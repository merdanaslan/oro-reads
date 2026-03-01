import { describe, expect, it } from "vitest";

import buyJupiter from "./fixtures/gold-buy-jupiter.json";
import sellMeteora from "./fixtures/gold-sell-meteora.json";
import buyOroNative from "./fixtures/gold-buy-oro-native.json";
import buyNonUsdc from "./fixtures/gold-buy-non-usdc.json";
import transferOnly from "./fixtures/gold-transfer-only.json";
import mintOro from "./fixtures/gold-mint-oro.json";
import redeemOro from "./fixtures/gold-redeem-oro.json";
import { classifyEnhancedTransaction, ClassifyContext } from "../src/normalize/classify";

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

describe("classifyEnhancedTransaction", () => {
  it("classifies a GOLD buy from Jupiter", () => {
    const result = classifyEnhancedTransaction(buyJupiter, context);
    expect(result.trade).not.toBeNull();
    expect(result.trade?.side).toBe("BUY");
    expect(result.trade?.venueTag).toBe("JUPITER");
    expect(result.trade?.valuationStatus).toBe("USDC_VALUED");
    expect(result.trade?.priceQuotePerGold).toBeCloseTo(2500);
  });

  it("classifies a GOLD sell from Meteora", () => {
    const result = classifyEnhancedTransaction(sellMeteora, context);
    expect(result.trade).not.toBeNull();
    expect(result.trade?.side).toBe("SELL");
    expect(result.trade?.venueTag).toBe("METEORA");
    expect(result.trade?.valuationStatus).toBe("USDC_VALUED");
    expect(result.trade?.priceQuotePerGold).toBeCloseTo(2750);
  });

  it("tags ORO-native trades using program IDs", () => {
    const result = classifyEnhancedTransaction(buyOroNative, context);
    expect(result.trade).not.toBeNull();
    expect(result.trade?.isOroNative).toBe(true);
    expect(result.trade?.venueTag).toBe("ORO_NATIVE");
  });

  it("marks non-USDC quote legs as NO_USDC_LEG", () => {
    const result = classifyEnhancedTransaction(buyNonUsdc, context);
    expect(result.trade).not.toBeNull();
    expect(result.trade?.quoteMint).toBe("So11111111111111111111111111111111111111112");
    expect(result.trade?.valuationStatus).toBe("NO_USDC_LEG");
  });

  it("ignores pure transfer activity", () => {
    const result = classifyEnhancedTransaction(transferOnly, context);
    expect(result.trade).toBeNull();
    expect(result.hasGoldDelta).toBe(true);
    expect(result.needsFallback).toBe(false);
  });

  it("does not treat MINT activity as a swap trade", () => {
    const result = classifyEnhancedTransaction(mintOro, context);
    expect(result.trade).toBeNull();
    expect(result.needsFallback).toBe(false);
  });

  it("does not treat REDEEM activity as a swap trade", () => {
    const result = classifyEnhancedTransaction(redeemOro, context);
    expect(result.trade).toBeNull();
    expect(result.needsFallback).toBe(false);
  });

  it("tags TITAN source swaps as TITAN", () => {
    const titanLike = {
      ...buyJupiter,
      source: "TITAN",
      instructions: [{ programId: "T1TANpTeScyeqVzzgNViGDNrkQ6qHz9KrSBS4aNXvGT" }]
    };
    const result = classifyEnhancedTransaction(titanLike, context);
    expect(result.trade).not.toBeNull();
    expect(result.trade?.venueTag).toBe("TITAN");
  });
});
