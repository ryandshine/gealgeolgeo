#!/bash

# Configuration
APP_DIR="/home/ryandshine/gealgeolgeo"
SERVICE_NAME="gealgeolgeo-backend"
WEB_ROOT="/var/www/gealgeolgeo"

echo "🚀 Starting PRODUCTION Deployment (Perfect Mode)..."

# 1. Update Code
echo "📥 Syncing with GitHub..."
cd $APP_DIR
# Clean up any local temporary files not in git
git reset --hard HEAD
git clean -fd
git pull origin main

# 2. Setup/Update Backend
echo "🐍 Refreshing Virtual Environment..."
# Stop service to release file locks
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
sudo systemctl daemon-reload
sudo systemctl enable $SERVICE_NAME
sudo systemctl restart $SERVICE_NAME
sudo systemctl restart nginx

echo "✅ DEPLOYMENT COMPLETE!"
echo "🌐 URL: https://gealgeolgeo.ditpps.com"
echo "🕒 Timestamp: $(date)"
