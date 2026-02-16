#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
INFRA_DIR="$ROOT_DIR/infra"
ENV_FILE="${1:-$INFRA_DIR/.env}"

if [[ ! -f "$ENV_FILE" ]]; then
  echo "ERROR: env infra tidak ditemukan: $ENV_FILE"
  exit 1
fi

DOMAIN="$(grep -E '^DOMAIN=' "$ENV_FILE" | head -n1 | cut -d= -f2-)"
if [[ -z "${DOMAIN:-}" ]]; then
  echo "ERROR: DOMAIN belum diisi di $ENV_FILE"
  exit 1
fi

echo "==> Compose status"
docker compose -f "$INFRA_DIR/docker-compose.yml" --env-file "$ENV_FILE" -p gealgeolgeo ps

echo "==> Health API via HTTPS"
curl -fsS --max-time 20 "https://${DOMAIN}/api/health" || {
  echo
  echo "Health check HTTPS gagal. Coba cek DNS/SSL/proxy logs."
  exit 1
}
echo
echo "OK"
