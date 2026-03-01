export type TradeSide = "BUY" | "SELL";

export type VenueTag = "ORO_NATIVE" | "JUPITER" | "METEORA" | "TITAN" | "OTHER" | "UNKNOWN";

export type ValuationStatus = "USDC_VALUED" | "NO_USDC_LEG" | "AMBIGUOUS";

export type ActivityType =
  | "SWAP"
  | "MINT"
  | "REDEEM"
  | "STAKE"
  | "UNSTAKE"
  | "CLAIM_REWARD";

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
  unrealizedInterval?: string;
  fetchedTransactions: number;
  pagesFetched: number;
  classifiedTrades: number;
  ambiguousTransactions: number;
  parsedFallbackCalls: number;
  rpcFallbackCalls: number;
  warnings: string[];
}

export interface ActivityLedgerEntry {
  signature: string;
  slot: number;
  timestamp: number;
  status: "SUCCESS" | "FAILED";
  wallet: string;
  activityType: ActivityType;
  source: string;
  type: string;
  isOroNative: boolean;
  programIds: string[];
  txFeeLamports: number;
  networkFeeSol: number;
  goldMint: string;
  goldDelta: number;
  usdcMint: string;
  usdcDelta: number;
  side: TradeSide | null;
  goldQty: number | null;
  quoteMint: string | null;
  quoteQty: number | null;
  rewardMint: string | null;
  rewardQty: number | null;
}

export interface StakingSummary {
  stakeCount: number;
  unstakeCount: number;
  claimRewardCount: number;
  totalStakedGold: number;
  totalUnstakedGold: number;
  netStakedGold: number;
  totalClaimedRewardsByMint: Record<string, number>;
  totalStakingFeesLamports: number;
  totalStakingFeesSol: number;
}

export interface WalletBalanceToken {
  mint: string;
  symbol: string | null;
  name: string | null;
  balance: number;
  decimals: number | null;
  tokenProgram: string | null;
  pricePerToken: number | null;
  usdValue: number | null;
}

export interface BalanceSnapshot {
  wallet: string;
  asOfUnix: number;
  totalUsdValue: number;
  solBalance: number;
  goldBalance: number;
  usdcBalance: number;
  tokens: WalletBalanceToken[];
}

export type CashflowDirection = "DEPOSIT" | "WITHDRAWAL";

export interface CashflowEntry {
  signature: string;
  slot: number;
  timestamp: number;
  status: "SUCCESS" | "FAILED";
  source: string;
  type: string;
  mint: string;
  amount: number;
  direction: CashflowDirection;
  txFeeLamports: number;
  networkFeeSol: number;
}

export interface CashflowSummary {
  depositCount: number;
  withdrawalCount: number;
  totalDepositsByMint: Record<string, number>;
  totalWithdrawalsByMint: Record<string, number>;
  netByMint: Record<string, number>;
}

export interface VenueBreakdownEntry {
  source: string;
  tradeCount: number;
  buyCount: number;
  sellCount: number;
  totalGoldVolume: number;
  totalUsdcVolume: number;
  totalFeesLamports: number;
  totalFeesSol: number;
  realizedPnlUsdc: number;
  winningSellCount: number;
  losingSellCount: number;
}

export interface VenueBreakdown {
  entries: VenueBreakdownEntry[];
}

export interface UnrealizedCurvePoint {
  period: string;
  goldPositionQty: number;
  usdcCash: number;
  goldPriceUsd: number | null;
  equityUsd: number | null;
  drawdownPct: number | null;
}

export interface UnrealizedCurve {
  provider: "birdeye" | "none";
  points: UnrealizedCurvePoint[];
  maxDrawdownPct: number | null;
  warnings: string[];
}
