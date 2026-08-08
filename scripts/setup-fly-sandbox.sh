#!/usr/bin/env bash
# Provision the Fly sandbox app + image, then print Vercel/GitHub env values.
#
# Prerequisites:
#   - flyctl installed (https://fly.io/docs/hands-on/install-flyctl/)
#   - `fly auth login` completed for an org that can create apps
#   - vercel CLI linked to cyberskill-builder (optional; for env push)
#
# Usage:
#   ./scripts/setup-fly-sandbox.sh
#   APP_NAME=my-sandbox ./scripts/setup-fly-sandbox.sh
#   SKIP_VERCEL=1 ./scripts/setup-fly-sandbox.sh   # print only; don't push env

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
APP_NAME="${APP_NAME:-cyberskill-sandbox}"
REGION="${FLY_REGION:-iad}"
SKIP_VERCEL="${SKIP_VERCEL:-0}"

if ! command -v fly >/dev/null 2>&1 && ! command -v flyctl >/dev/null 2>&1; then
  echo "flyctl not found. Install: https://fly.io/docs/hands-on/install-flyctl/" >&2
  exit 1
fi

FLY_BIN="$(command -v fly || command -v flyctl)"

if ! "$FLY_BIN" auth whoami >/dev/null 2>&1; then
  echo "Not logged into Fly. Run: fly auth login" >&2
  exit 1
fi

if ! "$FLY_BIN" apps list --json 2>/dev/null | grep -q "\"Name\":\"${APP_NAME}\""; then
  echo "Creating Fly app ${APP_NAME}…"
  "$FLY_BIN" apps create "${APP_NAME}" --org personal 2>/dev/null \
    || "$FLY_BIN" apps create "${APP_NAME}"
fi

echo "Deploying sandbox image to ${APP_NAME} (region ${REGION})…"
(
  cd "${ROOT}/sandbox"
  "$FLY_BIN" deploy --app "${APP_NAME}" --region "${REGION}" --image-label latest --yes
)

IMAGE="registry.fly.io/${APP_NAME}:latest"
TOKEN="$("$FLY_BIN" tokens create deploy -x 999999h -a "${APP_NAME}" 2>/dev/null || true)"
if [[ -z "${TOKEN}" ]]; then
  TOKEN="$("$FLY_BIN" auth token 2>/dev/null || true)"
fi

echo
echo "=== Set these server-only env vars ==="
echo "FLY_API_TOKEN=${TOKEN:-<run: fly tokens create deploy -a ${APP_NAME}>}"
echo "FLY_APP_NAME=${APP_NAME}"
echo "FLY_REGION=${REGION}"
echo "FLY_SANDBOX_IMAGE=${IMAGE}"
echo "FLY_TERMINAL_PORT=7681"
echo "FLY_IDLE_TIMEOUT_MINUTES=20"
echo "FLY_TERMINAL_WS_BASE=wss://${APP_NAME}.fly.dev"
echo "FLY_MAX_ACTIVE_SANDBOXES_PER_TENANT=2"
echo "FLY_SANDBOX_HOURLY_RATE_USD=0.02"
echo "FLY_MONTHLY_SPEND_WARNING_USD=50"

if [[ "${SKIP_VERCEL}" != "1" ]] && command -v vercel >/dev/null 2>&1; then
  if [[ -z "${TOKEN}" ]]; then
    echo "Skipping vercel env push — no deploy token available." >&2
    exit 0
  fi
  echo
  echo "Pushing non-secret + secret Fly env to Vercel (Preview + Production)…"
  push_env() {
    local key="$1" value="$2" sensitive="${3:-0}"
    for env_name in production preview; do
      if [[ "${sensitive}" == "1" ]]; then
        printf '%s' "${value}" | vercel env add "${key}" "${env_name}" --sensitive --force >/dev/null
      else
        printf '%s' "${value}" | vercel env add "${key}" "${env_name}" --force >/dev/null
      fi
      echo "  set ${key} (${env_name})"
    done
  }
  push_env FLY_API_TOKEN "${TOKEN}" 1
  push_env FLY_APP_NAME "${APP_NAME}" 0
  push_env FLY_REGION "${REGION}" 0
  push_env FLY_SANDBOX_IMAGE "${IMAGE}" 0
  push_env FLY_TERMINAL_PORT "7681" 0
  push_env FLY_IDLE_TIMEOUT_MINUTES "20" 0
  push_env FLY_TERMINAL_WS_BASE "wss://${APP_NAME}.fly.dev" 0
  push_env FLY_MAX_ACTIVE_SANDBOXES_PER_TENANT "2" 0
  echo "Vercel env updated. Redeploy production/preview to pick up secrets."
fi

# Local .env.local append (no overwrite of existing keys)
ENV_LOCAL="${ROOT}/.env.local"
if [[ -n "${TOKEN}" ]]; then
  touch "${ENV_LOCAL}"
  for pair in \
    "FLY_API_TOKEN=${TOKEN}" \
    "FLY_APP_NAME=${APP_NAME}" \
    "FLY_REGION=${REGION}" \
    "FLY_SANDBOX_IMAGE=${IMAGE}" \
    "FLY_TERMINAL_PORT=7681" \
    "FLY_IDLE_TIMEOUT_MINUTES=20" \
    "FLY_TERMINAL_WS_BASE=wss://${APP_NAME}.fly.dev"
  do
    key="${pair%%=*}"
    if ! grep -q "^${key}=" "${ENV_LOCAL}" 2>/dev/null; then
      printf '%s\n' "${pair}" >> "${ENV_LOCAL}"
      echo "Appended ${key} to .env.local"
    else
      echo "Kept existing ${key} in .env.local"
    fi
  done
fi

echo
echo "Also set GitHub Actions secrets for sandbox-cost-controls.yml:"
echo "  gh secret set FLY_API_TOKEN --body \"\$FLY_API_TOKEN\""
echo "  gh secret set FLY_APP_NAME --body \"${APP_NAME}\""
echo "  gh secret set FLY_SANDBOX_IMAGE --body \"${IMAGE}\""
echo
echo "Done."
