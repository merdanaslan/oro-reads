import { parseConfig, usage } from "./config";
import { HeliusClient } from "./helius/client";
import { EnhancedTransaction, HeliusWalletBalancesResponse } from "./helius/types";
import { buildActivityLedger } from "./activities/ledger";
import { buildBalanceSnapshot } from "./balances/snapshot";
import { BirdeyeClient } from "./birdeye/client";
import { buildCashflowData } from "./cashflow/classify";
import { buildOverviewMetrics } from "./metrics/overview";
import { buildPerformanceMetrics } from "./metrics/performance";
import { buildStakingSummary } from "./metrics/staking";
import { buildUnrealizedCurve } from "./metrics/unrealized";
import { buildVenueBreakdown } from "./metrics/venue";
import {
  ClassifyContext,
  ClassificationResult,
  classifyEnhancedTransaction,
  classifyRawFallbackTransaction
} from "./normalize/classify";
import { writeOutputs } from "./output/write";
import { runFifoPnl } from "./pnl/fifo";
import { NormalizedGoldTrade, RunMeta } from "./types";

export async function runCli(argv: string[], env: NodeJS.ProcessEnv): Promise<void> {
  let config;

  try {
    config = parseConfig(argv, env);
  } catch (error) {
    const message = String((error as Error).message ?? error);
    if (message.includes("Usage:")) {
      console.log(message);
      return;
    }
    throw error;
  }

  const endTimeUnix = Math.floor(Date.now() / 1000);
  const startTimeUnix = endTimeUnix - config.sinceDays * 24 * 60 * 60;

  const client = new HeliusClient({ apiKey: config.apiKey });

  const history = await client.getTransactionsByAddress({
    wallet: config.wallet,
    startTimeUnix,
    pageLimit: config.pageLimit
  });

  const bySignature = new Map<string, EnhancedTransaction>(
    history.transactions.map((tx) => [tx.signature, tx])
  );

  const classifyCtx: ClassifyContext = {
    wallet: config.wallet,
    goldMint: config.goldMint,
    usdcMint: config.usdcMint,
    oroProgramIds: new Set(config.oroProgramIds)
  };

  const warnings: string[] = [];

  const firstPass = classifyAll(Array.from(bySignature.values()), classifyCtx);

  let parsedFallbackCalls = 0;
  if (firstPass.ambiguousSignatures.length > 0) {
    parsedFallbackCalls = Math.ceil(firstPass.ambiguousSignatures.length / 100);
    const parsed = await client.parseTransactions(firstPass.ambiguousSignatures);
    for (const tx of parsed) {
      bySignature.set(tx.signature, tx);
    }
  }

  const secondPass = classifyAll(Array.from(bySignature.values()), classifyCtx);
  const recoveredTrades = new Map<string, NormalizedGoldTrade>(
    secondPass.tradeMap.entries()
  );

  let rpcFallbackCalls = 0;
  for (const signature of secondPass.ambiguousSignatures) {
    const raw = await client.getRawTransaction(signature);
    rpcFallbackCalls += 1;

    if (!raw) {
      warnings.push(`RPC fallback returned null for ${signature}`);
      continue;
    }

    const baseTx = bySignature.get(signature);
    const recovered = classifyRawFallbackTransaction(
      raw,
      {
        signature,
        source: baseTx?.source,
        type: baseTx?.type
      },
      classifyCtx
    );

    if (recovered) {
      recoveredTrades.set(signature, recovered);
      continue;
    }

    warnings.push(`RPC fallback could not classify ${signature}`);
  }

  for (const signature of secondPass.unclassifiedGoldSignatures) {
    warnings.push(`Gold delta detected but unclassified: ${signature}`);
  }

  const unresolvedAmbiguous = collectUnresolvedAmbiguousSignatures(
    secondPass.ambiguousSignatures,
    recoveredTrades
  );

  const normalizedTradesAll = Array.from(recoveredTrades.values()).sort((a, b) => {
    if (a.timestamp !== b.timestamp) {
      return a.timestamp - b.timestamp;
    }
    return a.signature.localeCompare(b.signature);
  });

  const { trades: normalizedTrades, droppedFailedTradeCount } =
    filterSuccessfulTrades(normalizedTradesAll);
  if (droppedFailedTradeCount > 0) {
    warnings.push(`Excluded ${droppedFailedTradeCount} failed trade(s) from analytics outputs.`);
  }

  const fifo = runFifoPnl(normalizedTrades, config.usdcMint);
  const activityLedger = buildActivityLedger(
    Array.from(bySignature.values()),
    recoveredTrades,
    {
      wallet: config.wallet,
      goldMint: config.goldMint,
      usdcMint: config.usdcMint,
      oroProgramIds: new Set(config.oroProgramIds)
    }
  );
  const cashflow = buildCashflowData({
    transactions: Array.from(bySignature.values()),
    wallet: config.wallet,
    excludedSignatures: new Set(activityLedger.map((entry) => entry.signature))
  });

  let walletBalances: HeliusWalletBalancesResponse = {};
  try {
    walletBalances = await client.getWalletBalances(config.wallet);
  } catch (error) {
    warnings.push(`Wallet balances fetch failed: ${String(error)}`);
  }
  const balanceSnapshot = buildBalanceSnapshot({
    wallet: config.wallet,
    asOfUnix: endTimeUnix,
    balances: walletBalances,
    goldMint: config.goldMint,
    usdcMint: config.usdcMint
  });

  const overview = buildOverviewMetrics(normalizedTrades, fifo, config.usdcMint);
  const performance = buildPerformanceMetrics(normalizedTrades, fifo, config.usdcMint);
  const venueBreakdown = buildVenueBreakdown(normalizedTrades, fifo, config.usdcMint);
  const stakingSummary = buildStakingSummary(activityLedger, config.goldMint);
  const birdeyeApiKey = (env.BIRDEYE_API_KEY ?? "").trim();
  const birdeyeClient = birdeyeApiKey
    ? new BirdeyeClient({ apiKey: birdeyeApiKey })
    : undefined;
  const unrealizedCurve = await buildUnrealizedCurve({
    trades: normalizedTrades,
    usdcMint: config.usdcMint,
    goldMint: config.goldMint,
    startTimeUnix,
    endTimeUnix,
    interval: config.unrealizedInterval,
    birdeyeClient
  });
  warnings.push(...unrealizedCurve.warnings);

  const runMeta: RunMeta = {
    wallet: config.wallet,
    startTimeUnix,
    endTimeUnix,
    sinceDays: config.sinceDays,
    unrealizedInterval: config.unrealizedInterval,
    fetchedTransactions: history.transactions.length,
    pagesFetched: history.pagesFetched,
    classifiedTrades: normalizedTrades.length,
    ambiguousTransactions: unresolvedAmbiguous.length,
    parsedFallbackCalls,
    rpcFallbackCalls,
    warnings
  };

  await writeOutputs(config.outDir, {
    normalizedTrades,
    activityLedger,
    balanceSnapshot,
    cashflowLedger: cashflow.entries,
    cashflowSummary: cashflow.summary,
    overview,
    performance,
    venueBreakdown,
    stakingSummary,
    unrealizedCurve,
    runMeta
  });

  console.log(`Wallet: ${config.wallet}`);
  console.log(`Fetched transactions: ${history.transactions.length} across ${history.pagesFetched} page(s)`);
  console.log(`Classified GOLD trades: ${normalizedTrades.length}`);
  console.log(`Activity ledger rows: ${activityLedger.length}`);
  console.log(`Cashflow rows: ${cashflow.entries.length}`);
  console.log(`Output directory: ${config.outDir}`);
}

