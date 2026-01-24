#!/bin/bash

# =============================================================================
# SIGAWAS / GealGeolGeo - Full Clean Deploy Script
# =============================================================================
# This script wipes the old deployment and sets up a fresh one from the package.
# Run with: bash /home/ryandshine/server_setup.sh
# Note: Requires sudo for copying to /var/www and restarting services.
# =============================================================================

APP_DIR="/home/ryandshine/gealgeolgeo"
PACKAGE="/home/ryandshine/deploy_package.tar.gz"
NGINX_WWW="/var/www/gealgeolgeo"
SERVICE_NAME="gealgeolgeo-backend"

echo "=============================================="
echo "🚀 SIGAWAS Full Clean Deployment Starting..."
echo "=============================================="

# --- 1. Backup Config Files ---
echo ""
echo "[1/7] 🧹 Backing up config files..."
cp $APP_DIR/.env /home/ryandshine/.env.bak 2>/dev/null || echo "    (No .env to backup)"
cp $APP_DIR/gee-service-account-key.json /home/ryandshine/gee-key.bak 2>/dev/null || echo "    (No GEE key to backup)"

# --- 2. Wipe Existing App Directory ---
echo ""
echo "[2/7] 🗑️ Wiping existing files in $APP_DIR..."
find $APP_DIR -mindepth 1 -delete

# --- 3. Extract New Package ---
echo ""
echo "[3/7] 📦 Extracting new deployment package..."
tar -xzf $PACKAGE -C $APP_DIR

# --- 4. Restore Config Files ---
echo ""
echo "[4/7] ♻️ Restoring config files..."
mv /home/ryandshine/.env.bak $APP_DIR/.env 2>/dev/null || echo "    (No .env to restore)"
mv /home/ryandshine/gee-key.bak $APP_DIR/gee-service-account-key.json 2>/dev/null || echo "    (No GEE key to restore)"

# --- 5. Setup Python Virtual Environment ---
echo ""
echo "[5/7] 🐍 Setting up Python Virtual Environment..."
cd $APP_DIR
python3 -m venv .venv
source .venv/bin/activate
pip install --upgrade pip -q
pip install -r requirements.txt -q
echo "    ✅ Python dependencies installed."

# --- 6. Build Frontend ---
echo ""
echo "[6/7] ⚛️ Building Frontend..."
cd $APP_DIR/frontend
rm -rf node_modules 2>/dev/null
npm install --silent
npm run build --silent
echo "    ✅ Frontend build complete."

# --- 7. Deploy to Nginx Web Root ---
echo ""
echo "[7/7] 🌐 Deploying frontend to Nginx web root ($NGINX_WWW)..."
echo "    (This step requires sudo)"
# Clean old files in www
sudo rm -rf $NGINX_WWW/*
# Copy new build
sudo cp -r $APP_DIR/frontend/dist/* $NGINX_WWW/
# Set correct ownership
sudo chown -R www-data:www-data $NGINX_WWW
echo "    ✅ Frontend deployed to $NGINX_WWW."

# --- Final: Restart Services ---
echo ""
echo "=============================================="
echo "🔄 Restarting Services (requires sudo)..."
echo "=============================================="
sudo systemctl restart $SERVICE_NAME
sudo systemctl restart nginx

echo ""
echo "=============================================="
echo "✅ DEPLOYMENT COMPLETE!"
echo "=============================================="
echo "🌐 App live at: http://gealgeolgeo.ditpps.com"
echo "📊 API Docs at: http://gealgeolgeo.ditpps.com/api/docs"
echo ""
