"""
Training Job: Load from warehouse.db, train a fraud classifier, and save artifacts.
Target: is_fraud (binary) on the orders table.
Run this after etl_build_warehouse.py.
"""
import sys
import os
sys.path.insert(0, os.path.dirname(__file__))

import json
from datetime import datetime
import pandas as pd
import joblib

from sklearn.model_selection import train_test_split
from sklearn.pipeline import Pipeline
from sklearn.impute import SimpleImputer
from sklearn.ensemble import RandomForestClassifier
from sklearn.metrics import (
    accuracy_score, f1_score, roc_auc_score,
    precision_score, recall_score, classification_report
)

from config import WH_DB_PATH, ARTIFACTS_DIR, MODEL_PATH, MODEL_METADATA_PATH, METRICS_PATH
from utils_db import sqlite_conn

MODEL_VERSION = "2.0.0"  # Major version bump: now predicts is_fraud

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
LABEL_COL = "is_fraud"


def train_and_save():
    with sqlite_conn(WH_DB_PATH) as conn:
        df = pd.read_sql("SELECT * FROM modeling_orders", conn)

    print(f"Loaded {len(df)} rows from warehouse.")
    fraud_count = int(df[LABEL_COL].sum())
    print(f"  Fraud rows : {fraud_count} ({100*fraud_count/len(df):.1f}%)")
    print(f"  Clean rows : {len(df) - fraud_count}")

    X = df[FEATURE_COLS]
    y = df[LABEL_COL].astype(int)

    X_train, X_test, y_train, y_test = train_test_split(
        X, y, test_size=0.2, random_state=42, stratify=y
    )

    # class_weight='balanced' compensates for the ~6% fraud rate
    model = Pipeline(steps=[
        ("imputer", SimpleImputer(strategy="median")),
        ("clf", RandomForestClassifier(
            n_estimators=300,
            max_depth=10,
            class_weight="balanced",
            random_state=42,
            n_jobs=-1
        ))
    ])

    model.fit(X_train, y_train)

    y_pred = model.predict(X_test)
    y_prob = model.predict_proba(X_test)[:, 1]

    acc = float(accuracy_score(y_test, y_pred))
    f1 = float(f1_score(y_test, y_pred, zero_division=0))
    roc = float(roc_auc_score(y_test, y_prob))
    prec = float(precision_score(y_test, y_pred, zero_division=0))
    rec = float(recall_score(y_test, y_pred, zero_division=0))

    metrics = {
        "accuracy": acc,
        "f1": f1,
        "precision": prec,
        "recall": rec,
        "roc_auc": roc,
        "row_count_train": int(len(X_train)),
        "row_count_test": int(len(X_test)),
        "fraud_count_train": int(y_train.sum()),
        "fraud_count_test": int(y_test.sum()),
        "classification_report": classification_report(y_test, y_pred, output_dict=True)
    }

    ARTIFACTS_DIR.mkdir(parents=True, exist_ok=True)
    joblib.dump(model, str(MODEL_PATH))

    metadata = {
        "model_version": MODEL_VERSION,
        "trained_at_utc": datetime.utcnow().isoformat(),
        "feature_list": FEATURE_COLS,
        "label": LABEL_COL,
        "warehouse_table": "modeling_orders",
        "warehouse_rows": int(len(df)),
        "algorithm": "RandomForestClassifier (class_weight=balanced)",
        "note": (
            "Predictions are stored in order_predictions table under the columns "
            "late_delivery_probability (= fraud_probability) and "
            "predicted_late_delivery (= predicted_fraud) for backward compatibility "
            "with the existing schema."
        )
    }

    with open(MODEL_METADATA_PATH, "w", encoding="utf-8") as f:
        json.dump(metadata, f, indent=2)

    with open(METRICS_PATH, "w", encoding="utf-8") as f:
        json.dump(metrics, f, indent=2)

    print(f"\nTraining complete.")
    print(f"  Accuracy  : {acc:.4f}")
    print(f"  Precision : {prec:.4f}")
    print(f"  Recall    : {rec:.4f}")
    print(f"  F1        : {f1:.4f}")
    print(f"  ROC-AUC   : {roc:.4f}")
    print(f"\nSaved model    : {MODEL_PATH}")
    print(f"Saved metadata : {MODEL_METADATA_PATH}")
    print(f"Saved metrics  : {METRICS_PATH}")


if __name__ == "__main__":
    train_and_save()
