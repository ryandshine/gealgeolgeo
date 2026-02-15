@echo off
setlocal enabledelayedexpansion
cd /d "%~dp0"
title GealGeolGeo Launcher

echo ========================================================
echo   GealGeolGeo - Local Development Launcher
echo ========================================================
echo.

:: ---- Pre-flight Checks ----

:: Check Python
python --version >nul 2>&1
if %errorlevel% neq 0 (
    echo [ERROR] Python tidak ditemukan! Install dulu: https://www.python.org/downloads/
    pause
    exit /b 1
)

:: Check Node.js
node --version >nul 2>&1
if %errorlevel% neq 0 (
    echo [ERROR] Node.js tidak ditemukan! Install dulu: https://nodejs.org/
    pause
    exit /b 1
)

:: ---- Auto Setup: Python venv + deps ----

if not exist ".venv\Scripts\python.exe" (
    echo [SETUP] Virtual environment belum ada, membuat...
    python -m venv .venv
    if !errorlevel! neq 0 (
        echo [ERROR] Gagal membuat virtual environment.
        pause
        exit /b 1
    )
    echo [SETUP] Menginstall Python dependencies...
    ".venv\Scripts\python.exe" -m pip install --upgrade pip -q
    ".venv\Scripts\python.exe" -m pip install -r requirements.txt -q
    echo [OK] Python dependencies terinstall.
    echo.
)

:: ---- Auto Setup: Frontend npm deps ----

if not exist "frontend\node_modules" (
    echo [SETUP] node_modules belum ada, menjalankan npm install...
    cd frontend
    call npm install
    cd ..
    echo [OK] Frontend dependencies terinstall.
    echo.
)

:: ---- Kill existing processes on ports ----

echo [CHECK] Memeriksa port 8000 dan 5173...
for /f "tokens=5" %%a in ('netstat -aon 2^>nul ^| findstr /C:":8000 " ^| findstr LISTENING') do (
    echo [WARN] Port 8000 sudah terpakai ^(PID: %%a^), menghentikan...
    taskkill /F /PID %%a >nul 2>&1
)
for /f "tokens=5" %%a in ('netstat -aon 2^>nul ^| findstr /C:":5173 " ^| findstr LISTENING') do (
    echo [WARN] Port 5173 sudah terpakai ^(PID: %%a^), menghentikan...
    taskkill /F /PID %%a >nul 2>&1
)

:: ---- Start Backend ----

echo.
echo [1/2] Menjalankan Backend Server (Port 8000)...
set "APP_DIR=%~dp0"
start "GealGeolGeo Backend" cmd /k "cd /d %APP_DIR% && call .venv\Scripts\activate && python main.py"

:: Wait for backend to be ready
echo        Menunggu backend siap...
set retries=0
:wait_backend
timeout /t 2 /nobreak >nul
set /a retries+=1
if !retries! gtr 15 (
    echo [WARN] Backend belum merespon setelah 30 detik, lanjut start frontend...
    goto :start_frontend
)
curl -s -o nul http://localhost:8000/docs >nul 2>&1
if %errorlevel% neq 0 goto :wait_backend
echo        [OK] Backend sudah berjalan!

:: ---- Start Frontend ----

:start_frontend
echo.
echo [2/2] Menjalankan Frontend Server (Port 5173)...
start "GealGeolGeo Frontend" cmd /k "cd /d %APP_DIR%frontend && npm run dev"

:: Wait a moment then open browser
timeout /t 3 /nobreak >nul

echo.
echo ========================================================
echo   Aplikasi berhasil dijalankan!
echo.
echo   Backend  : http://localhost:8000
echo   Frontend : http://localhost:5173
echo   API Docs : http://localhost:8000/docs
echo.
echo   Untuk menghentikan: jalankan stop_app_laptop.bat
echo ========================================================
echo.

:: Open browser automatically
start "" http://localhost:5173

echo Tekan tombol apa saja untuk menutup jendela ini...
pause >nul
