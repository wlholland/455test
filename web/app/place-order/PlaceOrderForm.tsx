"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

interface Product {
  product_id: number;
  product_name: string;
  category: string;
  price: number;
}

interface LineItem {
  product_id: number;
  quantity: number;
}

export default function PlaceOrderForm({ products }: { products: Product[] }) {
  const router = useRouter();
  const [lines, setLines] = useState<LineItem[]>([
    { product_id: products[0]?.product_id ?? 0, quantity: 1 },
  ]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function addLine() {
    setLines((prev) => [
      ...prev,
      { product_id: products[0]?.product_id ?? 0, quantity: 1 },
    ]);
  }

  function removeLine(idx: number) {
    setLines((prev) => prev.filter((_, i) => i !== idx));
  }

  function updateLine(idx: number, field: keyof LineItem, value: number) {
    setLines((prev) =>
      prev.map((l, i) => (i === idx ? { ...l, [field]: value } : l))
    );
  }

  function getProduct(id: number): Product | undefined {
    return products.find((p) => p.product_id === id);
  }

  const orderTotal = lines.reduce((sum, l) => {
    const p = getProduct(l.product_id);
    return sum + (p?.price ?? 0) * l.quantity;
  }, 0);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (lines.length === 0) {
      setError("Add at least one item.");
      return;
    }
    if (lines.some((l) => l.quantity < 1)) {
      setError("All quantities must be at least 1.");
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch("/api/place-order", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lines }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Failed to place order.");
        return;
      }
      router.push(`/orders/${data.order_id}?success=1`);
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit}>
      {error && <div className="alert alert-danger">{error}</div>}

      <div className="card">
        <div className="card-title">Order Items</div>
        <table className="line-items-table">
          <thead>
            <tr>
              <th>Product</th>
              <th>Category</th>
              <th>Unit Price</th>
              <th>Qty</th>
              <th>Line Total</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {lines.map((line, idx) => {
              const prod = getProduct(line.product_id);
              return (
                <tr key={idx}>
                  <td>
                    <select
                      value={line.product_id}
                      onChange={(e) =>
                        updateLine(idx, "product_id", Number(e.target.value))
                      }
                      style={{ width: "200px" }}
                    >
                      {products.map((p) => (
                        <option key={p.product_id} value={p.product_id}>
                          {p.product_name}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td style={{ color: "var(--muted)", fontSize: "13px" }}>
                    {prod?.category ?? "—"}
                  </td>
                  <td>${prod?.price?.toFixed(2) ?? "0.00"}</td>
                  <td>
                    <input
                      type="number"
                      min={1}
                      max={99}
                      value={line.quantity}
                      onChange={(e) =>
                        updateLine(idx, "quantity", Number(e.target.value))
                      }
                      style={{ width: "70px" }}
                    />
                  </td>
                  <td>
                    ${((prod?.price ?? 0) * line.quantity).toFixed(2)}
                  </td>
                  <td>
                    {lines.length > 1 && (
                      <button
                        type="button"
                        className="btn btn-danger"
                        style={{ padding: "4px 10px", fontSize: "13px" }}
                        onClick={() => removeLine(idx)}
                      >
                        ✕
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>

        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <button type="button" className="btn btn-secondary" onClick={addLine}>
            + Add Item
          </button>
          <div style={{ fontWeight: 700, fontSize: "16px" }}>
            Order Total: ${orderTotal.toFixed(2)}
          </div>
        </div>
      </div>

      <button
        type="submit"
        className="btn btn-primary btn-lg"
        disabled={submitting}
      >
        {submitting ? "Placing Order…" : "Place Order →"}
      </button>
    </form>
  );
}
