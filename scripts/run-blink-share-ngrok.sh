#!/usr/bin/env bash
set -euo pipefail

PORT="${BLINK_PORT:-8787}"
NGROK_LOG="$(mktemp -t blink-ngrok.XXXXXX.log)"
NGROK_PID=""

cleanup() {
  if [[ -n "${NGROK_PID}" ]] && kill -0 "${NGROK_PID}" 2>/dev/null; then
    kill "${NGROK_PID}" 2>/dev/null || true
  fi
  rm -f "${NGROK_LOG}"
}

trap cleanup EXIT INT TERM

if ! ngrok config check >/dev/null 2>&1; then
  echo "[blink:share:ngrok] ngrok is not configured."
  echo "Run this once, then rerun this command:"
  echo "ngrok config add-authtoken <YOUR_NGROK_TOKEN>"
  exit 1
fi

echo "[blink:share:ngrok] starting ngrok on port ${PORT}..."
ngrok http "${PORT}" --log=stdout >"${NGROK_LOG}" 2>&1 &
NGROK_PID=$!

PUBLIC_URL=""
for _ in $(seq 1 120); do
  if ! kill -0 "${NGROK_PID}" 2>/dev/null; then
    echo "[blink:share:ngrok] ngrok exited unexpectedly."
    sed -n '1,120p' "${NGROK_LOG}"
    exit 1
  fi

  TUNNELS_JSON="$(curl -s --max-time 2 http://127.0.0.1:4040/api/tunnels || true)"
  if [[ -n "${TUNNELS_JSON}" ]]; then
    PUBLIC_URL="$(node -e '
      const input = process.argv[1] || "";
      try {
        const data = JSON.parse(input);
        const tunnels = Array.isArray(data.tunnels) ? data.tunnels : [];
        const httpsTunnel = tunnels.find((t) => typeof t.public_url === "string" && t.public_url.startsWith("https://"));
        if (httpsTunnel?.public_url) process.stdout.write(httpsTunnel.public_url);
      } catch {}
    ' "${TUNNELS_JSON}")"
  fi

  if [[ -n "${PUBLIC_URL}" ]]; then
    break
  fi

  sleep 0.5
done

if [[ -z "${PUBLIC_URL}" ]]; then
  echo "[blink:share:ngrok] failed to get ngrok public URL."
  sed -n '1,160p' "${NGROK_LOG}"
  exit 1
fi

export BLINK_BASE_URL="${PUBLIC_URL}"
echo "[blink:share:ngrok] public base URL: ${BLINK_BASE_URL}"

GOLD_MINT="${BLINK_GOLD_MINT:-GoLDppdjB1vDTPSGxyMJFqdnj134yH6Prg9eqsGDiw6A}"
USDC_MINT="${BLINK_USDC_MINT:-EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v}"
BUY_URL="${BLINK_BASE_URL}/api/v0/swap/${USDC_MINT}-${GOLD_MINT}"
SELL_URL="${BLINK_BASE_URL}/api/v0/swap/${GOLD_MINT}-${USDC_MINT}"
ROUTER_URL="${BLINK_BASE_URL}/api/v0/swap/gold-usdc"

echo "[blink:share:ngrok] router URL: ${ROUTER_URL}"
echo "[blink:share:ngrok] buy URL: ${BUY_URL}"
echo "[blink:share:ngrok] sell URL: ${SELL_URL}"

ROUTER_ENC="$(node -e 'console.log(encodeURIComponent(process.argv[1]))' "${ROUTER_URL}")"
BUY_ENC="$(node -e 'console.log(encodeURIComponent(process.argv[1]))' "${BUY_URL}")"
SELL_ENC="$(node -e 'console.log(encodeURIComponent(process.argv[1]))' "${SELL_URL}")"

echo "[blink:share:ngrok] dial.to router:"
echo "https://dial.to/?action=${ROUTER_ENC}&cluster=mainnet&securityLevel=all"
echo "[blink:share:ngrok] dial.to buy:"
echo "https://dial.to/?action=${BUY_ENC}&cluster=mainnet&securityLevel=all"
echo "[blink:share:ngrok] dial.to sell:"
echo "https://dial.to/?action=${SELL_ENC}&cluster=mainnet&securityLevel=all"
echo "[blink:share:ngrok] starting Blink server..."

npm run blink:start
