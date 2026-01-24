@echo off
setlocal enabledelayedexpansion
title Stop GealGeolGeo (Port-based)
echo ========================================================
echo   Stopping Specific Server Ports (8000 & 5173)
echo ========================================================
echo.

:: 1. Stop Backend (Port 8000)
echo [1/2] Checking Port 8000 (Backend)...
set found_backend=0
for /f "tokens=5" %%a in ('netstat -aon ^| find ":8000" ^| find "LISTENING"') do (
    echo    - Killing PID %%a listening on port 8000...
    taskkill /F /PID %%a >nul 2>&1
    set found_backend=1
)
if "!found_backend!"=="0" (
    echo    - No process found on port 8000.
) else (
    echo    - Backend stopped.
)

:: 2. Stop Frontend (Port 5173)
echo.
echo [2/2] Checking Port 5173 (Frontend)...
set found_frontend=0
for /f "tokens=5" %%a in ('netstat -aon ^| find ":5173" ^| find "LISTENING"') do (
    echo    - Killing PID %%a listening on port 5173...
    taskkill /F /PID %%a >nul 2>&1
    set found_frontend=1
)
if "!found_frontend!"=="0" (
    echo    - No process found on port 5173.
) else (
    echo    - Frontend stopped.
)

echo.
echo ========================================================
echo   Servers stopped.
echo ========================================================
pause
