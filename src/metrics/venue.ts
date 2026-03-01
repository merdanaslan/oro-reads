import { FifoSummary, NormalizedGoldTrade, VenueBreakdown, VenueBreakdownEntry } from "../types";

export function buildVenueBreakdown(
  trades: NormalizedGoldTrade[],
  fifo: FifoSummary,
  usdcMint: string
): VenueBreakdown {
  const map = new Map<string, VenueBreakdownEntry>();

  for (const trade of trades) {
    const source = normalizeSource(trade.source);
    const existing =
      map.get(source) ??
      ({
        source,
        tradeCount: 0,
        buyCount: 0,
        sellCount: 0,
        totalGoldVolume: 0,
        totalUsdcVolume: 0,
        totalFeesLamports: 0,
        totalFeesSol: 0,
        realizedPnlUsdc: 0,
        winningSellCount: 0,
        losingSellCount: 0
      } satisfies VenueBreakdownEntry);

    existing.tradeCount += 1;
    existing.totalGoldVolume += trade.goldQty;
    existing.totalFeesLamports += trade.txFeeLamports;

    if (trade.quoteMint === usdcMint && trade.quoteQty !== null) {
      existing.totalUsdcVolume += trade.quoteQty;
    }

    if (trade.side === "BUY") {
      existing.buyCount += 1;
    } else {
      existing.sellCount += 1;
    }

    const pnl = fifo.tradeResults[trade.signature];
    if (pnl) {
      existing.realizedPnlUsdc += pnl.realizedPnlUsdc;
      if (trade.side === "SELL" && pnl.matchedQty > 0) {
        if (pnl.realizedPnlUsdc > 0) {
          existing.winningSellCount += 1;
        } else if (pnl.realizedPnlUsdc < 0) {
          existing.losingSellCount += 1;
        }
      }
    }

    map.set(source, existing);
  }

  const entries = Array.from(map.values())
    .map((entry) => ({
      ...entry,
      totalFeesSol: entry.totalFeesLamports / 1_000_000_000
    }))
    .sort((a, b) => b.totalUsdcVolume - a.totalUsdcVolume);

  return { entries };
}

function normalizeSource(source: string): string {
  const value = source.trim();
  if (!value) {
    return "UNKNOWN";
  }
  return value.toUpperCase();
}
