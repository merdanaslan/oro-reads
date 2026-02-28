import {
  FifoSummary,
  PerTradeBreakdown,
  PerformanceMetrics,
  PnlBucket,
  NormalizedGoldTrade
} from "../types";

export function buildPerformanceMetrics(
  trades: NormalizedGoldTrade[],
  fifo: FifoSummary,
  usdcMint: string
): PerformanceMetrics {
  const sorted = [...trades].sort((a, b) => {
    if (a.timestamp !== b.timestamp) {
      return a.timestamp - b.timestamp;
    }
    return a.signature.localeCompare(b.signature);
  });

  const buys = sorted.filter(
    (trade) => trade.side === "BUY" && trade.valuationStatus === "USDC_VALUED" && trade.quoteMint === usdcMint
  );
  const sells = sorted.filter(
    (trade) => trade.side === "SELL" && trade.valuationStatus === "USDC_VALUED" && trade.quoteMint === usdcMint
  );

  const avgEntryPrice = weightedAveragePrice(buys);
  const avgExitPrice = weightedAveragePrice(sells);

  const avgPositionSizeGold =
    sorted.length > 0 ? sorted.reduce((acc, trade) => acc + trade.goldQty, 0) / sorted.length : null;

  const perTradeBreakdown: PerTradeBreakdown[] = sorted.map((trade) => {
    const pnl = fifo.tradeResults[trade.signature];
    return {
      signature: trade.signature,
      timestamp: trade.timestamp,
      side: trade.side,
      goldQty: trade.goldQty,
      txFeeLamports: trade.txFeeLamports,
      networkFeeSol: trade.txFeeLamports / 1_000_000_000,
      quoteMint: trade.quoteMint,
      quoteQty: trade.quoteQty,
      priceQuotePerGold: trade.priceQuotePerGold,
      valuationStatus: trade.valuationStatus,
      venueTag: trade.venueTag,
      realizedPnlUsdc: pnl ? pnl.realizedPnlUsdc : null,
      matchedQty: pnl ? pnl.matchedQty : null,
      unknownBasisQty: pnl ? pnl.unknownBasisQty : null,
      holdingDurationSec: pnl ? pnl.holdingDurationSec : null
    };
  });

  return {
    pnlOverTime: {
      daily: aggregatePnl(fifo, sorted, "daily"),
      weekly: aggregatePnl(fifo, sorted, "weekly")
    },
    avgEntryPrice,
    avgExitPrice,
    avgPositionSizeGold,
    avgHoldingDurationSec: fifo.avgHoldingDurationSec,
    perTradeBreakdown
  };
}

function weightedAveragePrice(trades: NormalizedGoldTrade[]): number | null {
  let weightedQuote = 0;
  let totalQty = 0;

  for (const trade of trades) {
    if (trade.quoteQty === null) {
      continue;
    }

    weightedQuote += trade.quoteQty;
    totalQty += trade.goldQty;
  }

  if (totalQty <= 0) {
    return null;
  }

  return weightedQuote / totalQty;
}

function aggregatePnl(
  fifo: FifoSummary,
  trades: NormalizedGoldTrade[],
  granularity: "daily" | "weekly"
): PnlBucket[] {
  const buckets = new Map<string, number>();

  for (const trade of trades) {
    const tradePnl = fifo.tradeResults[trade.signature]?.realizedPnlUsdc ?? 0;
    if (tradePnl === 0) {
      continue;
    }

    const period = granularity === "daily" ? dayBucket(trade.timestamp) : isoWeekBucket(trade.timestamp);
    buckets.set(period, (buckets.get(period) ?? 0) + tradePnl);
  }

  return Array.from(buckets.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([period, realizedPnlUsdc]) => ({ period, realizedPnlUsdc }));
}

function dayBucket(unixSeconds: number): string {
  const date = new Date(unixSeconds * 1000);
  return date.toISOString().slice(0, 10);
}

function isoWeekBucket(unixSeconds: number): string {
  const date = new Date(unixSeconds * 1000);
  const utcDate = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));

  const day = utcDate.getUTCDay() || 7;
  utcDate.setUTCDate(utcDate.getUTCDate() + 4 - day);

  const yearStart = new Date(Date.UTC(utcDate.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil((((utcDate.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
  const year = utcDate.getUTCFullYear();

  return `${year}-W${String(weekNo).padStart(2, "0")}`;
}
