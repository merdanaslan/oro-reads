import { EnhancedTransaction } from "../helius/types";
import { computeWalletDeltas } from "../normalize/deltas";
import { CashflowEntry, CashflowSummary } from "../types";

const EPSILON = 1e-9;
export const SOL_NATIVE_MINT = "SOL_NATIVE";

export interface CashflowResult {
  entries: CashflowEntry[];
  summary: CashflowSummary;
}

export function buildCashflowData(input: {
  transactions: EnhancedTransaction[];
  wallet: string;
  excludedSignatures: Set<string>;
}): CashflowResult {
  const entries: CashflowEntry[] = [];

  for (const tx of input.transactions) {
    if (input.excludedSignatures.has(tx.signature)) {
      continue;
    }

    const typeUpper = (tx.type ?? "").toUpperCase();
    const sourceUpper = (tx.source ?? "").toUpperCase();
    const haystack = `${typeUpper} ${sourceUpper}`;

    // Keep cashflows focused on transfer-like movements and funding events.
    if (containsAny(haystack, ["SWAP", "MINT", "REDEEM", "STAKE", "UNSTAKE", "CLAIM", "HARVEST"])) {
      continue;
    }

    const deltas = computeWalletDeltas(tx, input.wallet);

    for (const [mint, delta] of deltas.tokenDeltas.entries()) {
      if (Math.abs(delta) <= EPSILON) {
        continue;
      }

      entries.push({
        signature: tx.signature,
        slot: tx.slot,
        timestamp: tx.timestamp ?? 0,
        status: tx.transactionError ? "FAILED" : "SUCCESS",
        source: tx.source ?? "UNKNOWN",
        type: tx.type ?? "UNKNOWN",
        mint,
        amount: Math.abs(delta),
        direction: delta > 0 ? "DEPOSIT" : "WITHDRAWAL",
        txFeeLamports: tx.fee ?? 0,
        networkFeeSol: (tx.fee ?? 0) / 1_000_000_000
      });
    }

    const nativeDeltaSol = deltas.nativeDeltaLamports / 1_000_000_000;
    if (Math.abs(nativeDeltaSol) > EPSILON) {
      entries.push({
        signature: tx.signature,
        slot: tx.slot,
        timestamp: tx.timestamp ?? 0,
        status: tx.transactionError ? "FAILED" : "SUCCESS",
        source: tx.source ?? "UNKNOWN",
        type: tx.type ?? "UNKNOWN",
        mint: SOL_NATIVE_MINT,
        amount: Math.abs(nativeDeltaSol),
        direction: nativeDeltaSol > 0 ? "DEPOSIT" : "WITHDRAWAL",
        txFeeLamports: tx.fee ?? 0,
        networkFeeSol: (tx.fee ?? 0) / 1_000_000_000
      });
    }
  }

  const sorted = entries.sort((a, b) => {
    if (a.timestamp !== b.timestamp) {
      return a.timestamp - b.timestamp;
    }
    if (a.signature !== b.signature) {
      return a.signature.localeCompare(b.signature);
    }
    return a.mint.localeCompare(b.mint);
  });

  return {
    entries: sorted,
    summary: summarize(sorted)
  };
}

function summarize(entries: CashflowEntry[]): CashflowSummary {
  const totalDepositsByMint: Record<string, number> = {};
  const totalWithdrawalsByMint: Record<string, number> = {};

  let depositCount = 0;
  let withdrawalCount = 0;

  for (const entry of entries) {
    if (entry.direction === "DEPOSIT") {
      depositCount += 1;
      totalDepositsByMint[entry.mint] = (totalDepositsByMint[entry.mint] ?? 0) + entry.amount;
      continue;
    }

    withdrawalCount += 1;
    totalWithdrawalsByMint[entry.mint] = (totalWithdrawalsByMint[entry.mint] ?? 0) + entry.amount;
  }

  const netByMint: Record<string, number> = {};
  const mints = new Set<string>([
    ...Object.keys(totalDepositsByMint),
    ...Object.keys(totalWithdrawalsByMint)
  ]);

  for (const mint of mints) {
    netByMint[mint] = (totalDepositsByMint[mint] ?? 0) - (totalWithdrawalsByMint[mint] ?? 0);
  }

  return {
    depositCount,
    withdrawalCount,
    totalDepositsByMint,
    totalWithdrawalsByMint,
    netByMint
  };
}

function containsAny(haystack: string, keywords: string[]): boolean {
  return keywords.some((keyword) => haystack.includes(keyword));
}
