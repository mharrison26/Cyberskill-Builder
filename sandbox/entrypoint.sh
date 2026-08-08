#!/usr/bin/env bash
set -euo pipefail

PORT="${PORT:-7681}"
IDLE_TIMEOUT_SECONDS="${IDLE_TIMEOUT_SECONDS:-1200}"

# Soft idle killer: exit so Fly auto_destroy can reclaim the machine.
(
  sleep "${IDLE_TIMEOUT_SECONDS}"
  echo "[sandbox] idle timeout (${IDLE_TIMEOUT_SECONDS}s) — shutting down" >&2
  kill -TERM 1 2>/dev/null || true
) &

exec ttyd \
  --port "${PORT}" \
  --writable \
  --base-path / \
  bash -l
