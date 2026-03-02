#!/usr/bin/env bash
set -euo pipefail

PORT="${BLINK_PORT:-8787}"
LT_LOG="$(mktemp -t blink-localtunnel.XXXXXX.log)"
LT_PID=""

cleanup() {
  if [[ -n "${LT_PID}" ]] && kill -0 "${LT_PID}" 2>/dev/null; then
    kill "${LT_PID}" 2>/dev/null || true
  fi
  rm -f "${LT_LOG}"
}

trap cleanup EXIT INT TERM

echo "[blink:share] starting localtunnel on port ${PORT}..."
npx --yes localtunnel --port "${PORT}" --local-host 127.0.0.1 >"${LT_LOG}" 2>&1 &
LT_PID=$!

PUBLIC_URL=""
for _ in $(seq 1 120); do
  if grep -q "your url is:" "${LT_LOG}"; then
    PUBLIC_URL="$(sed -n 's/.*your url is:[[:space:]]*\(https:\/\/[^[:space:]]*\).*/\1/p' "${LT_LOG}" | tail -n 1)"
    break
  fi

  if ! kill -0 "${LT_PID}" 2>/dev/null; then
    echo "[blink:share] localtunnel exited unexpectedly."
    cat "${LT_LOG}"
    exit 1
  fi

  sleep 0.5
done

if [[ -z "${PUBLIC_URL}" ]]; then
  echo "[blink:share] failed to get localtunnel URL."
  cat "${LT_LOG}"
  exit 1
fi

export BLINK_BASE_URL="${PUBLIC_URL}"
echo "[blink:share] public base URL: ${BLINK_BASE_URL}"

GOLD_MINT="${BLINK_GOLD_MINT:-GoLDppdjB1vDTPSGxyMJFqdnj134yH6Prg9eqsGDiw6A}"
USDC_MINT="${BLINK_USDC_MINT:-EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v}"
BUY_URL="${BLINK_BASE_URL}/api/v0/swap/${USDC_MINT}-${GOLD_MINT}"
SELL_URL="${BLINK_BASE_URL}/api/v0/swap/${GOLD_MINT}-${USDC_MINT}"
ROUTER_URL="${BLINK_BASE_URL}/api/v0/swap/gold-usdc"

echo "[blink:share] router URL: ${ROUTER_URL}"
echo "[blink:share] buy URL: ${BUY_URL}"
echo "[blink:share] sell URL: ${SELL_URL}"

ROUTER_ENC="$(node -e 'console.log(encodeURIComponent(process.argv[1]))' "${ROUTER_URL}")"
BUY_ENC="$(node -e 'console.log(encodeURIComponent(process.argv[1]))' "${BUY_URL}")"
SELL_ENC="$(node -e 'console.log(encodeURIComponent(process.argv[1]))' "${SELL_URL}")"

echo "[blink:share] dial.to router:"
echo "https://dial.to/?action=${ROUTER_ENC}&cluster=mainnet&securityLevel=all"
echo "[blink:share] dial.to buy:"
echo "https://dial.to/?action=${BUY_ENC}&cluster=mainnet&securityLevel=all"
echo "[blink:share] dial.to sell:"
echo "https://dial.to/?action=${SELL_ENC}&cluster=mainnet&securityLevel=all"
echo "[blink:share] starting Blink server..."

npm run blink:start
