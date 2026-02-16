#!/bin/bash

# Configuration
APP_DIR=$(pwd)
SERVICE_NAME="gealgeolgeo-backend"
WEB_ROOT="/var/www/gealgeolgeo"
REPO_URL="https://github.com/ryandshine/gealgeolgeo.git"

echo "🚀 Starting PRODUCTION Deployment (Perfect Mode)..."

# 1. Sync Code (if .git exists)
# if [ -d ".git" ]; then
#     echo "📥 Syncing with GitHub..."
#     git reset --hard HEAD
#     git clean -fd
#     git pull origin main
# else
#     echo "⚠️ Not a git repository, skipping sync."
# fi

# 2. Setup/Update Backend
echo "🐍 Refreshing Virtual Environment & Cache..."
sudo systemctl stop $SERVICE_NAME || true

# Clear stale cache (Important for data consistency)
rm -rf cache/
rm -rf .venv
python3 -m venv .venv
source .venv/bin/activate
pip install --upgrade pip
pip install -r requirements.txt

# 3. Setup/Update Frontend
echo "⚛️  Building Frontend (Fresh)..."
cd frontend
rm -rf dist node_modules package-lock.json
npm install
npm run build
cd ..

# 4. Finalize & Sync
echo "🔄 Updating Web Root..."
sudo mkdir -p $WEB_ROOT
sudo chown -R $USER:$USER $WEB_ROOT
cp -v -r frontend/dist/* $WEB_ROOT/

# 5. Services Refresh
echo "🔄 Restarting System Services..."
# Ensure nginx config is enabled
if [ ! -f "/etc/nginx/sites-available/gealgeolgeo" ]; then
    echo "🌐 Copying Nginx config..."
    sudo cp nginx_gealgeolgeo /etc/nginx/sites-available/gealgeolgeo
fi

if [ ! -f "/etc/nginx/sites-enabled/gealgeolgeo" ]; then
    echo "🌐 Enabling Nginx config..."
    sudo ln -sf /etc/nginx/sites-available/gealgeolgeo /etc/nginx/sites-enabled/
fi

# Disable default or conflicting sites if needed
if [ -f "/etc/nginx/sites-enabled/react-app" ]; then
    echo "🚫 Disabling conflicting react-app..."
    sudo rm /etc/nginx/sites-enabled/react-app
fi

sudo systemctl daemon-reload
sudo systemctl enable $SERVICE_NAME
sudo systemctl restart $SERVICE_NAME
sudo systemctl restart nginx

echo "✅ DEPLOYMENT COMPLETE!"
echo "🌐 URL: https://gealgeolgeo.ditpps.com"
echo "🕒 Timestamp: $(date)"
