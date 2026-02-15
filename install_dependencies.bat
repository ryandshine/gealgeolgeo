@echo off
setlocal enabledelayedexpansion
cd /d "%~dp0"
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
    echo         Please install Python 3.9 or newer and add it to PATH.
    echo         Download: https://www.python.org/downloads/
    pause
    exit /b 1
)
python --version

:: Check Node.js
node --version >nul 2>&1
if %errorlevel% neq 0 (
    echo [ERROR] Node.js is not found in PATH!
    echo         Please install Node.js LTS version.
    echo         Download: https://nodejs.org/
    pause
    exit /b 1
)
node --version

:: 2. Setup Python Environment
echo.
echo [2/5] Setting up Python Backend...

:: Check if .venv exists
if not exist ".venv" goto :CreateVenv

:: Check if .venv is valid
echo        Memeriksa validitas Virtual Environment...
set "venv_ok=1"

:: Check python.exe inside .venv
if not exist ".venv\Scripts\python.exe" set "venv_ok=0"

:: If valid, check if it runs
if "%venv_ok%"=="1" (
    ".venv\Scripts\python.exe" --version >nul 2>&1
    if !errorlevel! neq 0 set "venv_ok=0"
)

if "%venv_ok%"=="0" goto :FixVenv
echo        Virtual environment valid.
goto :ActivateVenv

:FixVenv
echo [WARNING] .venv terdeteksi rusak atau berasal dari PC lain.
echo           Resetting .venv...
rmdir /s /q .venv >nul 2>&1
goto :CreateVenv

:CreateVenv
echo        Creating virtual environment...
python -m venv .venv
if %errorlevel% neq 0 (
    echo [ERROR] Failed to create virtual environment.
    pause
    exit /b 1
)

:ActivateVenv
echo        Activating virtual environment...
rem No need to actully call activate.bat for just installing, but good for check path
if not exist ".venv\Scripts\python.exe" (
    echo [ERROR] Virtual environment python not found after creation!
    pause
    exit /b 1
)

echo        Installing Python dependencies...
".venv\Scripts\python.exe" -m ensurepip --default-pip
".venv\Scripts\python.exe" -m pip install --upgrade pip
".venv\Scripts\python.exe" -m pip install -r requirements.txt

if %errorlevel% neq 0 (
    echo [ERROR] Failed to install Python dependencies.
    pause
    exit /b 1
)

:: 3. Setup Frontend Environment
echo.
echo [3/5] Setting up Frontend...
if not exist "frontend" (
    echo [WARNING] 'frontend' directory not found! Skipping frontend setup.
    goto :ConfigSetup
)

cd frontend
echo        Installing Node.js dependencies...
call npm install
if %errorlevel% neq 0 (
    echo [ERROR] Failed to install Frontend dependencies.
    cd ..
    pause
    exit /b 1
)
cd ..

:ConfigSetup
:: 4. Configuration Setup
echo.
echo [4/5] Checking Configuration...
if not exist ".env" (
    if exist ".env.example" (
        echo        Creating .env from .env.example...
        copy .env.example .env >nul
        echo        [IMPORTANT] please check .env file!
    ) else (
        echo        [WARNING] .env.example not found.
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
echo   1. To start the app, run: start_app_laptop.bat
echo   2. Authenticate EE if needed: earthengine authenticate
echo.
pause
