const BASE58_ADDRESS = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

export const DEFAULT_USDC_MINT = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";

export const DEFAULT_ORO_PROGRAM_IDS = [
  "iNtiXEFgDNrc6FUt4cFALDe3D8RF3sVnNuKSHwxZRop",
  "HddmrUyzTVFuX39vyAT72XqV7C6ALa3GCUyKZeSJUHNm"
];

export interface CliConfig {
  apiKey: string;
  wallet: string;
  goldMint: string;
  usdcMint: string;
  sinceDays: number;
  outDir: string;
  oroProgramIds: string[];
  pageLimit: number;
}

interface ParsedArgs {
  wallet?: string;
  goldMint?: string;
  usdcMint?: string;
  sinceDays?: number;
  outDir?: string;
  oroProgramIds?: string[];
  pageLimit?: number;
}

export function parseConfig(argv: string[], env: NodeJS.ProcessEnv): CliConfig {
  const args = parseArgs(argv);
  const apiKey = (env.HELIUS_API_KEY ?? "").trim();

  if (!apiKey) {
    throw new Error("Missing HELIUS_API_KEY environment variable.");
  }

  const wallet = args.wallet ?? "";
  const goldMint = args.goldMint ?? "";

  validateAddress("wallet", wallet);
  validateAddress("gold mint", goldMint);

  const usdcMint = args.usdcMint ?? DEFAULT_USDC_MINT;
  validateAddress("usdc mint", usdcMint);

  const sinceDays = args.sinceDays ?? 365;
  if (!Number.isFinite(sinceDays) || sinceDays <= 0) {
    throw new Error("--since-days must be a positive number.");
  }

  const pageLimit = args.pageLimit ?? 100;
  if (!Number.isInteger(pageLimit) || pageLimit < 1 || pageLimit > 100) {
    throw new Error("--page-limit must be an integer in [1, 100].");
  }

  const fromEnvPrograms = parseProgramIdList(env.ORO_PROGRAM_IDS);
  const fromArgPrograms = args.oroProgramIds ?? [];
  const mergedPrograms = dedupe([
    ...DEFAULT_ORO_PROGRAM_IDS,
    ...fromEnvPrograms,
    ...fromArgPrograms
  ]);

  for (const programId of mergedPrograms) {
    validateAddress("ORO program ID", programId);
  }

  return {
    apiKey,
    wallet,
    goldMint,
    usdcMint,
    sinceDays,
    outDir: args.outDir ?? "./out",
    oroProgramIds: mergedPrograms,
    pageLimit
  };
}

export function usage(): string {
  return [
    "Usage:",
    "  npm run start -- --wallet <pubkey> --gold-mint <mint> [options]",
    "",
    "Required:",
    "  --wallet <pubkey>",
    "  --gold-mint <mint>",
    "  HELIUS_API_KEY env var",
    "",
    "Options:",
    "  --since-days <n>         Default: 365",
    `  --usdc-mint <mint>       Default: ${DEFAULT_USDC_MINT}`,
    "  --oro-program-ids <csv>  Extra program IDs used for ORO-native tagging",
    "  --out-dir <path>         Default: ./out",
    "  --page-limit <n>         Default: 100",
    "  --help"
  ].join("\n");
}

function parseArgs(argv: string[]): ParsedArgs {
  const parsed: ParsedArgs = {};

  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];

    if (token === "--help") {
      throw new Error(usage());
    }

    if (!token.startsWith("--")) {
      throw new Error(`Unexpected argument: ${token}`);
    }

    const key = token.slice(2);
    const value = argv[i + 1];

    if (!value || value.startsWith("--")) {
      throw new Error(`Missing value for --${key}`);
    }

    switch (key) {
      case "wallet":
        parsed.wallet = value.trim();
        break;
      case "gold-mint":
        parsed.goldMint = value.trim();
        break;
      case "usdc-mint":
        parsed.usdcMint = value.trim();
        break;
      case "since-days":
        parsed.sinceDays = Number(value);
        break;
      case "out-dir":
        parsed.outDir = value;
        break;
      case "oro-program-ids":
        parsed.oroProgramIds = parseProgramIdList(value);
        break;
      case "page-limit":
        parsed.pageLimit = Number(value);
        break;
      default:
        throw new Error(`Unknown option: --${key}`);
    }

    i += 1;
  }

  return parsed;
}

function parseProgramIdList(input: string | undefined): string[] {
  if (!input) {
    return [];
  }

  return input
    .split(",")
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
}

function validateAddress(name: string, address: string): void {
  if (!BASE58_ADDRESS.test(address)) {
    throw new Error(`Invalid ${name}: ${address}`);
  }
}

function dedupe(values: string[]): string[] {
  return Array.from(new Set(values));
}
