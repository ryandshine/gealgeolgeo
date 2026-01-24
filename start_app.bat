@echo off
title GealGeolGeo Launcher
echo ========================================================
echo   Starting GealGeolGeo Local Development Environment
echo ========================================================

:: 1. Start Backend
echo.
echo [1/2] Launching Backend Server (Port 8000)...
start "GealGeolGeo Backend" cmd /k "python -m uvicorn main:app --reload --port 8000"

:: 2. Start Frontend
echo [2/2] Launching Frontend Server (Port 5173)...
cd frontend
start "GealGeolGeo Frontend" cmd /k "npm run dev"

echo.
echo ========================================================
echo   Success! The app is starting up...
echo   Backend: http://localhost:8000
echo   Frontend: http://localhost:5173
echo ========================================================
echo.
pause
