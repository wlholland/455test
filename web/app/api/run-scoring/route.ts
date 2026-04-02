import { NextResponse } from "next/server";
import { query } from "@/lib/db";
import { scoreOrder } from "@/lib/score-order";

export async function POST() {
  try {
    const unscored = await query<{ order_id: number }>(
      `SELECT o.order_id
       FROM orders o
       LEFT JOIN order_predictions p ON p.order_id = o.order_id
       WHERE p.order_id IS NULL`
    );

    if (unscored.length === 0) {
      return NextResponse.json({
        success: true,
        count: 0,
        output: "All orders already scored — nothing to do.",
      });
    }

    for (const row of unscored) {
      await scoreOrder(row.order_id);
    }

    return NextResponse.json({
      success: true,
      count: unscored.length,
      output: `Scored ${unscored.length} new order${unscored.length !== 1 ? "s" : ""} for fraud risk.`,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown server error";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
