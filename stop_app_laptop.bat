@echo off
setlocal
cd /d "%~dp0"

echo ========================================================
echo   Stopping GealGeolGeo Local Development Environment
echo ========================================================

:: 1. Stop Backend (Port 8000)
echo.
echo [1/2] Stopping Backend Server (Port 8000)...
set found_backend=0
for /f "tokens=5" %%a in ('netstat -aon ^| findstr /C:":8000 "') do (
    echo Terminating Backend PID: %%a
    taskkill /F /PID %%a >nul 2>&1
    set found_backend=1
)
if %found_backend%==0 (
    echo [INFO] No process found on port 8000.
)

:: 2. Stop Frontend (Port 5173)
echo.
echo [2/2] Stopping Frontend Server (Port 5173)...
set found_frontend=0
for /f "tokens=5" %%a in ('netstat -aon ^| findstr /C:":5173 "') do (
    echo Terminating Frontend PID: %%a
    taskkill /F /PID %%a >nul 2>&1
    set found_frontend=1
)
if %found_frontend%==0 (
    echo [INFO] No process found on port 5173.
)

:: 3. Clean up cmd windows by title
echo.
echo [3/3] Closing Launcher Windows...
taskkill /F /FI "WINDOWTITLE eq GealGeolGeo Backend*" >nul 2>&1
taskkill /F /FI "WINDOWTITLE eq GealGeolGeo Frontend*" >nul 2>&1
taskkill /F /FI "WINDOWTITLE eq GealGeolGeo Launcher*" >nul 2>&1

echo.
echo ========================================================
echo   Success! Services have been stopped.
echo ========================================================
echo.
timeout /t 5
