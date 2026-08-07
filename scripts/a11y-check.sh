#!/usr/bin/env bash
#
# Build (optional), start the production server, and run WCAG 2.2 AA checks.
#
# Local usage:
#   A11Y_TEST_EMAIL=you@example.com A11Y_TEST_PASSWORD='secret' npm run a11y-check
#
# Skip rebuild when .next already exists:
#   A11Y_SKIP_BUILD=1 npm run a11y-check
#
# Requires Chromium for Playwright (installed automatically on first run).
#
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

PORT="${A11Y_PORT:-3000}"
export A11Y_BASE_URL="${A11Y_BASE_URL:-http://127.0.0.1:${PORT}}"

if [[ -z "${A11Y_SKIP_BUILD:-}" ]]; then
  echo "Building Next.js app..."
  npm run build
else
  echo "Skipping build (A11Y_SKIP_BUILD is set)."
fi

echo "Ensuring Playwright Chromium is installed..."
npx playwright install chromium

echo "Starting production server on port ${PORT}..."
npm run start -- -p "${PORT}" &
SERVER_PID=$!

cleanup() {
  if kill -0 "${SERVER_PID}" 2>/dev/null; then
    kill "${SERVER_PID}" 2>/dev/null || true
    wait "${SERVER_PID}" 2>/dev/null || true
  fi
}
trap cleanup EXIT INT TERM

echo "Waiting for ${A11Y_BASE_URL}..."
for _ in $(seq 1 60); do
  if curl -fsS "${A11Y_BASE_URL}" >/dev/null 2>&1; then
    break
  fi
  sleep 1
done

if ! curl -fsS "${A11Y_BASE_URL}" >/dev/null 2>&1; then
  echo "Server did not become ready at ${A11Y_BASE_URL}" >&2
  exit 1
fi

echo "Running accessibility checks (WCAG 2.2 AA)..."
npx tsx scripts/a11y-check.ts
