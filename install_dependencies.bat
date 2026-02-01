@echo off
setlocal
title GealGeolGeo Dependency Installer

echo ========================================================
echo   Setting up GealGeolGeo Environment
echo ========================================================
echo.

:: 1. Check Prerequisites
echo [1/5] Checking System Prerequisites...

:: Check Python
python --version >nul 2>&1
if %errorlevel% neq 0 (
    echo [ERROR] Python is defined or not found in PATH!
    echo         Please install Python (3.9+) and add it to PATH.
    echo         Download: https://www.python.org/downloads/
    pause
    exit /b 1
)
python --version

:: Check Node.js
node --version >nul 2>&1
if %errorlevel% neq 0 (
    echo [ERROR] Node.js is not found in PATH!
    echo         Please install Node.js (LTS version).
    echo         Download: https://nodejs.org/
    pause
    exit /b 1
)
node --version

:: 2. Setup Python Environment
echo.
echo [2/5] Setting up Python Backend...

:: Check/Create Virtual Env
if not exist ".venv" (
    echo        Creating virtual environment...
    python -m venv .venv
) else (
    echo        Virtual environment found.
)

:: Activate and Install
echo        Activating virtual environment...
call .venv\Scripts\activate.bat

echo        Installing Python dependencies from requirements.txt...
python -m pip install --upgrade pip
pip install -r requirements.txt

if %errorlevel% neq 0 (
    echo [ERROR] Failed to install Python dependencies.
    pause
    exit /b 1
)

:: 3. Setup Frontend Environment
echo.
echo [3/5] Setting up Frontend...
cd frontend

echo        Installing Node.js dependencies (npm install)...
call npm install

if %errorlevel% neq 0 (
    echo [ERROR] Failed to install Frontend dependencies.
    cd ..
    pause
    exit /b 1
)

cd ..


:: 4. Configuration Setup
echo.
echo [4/5] Checking Configuration...
if not exist ".env" (
    if exist ".env.example" (
        echo        Creating .env from .env.example...
        copy .env.example .env
        echo        [IMPORTANT] Please update .env with your specific keys!
    ) else (
        echo        [WARNING] .env.example not found. You may need to create .env manually.
    )
) else (
    echo        .env configuration file already exists.
)

:: 5. Finalizing
echo.
echo ========================================================
echo   Installation Complete!
echo ========================================================
echo.
echo [INFO] Usage Instructions:
echo   1. To start the app, run: start_app.bat
echo   2. If using Earth Engine, make sure to authenticate:
echo      earthengine authenticate
echo   3. CHECK YOUR .env FILE! Make sure API keys are correct.
echo.
pause
