import { describe, expect, it } from "vitest";

import { rewriteActionHrefs } from "../src/blink/rewrite";

describe("blink href rewrite", () => {
  it("rewrites absolute action links to local base URL", () => {
    const payload = {
      title: "Swap",
      links: {
        actions: [
          {
            href: "https://jupiter.dial.to/api/v0/swap/A-B/10?foo=bar",
            label: "Swap 10"
          }
        ]
      }
    };

    const rewritten = rewriteActionHrefs(payload, "http://localhost:8787");

    expect(rewritten.links?.actions?.[0].href).toBe("http://localhost:8787/api/v0/swap/A-B/10?foo=bar");
  });

  it("rewrites relative action links to local base URL", () => {
    const payload = {
      links: {
        actions: [{ href: "/api/v0/swap/A-B/5" }]
      }
    };

    const rewritten = rewriteActionHrefs(payload, "http://localhost:8787");

    expect(rewritten.links?.actions?.[0].href).toBe("http://localhost:8787/api/v0/swap/A-B/5");
  });

  it("returns payload unchanged when actions are absent", () => {
    const payload = { title: "noop" };
    const rewritten = rewriteActionHrefs(payload, "http://localhost:8787");
    expect(rewritten).toEqual(payload);
  });
});
