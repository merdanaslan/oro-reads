import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

import {
  ActivityLedgerEntry,
  BalanceSnapshot,
  CashflowEntry,
  CashflowSummary,
  NormalizedGoldTrade,
  OverviewMetrics,
  PerformanceMetrics,
  RunMeta,
  StakingSummary,
  UnrealizedCurve,
  VenueBreakdown
} from "../types";

export async function writeOutputs(
  outDir: string,
  payload: {
    normalizedTrades: NormalizedGoldTrade[];
    activityLedger: ActivityLedgerEntry[];
    balanceSnapshot: BalanceSnapshot;
    cashflowLedger: CashflowEntry[];
    cashflowSummary: CashflowSummary;
    overview: OverviewMetrics;
    performance: PerformanceMetrics;
    venueBreakdown: VenueBreakdown;
    stakingSummary: StakingSummary;
    unrealizedCurve: UnrealizedCurve;
    runMeta: RunMeta;
  }
): Promise<void> {
  await mkdir(outDir, { recursive: true });

  await Promise.all([
    writeJson(join(outDir, "normalized_trades.json"), payload.normalizedTrades),
    writeJson(join(outDir, "activity_ledger.json"), payload.activityLedger),
    writeJson(join(outDir, "balance_snapshot.json"), payload.balanceSnapshot),
    writeJson(join(outDir, "cashflow_ledger.json"), payload.cashflowLedger),
    writeJson(join(outDir, "cashflow_summary.json"), payload.cashflowSummary),
    writeJson(join(outDir, "metrics_overview.json"), payload.overview),
    writeJson(join(outDir, "metrics_performance.json"), payload.performance),
    writeJson(join(outDir, "venue_breakdown.json"), payload.venueBreakdown),
    writeJson(join(outDir, "staking_summary.json"), payload.stakingSummary),
    writeJson(join(outDir, "unrealized_curve.json"), payload.unrealizedCurve),
    writeJson(join(outDir, "run_meta.json"), payload.runMeta)
  ]);
}

async function writeJson(path: string, data: unknown): Promise<void> {
  await writeFile(path, `${JSON.stringify(data, null, 2)}\n`, "utf8");
}
