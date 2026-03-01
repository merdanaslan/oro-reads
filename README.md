# ORO GOLD Wallet Reads (Milestones 1-3)

Standalone TypeScript CLI that reads a Solana wallet, detects GOLD spot buy/sell activity, and produces auditable outputs for:

- Milestone 1: ORO Overview Analytics
- Milestone 2: ORO Performance Dashboard
- Milestone 3: ORO Trade History & Breakdown

The pipeline is read-only and uses Helius as primary data provider. Birdeye is optional for unrealized equity/drawdown pricing.

## What This Script Does

1. Fetches wallet transaction history from Helius.
2. Classifies GOLD spot buy/sell swaps into a normalized ledger.
3. Applies FIFO realized PnL for USDC-valued sells.
4. Writes JSON artifacts for overview, performance, and auditable trade history.
5. Optionally computes unrealized equity/drawdown using Birdeye price candles.

## Data Providers

### Helius (required)

Used endpoints:

- `GET /v0/addresses/{wallet}/transactions`
- `POST /v0/transactions` (fallback parse by signatures)
- RPC `getTransaction` at `https://mainnet.helius-rpc.com/?api-key=...` (final fallback)
- `GET /v1/wallet/{wallet}/balances` (balance snapshot)

### Birdeye (optional)

Used endpoint:

- `GET /defi/history_price` (historical price series for unrealized curve)

If `BIRDEYE_API_KEY` is not set, unrealized output is still produced, but without price-based valuation.

## Useful API Extensions (Optional)

These are not required for milestone 1-3 core outputs, but can be useful:

- Helius `getTransactionsForAddress` (RPC method): can reduce client-side filtering if you later want tighter server-side filters by source/type.
- Helius Webhooks: useful for near-real-time incremental sync into your app backend instead of periodic full rescans.
- Birdeye `GET /defi/price`: current mark price at sync time for quick portfolio cards.
- Birdeye OHLCV endpoints: richer candle series for chart rendering when you need true OHLC candles instead of point history.
- Birdeye wallet transaction history endpoint: optional cross-check/debug source, but not needed for current Helius-first pipeline.

## Setup

1. Install dependencies:

```bash
npm install
```

2. Configure environment:

```bash
cp .env.example .env
```

Set:

- `HELIUS_API_KEY` (required)
- `BIRDEYE_API_KEY` (optional)
- `ORO_PROGRAM_IDS` (optional, comma-separated extra program IDs)

## Run

### Development (tsx)

```bash
npm run start -- \
  --wallet <WALLET_PUBKEY> \
  --gold-mint <GOLD_MINT> \
  --since-days 365 \
  --out-dir ./out
```

### Build + run dist

```bash
npm run start:dist -- \
  --wallet <WALLET_PUBKEY> \
  --gold-mint <GOLD_MINT> \
  --since-days 365 \
  --out-dir ./out \
  --unrealized-interval 1D
```

## CLI Arguments

Required:

- `--wallet <pubkey>`
- `--gold-mint <mint>`
- `HELIUS_API_KEY` env var

Optional:

- `--since-days <n>` (default `365`)
- `--usdc-mint <mint>` (default mainnet USDC)
- `--oro-program-ids <csv>`
- `--out-dir <path>` (default `./out`)
- `--page-limit <n>` in `[1,100]` (default `100`)
- `--unrealized-interval <v>` (default `1D`, e.g. `1H`, `1D`, `1W`)

## Outputs

Core milestone outputs:

- `normalized_trades.json`
- `metrics_overview.json`
- `metrics_performance.json`
- `run_meta.json`

Additional outputs:

- `activity_ledger.json`
- `venue_breakdown.json`
- `staking_summary.json`
- `balance_snapshot.json`
- `cashflow_ledger.json`
- `cashflow_summary.json`
- `unrealized_curve.json`

## Trade Detection + PnL Rules

