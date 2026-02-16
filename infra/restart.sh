#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
INFRA_DIR="$ROOT_DIR/infra"
ENV_FILE="${1:-$INFRA_DIR/.env}"

docker compose -f "$INFRA_DIR/docker-compose.yml" --env-file "$ENV_FILE" -p gealgeolgeo restart
docker compose -f "$INFRA_DIR/docker-compose.yml" --env-file "$ENV_FILE" -p gealgeolgeo ps
