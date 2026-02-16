# Infra Package (Server Migration Ready)

Paket ini menyiapkan deployment end-to-end di server baru:
- `Docker Compose` untuk app + reverse proxy.
- `Caddy` untuk reverse proxy + SSL otomatis (Let's Encrypt).
- Volume persisten untuk data runtime (`storage`, `cache`).
- Script deploy, restart, health check, dan systemd autostart.

## Struktur

- `infra/docker-compose.yml` - stack app + proxy
- `infra/Caddyfile` - reverse proxy HTTPS
- `infra/.env.template` - template konfigurasi infra
- `infra/deploy.sh` - build + up stack
- `infra/restart.sh` - restart stack cepat
- `infra/check.sh` - cek status service + endpoint
- `infra/install-systemd.sh` - auto run saat boot

## Quick Start (Server Baru)

1. Clone repo:
```bash
git clone https://github.com/ryandshine/gealgeolgeo.git
cd gealgeolgeo
```

2. Siapkan env runtime:
```bash
cp .env.example .env
# lalu edit .env sesuai environment server
```

3. Siapkan env infra:
```bash
cp infra/.env.template infra/.env
# lalu edit DOMAIN, LETSENCRYPT_EMAIL, dan path key
```

4. Pastikan key GEE tersedia:
- Default path: `./gee-service-account-key.json`
- Bisa diubah via `GEE_KEY_FILE_HOST` di `infra/.env`

5. Deploy:
```bash
./infra/deploy.sh
```

6. Cek health:
```bash
./infra/check.sh
```

## Auto Run Saat VPS Restart

Jalankan sekali:
```bash
sudo ./infra/install-systemd.sh
```

Lalu verifikasi:
```bash
systemctl status gealgeolgeo-infra
```

## Catatan

- DNS domain harus mengarah ke IP server sebelum SSL otomatis berhasil.
- Port `80` dan `443` wajib terbuka.
- `.env` dan file key rahasia tidak disimpan ke Git.
