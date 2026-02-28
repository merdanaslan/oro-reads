import { EnhancedTransaction, RpcRawTransaction } from "../helius/types";

const BASE58_ADDRESS = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

export interface WalletDeltas {
  tokenDeltas: Map<string, number>;
  nativeDeltaLamports: number;
}

export function computeWalletDeltas(tx: EnhancedTransaction, wallet: string): WalletDeltas {
  const tokenDeltas = new Map<string, number>();
  let nativeDeltaLamports = 0;

  for (const transfer of tx.tokenTransfers ?? []) {
    const mint = transfer.mint ?? undefined;
    if (!mint) {
      continue;
    }

    const amount = toNumber(transfer.tokenAmount);
    if (!Number.isFinite(amount) || amount === 0) {
      continue;
    }

    if (transfer.toUserAccount === wallet) {
      increment(tokenDeltas, mint, amount);
    }

    if (transfer.fromUserAccount === wallet) {
      increment(tokenDeltas, mint, -amount);
    }
  }

  for (const transfer of tx.nativeTransfers ?? []) {
    const amount = toNumber(transfer.amount);
    if (!Number.isFinite(amount) || amount === 0) {
      continue;
    }

    if (transfer.toUserAccount === wallet) {
      nativeDeltaLamports += amount;
    }

    if (transfer.fromUserAccount === wallet) {
      nativeDeltaLamports -= amount;
    }
  }

  return {
    tokenDeltas,
    nativeDeltaLamports
  };
}

export function extractProgramIds(tx: EnhancedTransaction): string[] {
  const ids = new Set<string>();

  const visit = (instruction: { programId?: string; innerInstructions?: unknown[] }): void => {
    if (instruction.programId && BASE58_ADDRESS.test(instruction.programId)) {
      ids.add(instruction.programId);
    }

    for (const inner of instruction.innerInstructions ?? []) {
      if (typeof inner === "object" && inner !== null && "programId" in inner) {
        visit(inner as { programId?: string; innerInstructions?: unknown[] });
      }
    }
  };

  for (const instruction of tx.instructions ?? []) {
    visit(instruction);
  }

  return Array.from(ids);
}

export function computeRawWalletDeltas(rawTx: RpcRawTransaction, wallet: string): WalletDeltas {
  const tokenDeltas = new Map<string, number>();

  const pre = rawTx.meta?.preTokenBalances ?? [];
  const post = rawTx.meta?.postTokenBalances ?? [];

  const preMap = aggregateRawBalances(pre, wallet);
  const postMap = aggregateRawBalances(post, wallet);

  const keys = new Set<string>([...preMap.keys(), ...postMap.keys()]);
  for (const key of keys) {
    const [mint] = key.split("|");
    const delta = (postMap.get(key) ?? 0) - (preMap.get(key) ?? 0);
    if (delta !== 0) {
      increment(tokenDeltas, mint, delta);
    }
  }

  const accountKeys = rawTx.transaction?.message?.accountKeys ?? [];
  const walletIndexes: number[] = [];

  accountKeys.forEach((account, index) => {
    const pubkey = typeof account === "string" ? account : account.pubkey;
    if (pubkey === wallet) {
      walletIndexes.push(index);
    }
  });

  let nativeDeltaLamports = 0;
  for (const index of walletIndexes) {
    const preLamports = rawTx.meta?.preBalances?.[index] ?? 0;
    const postLamports = rawTx.meta?.postBalances?.[index] ?? 0;
    nativeDeltaLamports += postLamports - preLamports;
  }

  return {
    tokenDeltas,
    nativeDeltaLamports
  };
}

export function extractRawProgramIds(rawTx: RpcRawTransaction): string[] {
  const ids = new Set<string>();
  const accountKeys = rawTx.transaction?.message?.accountKeys ?? [];
  const resolveProgramId = (programIdIndex?: number, directProgramId?: string): void => {
    if (directProgramId && BASE58_ADDRESS.test(directProgramId)) {
      ids.add(directProgramId);
      return;
    }

    if (typeof programIdIndex !== "number") {
      return;
    }

    const key = accountKeys[programIdIndex];
    const pubkey = typeof key === "string" ? key : key?.pubkey;
    if (pubkey && BASE58_ADDRESS.test(pubkey)) {
      ids.add(pubkey);
    }
  };

  for (const instruction of rawTx.transaction?.message?.instructions ?? []) {
    resolveProgramId(instruction.programIdIndex, instruction.programId);
  }

  for (const group of rawTx.meta?.innerInstructions ?? []) {
    for (const instruction of group.instructions ?? []) {
      resolveProgramId(instruction.programIdIndex, instruction.programId);
    }
  }

  return Array.from(ids);
}

function aggregateRawBalances(
  balances: NonNullable<RpcRawTransaction["meta"]>["preTokenBalances"],
  wallet: string
): Map<string, number> {
  const map = new Map<string, number>();

  for (const balance of balances ?? []) {
    if (balance.owner !== wallet || !balance.mint) {
      continue;
    }

    const accountIndex = balance.accountIndex ?? -1;
    const key = `${balance.mint}|${String(accountIndex)}`;
    const decimals = balance.uiTokenAmount?.decimals ?? 0;
    const rawAmount = balance.uiTokenAmount?.amount ?? "0";
    const amount = rawTokenAmountToNumber(rawAmount, decimals);
    map.set(key, amount);
  }

  return map;
}

function rawTokenAmountToNumber(amount: string, decimals: number): number {
  const parsed = Number(amount);
  if (!Number.isFinite(parsed)) {
    return 0;
  }
  return parsed / 10 ** decimals;
}

function increment(map: Map<string, number>, key: string, amount: number): void {
  const next = (map.get(key) ?? 0) + amount;
  if (Math.abs(next) < 1e-12) {
    map.delete(key);
    return;
  }
  map.set(key, next);
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
