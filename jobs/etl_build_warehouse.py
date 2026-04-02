"""
ETL Job: Extract from shop.db, denormalize, engineer features, and load into warehouse.db.
Target label: is_fraud (from orders table).
Run this before train_model.py.
"""
import sys
import os
sys.path.insert(0, os.path.dirname(__file__))

import pandas as pd
from datetime import datetime
from config import OP_DB_PATH, WH_DB_PATH
from utils_db import sqlite_conn

# Mapping categorical fields to numeric codes
PAYMENT_METHOD_MAP = {"credit_card": 0, "debit_card": 1, "paypal": 2, "gift_card": 3, "bank_transfer": 4}
DEVICE_TYPE_MAP = {"web": 0, "mobile": 1, "tablet": 2}


def build_modeling_table():
    with sqlite_conn(OP_DB_PATH) as conn:
        orders = pd.read_sql("SELECT * FROM orders", conn)
        customers = pd.read_sql("SELECT * FROM customers", conn)
        order_items = pd.read_sql("SELECT * FROM order_items", conn)

    # Aggregate order-item level features per order
    item_features = (
        order_items
        .groupby("order_id")
        .agg(
            num_items=("quantity", "sum"),
            num_distinct_products=("product_id", "nunique")
        )
        .reset_index()
    )

    # Join orders + customers + item aggregates
    # No shipments join — label is is_fraud on the orders table
    df = (
        orders
        .merge(
            customers[["customer_id", "birthdate", "customer_segment", "loyalty_tier"]],
            on="customer_id",
            how="left"
        )
        .merge(item_features, on="order_id", how="left")
    )

    # --- Date / age feature engineering ---
    df["order_datetime"] = pd.to_datetime(df["order_datetime"], errors="coerce")
    df["birthdate"] = pd.to_datetime(df["birthdate"], errors="coerce")

    now_year = datetime.now().year
    df["customer_age"] = now_year - df["birthdate"].dt.year
    df["order_dow"] = df["order_datetime"].dt.dayofweek   # 0=Mon … 6=Sun
    df["order_month"] = df["order_datetime"].dt.month

    # --- Categorical encoding ---
    df["payment_method_code"] = df["payment_method"].map(PAYMENT_METHOD_MAP).fillna(-1).astype(int)
    df["device_type_code"] = df["device_type"].map(DEVICE_TYPE_MAP).fillna(-1).astype(int)

    # --- Loyalty tier encoding ---
    df["loyalty_tier_code"] = df["loyalty_tier"].map({"Bronze": 0, "Silver": 1, "Gold": 2}).fillna(0).astype(int)

    # --- Fill item count nulls ---
    df["num_items"] = df["num_items"].fillna(1)
    df["num_distinct_products"] = df["num_distinct_products"].fillna(1)

    # --- Select columns for modeling table ---
    modeling_cols = [
        "order_id",
        # Transaction features
        "num_items",
        "num_distinct_products",
        "order_total",
        "order_subtotal",
        "promo_used",
        "risk_score",
        # Encoded categorical
        "payment_method_code",
        "device_type_code",
        "loyalty_tier_code",
        # Time features
        "order_dow",
        "order_month",
        # Customer features
        "customer_age",
        # Label
        "is_fraud",
    ]

    df_model = df[modeling_cols].dropna(subset=["is_fraud"])

    with sqlite_conn(WH_DB_PATH) as wh_conn:
        df_model.to_sql("modeling_orders", wh_conn, if_exists="replace", index=False)

    fraud_count = int(df_model["is_fraud"].sum())
    print(f"Warehouse updated. modeling_orders rows: {len(df_model)} "
          f"(fraud: {fraud_count}, non-fraud: {len(df_model) - fraud_count})")
    return len(df_model)


if __name__ == "__main__":
    row_count = build_modeling_table()
    print(f"Total rows written: {row_count}")
