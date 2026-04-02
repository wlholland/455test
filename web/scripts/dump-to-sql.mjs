import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
import Database from "better-sqlite3";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const sqlitePath = path.join(__dirname, "..", "..", "shop.db");
const sqlite = new Database(sqlitePath, { readonly: true });
const outPath = path.join(__dirname, "..", "migration.sql");
const out = fs.createWriteStream(outPath);

function escapeVal(v) {
  if (v === null || v === undefined) return "NULL";
  if (typeof v === "number") return String(v);
  return "'" + String(v).replace(/'/g, "''") + "'";
}

function dumpTable(table, columns) {
  const rows = sqlite.prepare(`SELECT ${columns.join(", ")} FROM ${table}`).all();
  if (rows.length === 0) return;

  const BATCH = 200;
  for (let i = 0; i < rows.length; i += BATCH) {
    const batch = rows.slice(i, i + BATCH);
    out.write(`INSERT INTO ${table} (${columns.join(", ")}) VALUES\n`);
    const valueLines = batch.map(
      (row) => "(" + columns.map((col) => escapeVal(row[col])).join(", ") + ")"
    );
    out.write(valueLines.join(",\n") + ";\n\n");
  }
  console.log(`- ${table}: ${rows.length} rows`);
}

const schemaSql = `
DROP TABLE IF EXISTS order_predictions CASCADE;
DROP TABLE IF EXISTS product_reviews CASCADE;
DROP TABLE IF EXISTS shipments CASCADE;
DROP TABLE IF EXISTS order_items CASCADE;
DROP TABLE IF EXISTS orders CASCADE;
DROP TABLE IF EXISTS products CASCADE;
DROP TABLE IF EXISTS customers CASCADE;

CREATE TABLE customers (
  customer_id      BIGINT PRIMARY KEY,
  full_name        TEXT NOT NULL,
  email            TEXT NOT NULL UNIQUE,
  gender           TEXT NOT NULL,
  birthdate        TEXT NOT NULL,
  created_at       TEXT NOT NULL,
  city             TEXT,
  state            TEXT,
  zip_code         TEXT,
  customer_segment TEXT,
  loyalty_tier     TEXT,
  is_active        INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE products (
  product_id   BIGINT PRIMARY KEY,
  sku          TEXT NOT NULL UNIQUE,
  product_name TEXT NOT NULL,
  category     TEXT NOT NULL,
  price        DOUBLE PRECISION NOT NULL,
  cost         DOUBLE PRECISION NOT NULL,
  is_active    INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE orders (
  order_id        BIGINT PRIMARY KEY,
  customer_id     BIGINT NOT NULL REFERENCES customers(customer_id),
  order_datetime  TEXT NOT NULL,
  billing_zip     TEXT,
  shipping_zip    TEXT,
  shipping_state  TEXT,
  payment_method  TEXT NOT NULL,
  device_type     TEXT NOT NULL,
  ip_country      TEXT NOT NULL,
  promo_used      INTEGER NOT NULL DEFAULT 0,
  promo_code      TEXT,
  order_subtotal  DOUBLE PRECISION NOT NULL,
  shipping_fee    DOUBLE PRECISION NOT NULL,
  tax_amount      DOUBLE PRECISION NOT NULL,
  order_total     DOUBLE PRECISION NOT NULL,
  risk_score      DOUBLE PRECISION NOT NULL,
  is_fraud        INTEGER NOT NULL DEFAULT 0,
  fulfilled       INTEGER DEFAULT 0
);

CREATE TABLE order_items (
  order_item_id BIGINT PRIMARY KEY,
  order_id      BIGINT NOT NULL REFERENCES orders(order_id),
  product_id    BIGINT NOT NULL REFERENCES products(product_id),
  quantity      INTEGER NOT NULL,
  unit_price    DOUBLE PRECISION NOT NULL,
  line_total    DOUBLE PRECISION NOT NULL
);

CREATE TABLE shipments (
  shipment_id      BIGINT PRIMARY KEY,
  order_id         BIGINT NOT NULL UNIQUE REFERENCES orders(order_id),
  ship_datetime    TEXT NOT NULL,
  carrier          TEXT NOT NULL,
  shipping_method  TEXT NOT NULL,
  distance_band    TEXT NOT NULL,
  promised_days    INTEGER NOT NULL,
  actual_days      INTEGER NOT NULL,
  late_delivery    INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE product_reviews (
  review_id        BIGINT PRIMARY KEY,
  customer_id      BIGINT NOT NULL REFERENCES customers(customer_id),
  product_id       BIGINT NOT NULL REFERENCES products(product_id),
  rating           INTEGER NOT NULL CHECK (rating BETWEEN 1 AND 5),
  review_datetime  TEXT NOT NULL,
  review_text      TEXT,
  UNIQUE(customer_id, product_id)
);

CREATE TABLE order_predictions (
  order_id                   BIGINT PRIMARY KEY REFERENCES orders(order_id),
  late_delivery_probability  DOUBLE PRECISION,
  predicted_late_delivery    INTEGER,
  prediction_timestamp       TEXT
);
`;

out.write(schemaSql + "\n");

console.log("Dumping tables...");

dumpTable("customers", [
  "customer_id", "full_name", "email", "gender", "birthdate", "created_at",
  "city", "state", "zip_code", "customer_segment", "loyalty_tier", "is_active",
]);
dumpTable("products", ["product_id", "sku", "product_name", "category", "price", "cost", "is_active"]);
dumpTable("orders", [
  "order_id", "customer_id", "order_datetime", "billing_zip", "shipping_zip",
  "shipping_state", "payment_method", "device_type", "ip_country", "promo_used",
  "promo_code", "order_subtotal", "shipping_fee", "tax_amount", "order_total",
  "risk_score", "is_fraud", "fulfilled",
]);
dumpTable("order_items", ["order_item_id", "order_id", "product_id", "quantity", "unit_price", "line_total"]);
dumpTable("shipments", [
  "shipment_id", "order_id", "ship_datetime", "carrier", "shipping_method",
  "distance_band", "promised_days", "actual_days", "late_delivery",
]);
dumpTable("product_reviews", [
  "review_id", "customer_id", "product_id", "rating", "review_datetime", "review_text",
]);

out.end();
sqlite.close();
console.log(`\nSQL dump written to: ${outPath}`);
