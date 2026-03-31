import { NextResponse } from "next/server";
import { exec } from "child_process";
import path from "path";

const PROJECT_ROOT = path.join(process.cwd(), "..");
const INFERENCE_SCRIPT = path.join(PROJECT_ROOT, "jobs", "run_inference.py");

export async function POST() {
  return new Promise<NextResponse>((resolve) => {
    const command = `python "${INFERENCE_SCRIPT}"`;

    exec(
      command,
      { cwd: PROJECT_ROOT, timeout: 30_000 },
      (error, stdout, stderr) => {
        const output = (stdout ?? "") + (stderr ?? "");

        if (error && error.code !== 0) {
          resolve(
            NextResponse.json(
              { success: false, error: error.message, output },
              { status: 500 }
            )
          );
          return;
        }

        // Parse count from stdout: "Inference complete. Predictions written: N"
        const match = output.match(/Predictions written:\s*(\d+)/i);
        const count = match ? parseInt(match[1], 10) : null;

        resolve(NextResponse.json({ success: true, output, count }));
      }
    );
  });
}
