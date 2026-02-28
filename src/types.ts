export type TradeSide = "BUY" | "SELL";

export type VenueTag = "ORO_NATIVE" | "JUPITER" | "METEORA" | "OTHER" | "UNKNOWN";

export type ValuationStatus = "USDC_VALUED" | "NO_USDC_LEG" | "AMBIGUOUS";

export interface NormalizedGoldTrade {
  signature: string;
  slot: number;
  timestamp: number;
  status: "SUCCESS" | "FAILED";
  wallet: string;
  side: TradeSide;
  goldMint: string;
  goldQty: number;
  quoteMint: string | null;
  quoteQty: number | null;
  priceQuotePerGold: number | null;
  txFeeLamports: number;
  source: string;
  type: string;
  venueTag: VenueTag;
  isOroNative: boolean;
  programIds: string[];
  valuationStatus: ValuationStatus;
}

export interface FifoTradeResult {
  signature: string;
  realizedPnlUsdc: number;
  matchedQty: number;
  unknownBasisQty: number;
  holdingDurationSec: number | null;
}

export interface FifoSummary {
  realizedPnlUsdc: number;
  unknownBasisSellQty: number;
  avgHoldingDurationSec: number | null;
  tradeResults: Record<string, FifoTradeResult>;
}

export interface OverviewMetrics {
  tradeCount: number;
  firstTradeDate: string | null;
  goldVolume: number;
  usdcVolume: number;
  totalFeesLamports: number;
  realizedPnlUsdc: number;
  unknownBasisSellQty: number;
}

export interface PnlBucket {
  period: string;
  realizedPnlUsdc: number;
}

export interface PerTradeBreakdown {
  signature: string;
  timestamp: number;
  side: TradeSide;
  goldQty: number;
  txFeeLamports: number;
  networkFeeSol: number;
  quoteMint: string | null;
  quoteQty: number | null;
  priceQuotePerGold: number | null;
  valuationStatus: ValuationStatus;
  venueTag: VenueTag;
  realizedPnlUsdc: number | null;
  matchedQty: number | null;
  unknownBasisQty: number | null;
  holdingDurationSec: number | null;
}

export interface PerformanceMetrics {
  pnlOverTime: {
    daily: PnlBucket[];
    weekly: PnlBucket[];
  };
  avgEntryPrice: number | null;
  avgExitPrice: number | null;
  avgPositionSizeGold: number | null;
  avgHoldingDurationSec: number | null;
  perTradeBreakdown: PerTradeBreakdown[];
}

export interface RunMeta {
  wallet: string;
  startTimeUnix: number;
  endTimeUnix: number;
  sinceDays: number;
  fetchedTransactions: number;
  pagesFetched: number;
  classifiedTrades: number;
  ambiguousTransactions: number;
  parsedFallbackCalls: number;
  rpcFallbackCalls: number;
  warnings: string[];
}
