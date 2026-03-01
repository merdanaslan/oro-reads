import { describe, expect, it } from "vitest";

import {
  collectUnresolvedAmbiguousSignatures,
  filterSuccessfulTrades
} from "../src/cli";
import { NormalizedGoldTrade } from "../src/types";

const WALLET = "Cm9aaToERd5g3WshAezKfEW2EgdfcB7FqC7LmTaacigQ";
const GOLD_MINT = "GoLDppdjB1vDTPSGxyMJFqdnj134yH6Prg9eqsGDiw6A";
const USDC_MINT = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";

function makeTrade(
  partial: Partial<NormalizedGoldTrade> &
    Pick<NormalizedGoldTrade, "signature" | "status" | "valuationStatus">
): NormalizedGoldTrade {
  return {
    signature: partial.signature,
    slot: 1,
    timestamp: 1,
    status: partial.status,
    wallet: WALLET,
    side: "BUY",
    goldMint: GOLD_MINT,
    goldQty: 1,
    quoteMint: USDC_MINT,
    quoteQty: 1,
    priceQuotePerGold: 1,
    txFeeLamports: 1000,
    source: "JUPITER",
    type: "SWAP",
    venueTag: "JUPITER",
    isOroNative: false,
    programIds: [],
    valuationStatus: partial.valuationStatus
  };
}

describe("cli helpers", () => {
  it("filters failed trades out of analytics input", () => {
    const input: NormalizedGoldTrade[] = [
      makeTrade({ signature: "sig-1", status: "SUCCESS", valuationStatus: "USDC_VALUED" }),
      makeTrade({ signature: "sig-2", status: "FAILED", valuationStatus: "USDC_VALUED" }),
      makeTrade({ signature: "sig-3", status: "SUCCESS", valuationStatus: "NO_USDC_LEG" })
    ];

    const result = filterSuccessfulTrades(input);

    expect(result.trades.map((trade) => trade.signature)).toEqual(["sig-1", "sig-3"]);
    expect(result.droppedFailedTradeCount).toBe(1);
  });

  it("counts unresolved ambiguous signatures when trade is missing or still ambiguous", () => {
    const recovered = new Map<string, NormalizedGoldTrade>([
      ["sig-1", makeTrade({ signature: "sig-1", status: "SUCCESS", valuationStatus: "AMBIGUOUS" })],
      ["sig-2", makeTrade({ signature: "sig-2", status: "SUCCESS", valuationStatus: "USDC_VALUED" })]
    ]);

    const unresolved = collectUnresolvedAmbiguousSignatures(["sig-1", "sig-2", "sig-3"], recovered);

    expect(unresolved).toEqual(["sig-1", "sig-3"]);
  });
});

