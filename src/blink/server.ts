import { IncomingMessage, Server, ServerResponse, createServer } from "node:http";

import { BlinkConfig } from "./config";
import { DialectClient } from "./dialect";
import { rewriteActionHrefs } from "./rewrite";
import { BlinkErrorPayload, BlinkHttpError, BlinkMetadataPayload, UpstreamResponse } from "./types";
import { assertAllowedPair, assertWallet, normalizeAmount, parseAmount } from "./validate";

interface LoggerLike {
  log(message: string): void;
  error(message: string): void;
}

export interface BlinkServerDeps {
  config: BlinkConfig;
  dialectClient?: DialectClient;
  logger?: LoggerLike;
}

export interface BlinkDispatchInput {
  method: string;
  url: string;
  bodyText?: string;
}

export interface BlinkDispatchResult {
  statusCode: number;
  payload: unknown;
  actionVersion: string | null;
  blockchainIds: string | null;
}

const DEFAULT_ACTION_VERSION = "2.4";
const SOLANA_MAINNET_BLOCKCHAIN_ID = "solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp";

interface ActionsJsonPayload {
  rules: Array<{
    pathPattern: string;
    apiPath: string;
  }>;
}

interface DirectionRouterPayload {
  type: "action";
  icon: string;
  title: string;
  label: string;
  description: string;
  links: {
    actions: Array<{
      type: "transaction";
      label: string;
      href: string;
      parameters: Array<{
        name: "amount";
        label: string;
        type: "number";
        required: true;
      }>;
    }>;
  };
}

export function createBlinkServer(deps: BlinkServerDeps): Server {
  const logger = deps.logger ?? console;
  const dialectClient =
    deps.dialectClient ??
    new DialectClient({
      baseUrl: deps.config.dialectBaseUrl,
      slippageBps: deps.config.slippageBps,
      clientKey: deps.config.clientKey
    });

  return createServer((req, res) => {
    handleHttpRequest(req, res, deps.config, dialectClient)
      .then((statusCode) => {
        logger.log(`[blink] ${req.method ?? "UNKNOWN"} ${req.url ?? ""} -> ${statusCode}`);
      })
      .catch((error) => {
        const blinkError = asBlinkError(error);
        logger.error(
          `[blink] ${req.method ?? "UNKNOWN"} ${req.url ?? ""} -> ${blinkError.status} ${blinkError.code}`
        );
        sendError(res, blinkError);
      });
  });
}

export async function startBlinkServer(server: Server, port: number): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, () => {
      server.off("error", reject);
      resolve();
    });
  });
}

