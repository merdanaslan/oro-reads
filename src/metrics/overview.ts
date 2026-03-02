import { FifoSummary, NormalizedGoldTrade, OverviewMetrics } from "../types";

export function buildOverviewMetrics(
  trades: NormalizedGoldTrade[],
  fifo: FifoSummary,
  usdcMint: string
): OverviewMetrics {
  const firstTradeTimestamp = trades.reduce<number | null>((min, trade) => {
    if (min === null || trade.timestamp < min) {
      return trade.timestamp;
    }
    return min;
  }, null);

  return {
    tradeCount: trades.length,
    firstTradeDate:
      firstTradeTimestamp !== null ? new Date(firstTradeTimestamp * 1000).toISOString() : null,
    goldVolume: sum(trades.map((trade) => trade.goldQty)),
    usdcVolume: sum(
      trades
        .filter((trade) => trade.quoteMint === usdcMint && trade.quoteQty !== null)
        .map((trade) => trade.quoteQty ?? 0)
    ),
    totalFeesLamports: sum(trades.map((trade) => trade.txFeeLamports)),
    realizedPnlUsdc: fifo.realizedPnlUsdc,
    unknownBasisSellQty: fifo.unknownBasisSellQty
  };
}

function sum(values: number[]): number {
  return values.reduce((acc, value) => acc + value, 0);
}
