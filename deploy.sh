#!/bash

# Configuration
APP_DIR="/srv/apps/gealgeolgeo"
SERVICE_NAME="gealgeolgeo-backend"
WEB_ROOT="/var/www/gealgeolgeo"
REPO_URL="https://github.com/ryandshine/gealgeolgeo.git"

echo "🚀 Starting PRODUCTION Deployment (Perfect Mode)..."

# 1. Ensure Directory & Sync Code
if [ ! -d "$APP_DIR/.git" ]; then
    echo "📦 Initial Clone..."
    sudo mkdir -p $APP_DIR
    sudo chown $USER:$USER $APP_DIR
    git clone $REPO_URL $APP_DIR
fi

echo "📥 Syncing with GitHub..."
cd $APP_DIR
git reset --hard HEAD
git clean -fd
git pull origin main

# 2. Setup/Update Backend
echo "🐍 Refreshing Virtual Environment..."
sudo systemctl stop $SERVICE_NAME || true

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
if [ ! -f "/etc/nginx/sites-enabled/gealgeolgeo" ]; then
    echo "🌐 Enabling Nginx config..."
    sudo ln -s /etc/nginx/sites-available/gealgeolgeo /etc/nginx/sites-enabled/
fi

sudo systemctl daemon-reload
sudo systemctl enable $SERVICE_NAME
sudo systemctl restart $SERVICE_NAME
sudo systemctl restart nginx

echo "✅ DEPLOYMENT COMPLETE!"
echo "🌐 URL: https://gealgeolgeo.ditpps.com"
echo "🕒 Timestamp: $(date)"
