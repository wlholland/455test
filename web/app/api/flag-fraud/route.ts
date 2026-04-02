import { NextResponse } from "next/server";
import { query } from "@/lib/db";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { order_id, flagged } = body as { order_id: number; flagged: boolean };

    if (!order_id || typeof flagged !== "boolean") {
      return NextResponse.json({ error: "Invalid request." }, { status: 400 });
    }

    await query(
      `UPDATE order_predictions SET admin_flagged_fraud = $1 WHERE order_id = $2`,
      [flagged ? 1 : 0, order_id]
    );

    return NextResponse.json({ success: true, order_id, flagged });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown server error";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
