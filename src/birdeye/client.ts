export interface BirdeyeClientOptions {
  apiKey: string;
  fetchFn?: typeof fetch;
  maxRetries?: number;
  baseDelayMs?: number;
}

export interface BirdeyePricePoint {
  unixTime: number;
  price: number;
}

export class BirdeyeClient {
  private readonly apiKey: string;
  private readonly fetchFn: typeof fetch;
  private readonly maxRetries: number;
  private readonly baseDelayMs: number;

  public constructor(options: BirdeyeClientOptions) {
    this.apiKey = options.apiKey;
    this.fetchFn = options.fetchFn ?? fetch;
    this.maxRetries = options.maxRetries ?? 4;
    this.baseDelayMs = options.baseDelayMs ?? 350;
  }

  public async getPriceSeries(input: {
    mint: string;
    timeFromUnix: number;
    timeToUnix: number;
    interval: string;
  }): Promise<BirdeyePricePoint[]> {
    const query = new URLSearchParams({
      address: input.mint,
      address_type: "token",
      type: input.interval,
      time_from: String(input.timeFromUnix),
      time_to: String(input.timeToUnix)
    });

    const url = `https://public-api.birdeye.so/defi/history_price?${query.toString()}`;
    const json = await this.requestJson<Record<string, unknown>>(url, {
      method: "GET",
      headers: {
        "x-api-key": this.apiKey,
        "x-chain": "solana",
        Accept: "application/json"
      }
    });

    return extractPricePoints(json);
  }

  private async requestJson<T>(url: string, init: RequestInit): Promise<T> {
    let lastError: unknown;

    for (let attempt = 0; attempt <= this.maxRetries; attempt += 1) {
      try {
        const response = await this.fetchFn(url, init);

        if (response.ok) {
          return (await response.json()) as T;
        }

        if (response.status === 429 || response.status >= 500) {
          await sleep(this.baseDelayMs * 2 ** attempt + Math.floor(Math.random() * 120));
          continue;
        }

        const text = await response.text();
        throw new Error(`Birdeye request failed (${response.status}): ${text.slice(0, 280)}`);
      } catch (error) {
        lastError = error;
        if (attempt === this.maxRetries) {
          break;
        }
        await sleep(this.baseDelayMs * 2 ** attempt + Math.floor(Math.random() * 120));
      }
    }

    throw new Error(`Birdeye request failed after retries: ${String(lastError)}`);
  }
}

function extractPricePoints(payload: Record<string, unknown>): BirdeyePricePoint[] {
  const points: BirdeyePricePoint[] = [];

  const candidates = collectObjects(payload);
  for (const item of candidates) {
    const unixTime = toNumber(item.unixTime ?? item.unix_time ?? item.time ?? item.timestamp);
    const rawPrice = firstFinite([
      toNumber(item.price),
      toNumber(item.value),
      toNumber(item.close),
      toNumber(item.close_price)
    ]);

    if (!Number.isFinite(unixTime) || !Number.isFinite(rawPrice)) {
      continue;
    }

    points.push({
      unixTime,
      price: rawPrice
    });
  }

  return points.sort((a, b) => a.unixTime - b.unixTime);
}

function collectObjects(value: unknown): Record<string, unknown>[] {
  if (Array.isArray(value)) {
    return value.filter((item): item is Record<string, unknown> => typeof item === "object" && item !== null);
  }

  if (value && typeof value === "object") {
    const obj = value as Record<string, unknown>;
    const nestedArrays: Record<string, unknown>[] = [];
    for (const nested of Object.values(obj)) {
      nestedArrays.push(...collectObjects(nested));
    }

    const maybeItem = hasAnyKey(obj, ["price", "value", "close", "unixTime", "unix_time", "time"])
      ? [obj]
      : [];

    return [...maybeItem, ...nestedArrays];
  }

  return [];
}

function hasAnyKey(obj: Record<string, unknown>, keys: string[]): boolean {
  return keys.some((key) => key in obj);
}

function toNumber(value: unknown): number {
  if (typeof value === "number") {
    return value;
  }

  if (typeof value === "string") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : Number.NaN;
  }

  return Number.NaN;
}

function firstFinite(values: number[]): number {
  for (const value of values) {
    if (Number.isFinite(value)) {
      return value;
    }
  }
  return Number.NaN;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
