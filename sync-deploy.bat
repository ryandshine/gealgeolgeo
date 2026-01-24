@echo off
SET SERVER_IP=100.66.123.98
SET SERVER_USER=ryandshine
SET PROJECT_DIR=/home/ryandshine/gealgeolgeo

echo [1/3] Pushing changes to GitHub...
git add .
git commit -m "Auto-deploy update"
git push origin main

echo [2/3] Connecting to server and running deploy script...
ssh %SERVER_USER%@%SERVER_IP% "bash %PROJECT_DIR%/deploy.sh"

echo [3/3] Deployment complete!
pause
