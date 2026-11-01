@echo off
cd /d "%~dp0"

:: 1. Start the Vite Dev Server
start "Vite Server" cmd /k "npm run dev"

:: 2. Start the Python Backend
start "Python Backend" cmd /k "python -m uvicorn backend.server:app --reload --port 8000"

cd ..
cd Caddy

:: 3. Start Caddy Reverse Proxy
start "Caddy Server" cmd /k "caddy run"

exit
