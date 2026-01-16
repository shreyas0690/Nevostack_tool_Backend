@echo off
echo 🚀 Starting NevoStack HRMS Backend...

REM Check if .env file exists
if not exist .env (
    echo ⚠️  .env file not found, creating from .env.example...
    copy .env.example .env
    echo ✅ Please configure your .env file before starting the server
    pause
    exit /b 1
)

REM Install dependencies if node_modules doesn't exist
if not exist node_modules (
    echo 📦 Installing dependencies...
    npm install
)

REM Start the server
echo 🎯 Starting server in development mode...
npm run dev

pause
