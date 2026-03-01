import { EnhancedTransaction } from "../helius/types";
import {
  ActivityLedgerEntry,
  ActivityType,
  NormalizedGoldTrade
} from "../types";
import { computeWalletDeltas, extractProgramIds } from "../normalize/deltas";

const EPSILON = 1e-9;

export interface ActivityContext {
  wallet: string;
  goldMint: string;
  usdcMint: string;
  oroProgramIds: Set<string>;
}

export function buildActivityLedger(
  transactions: EnhancedTransaction[],
  swapTradesBySignature: Map<string, NormalizedGoldTrade>,
  ctx: ActivityContext
): ActivityLedgerEntry[] {
  const entries: ActivityLedgerEntry[] = [];

  for (const tx of transactions) {
    const swapTrade = swapTradesBySignature.get(tx.signature);
    if (swapTrade) {
      entries.push(fromSwapTrade(swapTrade, ctx.usdcMint));
      continue;
    }

    const deltas = computeWalletDeltas(tx, ctx.wallet);
    const programIds = extractProgramIds(tx);
    const goldDelta = deltas.tokenDeltas.get(ctx.goldMint) ?? 0;
    const usdcDelta = deltas.tokenDeltas.get(ctx.usdcMint) ?? 0;

    const type = tx.type ?? "UNKNOWN";
    const source = tx.source ?? "UNKNOWN";
    const activityType = classifyNonSwapActivity({
      type,
      source,
      goldDelta,
      usdcDelta,
      isOroNative: programIds.some((programId) => ctx.oroProgramIds.has(programId))
    });

    if (!activityType) {
      continue;
    }

    const reward = activityType === "CLAIM_REWARD"
      ? selectRewardDelta(deltas.tokenDeltas, ctx.goldMint, ctx.usdcMint)
      : { rewardMint: null, rewardQty: null };

    entries.push({
      signature: tx.signature,
      slot: tx.slot,
      timestamp: tx.timestamp ?? 0,
      status: tx.transactionError ? "FAILED" : "SUCCESS",
      wallet: ctx.wallet,
      activityType,
      source,
      type,
      isOroNative: programIds.some((programId) => ctx.oroProgramIds.has(programId)),
      programIds,
      txFeeLamports: tx.fee ?? 0,
      networkFeeSol: (tx.fee ?? 0) / 1_000_000_000,
      goldMint: ctx.goldMint,
      goldDelta,
      usdcMint: ctx.usdcMint,
      usdcDelta,
      side: null,
      goldQty: Math.abs(goldDelta) > EPSILON ? Math.abs(goldDelta) : null,
      quoteMint: null,
      quoteQty: null,
      rewardMint: reward.rewardMint,
      rewardQty: reward.rewardQty
    });
  }

  return entries.sort((a, b) => {
    if (a.timestamp !== b.timestamp) {
      return a.timestamp - b.timestamp;
    }
    return a.signature.localeCompare(b.signature);
  });
}

function fromSwapTrade(trade: NormalizedGoldTrade, usdcMint: string): ActivityLedgerEntry {
  const goldDelta = trade.side === "BUY" ? trade.goldQty : -trade.goldQty;
  const usdcDelta =
    trade.quoteMint === usdcMint && trade.quoteQty !== null
      ? trade.side === "BUY"
        ? -trade.quoteQty
        : trade.quoteQty
      : 0;

  return {
    signature: trade.signature,
    slot: trade.slot,
    timestamp: trade.timestamp,
    status: trade.status,
    wallet: trade.wallet,
    activityType: "SWAP",
    source: trade.source,
    type: trade.type,
    isOroNative: trade.isOroNative,
    programIds: trade.programIds,
    txFeeLamports: trade.txFeeLamports,
    networkFeeSol: trade.txFeeLamports / 1_000_000_000,
    goldMint: trade.goldMint,
    goldDelta,
    usdcMint,
    usdcDelta,
    side: trade.side,
    goldQty: trade.goldQty,
    quoteMint: trade.quoteMint,
    quoteQty: trade.quoteQty,
    rewardMint: null,
    rewardQty: null
  };
}

function classifyNonSwapActivity(input: {
  type: string;
  source: string;
  goldDelta: number;
  usdcDelta: number;
  isOroNative: boolean;
}): ActivityType | null {
  const typeUpper = input.type.toUpperCase();
  const sourceUpper = input.source.toUpperCase();
  const haystack = `${typeUpper} ${sourceUpper}`;

  if (containsWord(haystack, "UNSTAKE") || containsWord(haystack, "WITHDRAW_STAKE")) {
    if (input.isOroNative || Math.abs(input.goldDelta) > EPSILON) {
      return "UNSTAKE";
    }
  }

  if (
    containsWord(haystack, "CLAIM") ||
    containsWord(haystack, "HARVEST") ||
    containsWord(haystack, "REWARD")
  ) {
    if (input.isOroNative) {
      return "CLAIM_REWARD";
    }
  }

  if (containsWord(haystack, "STAKE") || containsWord(haystack, "DEPOSIT_STAKE")) {
    if (input.isOroNative || Math.abs(input.goldDelta) > EPSILON) {
      return "STAKE";
    }
  }

  if (containsWord(haystack, "REDEEM") || containsWord(haystack, "BURN")) {
    if (input.isOroNative || input.goldDelta < -EPSILON) {
      return "REDEEM";
    }
  }

  if (containsWord(haystack, "MINT")) {
    if (input.isOroNative || input.goldDelta > EPSILON) {
      return "MINT";
    }
  }

  // ORO-native fallback: infer mint/redeem semantics from GOLD+USDC flow direction.
  if (input.isOroNative) {
    if (input.goldDelta > EPSILON && input.usdcDelta < -EPSILON) {
      return "MINT";
    }

    if (input.goldDelta < -EPSILON && input.usdcDelta > EPSILON) {
      return "REDEEM";
    }
  }

  return null;
}

function containsWord(haystack: string, keyword: string): boolean {
  return haystack.includes(keyword);
}

function selectRewardDelta(
  tokenDeltas: Map<string, number>,
  goldMint: string,
  usdcMint: string
): { rewardMint: string | null; rewardQty: number | null } {
  const candidates = Array.from(tokenDeltas.entries())
    .filter(([mint, delta]) => mint !== goldMint && mint !== usdcMint && delta > EPSILON)
    .sort((a, b) => b[1] - a[1]);

  if (candidates.length > 0) {
    return {
      rewardMint: candidates[0][0],
      rewardQty: candidates[0][1]
    };
  }

  const fallback = Array.from(tokenDeltas.entries())
    .filter(([, delta]) => delta > EPSILON)
    .sort((a, b) => b[1] - a[1]);

  if (fallback.length > 0) {
    return {
      rewardMint: fallback[0][0],
      rewardQty: fallback[0][1]
    };
  }

  return {
    rewardMint: null,
    rewardQty: null
  };
}
