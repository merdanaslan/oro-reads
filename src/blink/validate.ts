import { BlinkHttpError } from "./types";

const BASE58_ADDRESS = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

export function assertAllowedPair(tokenPair: string, allowedPairs: Set<string>): void {
  if (!allowedPairs.has(tokenPair)) {
    throw new BlinkHttpError(400, "INVALID_TOKEN_PAIR", `Unsupported tokenPair: ${tokenPair}`);
  }
}

export function parseAmount(raw: string, maxNotionalUsd: number): number {
  const amount = Number(raw);
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new BlinkHttpError(400, "INVALID_AMOUNT", `Amount must be a positive number. Received: ${raw}`);
  }

  if (amount > maxNotionalUsd) {
    throw new BlinkHttpError(
      422,
      "AMOUNT_EXCEEDS_LIMIT",
      `Amount exceeds maximum allowed notional of ${maxNotionalUsd}.`,
      { maxNotionalUsd }
    );
  }

  return amount;
}

export function normalizeAmount(amount: number): string {
  if (Number.isInteger(amount)) {
    return String(amount);
  }

  return String(amount).replace(/(?:\.0+|(?:(\.[0-9]*?)0+))$/, "$1");
}

export function assertWallet(account: unknown): string {
  if (typeof account !== "string") {
    throw new BlinkHttpError(400, "INVALID_ACCOUNT", "Request body must include account as a base58 pubkey.");
  }

  const normalized = account.trim();
  if (!BASE58_ADDRESS.test(normalized)) {
    throw new BlinkHttpError(400, "INVALID_ACCOUNT", `Invalid account: ${normalized}`);
  }

  return normalized;
}
