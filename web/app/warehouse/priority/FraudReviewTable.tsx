"use client";

import { useState } from "react";
import Link from "next/link";

interface PriorityRow {
  order_id: number;
  order_datetime: string;
  order_total: number;
  customer_name: string;
  late_delivery_probability: number;
  predicted_late_delivery: number;
  prediction_timestamp: string;
  admin_flagged_fraud: number | null;
}

export default function FraudReviewTable({ initialRows }: { initialRows: PriorityRow[] }) {
  const [rows, setRows] = useState(initialRows);

  async function handleToggle(orderId: number, currentVal: number | null) {
    const newFlagged = currentVal === 1 ? false : true;

    setRows((prev) =>
      prev.map((r) =>
        r.order_id === orderId ? { ...r, admin_flagged_fraud: newFlagged ? 1 : 0 } : r
      )
    );

    try {
      const res = await fetch("/api/flag-fraud", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ order_id: orderId, flagged: newFlagged }),
      });
      if (!res.ok) {
        setRows((prev) =>
          prev.map((r) =>
            r.order_id === orderId ? { ...r, admin_flagged_fraud: currentVal } : r
          )
        );
      }
    } catch {
      setRows((prev) =>
        prev.map((r) =>
          r.order_id === orderId ? { ...r, admin_flagged_fraud: currentVal } : r
        )
      );
    }
  }

  return (
    <div className="card">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "12px" }}>
        <div className="card-title" style={{ marginBottom: 0 }}>
          Top {rows.length} orders — sorted by fraud risk
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
              <th>Fraud Risk</th>
              <th>Predicted Fraud</th>
              <th>Confirmed Fraud</th>
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
                    {row.predicted_late_delivery ? "Yes" : "No"}
                  </span>
                </td>
                <td style={{ textAlign: "center" }}>
                  <input
                    type="checkbox"
                    checked={row.admin_flagged_fraud === 1}
                    onChange={() => handleToggle(row.order_id, row.admin_flagged_fraud)}
                    style={{ width: "18px", height: "18px", cursor: "pointer", accentColor: "var(--danger)" }}
                  />
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
  );
}
