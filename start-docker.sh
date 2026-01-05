#!/bin/bash
# Quick start script for NearMe Docker setup on Linux/Mac

echo ""
echo "========================================"
echo "  NearMe Docker Quick Start"
echo "========================================"
echo ""

# Check if Docker is installed
if ! command -v docker &> /dev/null; then
    echo "[ERROR] Docker is not installed!"
    echo "Please install Docker from: https://www.docker.com/products/docker-desktop"
    exit 1
fi

echo "[OK] Docker found"
echo ""

# Check if .env file exists
if [ ! -f .env ]; then
    echo "[INFO] Creating .env file from .env.example"
    cp .env.example .env
    echo "[WARNING] Please edit .env file with your actual configuration values!"
    echo ""
    read -p "Press enter to continue..."
fi

echo "[INFO] Starting Docker containers..."
echo "This may take a few minutes on first run..."
echo ""

docker-compose up --build

