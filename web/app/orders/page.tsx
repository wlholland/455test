import { cookies } from "next/headers";
import { query, queryOne } from "@/lib/db";
import Link from "next/link";

interface Order {
  order_id: number;
  order_datetime: string;
  order_total: number;
  fulfilled: number;
  item_count: number;
  customer_name: string;
}

const PAGE_SIZE = 20;

export default async function OrdersPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; q?: string }>;
}) {
  const cookieStore = await cookies();
  const customerId = cookieStore.get("customer_id")?.value;

  const { page: pageStr, q } = await searchParams;
  const currentPage = Math.max(1, parseInt(pageStr ?? "1", 10) || 1);
  const offset = (currentPage - 1) * PAGE_SIZE;
  const search = (q ?? "").trim();

  const conditions: string[] = [];
  const countParams: unknown[] = [];
  const queryParams: unknown[] = [];
  let paramIdx = 1;

  if (customerId) {
    conditions.push(`o.customer_id = $${paramIdx}`);
    countParams.push(Number(customerId));
    queryParams.push(Number(customerId));
    paramIdx++;
  }

  if (search) {
    conditions.push(`(c.full_name ILIKE $${paramIdx} OR o.order_id::text = $${paramIdx} OR c.email ILIKE $${paramIdx})`);
    countParams.push(`%${search}%`);
    queryParams.push(`%${search}%`);
    paramIdx++;
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

  const customerName = customerId
    ? (await queryOne<{ full_name: string }>(
        "SELECT full_name FROM customers WHERE customer_id = $1",
        [customerId]
      ))?.full_name ?? null
    : null;

  const countResult = await queryOne<{ total: number }>(
    `SELECT COUNT(DISTINCT o.order_id)::int AS total
     FROM orders o
     JOIN customers c ON c.customer_id = o.customer_id
     ${whereClause}`,
    countParams
  );
  const totalOrders = countResult?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(totalOrders / PAGE_SIZE));

  const limitParam = paramIdx;
  const offsetParam = paramIdx + 1;

  const orders = await query<Order>(
    `SELECT o.order_id, o.order_datetime, o.order_total, o.fulfilled,
            COUNT(oi.order_item_id)::int AS item_count,
            c.full_name AS customer_name
     FROM orders o
     JOIN customers c ON c.customer_id = o.customer_id
     LEFT JOIN order_items oi ON oi.order_id = o.order_id
     ${whereClause}
     GROUP BY o.order_id, c.full_name
     ORDER BY o.order_datetime DESC
     LIMIT $${limitParam} OFFSET $${offsetParam}`,
    [...queryParams, PAGE_SIZE, offset]
  );

  function buildUrl(page: number, searchVal?: string) {
    const params = new URLSearchParams();
    if (page > 1) params.set("page", String(page));
    if (searchVal) params.set("q", searchVal);
    const qs = params.toString();
    return `/orders${qs ? `?${qs}` : ""}`;
  }

  return (
    <div>
      <div className="page-header">
        <h1>Order History</h1>
        <p>
          {customerName
            ? <>{customerName} — {totalOrders} order{totalOrders !== 1 ? "s" : ""}</>
            : <>{totalOrders} order{totalOrders !== 1 ? "s" : ""} total</>
          }
        </p>
      </div>

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px", gap: "12px", flexWrap: "wrap" }}>
        <Link href="/place-order" className="btn btn-primary">+ Place New Order</Link>
        <form method="GET" action="/orders" style={{ display: "flex", gap: "8px", alignItems: "center" }}>
          <input
            type="text"
            name="q"
            placeholder={customerId ? "Search by order ID..." : "Search by name, email, or order ID..."}
            defaultValue={search}
            style={{ width: "300px", padding: "8px 12px", fontSize: "14px" }}
          />
          <button type="submit" className="btn btn-secondary" style={{ padding: "8px 16px" }}>Search</button>
          {search && (
            <Link href="/orders" className="btn btn-secondary" style={{ padding: "8px 16px" }}>Clear</Link>
          )}
        </form>
      </div>

      {orders.length === 0 ? (
        <div className="card">
          <div className="empty-state">
            <h3>{search ? "No orders match your search" : "No orders yet"}</h3>
            <p>
              {search ? (
                <Link href="/orders">Clear search →</Link>
              ) : (
                <Link href="/place-order">Place your first order →</Link>
              )}
            </p>
          </div>
        </div>
      ) : (
        <div className="card">
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Order ID</th>
                  {!customerId && <th>Customer</th>}
                  <th>Date &amp; Time</th>
                  <th>Items</th>
                  <th>Total</th>
                  <th>Status</th>
                  <th>Details</th>
                </tr>
              </thead>
              <tbody>
                {orders.map((o) => (
                  <tr key={o.order_id}>
                    <td>#{o.order_id}</td>
                    {!customerId && <td>{o.customer_name}</td>}
                    <td style={{ whiteSpace: "nowrap" }}>{o.order_datetime?.slice(0, 16).replace("T", " ") ?? "—"}</td>
                    <td>{o.item_count}</td>
                    <td>${Number(o.order_total ?? 0).toFixed(2)}</td>
                    <td>
                      <span className={`badge ${o.fulfilled ? "badge-success" : "badge-warning"}`}>
                        {o.fulfilled ? "Fulfilled" : "Pending"}
                      </span>
                    </td>
                    <td>
                      <Link href={`/orders/${o.order_id}`}>View →</Link>
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
        </div>
      )}
    </div>
  );
}
