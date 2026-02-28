import { FifoSummary, FifoTradeResult, NormalizedGoldTrade } from "../types";

interface Lot {
  qtyRemaining: number;
  unitCostUsdc: number;
  openedAt: number;
}

const EPSILON = 1e-9;

export function runFifoPnl(trades: NormalizedGoldTrade[], usdcMint: string): FifoSummary {
  const sorted = [...trades].sort((a, b) => {
    if (a.timestamp !== b.timestamp) {
      return a.timestamp - b.timestamp;
    }
    return a.signature.localeCompare(b.signature);
  });

  const lots: Lot[] = [];
  const tradeResults: Record<string, FifoTradeResult> = {};
  let realizedPnlUsdc = 0;
  let unknownBasisSellQty = 0;
  let matchedQtyTotal = 0;
  let holdingDurationWeightedSec = 0;

  for (const trade of sorted) {
    if (trade.side === "BUY") {
      if (trade.valuationStatus === "USDC_VALUED" && trade.quoteMint === usdcMint && trade.quoteQty) {
        const unitCostUsdc = trade.quoteQty / trade.goldQty;
        lots.push({
          qtyRemaining: trade.goldQty,
          unitCostUsdc,
          openedAt: trade.timestamp
        });
      }

      tradeResults[trade.signature] = {
        signature: trade.signature,
        realizedPnlUsdc: 0,
        matchedQty: 0,
        unknownBasisQty: 0,
        holdingDurationSec: null
      };
      continue;
    }

    if (trade.valuationStatus !== "USDC_VALUED" || trade.quoteMint !== usdcMint || !trade.quoteQty) {
      unknownBasisSellQty += trade.goldQty;
      tradeResults[trade.signature] = {
        signature: trade.signature,
        realizedPnlUsdc: 0,
        matchedQty: 0,
        unknownBasisQty: trade.goldQty,
        holdingDurationSec: null
      };
      continue;
    }

    const sellUnitPrice = trade.quoteQty / trade.goldQty;
    let remainingSellQty = trade.goldQty;
    let matchedQty = 0;
    let matchedCost = 0;
    let holdingDurationTotalSec = 0;

    while (remainingSellQty > EPSILON && lots.length > 0) {
      const lot = lots[0];
      const matchedFromLot = Math.min(remainingSellQty, lot.qtyRemaining);

      matchedQty += matchedFromLot;
      matchedCost += matchedFromLot * lot.unitCostUsdc;
      holdingDurationTotalSec += matchedFromLot * Math.max(0, trade.timestamp - lot.openedAt);

      lot.qtyRemaining -= matchedFromLot;
      remainingSellQty -= matchedFromLot;

      if (lot.qtyRemaining <= EPSILON) {
        lots.shift();
      }
    }

    const unknownQty = Math.max(0, remainingSellQty);
    const matchedProceeds = sellUnitPrice * matchedQty;
    const realized = matchedProceeds - matchedCost;

    realizedPnlUsdc += realized;
    unknownBasisSellQty += unknownQty;
    matchedQtyTotal += matchedQty;
    holdingDurationWeightedSec += holdingDurationTotalSec;

    tradeResults[trade.signature] = {
      signature: trade.signature,
      realizedPnlUsdc: realized,
      matchedQty,
      unknownBasisQty: unknownQty,
      holdingDurationSec: matchedQty > EPSILON ? holdingDurationTotalSec / matchedQty : null
    };
  }

  return {
    realizedPnlUsdc,
    unknownBasisSellQty,
    avgHoldingDurationSec:
      matchedQtyTotal > EPSILON ? holdingDurationWeightedSec / matchedQtyTotal : null,
    tradeResults
  };
}
