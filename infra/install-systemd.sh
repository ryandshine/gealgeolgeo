#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
INFRA_DIR="$ROOT_DIR/infra"
ENV_FILE="$INFRA_DIR/.env"
UNIT_FILE="/etc/systemd/system/gealgeolgeo-infra.service"

if [[ ! -f "$ENV_FILE" ]]; then
  echo "ERROR: $ENV_FILE belum ada. Buat dulu dari template."
  exit 1
fi

sudo tee "$UNIT_FILE" >/dev/null <<EOF
[Unit]
Description=GealGeoLGeo Infra Stack (Docker Compose)
Requires=docker.service
After=docker.service network-online.target
Wants=network-online.target

[Service]
Type=oneshot
RemainAfterExit=yes
WorkingDirectory=$ROOT_DIR
ExecStart=/usr/bin/docker compose -f $INFRA_DIR/docker-compose.yml --env-file $ENV_FILE -p gealgeolgeo up -d --remove-orphans
ExecStop=/usr/bin/docker compose -f $INFRA_DIR/docker-compose.yml --env-file $ENV_FILE -p gealgeolgeo down
TimeoutStartSec=0

[Install]
WantedBy=multi-user.target
EOF

sudo systemctl daemon-reload
sudo systemctl enable gealgeolgeo-infra.service
sudo systemctl start gealgeolgeo-infra.service

echo "Service installed and started: gealgeolgeo-infra.service"
sudo systemctl status gealgeolgeo-infra.service --no-pager -l || true
