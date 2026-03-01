import { describe, expect, it, vi } from "vitest";

import { HeliusClient } from "../src/helius/client";

function jsonResponse(payload: unknown): Response {
  return {
    ok: true,
    status: 200,
    json: async () => payload,
    text: async () => JSON.stringify(payload)
  } as Response;
}

describe("HeliusClient.getWalletBalances", () => {
  it("paginates and merges token balances by mint", async () => {
    const fetchFn = vi
      .fn()
      .mockResolvedValueOnce(
        jsonResponse({
          data: {
            nativeBalance: { lamports: 1000 },
            totalValueUsd: 123,
            tokens: [
              { mint: "mint-a", symbol: "A", balance: 1 },
              { mint: "mint-b", symbol: "B", balance: 2 }
            ],
            pagination: { hasMore: true }
          }
        })
      )
      .mockResolvedValueOnce(
        jsonResponse({
          data: {
            nativeBalance: { lamports: 1000 },
            totalValueUsd: 123,
            tokens: [
              { mint: "mint-b", symbol: "B2", balance: 2.5 },
              { mint: "mint-c", symbol: "C", balance: 3 }
            ],
            pagination: { hasMore: false }
          }
        })
      );

    const client = new HeliusClient({
      apiKey: "test-key",
      fetchFn: fetchFn as unknown as typeof fetch
    });

    const result = await client.getWalletBalances("wallet-abc");

    expect(fetchFn).toHaveBeenCalledTimes(2);
    expect(result.nativeBalance).toEqual({ lamports: 1000 });
    expect(result.totalValueUsd).toBe(123);
    expect(result.balances).toHaveLength(3);
    expect(result.balances?.find((token) => token.mint === "mint-b")?.symbol).toBe("B2");
  });
});
