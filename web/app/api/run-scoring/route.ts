import { NextResponse } from "next/server";
import { query, withTransaction, queryWithClient } from "@/lib/db";

interface LiveOrder {
  order_id: number;
  order_datetime: string;
  order_total: number;
  risk_score: number;
  promo_used: number;
  num_items: number;
  birthdate: string;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function sigmoid(z: number): number {
  return 1 / (1 + Math.exp(-z));
}

export async function POST() {
  try {
    const liveOrders = await query<LiveOrder>(
      `SELECT
         o.order_id,
         o.order_datetime,
         o.order_total,
         o.risk_score,
         o.promo_used,
         c.birthdate,
         oi_agg.num_items
       FROM orders o
       JOIN customers c ON c.customer_id = o.customer_id
       JOIN (
         SELECT order_id, SUM(quantity)::int AS num_items
         FROM order_items
         GROUP BY order_id
       ) oi_agg ON oi_agg.order_id = o.order_id
       WHERE o.fulfilled = 0`
    );

    if (liveOrders.length === 0) {
      return NextResponse.json({
        success: true,
        count: 0,
        output: "No unfulfilled orders found.",
      });
    }

    const nowYear = new Date().getUTCFullYear();
    const scored = liveOrders.map((order) => {
      const birthDate = new Date(order.birthdate);

      const customerAge = Number.isFinite(birthDate.getUTCFullYear())
        ? nowYear - birthDate.getUTCFullYear()
        : 35;

      const riskScoreNorm = clamp(order.risk_score, 0, 100) / 100;
      const orderTotalNorm = clamp(order.order_total, 0, 5000) / 5000;
      const numItemsNorm = clamp(order.num_items, 1, 12) / 12;
      const youngerRisk = clamp((35 - customerAge) / 30, 0, 1);

      const z =
        -3.0 +
        4.0 * riskScoreNorm +
        1.5 * orderTotalNorm +
        0.8 * numItemsNorm +
        0.6 * youngerRisk +
        0.5 * order.promo_used;

      const fraudProbability = clamp(sigmoid(z), 0.01, 0.99);
      const predictedFraud = fraudProbability >= 0.5 ? 1 : 0;

      return {
        order_id: order.order_id,
        fraud_probability: fraudProbability,
        predicted_fraud: predictedFraud,
      };
    });

    const predictionTimestamp = new Date().toISOString();

    await withTransaction(async (client) => {
      for (const row of scored) {
        await queryWithClient(
          client,
          `INSERT INTO order_predictions
            (order_id, late_delivery_probability, predicted_late_delivery, prediction_timestamp)
           VALUES ($1, $2, $3, $4)
           ON CONFLICT (order_id) DO UPDATE
           SET late_delivery_probability = EXCLUDED.late_delivery_probability,
               predicted_late_delivery = EXCLUDED.predicted_late_delivery,
               prediction_timestamp = EXCLUDED.prediction_timestamp`,
          [
            row.order_id,
            row.fraud_probability,
            row.predicted_fraud,
            predictionTimestamp,
          ]
        );
      }
    });

    return NextResponse.json({
      success: true,
      count: scored.length,
      output: `Scored ${scored.length} unfulfilled orders for fraud risk.`,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown server error";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
