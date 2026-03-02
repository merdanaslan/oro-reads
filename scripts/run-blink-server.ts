import "dotenv/config";

import { parseBlinkConfig } from "../src/blink/config";
import { createBlinkServer, startBlinkServer } from "../src/blink/server";

async function main(): Promise<void> {
  const config = parseBlinkConfig(process.env);
  const server = createBlinkServer({ config });

  await startBlinkServer(server, config.port);

  console.log(`[blink] listening on ${config.baseUrl}`);
  console.log(`[blink] router URL: ${config.baseUrl}/api/v0/swap/gold-usdc`);
  console.log(`[blink] buy URL: ${config.baseUrl}/api/v0/swap/${config.buyTokenPair}`);
  console.log(`[blink] sell URL: ${config.baseUrl}/api/v0/swap/${config.sellTokenPair}`);
}

void main().catch((error) => {
  console.error(`[blink] failed to start: ${String(error)}`);
  process.exitCode = 1;
});
