import { query, queryOne } from "@/lib/db";
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

const PAGE_SIZE = 20;

export default async function WarehousePriorityPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; q?: string }>;
}) {
  const { page: pageStr, q } = await searchParams;
  const currentPage = Math.max(1, parseInt(pageStr ?? "1", 10) || 1);
  const offset = (currentPage - 1) * PAGE_SIZE;
  const search = (q ?? "").trim();

  let whereClause = "WHERE p.order_id IS NOT NULL";
  const countParams: unknown[] = [];
  const queryParams: unknown[] = [];

  if (search) {
    whereClause += ` AND (c.full_name ILIKE $1 OR o.order_id::text = $1 OR c.email ILIKE $1)`;
    countParams.push(`%${search}%`);
    queryParams.push(`%${search}%`);
  }

  const countResult = await queryOne<{ total: number }>(
    `SELECT COUNT(DISTINCT o.order_id)::int AS total
     FROM orders o
     JOIN customers c ON c.customer_id = o.customer_id
     JOIN order_predictions p ON p.order_id = o.order_id
     ${whereClause}`,
    countParams
  );
  const totalOrders = countResult?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(totalOrders / PAGE_SIZE));

  const limitParam = queryParams.length + 1;
  const offsetParam = limitParam + 1;

  const rows = await query<PriorityRow>(
    `SELECT
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
    ${whereClause}
    ORDER BY o.order_datetime DESC
    LIMIT $${limitParam} OFFSET $${offsetParam}`,
    [...queryParams, PAGE_SIZE, offset]
  );

  return (
    <div>
      <div className="page-header">
        <h1>Fraud Review Queue</h1>
        <p>
          Orders with ML fraud predictions, sorted by most recent.
          Review and confirm whether flagged orders are actually fraudulent.
        </p>
      </div>

      {totalOrders === 0 && !search ? (
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
        <FraudReviewTable
          initialRows={rows}
          currentPage={currentPage}
          totalPages={totalPages}
          totalOrders={totalOrders}
          search={search}
        />
      )}

      <div className="card">
        <div className="card-title">How This Works</div>
        <p style={{ fontSize: "14px", color: "var(--muted)", lineHeight: 1.7 }}>
          The scoring API computes fraud probabilities from live order features
          (risk score, order total, item counts, customer age, and promo usage),
          then writes results to <code>order_predictions</code>. This page surfaces
          scored orders so the admin can review them. Use the
          &quot;Confirmed Fraud&quot; checkbox to record ground-truth labels, which are
          saved back to the database for future model retraining.
        </p>
      </div>
    </div>
  );
}
