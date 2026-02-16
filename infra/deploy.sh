#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
INFRA_DIR="$ROOT_DIR/infra"
ENV_FILE="${1:-$INFRA_DIR/.env}"
COMPOSE=(docker compose -f "$INFRA_DIR/docker-compose.yml" --env-file "$ENV_FILE" -p gealgeolgeo)

if [[ ! -f "$ENV_FILE" ]]; then
  echo "ERROR: env infra tidak ditemukan: $ENV_FILE"
  echo "Jalankan: cp $INFRA_DIR/.env.template $INFRA_DIR/.env"
  exit 1
fi

if [[ ! -f "$ROOT_DIR/.env" ]]; then
  echo "ERROR: runtime env tidak ditemukan: $ROOT_DIR/.env"
  echo "Jalankan: cp $ROOT_DIR/.env.example $ROOT_DIR/.env lalu isi nilainya."
  exit 1
fi

echo "==> Validasi file key GEE"
GEE_KEY_FILE_HOST="$(grep -E '^GEE_KEY_FILE_HOST=' "$ENV_FILE" | head -n1 | cut -d= -f2- || true)"
GEE_KEY_FILE_HOST="${GEE_KEY_FILE_HOST:-../gee-service-account-key.json}"
if [[ ! -f "$INFRA_DIR/$GEE_KEY_FILE_HOST" && ! -f "$ROOT_DIR/${GEE_KEY_FILE_HOST#../}" && ! -f "$GEE_KEY_FILE_HOST" ]]; then
  echo "WARNING: key GEE tidak ditemukan di path: $GEE_KEY_FILE_HOST"
  echo "Deploy tetap dilanjutkan, tapi backend bisa gagal inisialisasi GEE."
fi

echo "==> Build image terbaru"
"${COMPOSE[@]}" build --pull

echo "==> Start/Update stack"
"${COMPOSE[@]}" up -d --remove-orphans

echo "==> Status service"
"${COMPOSE[@]}" ps

echo "==> Selesai"
