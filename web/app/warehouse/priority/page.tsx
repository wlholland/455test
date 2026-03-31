import { query } from "@/lib/db";
import Link from "next/link";

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
}

export default function WarehousePriorityPage() {
  const rows = query<PriorityRow>(`
    SELECT
      o.order_id,
      o.order_datetime,
      o.order_total,
      o.fulfilled,
      c.customer_id,
      c.full_name AS customer_name,
      p.late_delivery_probability,
      p.predicted_late_delivery,
      p.prediction_timestamp
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
        <h1>Late Delivery Priority Queue</h1>
        <p>
          Unfulfilled orders ranked by ML-predicted probability of late delivery.
          Process the top orders first to minimize delays.
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
        <div className="card">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "12px" }}>
            <div className="card-title" style={{ marginBottom: 0 }}>
              Top {rows.length} orders — sorted by risk
            </div>
            <Link href="/scoring" className="btn btn-secondary" style={{ fontSize: "13px", padding: "6px 14px" }}>
              Re-run Scoring →
            </Link>
          </div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Rank</th>
                  <th>Order ID</th>
                  <th>Customer</th>
                  <th>Order Date</th>
                  <th>Total</th>
                  <th>Late Risk</th>
                  <th>Prediction</th>
                  <th>Scored At</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row, i) => (
                  <tr key={row.order_id}>
                    <td style={{ color: "var(--muted)", fontWeight: 600 }}>#{i + 1}</td>
                    <td>
                      <Link href={`/orders/${row.order_id}`}>#{row.order_id}</Link>
                    </td>
                    <td>{row.customer_name}</td>
                    <td style={{ whiteSpace: "nowrap" }}>
                      {row.order_datetime?.slice(0, 16).replace("T", " ") ?? "—"}
                    </td>
                    <td>${row.order_total?.toFixed(2) ?? "0.00"}</td>
                    <td>
                      <div className="prob-cell">
                        <div className="prob-bar-bg">
                          <div
                            className="prob-bar"
                            style={{
                              width: `${(row.late_delivery_probability * 100).toFixed(0)}%`,
                              background: row.late_delivery_probability > 0.7
                                ? "var(--danger)"
                                : row.late_delivery_probability > 0.4
                                ? "var(--warning)"
                                : "var(--success)",
                            }}
                          />
                        </div>
                        <span style={{ fontSize: "13px", fontWeight: 600, minWidth: "42px" }}>
                          {(row.late_delivery_probability * 100).toFixed(1)}%
                        </span>
                      </div>
                    </td>
                    <td>
                      <span className={`badge ${row.predicted_late_delivery ? "badge-danger" : "badge-success"}`}>
                        {row.predicted_late_delivery ? "Late" : "On Time"}
                      </span>
                    </td>
                    <td style={{ fontSize: "12px", color: "var(--muted)" }}>
                      {row.prediction_timestamp?.slice(0, 16).replace("T", " ") ?? "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div className="card">
        <div className="card-title">How This Works</div>
        <p style={{ fontSize: "14px", color: "var(--muted)", lineHeight: 1.7 }}>
          A logistic regression model was trained on historical order data (shipment delays, customer age,
          order timing, item counts). The inference job scores each unfulfilled order and writes a
          <code> late_delivery_probability </code> to the <code>order_predictions</code> table.
          This page reads that table and surfaces the highest-risk orders at the top.
          The app never runs ML code itself — it simply queries prediction results like any other table.
        </p>
      </div>
    </div>
  );
}