export async function dispatchBlinkRequest(
  input: BlinkDispatchInput,
  config: BlinkConfig,
  dialectClient: DialectClient
): Promise<BlinkDispatchResult> {
  const method = input.method.toUpperCase();
  const url = new URL(input.url, config.baseUrl);
  const pathname = normalizePathname(url.pathname);

  if (method === "OPTIONS") {
    return {
      statusCode: 204,
      payload: null,
      actionVersion: DEFAULT_ACTION_VERSION,
      blockchainIds: SOLANA_MAINNET_BLOCKCHAIN_ID
    };
  }

  if (method === "GET" && pathname === "/healthz") {
    return {
      statusCode: 200,
      payload: {
        ok: true,
        network: config.network
      },
      actionVersion: null,
      blockchainIds: null
    };
  }

  if (
    (method === "GET" || method === "HEAD") &&
    (pathname === "/actions.json" || pathname === "/.well-known/solana/actions.json")
  ) {
    const payload = buildActionsJsonPayload();
    return {
      statusCode: 200,
      payload,
      actionVersion: DEFAULT_ACTION_VERSION,
      blockchainIds: SOLANA_MAINNET_BLOCKCHAIN_ID
    };
  }

  if ((method === "GET" || method === "HEAD") && pathname === "/api/v0/swap/gold-usdc") {
    return {
      statusCode: 200,
      payload: buildDirectionRouterPayload(config),
      actionVersion: DEFAULT_ACTION_VERSION,
      blockchainIds: SOLANA_MAINNET_BLOCKCHAIN_ID
    };
  }

  const swapPairMatch = pathname.match(/^\/api\/v0\/swap\/([^/]+)$/);
  if ((method === "GET" || method === "HEAD") && swapPairMatch) {
    const tokenPair = decodePathSegment(swapPairMatch[1]);
    assertAllowedPair(tokenPair, config.allowedTokenPairs);

    const amount = parseAmountFromQuery(url, config.maxNotionalUsd);
    const upstream = await dialectClient.getSwapMetadata(tokenPair, amount ?? undefined);
    const payload = ensureMetadataPayload(upstream.payload);

    return {
      statusCode: 200,
      payload: rewriteActionHrefs(payload, config.baseUrl),
      actionVersion: upstream.actionVersion ?? DEFAULT_ACTION_VERSION,
      blockchainIds: upstream.blockchainIds ?? SOLANA_MAINNET_BLOCKCHAIN_ID
    };
  }

  if (swapPairMatch && method === "POST") {
    const tokenPair = decodePathSegment(swapPairMatch[1]);
    assertAllowedPair(tokenPair, config.allowedTokenPairs);

    const amount = parseAmountFromQuery(url, config.maxNotionalUsd, true);
    if (!amount) {
      throw new BlinkHttpError(400, "INVALID_AMOUNT", "Query param `amount` is required for this route.");
    }

    const body = parseBodyText(input.bodyText);
    const account = assertWallet((body as { account?: unknown }).account);

    const upstream = await dialectClient.postSwapTransaction(tokenPair, amount, account);
    return {
      statusCode: 200,
      payload: upstream.payload,
      actionVersion: upstream.actionVersion ?? DEFAULT_ACTION_VERSION,
      blockchainIds: upstream.blockchainIds ?? SOLANA_MAINNET_BLOCKCHAIN_ID
    };
  }

  const swapAmountMatch = pathname.match(/^\/api\/v0\/swap\/([^/]+)\/([^/]+)$/);
  if (swapAmountMatch && (method === "GET" || method === "HEAD")) {
    const tokenPair = decodePathSegment(swapAmountMatch[1]);
    assertAllowedPair(tokenPair, config.allowedTokenPairs);

    const amountValue = parseAmount(decodePathSegment(swapAmountMatch[2]), config.maxNotionalUsd);
    const amount = normalizeAmount(amountValue);

    const upstream = await dialectClient.getSwapMetadata(tokenPair, amount);
    const payload = ensureMetadataPayload(upstream.payload);

    return {
      statusCode: 200,
      payload: rewriteActionHrefs(payload, config.baseUrl),
      actionVersion: upstream.actionVersion ?? DEFAULT_ACTION_VERSION,
      blockchainIds: upstream.blockchainIds ?? SOLANA_MAINNET_BLOCKCHAIN_ID
    };
  }

  if (swapAmountMatch && method === "POST") {
    const tokenPair = decodePathSegment(swapAmountMatch[1]);
    assertAllowedPair(tokenPair, config.allowedTokenPairs);

    const amountValue = parseAmount(decodePathSegment(swapAmountMatch[2]), config.maxNotionalUsd);
    const amount = normalizeAmount(amountValue);

    const body = parseBodyText(input.bodyText);
    const account = assertWallet((body as { account?: unknown }).account);

    const upstream = await dialectClient.postSwapTransaction(tokenPair, amount, account);
    return {
      statusCode: 200,
      payload: upstream.payload,
      actionVersion: upstream.actionVersion ?? DEFAULT_ACTION_VERSION,
      blockchainIds: upstream.blockchainIds ?? SOLANA_MAINNET_BLOCKCHAIN_ID
    };
  }

  if (pathname.startsWith("/api/v0/swap")) {
    throw new BlinkHttpError(422, "UNSUPPORTED_REQUEST_SHAPE", `Unsupported request: ${method} ${pathname}`);
  }

  throw new BlinkHttpError(404, "NOT_FOUND", `Route not found: ${pathname}`);
}

async function handleHttpRequest(
  req: IncomingMessage,
  res: ServerResponse,
  config: BlinkConfig,
  dialectClient: DialectClient
): Promise<number> {
  setCorsHeaders(res);

  const bodyText = await readBodyText(req);
  const result = await dispatchBlinkRequest(
    {
      method: req.method ?? "GET",
      url: req.url ?? "/",
      bodyText
    },
    config,
    dialectClient
  );

  if (result.statusCode === 204) {
    res.statusCode = 204;
    if (result.actionVersion) {
      res.setHeader("x-action-version", result.actionVersion);
    }
    if (result.blockchainIds) {
      res.setHeader("x-blockchain-ids", result.blockchainIds);
    }
    res.end();
    return 204;
  }

  if ((req.method ?? "GET").toUpperCase() === "HEAD") {
    setResponseHeaders(res, result.statusCode, {
      payload: result.payload,
      actionVersion: result.actionVersion,
      blockchainIds: result.blockchainIds
    });
    res.end();
    return result.statusCode;
  }

  sendJson(res, result.statusCode, result.payload, {
    payload: result.payload,
    actionVersion: result.actionVersion,
    blockchainIds: result.blockchainIds
  });
  return result.statusCode;
}

function ensureMetadataPayload(payload: unknown): BlinkMetadataPayload {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    throw new BlinkHttpError(502, "DIALECT_INVALID_METADATA", "Dialect metadata payload is not an object.");
  }

  return payload as BlinkMetadataPayload;
}

function parseBodyText(bodyText: string | undefined): unknown {
  const body = (bodyText ?? "").trim();
  if (body.length === 0) {
    throw new BlinkHttpError(400, "INVALID_BODY", "Request body is required.");
  }

  try {
    return JSON.parse(body);
  } catch {
    throw new BlinkHttpError(400, "INVALID_BODY", "Request body must be valid JSON.");
  }
}

