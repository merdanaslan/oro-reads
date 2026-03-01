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
          qtyRemaining: clampNearZero(trade.goldQty),
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
      unknownBasisSellQty = clampNearZero(unknownBasisSellQty + trade.goldQty);
      tradeResults[trade.signature] = {
        signature: trade.signature,
        realizedPnlUsdc: 0,
        matchedQty: 0,
        unknownBasisQty: clampNearZero(trade.goldQty),
        holdingDurationSec: null
      };
      continue;
    }

    const sellUnitPrice = trade.quoteQty / trade.goldQty;
    let remainingSellQty = clampNearZero(trade.goldQty);
    let matchedQty = 0;
    let matchedCost = 0;
    let holdingDurationTotalSec = 0;

    while (remainingSellQty > EPSILON && lots.length > 0) {
      const lot = lots[0];
      const matchedFromLot = Math.min(remainingSellQty, lot.qtyRemaining);

      matchedQty = clampNearZero(matchedQty + matchedFromLot);
      matchedCost += matchedFromLot * lot.unitCostUsdc;
      holdingDurationTotalSec += matchedFromLot * Math.max(0, trade.timestamp - lot.openedAt);

      lot.qtyRemaining = clampNearZero(lot.qtyRemaining - matchedFromLot);
      remainingSellQty = clampNearZero(remainingSellQty - matchedFromLot);

      if (lot.qtyRemaining <= EPSILON) {
        lots.shift();
      }
    }

    const unknownQty = clampNearZero(Math.max(0, remainingSellQty));
    const matchedProceeds = sellUnitPrice * matchedQty;
    const realized = clampNearZero(matchedProceeds - matchedCost);

    realizedPnlUsdc = clampNearZero(realizedPnlUsdc + realized);
    unknownBasisSellQty = clampNearZero(unknownBasisSellQty + unknownQty);
    matchedQtyTotal = clampNearZero(matchedQtyTotal + matchedQty);
    holdingDurationWeightedSec += holdingDurationTotalSec;

    tradeResults[trade.signature] = {
      signature: trade.signature,
      realizedPnlUsdc: clampNearZero(realized),
      matchedQty: clampNearZero(matchedQty),
      unknownBasisQty: clampNearZero(unknownQty),
      holdingDurationSec: matchedQty > EPSILON ? holdingDurationTotalSec / matchedQty : null
    };
  }

  return {
    realizedPnlUsdc: clampNearZero(realizedPnlUsdc),
    unknownBasisSellQty: clampNearZero(unknownBasisSellQty),
    avgHoldingDurationSec:
      matchedQtyTotal > EPSILON ? holdingDurationWeightedSec / matchedQtyTotal : null,
    tradeResults
  };
}

function clampNearZero(value: number): number {
  return Math.abs(value) <= EPSILON ? 0 : value;
}
