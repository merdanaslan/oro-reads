export interface EnhancedTokenTransfer {
  fromUserAccount?: string | null;
  toUserAccount?: string | null;
  fromTokenAccount?: string | null;
  toTokenAccount?: string | null;
  tokenAmount?: number | string | null;
  mint?: string | null;
}

export interface EnhancedNativeTransfer {
  fromUserAccount?: string | null;
  toUserAccount?: string | null;
  amount?: number | null;
}

export interface EnhancedTokenBalanceChange {
  userAccount?: string | null;
  tokenAccount?: string | null;
  mint?: string | null;
  rawTokenAmount?: {
    tokenAmount?: string;
    decimals?: number;
  };
  tokenAmount?: number | string | null;
}

export interface EnhancedAccountData {
  account?: string;
  tokenBalanceChanges?: EnhancedTokenBalanceChange[];
}

export interface EnhancedInstruction {
  programId?: string;
  innerInstructions?: EnhancedInstruction[];
}

export interface EnhancedEvents {
  swap?: unknown;
}

export interface EnhancedTransaction {
  signature: string;
  slot: number;
  timestamp?: number;
  fee?: number;
  source?: string;
  type?: string;
  tokenTransfers?: EnhancedTokenTransfer[];
  nativeTransfers?: EnhancedNativeTransfer[];
  accountData?: EnhancedAccountData[];
  instructions?: EnhancedInstruction[];
  events?: EnhancedEvents;
  transactionError?: unknown;
}

export interface RpcTokenBalance {
  accountIndex?: number;
  mint?: string;
  owner?: string;
  uiTokenAmount?: {
    amount?: string;
    decimals?: number;
  };
}

export interface RpcInstruction {
  programId?: string;
  programIdIndex?: number;
}

export interface RpcInnerInstructionGroup {
  instructions?: RpcInstruction[];
}

export interface RpcAccountKeyObject {
  pubkey?: string;
}

export interface RpcRawTransaction {
  slot?: number;
  blockTime?: number | null;
  meta?: {
    err?: unknown;
    fee?: number;
    preTokenBalances?: RpcTokenBalance[];
    postTokenBalances?: RpcTokenBalance[];
    preBalances?: number[];
    postBalances?: number[];
    innerInstructions?: RpcInnerInstructionGroup[];
  };
  transaction?: {
    message?: {
      accountKeys?: (string | RpcAccountKeyObject)[];
      instructions?: RpcInstruction[];
    };
  };
}

export interface FetchAddressTransactionsResult {
  transactions: EnhancedTransaction[];
  pagesFetched: number;
}

export interface HeliusWalletBalanceToken {
  mint?: string;
  symbol?: string | null;
  name?: string | null;
  amount?: number | string;
  balance?: number | string;
  decimals?: number;
  tokenProgram?: string | null;
  price?: number | null;
  pricePerToken?: number | null;
  totalPrice?: number | null;
  usdValue?: number | null;
}

export interface HeliusWalletBalancesResponse {
  nativeBalance?: number | {
    lamports?: number;
    amount?: number;
  };
  totalValueUsd?: number;
  balances?: HeliusWalletBalanceToken[];
  tokens?: HeliusWalletBalanceToken[];
  tokenBalances?: HeliusWalletBalanceToken[];
}
