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

interface Props {
  initialRows: PriorityRow[];
  currentPage: number;
  totalPages: number;
  totalOrders: number;
  search: string;
}

function buildUrl(page: number, searchVal?: string) {
  const params = new URLSearchParams();
  if (page > 1) params.set("page", String(page));
  if (searchVal) params.set("q", searchVal);
  const qs = params.toString();
  return `/warehouse/priority${qs ? `?${qs}` : ""}`;
}

export default function FraudReviewTable({
  initialRows,
  currentPage,
  totalPages,
  totalOrders,
  search,
}: Props) {
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
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "12px", gap: "12px", flexWrap: "wrap" }}>
        <div className="card-title" style={{ marginBottom: 0 }}>
          {totalOrders} scored order{totalOrders !== 1 ? "s" : ""}
        </div>
        <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
          <Link href="/scoring" className="btn btn-secondary" style={{ fontSize: "13px", padding: "6px 14px" }}>
            Re-run Scoring →
          </Link>
        </div>
      </div>

      <form method="GET" action="/warehouse/priority" style={{ display: "flex", gap: "8px", alignItems: "center", marginBottom: "16px" }}>
        <input
          type="text"
          name="q"
          placeholder="Search by name, email, or order ID..."
          defaultValue={search}
          style={{ flex: 1, maxWidth: "350px", padding: "8px 12px", fontSize: "14px" }}
        />
        <button type="submit" className="btn btn-secondary" style={{ padding: "8px 16px" }}>Search</button>
        {search && (
          <Link href="/warehouse/priority" className="btn btn-secondary" style={{ padding: "8px 16px" }}>Clear</Link>
        )}
      </form>

      {rows.length === 0 ? (
        <div className="empty-state" style={{ padding: "32px 0" }}>
          <h3>No orders match your search</h3>
          <p><Link href="/warehouse/priority">Clear search →</Link></p>
        </div>
      ) : (
        <>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
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
                {rows.map((row) => (
                  <tr key={row.order_id}>
                    <td>
                      <Link href={`/orders/${row.order_id}`}>#{row.order_id}</Link>
                    </td>
                    <td>{row.customer_name}</td>
                    <td style={{ whiteSpace: "nowrap" }}>
                      {row.order_datetime?.slice(0, 16).replace("T", " ") ?? "—"}
                    </td>
                    <td>${Number(row.order_total ?? 0).toFixed(2)}</td>
                    <td>
                      <div className="prob-cell">
                        <div className="prob-bar-bg">
                          <div
                            className="prob-bar"
                            style={{
                              width: `${(Number(row.late_delivery_probability) * 100).toFixed(0)}%`,
                              background: row.late_delivery_probability > 0.7
                                ? "var(--danger)"
                                : row.late_delivery_probability > 0.4
                                ? "var(--warning)"
                                : "var(--success)",
                            }}
                          />
                        </div>
                        <span style={{ fontSize: "13px", fontWeight: 600, minWidth: "42px" }}>
                          {(Number(row.late_delivery_probability) * 100).toFixed(1)}%
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

          {totalPages > 1 && (
            <div style={{ display: "flex", justifyContent: "center", alignItems: "center", gap: "12px", marginTop: "16px", paddingTop: "12px", borderTop: "1px solid var(--border)" }}>
              {currentPage > 1 ? (
                <Link href={buildUrl(currentPage - 1, search)} className="btn btn-secondary" style={{ padding: "6px 14px", fontSize: "13px" }}>
                  ← Prev
                </Link>
              ) : (
                <span className="btn btn-secondary" style={{ padding: "6px 14px", fontSize: "13px", opacity: 0.4, pointerEvents: "none" }}>← Prev</span>
              )}

              <span style={{ fontSize: "14px", color: "var(--muted)" }}>
                Page {currentPage} of {totalPages}
              </span>

              {currentPage < totalPages ? (
                <Link href={buildUrl(currentPage + 1, search)} className="btn btn-secondary" style={{ padding: "6px 14px", fontSize: "13px" }}>
                  Next →
                </Link>
              ) : (
                <span className="btn btn-secondary" style={{ padding: "6px 14px", fontSize: "13px", opacity: 0.4, pointerEvents: "none" }}>Next →</span>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
