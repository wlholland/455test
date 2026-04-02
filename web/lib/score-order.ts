import { queryOne, query as dbQuery } from "@/lib/db";

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function sigmoid(z: number): number {
  return 1 / (1 + Math.exp(-z));
}

/**
 * Score a single order for FRAUD RISK and upsert the prediction into order_predictions.
 *
 * This is the serverless equivalent of the Python jobs/run_inference.py batch job.
 * It replicates the same feature engineering logic used in the trained sklearn pipeline
 * (see jobs/train_model.py and jobs/etl_build_warehouse.py) as a pure TypeScript
 * heuristic so it can run inside a Vercel edge function without Python dependencies.
 *
 * Features used (mirrors FEATURE_COLS in run_inference.py):
 *   risk_score, order_total, promo_used, num_items,
 *   customer_age, payment_method, device_type
 *
 * NOTE on column naming: The order_predictions table uses legacy schema names:
 *   - late_delivery_probability → stores fraud_probability
 *   - predicted_late_delivery   → stores predicted_fraud (1=fraud, 0=clean)
 *
 * Safe to call even if the order already has a prediction (uses ON CONFLICT upsert).
 */
export async function scoreOrder(orderId: number): Promise<void> {
  const order = await queryOne<{
    order_total: number;
    order_subtotal: number;
    risk_score: number;
    promo_used: number;
    payment_method: string;
    device_type: string;
    birthdate: string;
    num_items: number;
    num_distinct_products: number;
    loyalty_tier: string;
  }>(
    `SELECT
       o.order_total,
       o.order_subtotal,
       o.risk_score,
       o.promo_used,
       o.payment_method,
       o.device_type,
       c.birthdate,
       c.loyalty_tier,
       COALESCE(oi_agg.num_items, 1)             AS num_items,
       COALESCE(oi_agg.num_distinct_products, 1) AS num_distinct_products
     FROM orders o
     JOIN customers c ON c.customer_id = o.customer_id
     LEFT JOIN (
       SELECT order_id,
              SUM(quantity)::int              AS num_items,
              COUNT(DISTINCT product_id)::int AS num_distinct_products
       FROM order_items
       GROUP BY order_id
     ) oi_agg ON oi_agg.order_id = o.order_id
     WHERE o.order_id = $1`,
    [orderId]
  );

  if (!order) return;

  // --- Customer age ---
  const nowYear = new Date().getUTCFullYear();
  const birthYear = new Date(order.birthdate).getUTCFullYear();
  const customerAge = Number.isFinite(birthYear) ? nowYear - birthYear : 35;

  // --- Normalize features (same scale used during training) ---
  const riskScoreNorm        = clamp(order.risk_score ?? 0, 0, 100) / 100;
  const orderTotalNorm       = clamp(order.order_total ?? 0, 0, 5000) / 5000;
  const numItemsNorm         = clamp(order.num_items ?? 1, 1, 20) / 20;
  const distinctProductsNorm = clamp(order.num_distinct_products ?? 1, 1, 10) / 10;
  const youngerRisk          = clamp((35 - customerAge) / 30, 0, 1);

  // Payment method risk encoding (mirrors PAYMENT_METHOD_MAP in Python)
  const paymentRisk: Record<string, number> = {
    gift_card: 1.0,
    paypal: 0.6,
    debit_card: 0.3,
    credit_card: 0.2,
    bank_transfer: 0.1,
  };
  const pmRisk = paymentRisk[order.payment_method] ?? 0.5;

  // Device type risk (mobile / tablet orders have slightly higher fraud rates)
  const deviceRisk: Record<string, number> = { mobile: 0.7, tablet: 0.5, web: 0.2 };
  const devRisk = deviceRisk[order.device_type] ?? 0.5;

  // Loyalty tier (lower tier = less trust history)
  const loyaltyRisk: Record<string, number> = { Bronze: 0.6, Silver: 0.3, Gold: 0.1 };
  const loyRisk = loyaltyRisk[order.loyalty_tier] ?? 0.5;

  // Logistic regression–style decision boundary derived from training feature importances
  const z =
    -3.2 +
    5.0  * riskScoreNorm +          // highest importance feature
    1.8  * orderTotalNorm +
    0.9  * numItemsNorm +
    0.5  * distinctProductsNorm +
    0.7  * youngerRisk +
    0.6  * (order.promo_used ? 1 : 0) +
    0.8  * pmRisk +
    0.4  * devRisk +
    0.3  * loyRisk;

  // fraud_probability stored in late_delivery_probability (legacy column name)
  const fraudProbability = clamp(sigmoid(z), 0.01, 0.99);
  const predictedFraud   = fraudProbability >= 0.5 ? 1 : 0;

  await dbQuery(
    `INSERT INTO order_predictions
       (order_id, late_delivery_probability, predicted_late_delivery, prediction_timestamp)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (order_id) DO UPDATE
     SET late_delivery_probability = EXCLUDED.late_delivery_probability,
         predicted_late_delivery   = EXCLUDED.predicted_late_delivery,
         prediction_timestamp      = EXCLUDED.prediction_timestamp`,
    [orderId, fraudProbability, predictedFraud, new Date().toISOString()]
  );
}
