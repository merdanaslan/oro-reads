import { describe, expect, it } from "vitest";

import { BlinkHttpError } from "../src/blink/types";
import { assertAllowedPair, assertWallet, normalizeAmount, parseAmount } from "../src/blink/validate";

describe("blink validation", () => {
  it("accepts only allowed token pairs", () => {
    const allowed = new Set(["usdc-gold"]);
    expect(() => assertAllowedPair("usdc-gold", allowed)).not.toThrow();
    expect(() => assertAllowedPair("gold-sol", allowed)).toThrowError(BlinkHttpError);
  });

  it("parses positive amounts and rejects invalid values", () => {
    expect(parseAmount("10", 100)).toBe(10);
    expect(parseAmount("0.25", 100)).toBeCloseTo(0.25);

    expect(() => parseAmount("0", 100)).toThrowError(BlinkHttpError);
    expect(() => parseAmount("-1", 100)).toThrowError(BlinkHttpError);
    expect(() => parseAmount("abc", 100)).toThrowError(BlinkHttpError);
    expect(() => parseAmount("101", 100)).toThrowError(BlinkHttpError);
  });

  it("normalizes amount strings for path forwarding", () => {
    expect(normalizeAmount(10)).toBe("10");
    expect(normalizeAmount(10.5)).toBe("10.5");
    expect(normalizeAmount(10.25)).toBe("10.25");
  });

  it("validates wallet pubkeys", () => {
    const wallet = "7orgFWEBNCsqspUTX8AZurjRfHrgRYZiswm4ewqJmH9E";
    expect(assertWallet(wallet)).toBe(wallet);
    expect(() => assertWallet("bad-wallet")).toThrowError(BlinkHttpError);
    expect(() => assertWallet(null)).toThrowError(BlinkHttpError);
  });
});
