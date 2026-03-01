import { describe, expect, it } from "vitest";

import buyJupiter from "./fixtures/gold-buy-jupiter.json";
import mintOro from "./fixtures/gold-mint-oro.json";
import redeemOro from "./fixtures/gold-redeem-oro.json";
import stakeOro from "./fixtures/gold-stake-oro.json";
import claimRewardOro from "./fixtures/reward-claim-oro.json";
import realUnknownStake from "./fixtures/real-oro-unknown-stake.json";
import realUnknownMint from "./fixtures/real-oro-unknown-mint.json";
import realUnknownRedeem from "./fixtures/real-oro-unknown-redeem.json";
import realUnknownUnstake from "./fixtures/real-oro-unknown-unstake.json";
import realClaimReward from "./fixtures/real-oro-claim-reward.json";
import { buildActivityLedger } from "../src/activities/ledger";
import { buildStakingSummary } from "../src/metrics/staking";
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

describe("activity ledger and staking summary", () => {
  it("builds non-swap activities alongside swaps", () => {
    const txs = [buyJupiter, mintOro, redeemOro, stakeOro, claimRewardOro];

    const tradeMap = new Map(
      txs
        .map((tx) => classifyEnhancedTransaction(tx, context).trade)
        .filter((trade) => trade !== null)
        .map((trade) => [trade.signature, trade])
    );

    const ledger = buildActivityLedger(txs, tradeMap, {
      wallet: WALLET,
      goldMint: GOLD_MINT,
      usdcMint: USDC_MINT,
      oroProgramIds: context.oroProgramIds
    });

    expect(ledger.length).toBe(5);
    expect(ledger.filter((entry) => entry.activityType === "SWAP")).toHaveLength(1);
    expect(ledger.filter((entry) => entry.activityType === "MINT")).toHaveLength(1);
    expect(ledger.filter((entry) => entry.activityType === "REDEEM")).toHaveLength(1);
    expect(ledger.filter((entry) => entry.activityType === "STAKE")).toHaveLength(1);
    expect(ledger.filter((entry) => entry.activityType === "CLAIM_REWARD")).toHaveLength(1);

    const summary = buildStakingSummary(ledger, GOLD_MINT);

    expect(summary.stakeCount).toBe(1);
    expect(summary.unstakeCount).toBe(0);
    expect(summary.claimRewardCount).toBe(1);
    expect(summary.totalStakedGold).toBeCloseTo(0.0005);
    expect(summary.totalUnstakedGold).toBeCloseTo(0);
    expect(summary.netStakedGold).toBeCloseTo(0.0005);
    expect(summary.totalClaimedRewardsByMint).toEqual({
      RwdCLaimTok3n111111111111111111111111111111: 2.5
    });
    expect(summary.totalStakingFeesLamports).toBe(12700);
  });

  it("infers STAKE for ORO-native UNKNOWN stake-like activity", () => {
    const wallet = "DTADb5gofmTux91xuiTVNeSyLnoYweL7MFMVuHimYpTk";
    const localCtx: ClassifyContext = {
      wallet,
      goldMint: GOLD_MINT,
      usdcMint: USDC_MINT,
      oroProgramIds: context.oroProgramIds
    };

    const trade = classifyEnhancedTransaction(realUnknownStake, localCtx).trade;
    const tradeMap = new Map<string, NonNullable<typeof trade>>();
    if (trade) {
      tradeMap.set(trade.signature, trade);
    }

    const ledger = buildActivityLedger([realUnknownStake], tradeMap, {
      wallet,
      goldMint: GOLD_MINT,
      usdcMint: USDC_MINT,
      oroProgramIds: localCtx.oroProgramIds
    });

    expect(ledger).toHaveLength(1);
    expect(ledger[0].activityType).toBe("STAKE");
    expect(ledger[0].source).toBe("UNKNOWN");
  });

  it("maps ORO-native UNKNOWN buy-like flow to MINT activity", () => {
    const wallet = "B2CP2WEFFxx1DFDenirn6hhYD2zFV7VC6PfZzyLYFmMN";
    const localCtx: ClassifyContext = {
      wallet,
      goldMint: GOLD_MINT,
      usdcMint: USDC_MINT,
      oroProgramIds: context.oroProgramIds
    };

    const trade = classifyEnhancedTransaction(realUnknownMint, localCtx).trade;
    expect(trade).not.toBeNull();
    expect(trade?.side).toBe("BUY");

    const tradeMap = new Map<string, NonNullable<typeof trade>>();
    if (trade) {
      tradeMap.set(trade.signature, trade);
    }

    const ledger = buildActivityLedger([realUnknownMint], tradeMap, {
      wallet,
      goldMint: GOLD_MINT,
      usdcMint: USDC_MINT,
      oroProgramIds: localCtx.oroProgramIds
    });

    expect(ledger).toHaveLength(1);
    expect(ledger[0].activityType).toBe("MINT");
    expect(ledger[0].side).toBe("BUY");
  });

  it("maps ORO-native UNKNOWN sell-like flow to REDEEM activity", () => {
    const wallet = "B2CP2WEFFxx1DFDenirn6hhYD2zFV7VC6PfZzyLYFmMN";
    const localCtx: ClassifyContext = {
      wallet,
      goldMint: GOLD_MINT,
      usdcMint: USDC_MINT,
      oroProgramIds: context.oroProgramIds
    };

    const trade = classifyEnhancedTransaction(realUnknownRedeem, localCtx).trade;
    expect(trade).not.toBeNull();
    expect(trade?.side).toBe("SELL");

    const tradeMap = new Map<string, NonNullable<typeof trade>>();
    if (trade) {
      tradeMap.set(trade.signature, trade);
    }

    const ledger = buildActivityLedger([realUnknownRedeem], tradeMap, {
      wallet,
      goldMint: GOLD_MINT,
      usdcMint: USDC_MINT,
      oroProgramIds: localCtx.oroProgramIds
    });

    expect(ledger).toHaveLength(1);
    expect(ledger[0].activityType).toBe("REDEEM");
    expect(ledger[0].side).toBe("SELL");
  });

  it("maps ORO-native UNKNOWN unstake-like flow to UNSTAKE activity", () => {
    const wallet = "B2CP2WEFFxx1DFDenirn6hhYD2zFV7VC6PfZzyLYFmMN";
    const localCtx: ClassifyContext = {
      wallet,
      goldMint: GOLD_MINT,
      usdcMint: USDC_MINT,
      oroProgramIds: context.oroProgramIds
    };

    const trade = classifyEnhancedTransaction(realUnknownUnstake, localCtx).trade;
    expect(trade).toBeNull();

    const tradeMap = new Map<string, NonNullable<typeof trade>>();
    const ledger = buildActivityLedger([realUnknownUnstake], tradeMap, {
      wallet,
      goldMint: GOLD_MINT,
      usdcMint: USDC_MINT,
      oroProgramIds: localCtx.oroProgramIds
    });

    expect(ledger).toHaveLength(1);
    expect(ledger[0].activityType).toBe("UNSTAKE");
    expect(ledger[0].goldDelta).toBeGreaterThan(0);
  });

  it("maps ORO-native UNKNOWN reward-only flow to CLAIM_REWARD activity", () => {
    const unknownClaim = {
      ...claimRewardOro,
      source: "UNKNOWN",
      type: "UNKNOWN",
      instructions: [],
      accountData: [{ account: "iNtiXEFgDNrc6FUt4cFALDe3D8RF3sVnNuKSHwxZRop" }]
    };

    const localCtx: ClassifyContext = {
      wallet: WALLET,
      goldMint: GOLD_MINT,
      usdcMint: USDC_MINT,
      oroProgramIds: context.oroProgramIds
    };

    const trade = classifyEnhancedTransaction(unknownClaim, localCtx).trade;
    expect(trade).toBeNull();

    const tradeMap = new Map<string, NonNullable<typeof trade>>();
    const ledger = buildActivityLedger([unknownClaim], tradeMap, {
      wallet: WALLET,
      goldMint: GOLD_MINT,
      usdcMint: USDC_MINT,
      oroProgramIds: localCtx.oroProgramIds
    });

    expect(ledger).toHaveLength(1);
    expect(ledger[0].activityType).toBe("CLAIM_REWARD");
    expect(ledger[0].rewardMint).toBe("RwdCLaimTok3n111111111111111111111111111111");
    expect(ledger[0].rewardQty).toBeCloseTo(2.5);
  });

  it("maps real TOKEN_MINT reward-only flow to CLAIM_REWARD activity", () => {
    const wallet = "EfAN9h43PBAWZsbUpNshpzZBTJiP6hMgxearRbLndPeb";
    const localCtx: ClassifyContext = {
      wallet,
      goldMint: GOLD_MINT,
      usdcMint: USDC_MINT,
      oroProgramIds: context.oroProgramIds
    };

    const trade = classifyEnhancedTransaction(realClaimReward, localCtx).trade;
    expect(trade).toBeNull();

    const tradeMap = new Map<string, NonNullable<typeof trade>>();
    const ledger = buildActivityLedger([realClaimReward], tradeMap, {
      wallet,
      goldMint: GOLD_MINT,
      usdcMint: USDC_MINT,
      oroProgramIds: localCtx.oroProgramIds
    });

    expect(ledger).toHaveLength(1);
    expect(ledger[0].activityType).toBe("CLAIM_REWARD");
    expect(ledger[0].source).toBe("UNKNOWN");
    expect(ledger[0].type).toBe("TOKEN_MINT");
    expect(ledger[0].rewardMint).toBe("stGkA722tvGBgGwiaUAGmBBtwCGQCQRnHSxe3DWKLNv");
    expect(ledger[0].rewardQty).toBeCloseTo(0.00004);
  });
});