function decodePathSegment(raw: string): string {
  try {
    return decodeURIComponent(raw);
  } catch {
    throw new BlinkHttpError(400, "INVALID_PATH_SEGMENT", `Invalid path segment: ${raw}`);
  }
}

function normalizePathname(pathname: string): string {
  if (pathname.length > 1 && pathname.endsWith("/")) {
    return pathname.replace(/\/+$/, "");
  }

  return pathname;
}

function parseAmountFromQuery(
  url: URL,
  maxNotionalUsd: number,
  required = false
): string | null {
  const rawAmount = url.searchParams.get("amount");
  if (rawAmount === null || rawAmount.trim().length === 0) {
    if (required) {
      throw new BlinkHttpError(400, "INVALID_AMOUNT", "Query param `amount` is required.");
    }

    return null;
  }

  const parsed = parseAmount(rawAmount.trim(), maxNotionalUsd);
  return normalizeAmount(parsed);
}

function buildActionsJsonPayload(): ActionsJsonPayload {
  return {
    rules: [
      {
        pathPattern: "/api/v0/swap/*",
        apiPath: "/api/v0/swap/*"
      },
      {
        pathPattern: "/api/v0/swap/**",
        apiPath: "/api/v0/swap/**"
      },
      {
        pathPattern: "/api/v0/swap/gold-usdc",
        apiPath: "/api/v0/swap/gold-usdc"
      }
    ]
  };
}

function buildDirectionRouterPayload(config: BlinkConfig): DirectionRouterPayload {
  const buyHref = `${config.baseUrl}/api/v0/swap/${config.buyTokenPair}`;
  const sellHref = `${config.baseUrl}/api/v0/swap/${config.sellTokenPair}`;

  return {
    type: "action",
    icon: "https://ucarecdn.com/09c80208-f27c-45dd-b716-75e1e55832c4/-/preview/1000x981/-/quality/smart/-/format/auto/",
    title: "GOLD Swap",
    label: "Swap GOLD/USDC",
    description: "Buy or sell GOLD with USDC. Enter a custom USD amount.",
    links: {
      actions: [
        {
          type: "transaction",
          label: "Buy GOLD",
          href: `${buyHref}?amount={amount}`,
          parameters: [
            {
              name: "amount",
              label: "Enter USD amount",
              type: "number",
              required: true
            }
          ]
        },
        {
          type: "transaction",
          label: "Sell GOLD",
          href: `${sellHref}?amount={amount}`,
          parameters: [
            {
              name: "amount",
              label: "Enter USD amount",
              type: "number",
              required: true
            }
          ]
        }
      ]
    }
  };
}

async function readBodyText(req: IncomingMessage): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(typeof chunk === "string" ? Buffer.from(chunk) : chunk);
  }

  if (chunks.length === 0) {
    return "";
  }

  return Buffer.concat(chunks).toString("utf8");
}

function setCorsHeaders(res: ServerResponse): void {
  res.setHeader("access-control-allow-origin", "*");
  res.setHeader("access-control-allow-methods", "GET,HEAD,POST,OPTIONS");
  res.setHeader(
    "access-control-allow-headers",
    "Content-Type,Authorization,X-Blink-Client-Key,X-Action-Version,X-Blockchain-Ids"
  );
  res.setHeader("access-control-expose-headers", "x-action-version,x-blockchain-ids");
  res.setHeader("access-control-allow-private-network", "true");
}

function sendJson(
  res: ServerResponse,
  statusCode: number,
  payload: unknown,
  upstreamHeaders?: UpstreamResponse
): void {
  setResponseHeaders(res, statusCode, upstreamHeaders);

  res.end(`${JSON.stringify(payload)}\n`);
}

function setResponseHeaders(
  res: ServerResponse,
  statusCode: number,
  upstreamHeaders?: UpstreamResponse
): void {
  res.statusCode = statusCode;
  res.setHeader("content-type", "application/json; charset=utf-8");

  if (upstreamHeaders?.actionVersion) {
    res.setHeader("x-action-version", upstreamHeaders.actionVersion);
  }

  if (upstreamHeaders?.blockchainIds) {
    res.setHeader("x-blockchain-ids", upstreamHeaders.blockchainIds);
  }
}

function asBlinkError(error: unknown): BlinkHttpError {
  if (error instanceof BlinkHttpError) {
    return error;
  }

  return new BlinkHttpError(500, "INTERNAL_SERVER_ERROR", "Unexpected server error.", String(error));
}

function sendError(res: ServerResponse, error: BlinkHttpError): void {
  const payload: BlinkErrorPayload = {
    error: {
      code: error.code,
      message: error.message,
      ...(error.details !== undefined ? { details: error.details } : {})
    }
  };

  setCorsHeaders(res);
  sendJson(res, error.status, payload);
}
