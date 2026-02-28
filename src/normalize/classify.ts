import { EnhancedTransaction, RpcRawTransaction } from "../helius/types";
import { NormalizedGoldTrade, ValuationStatus, VenueTag } from "../types";
import {
  WalletDeltas,
  computeRawWalletDeltas,
  computeWalletDeltas,
  extractProgramIds,
  extractRawProgramIds
} from "./deltas";

const EPSILON = 1e-9;

export interface ClassifyContext {
  wallet: string;
  goldMint: string;
  usdcMint: string;
  oroProgramIds: Set<string>;
}

export interface ClassificationResult {
  trade: NormalizedGoldTrade | null;
  hasGoldDelta: boolean;
  needsFallback: boolean;
  reason: string;
}

export function classifyEnhancedTransaction(
  tx: EnhancedTransaction,
  ctx: ClassifyContext
): ClassificationResult {
  const deltas = computeWalletDeltas(tx, ctx.wallet);
  const programIds = extractProgramIds(tx);

  const trade = buildTradeFromDeltas({
    signature: tx.signature,
    slot: tx.slot,
    timestamp: tx.timestamp ?? 0,
    txFeeLamports: tx.fee ?? 0,
    source: tx.source ?? "UNKNOWN",
    type: tx.type ?? "UNKNOWN",
    status: tx.transactionError ? "FAILED" : "SUCCESS",
    deltas,
    programIds,
    hasSwapEvidence: hasSwapEvidence(tx),
    ctx
  });

  if (trade === null) {
    const goldDelta = deltas.tokenDeltas.get(ctx.goldMint) ?? 0;
    const hasGoldDelta = Math.abs(goldDelta) > EPSILON;
    const fallbackReason = hasGoldDelta && hasSwapEvidence(tx) ? "needs_enrichment" : "not_trade";
    return {
      trade: null,
      hasGoldDelta,
      needsFallback: fallbackReason === "needs_enrichment",
      reason: fallbackReason
    };
  }

  return {
    trade,
    hasGoldDelta: true,
    needsFallback: trade.valuationStatus === "AMBIGUOUS",
    reason: trade.valuationStatus === "AMBIGUOUS" ? "ambiguous_valuation" : "classified"
  };
}

export function classifyRawFallbackTransaction(
  rawTx: RpcRawTransaction,
  base: {
    signature: string;
    source?: string;
    type?: string;
  },
  ctx: ClassifyContext
): NormalizedGoldTrade | null {
  const deltas = computeRawWalletDeltas(rawTx, ctx.wallet);
  const programIds = extractRawProgramIds(rawTx);

  return buildTradeFromDeltas({
    signature: base.signature,
    slot: rawTx.slot ?? 0,
    timestamp: rawTx.blockTime ?? 0,
    txFeeLamports: rawTx.meta?.fee ?? 0,
    source: base.source ?? "UNKNOWN",
    type: base.type ?? "UNKNOWN",
    status: rawTx.meta?.err ? "FAILED" : "SUCCESS",
    deltas,
    programIds,
    hasSwapEvidence: true,
    ctx
  });
}

interface BuildTradeInput {
  signature: string;
  slot: number;
  timestamp: number;
  txFeeLamports: number;
  source: string;
  type: string;
  status: "SUCCESS" | "FAILED";
  deltas: WalletDeltas;
  programIds: string[];
  hasSwapEvidence: boolean;
  ctx: ClassifyContext;
}

