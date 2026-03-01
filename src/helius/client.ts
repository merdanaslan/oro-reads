import {
  EnhancedTransaction,
  FetchAddressTransactionsResult,
  HeliusWalletBalancesResponse,
  RpcRawTransaction
} from "./types";

export interface HeliusClientOptions {
  apiKey: string;
  maxRetries?: number;
  baseDelayMs?: number;
  fetchFn?: typeof fetch;
}

export interface AddressHistoryParams {
  wallet: string;
  startTimeUnix: number;
  pageLimit?: number;
}

export class HeliusClient {
  private readonly apiKey: string;
  private readonly maxRetries: number;
  private readonly baseDelayMs: number;
  private readonly fetchFn: typeof fetch;

  public constructor(options: HeliusClientOptions) {
    this.apiKey = options.apiKey;
    this.maxRetries = options.maxRetries ?? 5;
    this.baseDelayMs = options.baseDelayMs ?? 350;
    this.fetchFn = options.fetchFn ?? fetch;
  }

  public async getTransactionsByAddress(
    params: AddressHistoryParams
  ): Promise<FetchAddressTransactionsResult> {
    const pageLimit = params.pageLimit ?? 100;
    const collected: EnhancedTransaction[] = [];
    let before: string | undefined;
    let pagesFetched = 0;

    while (true) {
      const query = new URLSearchParams({
        "api-key": this.apiKey,
        limit: String(pageLimit),
        "sort-order": "desc",
        "start-time": String(params.startTimeUnix)
      });

      if (before) {
        query.set("before", before);
      }

      const url = `https://api.helius.xyz/v0/addresses/${params.wallet}/transactions?${query.toString()}`;
      const page = await this.requestJson<EnhancedTransaction[]>(url, {
        method: "GET"
      });

      pagesFetched += 1;

      if (!Array.isArray(page) || page.length === 0) {
        break;
      }

      for (const tx of page) {
        const timestamp = tx.timestamp ?? 0;
        if (timestamp >= params.startTimeUnix) {
          collected.push(tx);
        }
      }

      const oldestTimestamp = page.reduce((min, tx) => {
        const ts = tx.timestamp ?? Number.MAX_SAFE_INTEGER;
        return Math.min(min, ts);
      }, Number.MAX_SAFE_INTEGER);

      if (oldestTimestamp < params.startTimeUnix) {
        break;
      }

      before = page[page.length - 1]?.signature;
      if (!before) {
        break;
      }
    }

    return {
      transactions: dedupeBySignature(collected),
      pagesFetched
    };
  }

  public async parseTransactions(signatures: string[]): Promise<EnhancedTransaction[]> {
    const unique = dedupe(signatures);
    const batches = chunk(unique, 100);
    const parsed: EnhancedTransaction[] = [];

    for (const batch of batches) {
      const url = `https://api.helius.xyz/v0/transactions?api-key=${encodeURIComponent(
        this.apiKey
      )}`;
      const response = await this.requestJson<EnhancedTransaction[]>(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ transactions: batch })
      });

      if (Array.isArray(response)) {
        parsed.push(...response);
      }
    }

    return dedupeBySignature(parsed);
  }

  public async getRawTransaction(signature: string): Promise<RpcRawTransaction | null> {
    const url = `https://mainnet.helius-rpc.com/?api-key=${encodeURIComponent(this.apiKey)}`;
    const response = await this.requestJson<{ result: RpcRawTransaction | null }>(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "getTransaction",
        params: [
          signature,
          {
            encoding: "jsonParsed",
            maxSupportedTransactionVersion: 0,
            commitment: "confirmed"
          }
        ]
      })
    });

    return response.result ?? null;
  }

  public async getWalletBalances(wallet: string): Promise<HeliusWalletBalancesResponse> {
    const query = new URLSearchParams({
      "api-key": this.apiKey
    });
    const url = `https://api.helius.xyz/v1/wallet/${wallet}/balances?${query.toString()}`;
    const payload = await this.requestJson<Record<string, unknown>>(url, {
      method: "GET"
    });
    return unwrapWalletBalances(payload);
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
          await sleep(this.delayForAttempt(attempt));
          continue;
        }

        const text = await response.text();
        throw new Error(`Helius request failed (${response.status}): ${text.slice(0, 280)}`);
      } catch (error) {
        lastError = error;
        if (attempt === this.maxRetries) {
          break;
        }
        await sleep(this.delayForAttempt(attempt));
      }
    }

    throw new Error(`Helius request failed after retries: ${String(lastError)}`);
  }

  private delayForAttempt(attempt: number): number {
    const jitter = Math.floor(Math.random() * 120);
    return this.baseDelayMs * 2 ** attempt + jitter;
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function chunk<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
}

function dedupe(values: string[]): string[] {
  return Array.from(new Set(values));
}

function dedupeBySignature(transactions: EnhancedTransaction[]): EnhancedTransaction[] {
  const map = new Map<string, EnhancedTransaction>();
  for (const tx of transactions) {
    map.set(tx.signature, tx);
  }
  return Array.from(map.values());
}

function unwrapWalletBalances(payload: Record<string, unknown>): HeliusWalletBalancesResponse {
  const maybeData = payload.data;
  if (maybeData && typeof maybeData === "object") {
    return maybeData as HeliusWalletBalancesResponse;
  }
  return payload as HeliusWalletBalancesResponse;
}
