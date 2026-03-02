const BASE58_ADDRESS = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

export interface BlinkConfig {
  port: number;
  baseUrl: string;
  dialectBaseUrl: string;
  goldMint: string;
  usdcMint: string;
  maxNotionalUsd: number;
  slippageBps: number;
  network: "mainnet";
  clientKey: string | null;
  buyTokenPair: string;
  sellTokenPair: string;
  allowedTokenPairs: Set<string>;
}

export function parseBlinkConfig(env: NodeJS.ProcessEnv): BlinkConfig {
  const networkRaw = (env.BLINK_NETWORK ?? "mainnet").trim().toLowerCase();
  if (networkRaw !== "mainnet") {
    throw new Error(`BLINK_NETWORK must be mainnet. Received: ${networkRaw}`);
  }

  const goldMint = (env.BLINK_GOLD_MINT ?? "GoLDppdjB1vDTPSGxyMJFqdnj134yH6Prg9eqsGDiw6A").trim();
  const usdcMint = (env.BLINK_USDC_MINT ?? "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v").trim();

  validateAddress("BLINK_GOLD_MINT", goldMint);
  validateAddress("BLINK_USDC_MINT", usdcMint);

  const buyTokenPair = `${usdcMint}-${goldMint}`;
  const sellTokenPair = `${goldMint}-${usdcMint}`;
  const maxNotionalUsd = parsePositiveNumber(env.BLINK_MAX_NOTIONAL_USD ?? "10000", "BLINK_MAX_NOTIONAL_USD");

  return {
    port: parsePort(env.BLINK_PORT ?? "8787"),
    baseUrl: normalizeUrl(env.BLINK_BASE_URL ?? "http://localhost:8787", "BLINK_BASE_URL"),
    dialectBaseUrl: normalizeUrl(
      env.BLINK_DIALECT_BASE_URL ?? "https://jupiter.dial.to/api/v0",
      "BLINK_DIALECT_BASE_URL"
    ),
    goldMint,
    usdcMint,
    maxNotionalUsd,
    slippageBps: parsePositiveInteger(env.BLINK_SLIPPAGE_BPS ?? "100", "BLINK_SLIPPAGE_BPS"),
    network: "mainnet",
    clientKey: normalizeOptional(env.BLINK_CLIENT_KEY),
    buyTokenPair,
    sellTokenPair,
    allowedTokenPairs: new Set([buyTokenPair, sellTokenPair])
  };
}

function parsePort(raw: string): number {
  const port = Number(raw);
  if (!Number.isInteger(port) || port <= 0 || port > 65535) {
    throw new Error(`BLINK_PORT must be an integer in [1, 65535]. Received: ${raw}`);
  }
  return port;
}

function parsePositiveInteger(raw: string, name: string): number {
  const value = Number(raw);
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`${name} must be a positive integer. Received: ${raw}`);
  }
  return value;
}

function parsePositiveNumber(raw: string, name: string): number {
  const value = Number(raw);
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`${name} must be a positive number. Received: ${raw}`);
  }
  return value;
}

function normalizeUrl(raw: string, name: string): string {
  let parsed: URL;
  try {
    parsed = new URL(raw.trim());
  } catch {
    throw new Error(`${name} must be a valid absolute URL. Received: ${raw}`);
  }

  parsed.pathname = parsed.pathname.replace(/\/+$/, "");
  parsed.search = "";
  parsed.hash = "";
  return parsed.toString().replace(/\/$/, "");
}

function validateAddress(name: string, address: string): void {
  if (!BASE58_ADDRESS.test(address)) {
    throw new Error(`${name} is not a valid base58 address: ${address}`);
  }
}

function normalizeOptional(raw: string | undefined): string | null {
  if (!raw) {
    return null;
  }

  const trimmed = raw.trim();
  return trimmed.length > 0 ? trimmed : null;
}
