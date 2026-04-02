import { queryOne, query as dbQuery } from "@/lib/db";

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function sigmoid(z: number): number {
  return 1 / (1 + Math.exp(-z));
}

/**
 * Score a single order for fraud risk and upsert the prediction.
 * Safe to call even if the order already has a prediction (uses ON CONFLICT).
 */
export async function scoreOrder(orderId: number): Promise<void> {
  const order = await queryOne<{
    order_total: number;
    risk_score: number;
    promo_used: number;
    birthdate: string;
    num_items: number;
  }>(
    `SELECT
       o.order_total,
       o.risk_score,
       o.promo_used,
       c.birthdate,
       COALESCE(oi_agg.num_items, 1) AS num_items
     FROM orders o
     JOIN customers c ON c.customer_id = o.customer_id
     LEFT JOIN (
       SELECT order_id, SUM(quantity)::int AS num_items
       FROM order_items
       GROUP BY order_id
     ) oi_agg ON oi_agg.order_id = o.order_id
     WHERE o.order_id = $1`,
    [orderId]
  );

  if (!order) return;

  const nowYear = new Date().getUTCFullYear();
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

  await dbQuery(
    `INSERT INTO order_predictions
       (order_id, late_delivery_probability, predicted_late_delivery, prediction_timestamp)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (order_id) DO UPDATE
     SET late_delivery_probability = EXCLUDED.late_delivery_probability,
         predicted_late_delivery = EXCLUDED.predicted_late_delivery,
         prediction_timestamp = EXCLUDED.prediction_timestamp`,
    [orderId, fraudProbability, predictedFraud, new Date().toISOString()]
  );
}
