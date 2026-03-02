import { BlinkHttpError, UpstreamResponse } from "./types";

export interface DialectClientOptions {
  baseUrl: string;
  slippageBps: number;
  clientKey: string | null;
  fetchFn?: typeof fetch;
}

export class DialectClient {
  private readonly baseUrl: string;
  private readonly slippageBps: number;
  private readonly clientKey: string | null;
  private readonly fetchFn: typeof fetch;

  public constructor(options: DialectClientOptions) {
    this.baseUrl = options.baseUrl;
    this.slippageBps = options.slippageBps;
    this.clientKey = options.clientKey;
    this.fetchFn = options.fetchFn ?? fetch;
  }

  public async getSwapMetadata(tokenPair: string, amount?: string): Promise<UpstreamResponse> {
    const url = new URL(`${this.baseUrl}/swap/${tokenPair}${amount ? `/${amount}` : ""}`);
    return this.request(url, {
      method: "GET",
      headers: {
        accept: "application/json"
      }
    });
  }

  public async postSwapTransaction(
    tokenPair: string,
    amount: string,
    account: string
  ): Promise<UpstreamResponse> {
    const url = new URL(`${this.baseUrl}/swap/${tokenPair}/${amount}`);
    url.searchParams.set("slippageBps", String(this.slippageBps));

    const headers: Record<string, string> = {
      "content-type": "application/json",
      accept: "application/json"
    };

    if (this.clientKey) {
      headers["x-blink-client-key"] = this.clientKey;
    }

    return this.request(url, {
      method: "POST",
      headers,
      body: JSON.stringify({ account })
    });
  }

  private async request(url: URL, init: RequestInit): Promise<UpstreamResponse> {
    let response: Response;
    try {
      response = await this.fetchFn(url, init);
    } catch (error) {
      throw new BlinkHttpError(
        502,
        "DIALECT_UPSTREAM_UNREACHABLE",
        "Failed to reach Dialect swap endpoint.",
        String(error)
      );
    }

    const actionVersion = response.headers.get("x-action-version");
    const blockchainIds = response.headers.get("x-blockchain-ids");

    if (!response.ok) {
      const text = await safeText(response);
      throw new BlinkHttpError(
        502,
        "DIALECT_UPSTREAM_ERROR",
        `Dialect request failed (${response.status}).`,
        text.slice(0, 280)
      );
    }

    let payload: unknown;
    try {
      payload = await response.json();
    } catch {
      throw new BlinkHttpError(502, "DIALECT_INVALID_JSON", "Dialect returned non-JSON payload.");
    }

    return {
      payload,
      actionVersion,
      blockchainIds
    };
  }
}

async function safeText(response: Response): Promise<string> {
  try {
    return await response.text();
  } catch {
    return "";
  }
}
