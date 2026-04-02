import { query } from "@/lib/db";
import Link from "next/link";
import FraudReviewTable from "./FraudReviewTable";

interface PriorityRow {
  order_id: number;
  order_datetime: string;
  order_total: number;
  fulfilled: number;
  customer_id: number;
  customer_name: string;
  late_delivery_probability: number;
  predicted_late_delivery: number;
  prediction_timestamp: string;
  admin_flagged_fraud: number | null;
}

export default async function WarehousePriorityPage() {
  const rows = await query<PriorityRow>(`
    SELECT
      o.order_id,
      o.order_datetime,
      o.order_total,
      o.fulfilled,
      c.customer_id,
      c.full_name AS customer_name,
      p.late_delivery_probability,
      p.predicted_late_delivery,
      p.prediction_timestamp,
      p.admin_flagged_fraud
    FROM orders o
    JOIN customers c ON c.customer_id = o.customer_id
    JOIN order_predictions p ON p.order_id = o.order_id
    WHERE o.fulfilled = 0
    ORDER BY p.late_delivery_probability DESC, o.order_datetime ASC
    LIMIT 50
  `);

  return (
    <div>
      <div className="page-header">
        <h1>Fraud Review Queue</h1>
        <p>
          Unfulfilled orders ranked by ML-predicted fraud probability.
          Review the highest-risk orders and confirm whether they are actually fraudulent.
        </p>
      </div>

      {rows.length === 0 ? (
        <div className="card">
          <div className="empty-state">
            <h3>No scored orders yet</h3>
            <p style={{ marginBottom: "16px" }}>
              Place an order, then run the scoring job to see predictions here.
            </p>
            <div style={{ display: "flex", gap: "12px", justifyContent: "center" }}>
              <Link href="/place-order" className="btn btn-primary">Place Order</Link>
              <Link href="/scoring" className="btn btn-secondary">Run Scoring →</Link>
            </div>
          </div>
        </div>
      ) : (
        <FraudReviewTable initialRows={rows} />
      )}

      <div className="card">
        <div className="card-title">How This Works</div>
        <p style={{ fontSize: "14px", color: "var(--muted)", lineHeight: 1.7 }}>
          The scoring API computes fraud probabilities from live order features
          (risk score, order total, item counts, customer age, and promo usage),
          then writes results to <code>order_predictions</code>. This page surfaces
          the highest-risk unfulfilled orders so the admin can review them. Use the
          &quot;Confirmed Fraud&quot; checkbox to record ground-truth labels, which are
          saved back to the database for future model retraining.
        </p>
      </div>
    </div>
  );
}