interface ClassificationPass {
  tradeMap: Map<string, NormalizedGoldTrade>;
  ambiguousSignatures: string[];
  unclassifiedGoldSignatures: string[];
}

export function collectUnresolvedAmbiguousSignatures(
  ambiguousSignatures: string[],
  recoveredTrades: Map<string, NormalizedGoldTrade>
): string[] {
  return ambiguousSignatures.filter((signature) => {
    const maybeTrade = recoveredTrades.get(signature);
    return !maybeTrade || maybeTrade.valuationStatus === "AMBIGUOUS";
  });
}

export function filterSuccessfulTrades(trades: NormalizedGoldTrade[]): {
  trades: NormalizedGoldTrade[];
  droppedFailedTradeCount: number;
} {
  const successfulTrades = trades.filter((trade) => trade.status === "SUCCESS");
  return {
    trades: successfulTrades,
    droppedFailedTradeCount: trades.length - successfulTrades.length
  };
}

function classifyAll(transactions: EnhancedTransaction[], ctx: ClassifyContext): ClassificationPass {
  const tradeMap = new Map<string, NormalizedGoldTrade>();
  const ambiguousSignatures = new Set<string>();
  const unclassifiedGoldSignatures = new Set<string>();

  for (const tx of transactions) {
    const result: ClassificationResult = classifyEnhancedTransaction(tx, ctx);
    if (result.trade) {
      tradeMap.set(result.trade.signature, result.trade);
    }

    if (result.needsFallback) {
      ambiguousSignatures.add(tx.signature);
    }

    if (result.hasGoldDelta && !result.trade && result.reason !== "not_trade") {
      unclassifiedGoldSignatures.add(tx.signature);
    }
  }

  return {
    tradeMap,
    ambiguousSignatures: Array.from(ambiguousSignatures),
    unclassifiedGoldSignatures: Array.from(unclassifiedGoldSignatures)
  };
}

export async function runFromProcess(): Promise<void> {
  try {
    await runCli(process.argv.slice(2), process.env);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(message);
    console.error("\n" + usage());
    process.exitCode = 1;
  }
}
