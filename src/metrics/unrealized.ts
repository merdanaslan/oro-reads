import { BirdeyeClient } from "../birdeye/client";
import { NormalizedGoldTrade, UnrealizedCurve, UnrealizedCurvePoint } from "../types";

const EPSILON = 1e-9;

export async function buildUnrealizedCurve(input: {
  trades: NormalizedGoldTrade[];
  usdcMint: string;
  goldMint: string;
  startTimeUnix: number;
  endTimeUnix: number;
  interval?: string;
  birdeyeClient?: BirdeyeClient;
}): Promise<UnrealizedCurve> {
  const warnings: string[] = [];
  const interval = input.interval ?? "1D";
  const intervalSeconds = intervalToSeconds(interval);
  if (intervalSeconds <= 0) {
    return {
      provider: input.birdeyeClient ? "birdeye" : "none",
      points: [],
      maxDrawdownPct: null,
      warnings: [`Unsupported unrealized interval: ${interval}`]
    };
  }

  const fallbackBuckets = listBuckets(input.startTimeUnix, input.endTimeUnix, intervalSeconds);
  if (fallbackBuckets.length === 0) {
    return {
      provider: input.birdeyeClient ? "birdeye" : "none",
      points: [],
      maxDrawdownPct: null,
      warnings
    };
  }

  const pricesByBucketStart = new Map<number, number>();
  let buckets = fallbackBuckets;

  if (input.birdeyeClient) {
    try {
      const fetched = await input.birdeyeClient.getPriceSeries({
        mint: input.goldMint,
        timeFromUnix: input.startTimeUnix,
        timeToUnix: input.endTimeUnix,
        interval
      });

      if (fetched.length > 0) {
        buckets = fetched.map((point) => ({
          startUnix: point.unixTime,
          endUnix: point.unixTime
        }));
      }

      for (const point of fetched) {
        pricesByBucketStart.set(point.unixTime, point.price);
      }
    } catch (error) {
      warnings.push(`Birdeye price fetch failed: ${String(error)}`);
    }
  } else {
    warnings.push("BIRDEYE_API_KEY not configured; unrealized curve returned without pricing.");
  }

  const trades = [...input.trades]
    .filter((trade) => trade.goldMint === input.goldMint)
    .sort((a, b) => {
      if (a.timestamp !== b.timestamp) {
        return a.timestamp - b.timestamp;
      }
      return a.signature.localeCompare(b.signature);
    });

  const points: UnrealizedCurvePoint[] = [];
  let tradeIndex = 0;
  let goldPositionQty = 0;
  let usdcCash = 0;
  let peakEquity: number | null = null;
  let maxDrawdownPct: number | null = null;

  for (const bucket of buckets) {
    const periodEndUnix = bucket.endUnix;

    while (tradeIndex < trades.length && trades[tradeIndex].timestamp <= periodEndUnix) {
      const trade = trades[tradeIndex];
      if (trade.quoteMint === input.usdcMint && trade.quoteQty !== null) {
        if (trade.side === "BUY") {
          goldPositionQty = clampNearZero(goldPositionQty + trade.goldQty);
          usdcCash = clampNearZero(usdcCash - trade.quoteQty);
        } else {
          goldPositionQty = clampNearZero(goldPositionQty - trade.goldQty);
          usdcCash = clampNearZero(usdcCash + trade.quoteQty);
        }
      }
      tradeIndex += 1;
    }

    const goldPriceUsd = pricesByBucketStart.get(bucket.startUnix) ?? null;
    const equityUsd =
      goldPriceUsd !== null ? clampNearZero(usdcCash + goldPositionQty * goldPriceUsd) : null;

    let drawdownPct: number | null = null;
    if (equityUsd !== null) {
      if (peakEquity === null || equityUsd > peakEquity) {
        peakEquity = equityUsd;
      }

      if (peakEquity !== null && peakEquity > 0) {
        drawdownPct = ((equityUsd - peakEquity) / peakEquity) * 100;
        if (maxDrawdownPct === null || drawdownPct < maxDrawdownPct) {
          maxDrawdownPct = drawdownPct;
        }
      }
    }

    points.push({
      period: formatPeriod(bucket.startUnix, intervalSeconds),
      goldPositionQty,
      usdcCash,
      goldPriceUsd,
      equityUsd,
      drawdownPct
    });
  }

  return {
    provider: input.birdeyeClient ? "birdeye" : "none",
    points,
    maxDrawdownPct,
    warnings
  };
}

interface TimeBucket {
  startUnix: number;
  endUnix: number;
}

function listBuckets(startUnix: number, endUnix: number, intervalSeconds: number): TimeBucket[] {
  if (endUnix < startUnix) {
    return [];
  }

  const alignedStart = Math.floor(startUnix / intervalSeconds) * intervalSeconds;
  const buckets: TimeBucket[] = [];

  for (let start = alignedStart; start <= endUnix; start += intervalSeconds) {
    buckets.push({
      startUnix: start,
      endUnix: Math.min(start + intervalSeconds - 1, endUnix)
    });
  }

  return buckets;
}

function intervalToSeconds(interval: string): number {
  const normalized = interval.trim();
  const match = normalized.match(/^(\d+)([mHDWM])$/);
  if (!match) {
    return 0;
  }

  const value = Number(match[1]);
  const unit = match[2];
  if (!Number.isFinite(value) || value <= 0) {
    return 0;
  }

  const unitSeconds =
    unit === "m"
      ? 60
      : unit === "H"
        ? 3600
        : unit === "D"
          ? 86400
          : unit === "W"
            ? 604800
            : 2592000;

  return value * unitSeconds;
}

function formatPeriod(unixTime: number, intervalSeconds: number): string {
  if (intervalSeconds >= 86400) {
    return new Date(unixTime * 1000).toISOString().slice(0, 10);
  }
  return new Date(unixTime * 1000).toISOString();
}

function clampNearZero(value: number): number {
  return Math.abs(value) <= EPSILON ? 0 : value;
}
