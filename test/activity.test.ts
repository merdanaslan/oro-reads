import { describe, expect, it } from "vitest";

import buyJupiter from "./fixtures/gold-buy-jupiter.json";
import mintOro from "./fixtures/gold-mint-oro.json";
import redeemOro from "./fixtures/gold-redeem-oro.json";
import stakeOro from "./fixtures/gold-stake-oro.json";
import claimRewardOro from "./fixtures/reward-claim-oro.json";
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
});
