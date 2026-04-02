"""
Inference Job: Load the fraud model, score unfulfilled orders, and write predictions to shop.db.
Run this after train_model.py, or on demand via the web app's "Run Scoring" button.

NOTE on column naming: The order_predictions table uses legacy column names
  - late_delivery_probability  → stores fraud_probability
  - predicted_late_delivery    → stores predicted_fraud (1=fraud, 0=clean)
These names are kept for backward compatibility with the existing schema.
"""
import sys
import os
sys.path.insert(0, os.path.dirname(__file__))

import pandas as pd
import joblib
from datetime import datetime

from config import OP_DB_PATH, MODEL_PATH
from utils_db import sqlite_conn, ensure_predictions_table

# Must match the feature list in train_model.py
FEATURE_COLS = [
    "num_items",
    "num_distinct_products",
    "order_total",
    "order_subtotal",
    "promo_used",
    "risk_score",
    "payment_method_code",
    "device_type_code",
    "loyalty_tier_code",
    "order_dow",
    "order_month",
    "customer_age",
]

PAYMENT_METHOD_MAP = {"credit_card": 0, "debit_card": 1, "paypal": 2, "gift_card": 3, "bank_transfer": 4}
DEVICE_TYPE_MAP = {"web": 0, "mobile": 1, "tablet": 2}


def run_inference():
    if not MODEL_PATH.exists():
        print(f"ERROR: Model file not found at {MODEL_PATH}")
        print("Run etl_build_warehouse.py and train_model.py first.")
        sys.exit(1)

    model = joblib.load(str(MODEL_PATH))

    with sqlite_conn(OP_DB_PATH) as conn:
        query = """
        SELECT
            o.order_id,
            o.order_datetime,
            o.order_total,
            o.order_subtotal,
            o.promo_used,
            o.risk_score,
            o.payment_method,
            o.device_type,
            c.birthdate,
            c.loyalty_tier,
            COALESCE(oi_agg.num_items, 1)              AS num_items,
            COALESCE(oi_agg.num_distinct_products, 1)  AS num_distinct_products
        FROM orders o
        JOIN customers c ON o.customer_id = c.customer_id
        LEFT JOIN (
            SELECT
                order_id,
                SUM(quantity)       AS num_items,
                COUNT(DISTINCT product_id) AS num_distinct_products
            FROM order_items
            GROUP BY order_id
        ) oi_agg ON oi_agg.order_id = o.order_id
        WHERE o.fulfilled = 0
        """
        df_live = pd.read_sql(query, conn)

    if df_live.empty:
        print("No unfulfilled orders found. Place an order via the app first.")
        return 0

    # --- Feature engineering (mirrors etl_build_warehouse.py) ---
    df_live["order_datetime"] = pd.to_datetime(df_live["order_datetime"], errors="coerce")
    df_live["birthdate"] = pd.to_datetime(df_live["birthdate"], errors="coerce")

    now_year = datetime.now().year
    df_live["customer_age"] = now_year - df_live["birthdate"].dt.year
    df_live["order_dow"] = df_live["order_datetime"].dt.dayofweek
    df_live["order_month"] = df_live["order_datetime"].dt.month

    df_live["payment_method_code"] = df_live["payment_method"].map(PAYMENT_METHOD_MAP).fillna(-1).astype(int)
    df_live["device_type_code"] = df_live["device_type"].map(DEVICE_TYPE_MAP).fillna(-1).astype(int)
    df_live["loyalty_tier_code"] = df_live["loyalty_tier"].map({"Bronze": 0, "Silver": 1, "Gold": 2}).fillna(0).astype(int)
    df_live["risk_score"] = df_live["risk_score"].fillna(0)

    X_live = df_live[FEATURE_COLS]

    # fraud_probability stored in late_delivery_probability column (legacy name)
    fraud_probs = model.predict_proba(X_live)[:, 1]
    fraud_preds = model.predict(X_live)

    ts = datetime.utcnow().isoformat()
    out_rows = [
        (int(oid), float(p), int(yhat), ts)
        for oid, p, yhat in zip(df_live["order_id"], fraud_probs, fraud_preds)
    ]

    with sqlite_conn(OP_DB_PATH) as conn:
        ensure_predictions_table(conn)
        cur = conn.cursor()
        # late_delivery_probability = fraud_probability
        # predicted_late_delivery   = predicted_fraud
        cur.executemany("""
        INSERT OR REPLACE INTO order_predictions
        (order_id, late_delivery_probability, predicted_late_delivery, prediction_timestamp)
        VALUES (?, ?, ?, ?)
        """, out_rows)
        conn.commit()

    flagged = sum(1 for _, p, yhat, _ in out_rows if yhat == 1)
    print(f"Inference complete. Orders scored: {len(out_rows)}, flagged as fraud: {flagged}")
    return len(out_rows)


if __name__ == "__main__":
    run_inference()
