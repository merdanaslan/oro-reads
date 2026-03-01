import { ActivityLedgerEntry, StakingSummary } from "../types";

export function buildStakingSummary(
  activityLedger: ActivityLedgerEntry[],
  goldMint: string
): StakingSummary {
  const stakingEntries = activityLedger.filter((entry) => isStakingActivity(entry.activityType));

  const stakeEntries = stakingEntries.filter((entry) => entry.activityType === "STAKE");
  const unstakeEntries = stakingEntries.filter((entry) => entry.activityType === "UNSTAKE");
  const claimEntries = stakingEntries.filter((entry) => entry.activityType === "CLAIM_REWARD");

  const totalStakedGold = sum(
    stakeEntries.map((entry) => {
      if (entry.goldMint !== goldMint) {
        return 0;
      }
      return Math.abs(entry.goldDelta);
    })
  );

  const totalUnstakedGold = sum(
    unstakeEntries.map((entry) => {
      if (entry.goldMint !== goldMint) {
        return 0;
      }
      return Math.abs(entry.goldDelta);
    })
  );

  const totalClaimedRewardsByMint: Record<string, number> = {};
  for (const entry of claimEntries) {
    if (!entry.rewardMint || entry.rewardQty === null) {
      continue;
    }

    totalClaimedRewardsByMint[entry.rewardMint] =
      (totalClaimedRewardsByMint[entry.rewardMint] ?? 0) + entry.rewardQty;
  }

  const totalStakingFeesLamports = sum(stakingEntries.map((entry) => entry.txFeeLamports));

  return {
    stakeCount: stakeEntries.length,
    unstakeCount: unstakeEntries.length,
    claimRewardCount: claimEntries.length,
    totalStakedGold,
    totalUnstakedGold,
    netStakedGold: totalStakedGold - totalUnstakedGold,
    totalClaimedRewardsByMint,
    totalStakingFeesLamports,
    totalStakingFeesSol: totalStakingFeesLamports / 1_000_000_000
  };
}

function isStakingActivity(type: ActivityLedgerEntry["activityType"]): boolean {
  return type === "STAKE" || type === "UNSTAKE" || type === "CLAIM_REWARD";
}

function sum(values: number[]): number {
  return values.reduce((acc, value) => acc + value, 0);
}
