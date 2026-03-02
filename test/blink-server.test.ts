import { describe, expect, it, vi } from "vitest";

import { parseBlinkConfig } from "../src/blink/config";
import { DialectClient } from "../src/blink/dialect";
import { dispatchBlinkRequest } from "../src/blink/server";
import { BlinkHttpError } from "../src/blink/types";

function makeConfig() {
  return parseBlinkConfig({
    BLINK_PORT: "8787",
    BLINK_BASE_URL: "http://localhost:8787",
    BLINK_DIALECT_BASE_URL: "https://jupiter.dial.to/api/v0",
    BLINK_GOLD_MINT: "GoLDppdjB1vDTPSGxyMJFqdnj134yH6Prg9eqsGDiw6A",
    BLINK_USDC_MINT: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
    BLINK_MAX_NOTIONAL_USD: "10000",
    BLINK_SLIPPAGE_BPS: "100",
    BLINK_NETWORK: "mainnet",
    BLINK_CLIENT_KEY: ""
  });
}

function jsonResponse(payload: unknown, status = 200, headers?: Record<string, string>): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: new Headers(headers ?? {}),
    json: async () => payload,
    text: async () => JSON.stringify(payload)
  } as Response;
}

describe("blink server routing", () => {
  it("serves a combined router action with buy and sell links", async () => {
    const config = makeConfig();
    const fetchFn = vi.fn();

    const dialectClient = new DialectClient({
      baseUrl: config.dialectBaseUrl,
      slippageBps: config.slippageBps,
      clientKey: config.clientKey,
      fetchFn: fetchFn as unknown as typeof fetch
    });

    const result = await dispatchBlinkRequest(
      {
        method: "GET",
        url: "/api/v0/swap/gold-usdc"
      },
      config,
      dialectClient
    );

    expect(result.statusCode).toBe(200);
    expect(result.actionVersion).toBe("2.4");
    expect(result.blockchainIds).toBe("solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp");

    const payload = result.payload as {
      links?: {
        actions?: Array<{
          type?: string;
          label?: string;
          href?: string;
          parameters?: Array<{ name?: string; label?: string; type?: string; required?: boolean }>;
        }>;
      };
    };
    const actions = payload.links?.actions ?? [];
    expect(actions).toHaveLength(2);
    expect(actions[0]).toMatchObject({
      type: "transaction",
      label: "Buy GOLD",
      href: `${config.baseUrl}/api/v0/swap/${config.buyTokenPair}?amount={amount}`
    });
    expect(actions[1]).toMatchObject({
      type: "transaction",
      label: "Sell GOLD",
      href: `${config.baseUrl}/api/v0/swap/${config.sellTokenPair}?amount={amount}`
    });
    expect(actions[0].parameters?.[0]).toMatchObject({ name: "amount", type: "number", required: true });
    expect(actions[1].parameters?.[0]).toMatchObject({ name: "amount", type: "number", required: true });

    expect(fetchFn).not.toHaveBeenCalled();
  });

  it("serves actions.json discovery routes", async () => {
    const config = makeConfig();
    const fetchFn = vi.fn();

    const dialectClient = new DialectClient({
      baseUrl: config.dialectBaseUrl,
      slippageBps: config.slippageBps,
      clientKey: config.clientKey,
      fetchFn: fetchFn as unknown as typeof fetch
    });

    const direct = await dispatchBlinkRequest(
      {
        method: "GET",
        url: "/actions.json"
      },
      config,
      dialectClient
    );

    const wellKnown = await dispatchBlinkRequest(
      {
        method: "GET",
        url: "/.well-known/solana/actions.json"
      },
      config,
      dialectClient
    );

    expect(direct.statusCode).toBe(200);
    expect(wellKnown.statusCode).toBe(200);
    expect(direct.actionVersion).toBe("2.4");
    expect(direct.blockchainIds).toBe("solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp");

    const payload = direct.payload as { rules?: Array<{ pathPattern: string; apiPath: string }> };
    expect(payload.rules?.length).toBeGreaterThan(0);
    expect(payload.rules?.some((rule) => rule.pathPattern === "/api/v0/swap/*")).toBe(true);
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it("returns standardized blink headers for OPTIONS preflight", async () => {
    const config = makeConfig();
    const fetchFn = vi.fn();

    const dialectClient = new DialectClient({
      baseUrl: config.dialectBaseUrl,
      slippageBps: config.slippageBps,
      clientKey: config.clientKey,
      fetchFn: fetchFn as unknown as typeof fetch
    });

    const result = await dispatchBlinkRequest(
      {
        method: "OPTIONS",
        url: `/api/v0/swap/${config.buyTokenPair}`
      },
      config,
      dialectClient
    );

    expect(result.statusCode).toBe(204);
    expect(result.actionVersion).toBe("2.4");
    expect(result.blockchainIds).toBe("solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp");
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it("proxies GET pair metadata and rewrites action hrefs", async () => {
    const config = makeConfig();
    const pair = config.buyTokenPair;

    const fetchFn = vi.fn().mockResolvedValue(
      jsonResponse(
        {
          title: "Swap",
          links: {
            actions: [
              {
                href: `https://jupiter.dial.to/api/v0/swap/${pair}/10?foo=bar`,
                label: "Swap"
              }
            ]
          }
        },
        200,
        {
          "x-action-version": "2.4.2",
          "x-blockchain-ids": "solana:mainnet"
        }
      )
    );

    const dialectClient = new DialectClient({
      baseUrl: config.dialectBaseUrl,
      slippageBps: config.slippageBps,
      clientKey: config.clientKey,
      fetchFn: fetchFn as unknown as typeof fetch
    });

    const result = await dispatchBlinkRequest(
      {
        method: "GET",
        url: `/api/v0/swap/${pair}`
      },
      config,
      dialectClient
    );

    expect(result.statusCode).toBe(200);
    expect(result.actionVersion).toBe("2.4.2");

    const payload = result.payload as {
      links?: { actions?: Array<{ href?: string }> };
    };
    expect(payload.links?.actions?.[0].href).toBe(`${config.baseUrl}/api/v0/swap/${pair}/10?foo=bar`);

    const calledUrl = String(fetchFn.mock.calls[0][0]);
    expect(calledUrl).toContain(`/swap/${pair}`);
  });

  it("supports amount query on GET pair metadata endpoint", async () => {
    const config = makeConfig();
    const pair = config.buyTokenPair;

    const fetchFn = vi.fn().mockResolvedValue(
      jsonResponse({
        title: "Swap",
        links: {
          actions: [{ href: `https://jupiter.dial.to/api/v0/swap/${pair}/10` }]
        }
      })
    );

    const dialectClient = new DialectClient({
      baseUrl: config.dialectBaseUrl,
      slippageBps: config.slippageBps,
      clientKey: config.clientKey,
      fetchFn: fetchFn as unknown as typeof fetch
    });

    const result = await dispatchBlinkRequest(
      {
        method: "GET",
        url: `/api/v0/swap/${pair}?amount=10`
      },
      config,
      dialectClient
    );

    expect(result.statusCode).toBe(200);
    const calledUrl = String(fetchFn.mock.calls[0][0]);
    expect(calledUrl).toContain(`/swap/${pair}/10`);
  });

  it("supports HEAD for metadata route", async () => {
    const config = makeConfig();
    const pair = config.buyTokenPair;

    const fetchFn = vi.fn().mockResolvedValue(
      jsonResponse(
        {
          title: "Swap",
          links: {
            actions: [{ href: `https://jupiter.dial.to/api/v0/swap/${pair}/10` }]
          }
        },
        200,
        {
          "x-action-version": "2.4.2",
          "x-blockchain-ids": "solana:mainnet"
        }
      )
    );

    const dialectClient = new DialectClient({
      baseUrl: config.dialectBaseUrl,
      slippageBps: config.slippageBps,
      clientKey: config.clientKey,
      fetchFn: fetchFn as unknown as typeof fetch
    });

    const result = await dispatchBlinkRequest(
      {
        method: "HEAD",
        url: `/api/v0/swap/${pair}`
      },
      config,
      dialectClient
    );

    expect(result.statusCode).toBe(200);
    expect(result.actionVersion).toBe("2.4.2");
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });

  it("supports trailing slash routes and applies default blink headers", async () => {
    const config = makeConfig();
    const pair = config.buyTokenPair;

    const fetchFn = vi.fn().mockResolvedValue(
      jsonResponse({
        title: "Swap",
        links: {
          actions: [{ href: `https://jupiter.dial.to/api/v0/swap/${pair}/10` }]
        }
      })
    );

    const dialectClient = new DialectClient({
      baseUrl: config.dialectBaseUrl,
      slippageBps: config.slippageBps,
      clientKey: config.clientKey,
      fetchFn: fetchFn as unknown as typeof fetch
    });

    const result = await dispatchBlinkRequest(
      {
        method: "GET",
        url: `/api/v0/swap/${pair}/`
      },
      config,
      dialectClient
    );

    expect(result.statusCode).toBe(200);
    expect(result.actionVersion).toBe("2.4");
    expect(result.blockchainIds).toBe("solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp");
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });

  it("enforces max notional on GET amount endpoint", async () => {
    const config = makeConfig();
    const fetchFn = vi.fn();

    const dialectClient = new DialectClient({
      baseUrl: config.dialectBaseUrl,
      slippageBps: config.slippageBps,
      clientKey: config.clientKey,
      fetchFn: fetchFn as unknown as typeof fetch
    });

    await expect(
      dispatchBlinkRequest(
        {
          method: "GET",
          url: `/api/v0/swap/${config.buyTokenPair}/10001`
        },
        config,
        dialectClient
      )
    ).rejects.toMatchObject({
      status: 422,
      code: "AMOUNT_EXCEEDS_LIMIT"
    } satisfies Partial<BlinkHttpError>);

    expect(fetchFn).not.toHaveBeenCalled();
  });

  it("forwards POST execute and includes slippage bps + optional client key", async () => {
    const config = makeConfig();
    config.clientKey = "blink-key-123";

    const fetchFn = vi.fn().mockResolvedValue(
      jsonResponse({ type: "transaction", transaction: "base64tx" }, 200)
    );

    const dialectClient = new DialectClient({
      baseUrl: config.dialectBaseUrl,
      slippageBps: config.slippageBps,
      clientKey: config.clientKey,
      fetchFn: fetchFn as unknown as typeof fetch
    });

    const wallet = "7orgFWEBNCsqspUTX8AZurjRfHrgRYZiswm4ewqJmH9E";
    const result = await dispatchBlinkRequest(
      {
        method: "POST",
        url: `/api/v0/swap/${config.buyTokenPair}/25`,
        bodyText: JSON.stringify({ account: wallet })
      },
      config,
      dialectClient
    );

    expect(result.statusCode).toBe(200);
    expect(result.payload).toEqual({ type: "transaction", transaction: "base64tx" });

    const calledUrl = String(fetchFn.mock.calls[0][0]);
    const calledInit = fetchFn.mock.calls[0][1] as RequestInit;

    expect(calledUrl).toContain(`/swap/${config.buyTokenPair}/25`);
    expect(calledUrl).toContain("slippageBps=100");
    expect(calledInit.method).toBe("POST");

    const headers = calledInit.headers as Record<string, string>;
    expect(headers["content-type"]).toBe("application/json");
    expect(headers["x-blink-client-key"]).toBe("blink-key-123");

    const forwardedBody = JSON.parse(String(calledInit.body)) as { account: string };
    expect(forwardedBody.account).toBe(wallet);
  });

  it("supports POST execute on pair route with amount query", async () => {
    const config = makeConfig();
    const fetchFn = vi.fn().mockResolvedValue(
      jsonResponse({ type: "transaction", transaction: "base64tx" }, 200)
    );

    const dialectClient = new DialectClient({
      baseUrl: config.dialectBaseUrl,
      slippageBps: config.slippageBps,
      clientKey: config.clientKey,
      fetchFn: fetchFn as unknown as typeof fetch
    });

    const wallet = "7orgFWEBNCsqspUTX8AZurjRfHrgRYZiswm4ewqJmH9E";
    const result = await dispatchBlinkRequest(
      {
        method: "POST",
        url: `/api/v0/swap/${config.buyTokenPair}?amount=10`,
        bodyText: JSON.stringify({ account: wallet })
      },
      config,
      dialectClient
    );

    expect(result.statusCode).toBe(200);
    const calledUrl = String(fetchFn.mock.calls[0][0]);
    expect(calledUrl).toContain(`/swap/${config.buyTokenPair}/10`);
  });

  it("rejects invalid wallet and unsupported pair", async () => {
    const config = makeConfig();
    const fetchFn = vi.fn();

    const dialectClient = new DialectClient({
      baseUrl: config.dialectBaseUrl,
      slippageBps: config.slippageBps,
      clientKey: config.clientKey,
      fetchFn: fetchFn as unknown as typeof fetch
    });

    await expect(
      dispatchBlinkRequest(
        {
          method: "POST",
          url: `/api/v0/swap/${config.buyTokenPair}/5`,
          bodyText: JSON.stringify({ account: "bad" })
        },
        config,
        dialectClient
      )
    ).rejects.toMatchObject({ status: 400, code: "INVALID_ACCOUNT" } satisfies Partial<BlinkHttpError>);

    await expect(
      dispatchBlinkRequest(
        {
          method: "GET",
          url: `/api/v0/swap/So11111111111111111111111111111111111111112-${config.goldMint}`
        },
        config,
        dialectClient
      )
    ).rejects.toMatchObject({ status: 400, code: "INVALID_TOKEN_PAIR" } satisfies Partial<BlinkHttpError>);

    expect(fetchFn).not.toHaveBeenCalled();
  });
});
