@echo off
REM Quick start script for NearMe Docker setup on Windows

echo.
echo ========================================
echo   NearMe Docker Quick Start
echo ========================================
echo.

REM Check if Docker is installed
docker --version >nul 2>&1
if %errorlevel% neq 0 (
    echo [ERROR] Docker is not installed!
    echo Please install Docker Desktop from: https://www.docker.com/products/docker-desktop
    pause
    exit /b 1
)

echo [OK] Docker found
echo.

REM Check if .env file exists
if not exist .env (
    echo [INFO] Creating .env file from .env.example
    copy .env.example .env
    echo [WARNING] Please edit .env file with your actual configuration values!
    echo.
    pause
)

echo [INFO] Starting Docker containers...
echo This may take a few minutes on first run...
echo.

docker-compose up --build

pause
