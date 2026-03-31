"use client";

import { useState } from "react";
import Link from "next/link";

interface ScoringResult {
  success: boolean;
  output?: string;
  error?: string;
  count?: number | null;
}

export default function ScoringClient() {
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<ScoringResult | null>(null);
  const [timestamp, setTimestamp] = useState<string | null>(null);

  async function handleRun() {
    setRunning(true);
    setResult(null);
    setTimestamp(null);
    try {
      const res = await fetch("/api/run-scoring", { method: "POST" });
      const data = await res.json();
      setResult(data);
      setTimestamp(new Date().toLocaleString());
    } catch {
      setResult({ success: false, error: "Network error. Could not reach the server." });
    } finally {
      setRunning(false);
    }
  }

  return (
    <div>
      <div className="card">
        <div className="card-title">Run ML Inference Job</div>
        <p style={{ fontSize: "14px", color: "var(--muted)", marginBottom: "20px", lineHeight: 1.7 }}>
          Clicking the button below runs <code>jobs/run_inference.py</code> on the server.
          The script loads the trained model, scores all unfulfilled orders in <code>shop.db</code>,
          and writes predictions to the <code>order_predictions</code> table.
        </p>
        <button
          className="btn btn-primary btn-lg"
          onClick={handleRun}
          disabled={running}
        >
          {running ? "Running Inference…" : "▶ Run Scoring"}
        </button>
      </div>

      {result && (
        <div className={`card`}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "12px" }}>
            <div>
              <div className="card-title">Result</div>
              {timestamp && <div style={{ fontSize: "13px", color: "var(--muted)" }}>Completed at {timestamp}</div>}
            </div>
            {result.success && result.count !== null && result.count !== undefined && (
              <div style={{ textAlign: "right" }}>
                <div style={{ fontSize: "28px", fontWeight: 700, color: "var(--success)" }}>{result.count}</div>
                <div style={{ fontSize: "12px", color: "var(--muted)" }}>orders scored</div>
              </div>
            )}
          </div>

          {result.success ? (
            <>
              <div className="alert alert-success">
                Inference complete.{" "}
                {result.count === 0
                  ? "No unfulfilled orders found. Place an order first."
                  : `${result.count} order${result.count !== 1 ? "s" : ""} scored and written to order_predictions.`}
              </div>
              {result.count && result.count > 0 && (
                <Link href="/warehouse/priority" className="btn btn-primary">
                  View Priority Queue →
                </Link>
              )}
            </>
          ) : (
            <div className="alert alert-danger">
              <strong>Error:</strong> {result.error}
            </div>
          )}

          {result.output && (
            <>
              <div style={{ fontSize: "13px", fontWeight: 600, marginTop: "16px", marginBottom: "6px" }}>
                Script Output
              </div>
              <div className="score-box">{result.output}</div>
            </>
          )}
        </div>
      )}

      <div className="card">
        <div className="card-title">About the ML Pipeline</div>
        <table style={{ fontSize: "14px" }}>
          <tbody>
            <tr>
              <td style={{ color: "var(--muted)", width: "160px", padding: "6px 0" }}>ETL script</td>
              <td><code>jobs/etl_build_warehouse.py</code></td>
            </tr>
            <tr>
              <td style={{ color: "var(--muted)", padding: "6px 0" }}>Training script</td>
              <td><code>jobs/train_model.py</code></td>
            </tr>
            <tr>
              <td style={{ color: "var(--muted)", padding: "6px 0" }}>Inference script</td>
              <td><code>jobs/run_inference.py</code></td>
            </tr>
            <tr>
              <td style={{ color: "var(--muted)", padding: "6px 0" }}>Model artifact</td>
              <td><code>artifacts/late_delivery_model.sav</code></td>
            </tr>
            <tr>
              <td style={{ color: "var(--muted)", padding: "6px 0" }}>Writes to</td>
              <td><code>shop.db → order_predictions</code></td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}
