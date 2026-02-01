@echo off
setlocal
:: Berpindah ke direktori tempat file bat ini berada
cd /d "%~dp0"

title GealGeolGeo Launcher

echo ========================================================
echo   Starting GealGeolGeo Local Development Environment
echo ========================================================
echo Lokasi Proyek: %CD%
echo.

:: 1. Verifikasi Backend (.venv)
if not exist ".venv\Scripts\python.exe" (
    echo [ERROR] Virtual environment tidak ditemukan!
    echo Harap jalankan install_dependencies.bat terlebih dahulu.
    echo.
    pause
    exit /b 1
)

:: 2. Verifikasi Frontend
set FRONTEND_DIR=%~dp0frontend
if not exist "%FRONTEND_DIR%\package.json" (
    echo [ERROR] Folder frontend atau package.json tidak ditemukan di: %FRONTEND_DIR%
    echo Harap pastikan folder 'frontend' ada di direktori project.
    echo.
    pause
    exit /b 1
)

echo [OK] Lingkungan Backend dan Frontend terdeteksi.
echo.

:: 3. Jalankan Backend
echo [1/2] Menjalankan Backend Server (Port 8000)...
start "Backend" cmd /k "chcp 65001 >nul && .\.venv\Scripts\python.exe -m uvicorn main:app --reload --port 8000 --host 0.0.0.0"

:: 4. Jalankan Frontend
echo [2/2] Menjalankan Frontend Server (Vite Port 5173)...
cd /d "%FRONTEND_DIR%"
start "Frontend" cmd /k "npm run dev"

:: Kembali ke root
cd /d "%~dp0"

echo.
echo ========================================================
echo   Berhasil! Server sedang diluncurkan di jendela baru.
echo.
echo   - Backend API:  http://localhost:8000
echo   - Frontend UI:  http://localhost:5173
echo   - Dokumentasi:  http://localhost:8000/docs
echo.
echo   Gunakan stop_app.bat untuk mematikan kedua server.
echo ========================================================
echo Window ini akan menutup otomatis dalam 10 detik...
timeout /t 10
