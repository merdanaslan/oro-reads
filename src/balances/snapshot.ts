import { HeliusWalletBalancesResponse } from "../helius/types";
import { BalanceSnapshot, WalletBalanceToken } from "../types";

export function buildBalanceSnapshot(input: {
  wallet: string;
  asOfUnix: number;
  balances: HeliusWalletBalancesResponse;
  goldMint: string;
  usdcMint: string;
}): BalanceSnapshot {
  const tokensRaw =
    input.balances.tokens ?? input.balances.tokenBalances ?? input.balances.balances ?? [];

  const tokens: WalletBalanceToken[] = tokensRaw
    .map((token) => {
      const mint = token.mint ?? null;
      if (!mint) {
        return null;
      }

      const balance = toNumber(token.balance ?? token.amount);
      const pricePerToken = toNumber(token.pricePerToken ?? token.price);
      const usdValue = toNumber(token.usdValue ?? token.totalPrice);

      return {
        mint,
        symbol: token.symbol ?? null,
        name: token.name ?? null,
        balance: Number.isFinite(balance) ? balance : 0,
        decimals: typeof token.decimals === "number" ? token.decimals : null,
        tokenProgram: token.tokenProgram ?? null,
        pricePerToken: Number.isFinite(pricePerToken) ? pricePerToken : null,
        usdValue: Number.isFinite(usdValue) ? usdValue : null
      } satisfies WalletBalanceToken;
    })
    .filter((token): token is WalletBalanceToken => token !== null)
    .sort((a, b) => (b.usdValue ?? 0) - (a.usdValue ?? 0));

  const nativeLamports = extractNativeLamports(input.balances.nativeBalance);
  const solFromNative = nativeLamports / 1_000_000_000;
  const solFromMint =
    tokens.find(
      (token) =>
        token.mint === "So11111111111111111111111111111111111111112" ||
        token.mint.startsWith("So1111111111111111111111111111111111111111") ||
        token.symbol === "SOL"
    )?.balance ?? 0;
  const solBalance = solFromNative > 0 ? solFromNative : solFromMint;

  const goldBalance = tokens.find((token) => token.mint === input.goldMint)?.balance ?? 0;
  const usdcBalance = tokens.find((token) => token.mint === input.usdcMint)?.balance ?? 0;

  const explicitTotal = toNumber(input.balances.totalValueUsd);
  const inferredTotal =
    tokens.reduce((acc, token) => acc + (token.usdValue ?? 0), 0) +
    inferNativeUsdValue(input.balances.nativeBalance);

  return {
    wallet: input.wallet,
    asOfUnix: input.asOfUnix,
    totalUsdValue: Number.isFinite(explicitTotal) ? explicitTotal : inferredTotal,
    solBalance,
    goldBalance,
    usdcBalance,
    tokens
  };
}

function extractNativeLamports(nativeBalance: HeliusWalletBalancesResponse["nativeBalance"]): number {
  if (typeof nativeBalance === "number") {
    return nativeBalance;
  }

  if (nativeBalance && typeof nativeBalance === "object") {
    const lamports = toNumber(nativeBalance.lamports);
    if (Number.isFinite(lamports)) {
      return lamports;
    }

    const amount = toNumber(nativeBalance.amount);
    if (Number.isFinite(amount)) {
      return amount * 1_000_000_000;
    }
  }

  return 0;
}

function inferNativeUsdValue(nativeBalance: HeliusWalletBalancesResponse["nativeBalance"]): number {
  if (!nativeBalance || typeof nativeBalance !== "object") {
    return 0;
  }

  const maybeTotal = (nativeBalance as { totalPrice?: unknown; usdValue?: unknown }).totalPrice;
  const maybeUsd = (nativeBalance as { totalPrice?: unknown; usdValue?: unknown }).usdValue;
  const total = toNumber(maybeTotal ?? maybeUsd);
  return Number.isFinite(total) ? total : 0;
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
