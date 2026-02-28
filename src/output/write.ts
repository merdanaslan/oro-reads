import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { NormalizedGoldTrade, OverviewMetrics, PerformanceMetrics, RunMeta } from "../types";

export async function writeOutputs(
  outDir: string,
  payload: {
    normalizedTrades: NormalizedGoldTrade[];
    overview: OverviewMetrics;
    performance: PerformanceMetrics;
    runMeta: RunMeta;
  }
): Promise<void> {
  await mkdir(outDir, { recursive: true });

  await Promise.all([
    writeJson(join(outDir, "normalized_trades.json"), payload.normalizedTrades),
    writeJson(join(outDir, "metrics_overview.json"), payload.overview),
    writeJson(join(outDir, "metrics_performance.json"), payload.performance),
    writeJson(join(outDir, "run_meta.json"), payload.runMeta)
  ]);
}

async function writeJson(path: string, data: unknown): Promise<void> {
  await writeFile(path, `${JSON.stringify(data, null, 2)}\n`, "utf8");
}
