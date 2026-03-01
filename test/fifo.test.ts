import { describe, expect, it } from "vitest";

import { runFifoPnl } from "../src/pnl/fifo";
import { NormalizedGoldTrade } from "../src/types";

const WALLET = "Cm9aaToERd5g3WshAezKfEW2EgdfcB7FqC7LmTaacigQ";
const GOLD_MINT = "GoLDppdjB1vDTPSGxyMJFqdnj134yH6Prg9eqsGDiw6A";
const USDC_MINT = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";

function trade(partial: Partial<NormalizedGoldTrade> & Pick<NormalizedGoldTrade, "signature" | "side" | "goldQty">): NormalizedGoldTrade {
  return {
    slot: 1,
    timestamp: 1,
    status: "SUCCESS",
    wallet: WALLET,
    goldMint: GOLD_MINT,
    quoteMint: USDC_MINT,
    quoteQty: 0,
    priceQuotePerGold: null,
    txFeeLamports: 0,
    source: "JUPITER",
    type: "SWAP",
    venueTag: "JUPITER",
    isOroNative: false,
    programIds: [],
    valuationStatus: "USDC_VALUED",
    ...partial
  };
}

describe("runFifoPnl", () => {
  it("computes realized pnl and unknown basis with FIFO", () => {
    const trades: NormalizedGoldTrade[] = [
      trade({ signature: "buy1", side: "BUY", timestamp: 100, goldQty: 1, quoteQty: 100, priceQuotePerGold: 100 }),
      trade({ signature: "buy2", side: "BUY", timestamp: 120, goldQty: 1, quoteQty: 120, priceQuotePerGold: 120 }),
      trade({ signature: "sell1", side: "SELL", timestamp: 220, goldQty: 2.5, quoteQty: 350, priceQuotePerGold: 140 })
    ];

    const result = runFifoPnl(trades, USDC_MINT);

    expect(result.realizedPnlUsdc).toBeCloseTo(60);
    expect(result.unknownBasisSellQty).toBeCloseTo(0.5);
    expect(result.tradeResults.sell1.matchedQty).toBeCloseTo(2);
    expect(result.tradeResults.sell1.unknownBasisQty).toBeCloseTo(0.5);
    expect(result.tradeResults.sell1.holdingDurationSec).toBeCloseTo(110);
  });

  it("treats non-USDC sell as unknown basis", () => {
    const trades: NormalizedGoldTrade[] = [
      trade({ signature: "sell-non-usdc", side: "SELL", goldQty: 0.2, quoteMint: "So11111111111111111111111111111111111111112", quoteQty: 1, valuationStatus: "NO_USDC_LEG" })
    ];

    const result = runFifoPnl(trades, USDC_MINT);

    expect(result.realizedPnlUsdc).toBe(0);
    expect(result.unknownBasisSellQty).toBeCloseTo(0.2);
  });

  it("clamps floating-point dust to zero on full close", () => {
    const trades: NormalizedGoldTrade[] = [
      trade({ signature: "buy-a", side: "BUY", timestamp: 100, goldQty: 0.1, quoteQty: 1, priceQuotePerGold: 10 }),
      trade({ signature: "buy-b", side: "BUY", timestamp: 110, goldQty: 0.2, quoteQty: 2, priceQuotePerGold: 10 }),
      trade({ signature: "sell-all", side: "SELL", timestamp: 120, goldQty: 0.3, quoteQty: 3, priceQuotePerGold: 10 })
    ];

    const result = runFifoPnl(trades, USDC_MINT);

    expect(result.realizedPnlUsdc).toBe(0);
    expect(result.unknownBasisSellQty).toBe(0);
    expect(result.tradeResults["sell-all"].unknownBasisQty).toBe(0);
  });
});
