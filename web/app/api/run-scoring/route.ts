import { NextResponse } from "next/server";
import { query, withTransaction, queryWithClient } from "@/lib/db";

function clamp(v: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, v));
}
function sigmoid(z: number) {
  return 1 / (1 + Math.exp(-z));
}

interface UnscoredRow {
  order_id: number;
  order_total: number;
  order_subtotal: number;
  risk_score: number;
  promo_used: number;
  payment_method: string;
  device_type: string;
  birthdate: string;
  loyalty_tier: string;
  num_items: number;
  num_distinct_products: number;
}

export async function POST() {
  try {
    const rows = await query<UnscoredRow>(
      `SELECT
         o.order_id,
         o.order_total,
         o.order_subtotal,
         o.risk_score,
         o.promo_used,
         o.payment_method,
         o.device_type,
         c.birthdate,
         c.loyalty_tier,
         COALESCE(oi_agg.num_items, 1)::int             AS num_items,
         COALESCE(oi_agg.num_distinct_products, 1)::int  AS num_distinct_products
       FROM orders o
       JOIN customers c ON c.customer_id = o.customer_id
       LEFT JOIN (
         SELECT order_id,
                SUM(quantity)::int              AS num_items,
                COUNT(DISTINCT product_id)::int AS num_distinct_products
         FROM order_items
         GROUP BY order_id
       ) oi_agg ON oi_agg.order_id = o.order_id
       LEFT JOIN order_predictions p ON p.order_id = o.order_id
       WHERE p.order_id IS NULL`
    );

    if (rows.length === 0) {
      return NextResponse.json({
        success: true,
        count: 0,
        output: "All orders already scored — nothing to do.",
      });
    }

    const nowYear = new Date().getUTCFullYear();
    const ts = new Date().toISOString();

    const paymentRisk: Record<string, number> = {
      gift_card: 1.0, paypal: 0.6, debit_card: 0.3, credit_card: 0.2, bank_transfer: 0.1,
    };
    const deviceRisk: Record<string, number> = { mobile: 0.7, tablet: 0.5, web: 0.2 };
    const loyaltyRisk: Record<string, number> = { Bronze: 0.6, Silver: 0.3, Gold: 0.1 };

    const scored = rows.map((r) => {
      const birthYear = new Date(r.birthdate).getUTCFullYear();
      const age = Number.isFinite(birthYear) ? nowYear - birthYear : 35;

      const z =
        -3.2 +
        5.0 * clamp(r.risk_score ?? 0, 0, 100) / 100 +
        1.8 * clamp(r.order_total ?? 0, 0, 5000) / 5000 +
        0.9 * clamp(r.num_items ?? 1, 1, 20) / 20 +
        0.5 * clamp(r.num_distinct_products ?? 1, 1, 10) / 10 +
        0.7 * clamp((35 - age) / 30, 0, 1) +
        0.6 * (r.promo_used ? 1 : 0) +
        0.8 * (paymentRisk[r.payment_method] ?? 0.5) +
        0.4 * (deviceRisk[r.device_type] ?? 0.5) +
        0.3 * (loyaltyRisk[r.loyalty_tier] ?? 0.5);

      const prob = clamp(sigmoid(z), 0.01, 0.99);
      return { order_id: r.order_id, prob, pred: prob >= 0.5 ? 1 : 0 };
    });

    const BATCH = 500;
    await withTransaction(async (client) => {
      for (let i = 0; i < scored.length; i += BATCH) {
        const batch = scored.slice(i, i + BATCH);
        const values: unknown[] = [];
        const placeholders = batch.map((s, idx) => {
          const base = idx * 4;
          values.push(s.order_id, s.prob, s.pred, ts);
          return `($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4})`;
        });

        await queryWithClient(
          client,
          `INSERT INTO order_predictions
             (order_id, late_delivery_probability, predicted_late_delivery, prediction_timestamp)
           VALUES ${placeholders.join(", ")}
           ON CONFLICT (order_id) DO UPDATE
           SET late_delivery_probability = EXCLUDED.late_delivery_probability,
               predicted_late_delivery   = EXCLUDED.predicted_late_delivery,
               prediction_timestamp      = EXCLUDED.prediction_timestamp`,
          values
        );
      }
    });

    return NextResponse.json({
      success: true,
      count: scored.length,
      output: `Scored ${scored.length} order${scored.length !== 1 ? "s" : ""} for fraud risk.`,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown server error";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
