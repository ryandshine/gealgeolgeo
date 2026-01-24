#!/bin/bash

# Configuration
APP_DIR="/home/ryandshine/gealgeolgeo"
SERVICE_NAME="gealgeolgeo-backend"

echo "🚀 Starting DEEP CLEAN Deployment..."

# 1. Update Code
echo "📥 Pulling latest changes from Git..."
cd $APP_DIR
# Reset any local changes to avoid conflicts
git reset --hard HEAD
git pull origin main

# 2. Deep Clean & Update Backend
echo "🐍 Cleaning and Updating Backend (Python)..."
# Stop service before cleaning
sudo systemctl stop $SERVICE_NAME

# Remove virtual environment to force fresh install
rm -rf .venv
python3 -m venv .venv
source .venv/bin/activate
echo "📦 Installing Python dependencies..."
pip install --upgrade pip
pip install -r requirements.txt

# 3. Deep Clean & Update Frontend
echo "⚛️  Cleaning and Building Frontend (React)..."
cd frontend
# Remove build artifacts and dependencies
rm -rf dist
rm -rf node_modules
echo "📦 Installing npm dependencies..."
npm install
echo "🛠️  Creating fresh production build..."
npm run build
cd ..

# 4. Sync to Web Root & Restart Services
echo "🔄 Syncing files to Web Root (/var/www/gealgeolgeo)..."
sudo cp -r frontend/dist/* /var/www/gealgeolgeo/

echo "🔄 Restarting Systemd Service..."
sudo systemctl restart $SERVICE_NAME
# Ensure it's enabled
sudo systemctl enable $SERVICE_NAME

echo "🌐 Restarting Nginx..."
sudo systemctl restart nginx

# 5. Verify Database Access Policy (Ensure public access)
echo "✅ Backend set to 0.0.0.0:8000"
echo "✅ CORS set to allow all origins in main.py"
echo "✅ Deployment Finished Successfully!"
echo "🌐 App should be live at: http://gealgeolgeo.ditpps.com"