function buildTradeFromDeltas(input: BuildTradeInput): NormalizedGoldTrade | null {
  const goldDelta = input.deltas.tokenDeltas.get(input.ctx.goldMint) ?? 0;
  if (Math.abs(goldDelta) <= EPSILON) {
    return null;
  }

  const side = goldDelta > 0 ? "BUY" : "SELL";
  const oppositeTokenFlows = Array.from(input.deltas.tokenDeltas.entries())
    .filter(([mint]) => mint !== input.ctx.goldMint)
    .filter(([, delta]) => (side === "BUY" ? delta < -EPSILON : delta > EPSILON));

  const nativeCounterflow =
    (side === "BUY" && input.deltas.nativeDeltaLamports < -EPSILON) ||
    (side === "SELL" && input.deltas.nativeDeltaLamports > EPSILON);

  const hasCounterflow = oppositeTokenFlows.length > 0 || nativeCounterflow;
  if (!hasCounterflow && !input.hasSwapEvidence) {
    return null;
  }

  const preferredQuote = selectQuote(oppositeTokenFlows, input.ctx.usdcMint);

  const quoteMint = preferredQuote?.mint ?? null;
  const quoteQty = preferredQuote ? Math.abs(preferredQuote.delta) : null;

  const valuationStatus = determineValuationStatus(quoteMint, input.ctx.usdcMint);
  const priceQuotePerGold =
    quoteQty !== null && quoteQty > EPSILON ? quoteQty / Math.abs(goldDelta) : null;

  const isOroNative = input.programIds.some((programId) => input.ctx.oroProgramIds.has(programId));
  const venueTag = deriveVenueTag(input.source, input.programIds, isOroNative);

  return {
    signature: input.signature,
    slot: input.slot,
    timestamp: input.timestamp,
    status: input.status,
    wallet: input.ctx.wallet,
    side,
    goldMint: input.ctx.goldMint,
    goldQty: Math.abs(goldDelta),
    quoteMint,
    quoteQty,
    priceQuotePerGold,
    txFeeLamports: input.txFeeLamports,
    source: input.source,
    type: input.type,
    venueTag,
    isOroNative,
    programIds: dedupe(input.programIds),
    valuationStatus
  };
}

function hasSwapEvidence(tx: EnhancedTransaction): boolean {
  const type = (tx.type ?? "").toUpperCase();
  if (type.includes("SWAP")) {
    return true;
  }

  if (tx.events?.swap) {
    return true;
  }

  const source = (tx.source ?? "").toUpperCase();
  const swapSources = ["JUPITER", "METEORA", "RAYDIUM", "ORCA", "PHOENIX"];
  return swapSources.some((known) => source.includes(known));
}

function determineValuationStatus(quoteMint: string | null, usdcMint: string): ValuationStatus {
  if (quoteMint === usdcMint) {
    return "USDC_VALUED";
  }

  if (quoteMint) {
    return "NO_USDC_LEG";
  }

  return "AMBIGUOUS";
}

function deriveVenueTag(sourceRaw: string, programIds: string[], isOroNative: boolean): VenueTag {
  if (isOroNative) {
    return "ORO_NATIVE";
  }

  const source = sourceRaw.toUpperCase();
  if (source.includes("JUPITER") || containsAny(programIds, JUPITER_PROGRAM_IDS)) {
    return "JUPITER";
  }

  if (source.includes("METEORA") || containsAny(programIds, METEORA_PROGRAM_IDS)) {
    return "METEORA";
  }

  if (source === "" || source === "UNKNOWN") {
    return "UNKNOWN";
  }

  return "OTHER";
}

function containsAny(values: string[], candidates: ReadonlySet<string>): boolean {
  return values.some((value) => candidates.has(value));
}

function selectQuote(
  flows: [string, number][],
  usdcMint: string
): { mint: string; delta: number } | null {
  if (flows.length === 0) {
    return null;
  }

  const usdc = flows.find(([mint]) => mint === usdcMint);
  if (usdc) {
    return {
      mint: usdc[0],
      delta: usdc[1]
    };
  }

  const sorted = [...flows].sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]));
  return {
    mint: sorted[0][0],
    delta: sorted[0][1]
  };
}

function dedupe(values: string[]): string[] {
  return Array.from(new Set(values));
}

const JUPITER_PROGRAM_IDS = new Set<string>([
  "JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4",
  "JUP4Fb2cqiRUcaTHdrPC8h2gNsA2ETXiPDD33WcGuJB"
]);

const METEORA_PROGRAM_IDS = new Set<string>([
]);