- GOLD delta `> 0` => BUY candidate
- GOLD delta `< 0` => SELL candidate
- Requires swap-like counterflow (token or native) unless explicit swap evidence exists
- MINT/REDEEM/STAKE/CLAIM semantics are excluded from swap trade ledger
- FIFO for realized PnL (spot)
- Realized PnL only for USDC-valued sells
- Non-USDC or ambiguous sells are flagged as unknown basis and excluded from realized totals

## Edge Cases Handled

- Pagination with cutoff by `start-time`
- Retry with exponential backoff on `429`/`5xx`
- Signature dedupe across pages/fallback payloads
- Ambiguous swap fallback chain:
  - enhanced address history -> parsed tx by signatures -> raw RPC parse
- Explicit warning capture in `run_meta.json`
- Failed trades are excluded from analytics inputs
- Unresolved ambiguous signatures are counted correctly
- Floating-point near-zero dust is clamped in FIFO and unrealized position/cash
- ORO-native `UNKNOWN` tx fallback:
  - BUY-like GOLD/USDC flow => `MINT` activity
  - SELL-like GOLD/USDC flow => `REDEEM` activity
  - GOLD-only outflow/inflow => `STAKE`/`UNSTAKE` activity

## Testing

Run tests:

```bash
npm test
```

Build:

```bash
npm run build
```

## Final Validation Commands

Run these from project root (with `.env` configured):

```bash
npm run start:dist -- --wallet 7orgFWEBNCsqspUTX8AZurjRfHrgRYZiswm4ewqJmH9E --gold-mint GoLDppdjB1vDTPSGxyMJFqdnj134yH6Prg9eqsGDiw6A --since-days 365 --out-dir ./out-finalcheck-7org --unrealized-interval 1D
```

```bash
npm run start:dist -- --wallet B2CP2WEFFxx1DFDenirn6hhYD2zFV7VC6PfZzyLYFmMN --gold-mint GoLDppdjB1vDTPSGxyMJFqdnj134yH6Prg9eqsGDiw6A --since-days 30 --out-dir ./out-finalcheck-b2cp --unrealized-interval 1D
```

```bash
npm run start:dist -- --wallet DTADb5gofmTux91xuiTVNeSyLnoYweL7MFMVuHimYpTk --gold-mint GoLDppdjB1vDTPSGxyMJFqdnj134yH6Prg9eqsGDiw6A --since-days 30 --out-dir ./out-finalcheck-dtad --unrealized-interval 1D
```

```bash
npm run start:dist -- --wallet EfAN9h43PBAWZsbUpNshpzZBTJiP6hMgxearRbLndPeb --gold-mint GoLDppdjB1vDTPSGxyMJFqdnj134yH6Prg9eqsGDiw6A --since-days 365 --out-dir ./out-finalcheck-efan --unrealized-interval 1D
```

## Reference Test Wallets (Mainnet)

Use these to quickly re-validate behavior without searching again:

- `7orgFWEBNCsqspUTX8AZurjRfHrgRYZiswm4ewqJmH9E` (your wallet): basic GOLD swap buy/sell checks.
- `B2CP2WEFFxx1DFDenirn6hhYD2zFV7VC6PfZzyLYFmMN`: ORO-native `UNKNOWN` mint/redeem style activity and unstake-style activity.
- `DTADb5gofmTux91xuiTVNeSyLnoYweL7MFMVuHimYpTk`: ORO-native `UNKNOWN` stake-style activity.
- `EfAN9h43PBAWZsbUpNshpzZBTJiP6hMgxearRbLndPeb`: real `TOKEN_MINT` reward-only flows now mapped to `CLAIM_REWARD`.

Notes:

- These are public wallets; historical activity can change over time.
- Keep `--since-days` wide enough (for example `30` or `365`) so the relevant signatures are included.
- Real claim-reward behavior is regression-tested with fixture `test/fixtures/real-oro-claim-reward.json` (signature-auditable).

## Scope

In scope:

- Read-only GOLD spot analytics for milestones 1-3

Out of scope:

- In-app execution (milestone 4)
- KYC-gated mint/redeem user execution flows
- Pending staking rewards
