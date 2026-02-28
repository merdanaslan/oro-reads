import { describe, expect, it } from "vitest";

import buyJupiter from "./fixtures/gold-buy-jupiter.json";
import sellMeteora from "./fixtures/gold-sell-meteora.json";
import buyOroNative from "./fixtures/gold-buy-oro-native.json";
import buyNonUsdc from "./fixtures/gold-buy-non-usdc.json";
import transferOnly from "./fixtures/gold-transfer-only.json";
import { buildOverviewMetrics } from "../src/metrics/overview";
import { buildPerformanceMetrics } from "../src/metrics/performance";
import { classifyEnhancedTransaction, ClassifyContext } from "../src/normalize/classify";
import { runFifoPnl } from "../src/pnl/fifo";

const WALLET = "Cm9aaToERd5g3WshAezKfEW2EgdfcB7FqC7LmTaacigQ";
const GOLD_MINT = "GoLDppdjB1vDTPSGxyMJFqdnj134yH6Prg9eqsGDiw6A";
const USDC_MINT = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";

const context: ClassifyContext = {
  wallet: WALLET,
  goldMint: GOLD_MINT,
  usdcMint: USDC_MINT,
  oroProgramIds: new Set([
    "iNtiXEFgDNrc6FUt4cFALDe3D8RF3sVnNuKSHwxZRop",
    "HddmrUyzTVFuX39vyAT72XqV7C6ALa3GCUyKZeSJUHNm"
  ])
};

describe("pipeline integration", () => {
  it("builds overview and performance metrics from classified trades", () => {
    const rawTxs = [buyJupiter, sellMeteora, buyOroNative, buyNonUsdc, transferOnly];

    const trades = rawTxs
      .map((tx) => classifyEnhancedTransaction(tx, context).trade)
      .filter((trade) => trade !== null);

    const fifo = runFifoPnl(trades, USDC_MINT);
    const overview = buildOverviewMetrics(trades, fifo, USDC_MINT);
    const performance = buildPerformanceMetrics(trades, fifo, USDC_MINT);

    expect(overview.tradeCount).toBe(4);
    expect(overview.goldVolume).toBeCloseTo(0.075);
    expect(overview.usdcVolume).toBeCloseTo(180);
    expect(overview.realizedPnlUsdc).toBeCloseTo(5);

    expect(performance.avgEntryPrice).toBeCloseTo((100 + 25) / (0.04 + 0.01));
    expect(performance.avgExitPrice).toBeCloseTo(2750);
    expect(performance.perTradeBreakdown.length).toBe(4);
    expect(performance.pnlOverTime.daily.length).toBeGreaterThan(0);
  });
});
