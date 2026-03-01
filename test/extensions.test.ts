import { describe, expect, it } from "vitest";

import buyJupiter from "./fixtures/gold-buy-jupiter.json";
import transferOnly from "./fixtures/gold-transfer-only.json";
import { buildBalanceSnapshot } from "../src/balances/snapshot";
import { buildCashflowData } from "../src/cashflow/classify";
import { buildUnrealizedCurve } from "../src/metrics/unrealized";
import { buildVenueBreakdown } from "../src/metrics/venue";
import { classifyEnhancedTransaction, ClassifyContext } from "../src/normalize/classify";
import { runFifoPnl } from "../src/pnl/fifo";
import { NormalizedGoldTrade } from "../src/types";

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

describe("portfolio extension metrics", () => {
  it("builds balance snapshot from wallet balances payload", () => {
    const snapshot = buildBalanceSnapshot({
      wallet: WALLET,
      asOfUnix: 1700000000,
      goldMint: GOLD_MINT,
      usdcMint: USDC_MINT,
      balances: {
        nativeBalance: { lamports: 1_500_000_000 },
        totalValueUsd: 120,
        tokens: [
          { mint: GOLD_MINT, symbol: "GOLD", balance: 0.02, pricePerToken: 5500, usdValue: 110 },
          { mint: USDC_MINT, symbol: "USDC", balance: 10, pricePerToken: 1, usdValue: 10 }
        ]
      }
    });

    expect(snapshot.solBalance).toBeCloseTo(1.5);
    expect(snapshot.goldBalance).toBeCloseTo(0.02);
    expect(snapshot.usdcBalance).toBeCloseTo(10);
    expect(snapshot.totalUsdValue).toBeCloseTo(120);
  });

  it("classifies transfer-only movements into cashflow ledger", () => {
    const cashflow = buildCashflowData({
      transactions: [transferOnly],
      wallet: WALLET,
      excludedSignatures: new Set()
    });

    expect(cashflow.entries.length).toBeGreaterThan(0);
    expect(cashflow.summary.depositCount).toBeGreaterThan(0);
  });

  it("builds venue breakdown with TITAN tagging", () => {
    const titanLike = {
      ...buyJupiter,
      signature: "titan-sig-1",
      source: "TITAN",
      instructions: [{ programId: "T1TANpTeScyeqVzzgNViGDNrkQ6qHz9KrSBS4aNXvGT" }]
    };

    const jupiterTrade = classifyEnhancedTransaction(buyJupiter, context).trade;
    const titanTrade = classifyEnhancedTransaction(titanLike, context).trade;

    const trades = [jupiterTrade, titanTrade].filter(
      (trade): trade is NormalizedGoldTrade => trade !== null
    );

    const fifo = runFifoPnl(trades, USDC_MINT);
    const breakdown = buildVenueBreakdown(trades, fifo, USDC_MINT);

    const sources = breakdown.entries.map((entry) => entry.source);
    expect(sources).toContain("JUPITER");
    expect(sources).toContain("TITAN");
  });

  it("returns no-price unrealized curve when birdeye client is missing", async () => {
    const trades: NormalizedGoldTrade[] = [
      {
        signature: "buy-1",
        slot: 1,
        timestamp: 1700000000,
        status: "SUCCESS",
        wallet: WALLET,
        side: "BUY",
        goldMint: GOLD_MINT,
        goldQty: 0.01,
        quoteMint: USDC_MINT,
        quoteQty: 50,
        priceQuotePerGold: 5000,
        txFeeLamports: 5000,
        source: "JUPITER",
        type: "SWAP",
        venueTag: "JUPITER",
        isOroNative: false,
        programIds: [],
        valuationStatus: "USDC_VALUED"
      }
    ];

    const curve = await buildUnrealizedCurve({
      trades,
      usdcMint: USDC_MINT,
      goldMint: GOLD_MINT,
      startTimeUnix: 1700000000,
      endTimeUnix: 1700086400
    });

    expect(curve.provider).toBe("none");
    expect(curve.points.length).toBeGreaterThan(0);
    expect(curve.warnings.length).toBeGreaterThan(0);
  });
});
