@echo off
chcp 65001 >nul
echo ====================================
echo BARMAN STORE - Starting Application
echo ====================================
echo.

REM Check if Node.js is installed
node --version >nul 2>&1
if %errorlevel% neq 0 (
    echo [ERROR] Node.js is not installed. Please install Node.js first.
    echo Visit: https://nodejs.org/
    pause
    exit /b 1
)

echo [OK] Node.js is installed

REM Install dependencies if node_modules doesn't exist
if not exist node_modules (
    echo.
    echo Installing dependencies...
    npm install
    if %errorlevel% neq 0 (
        echo [ERROR] Failed to install dependencies
        pause
        exit /b 1
    )
    echo [OK] Dependencies installed successfully
) else (
    echo [OK] Dependencies already installed
)

echo.
echo Starting backend server...
start "Barman Store - Server" cmd /c "node server/index.js"

REM Wait for the server to start
timeout /t 3 /nobreak >nul

echo.
echo Starting frontend development server...
echo.
echo ====================================
echo Application is running!
echo Frontend: http://localhost:3000
echo Backend:  http://localhost:5000
echo ====================================
echo.
echo Admin Login: admin@admin.com / admin123
echo.

REM Open browser automatically
timeout /t 2 /nobreak >nul
start http://localhost:3000

echo.
echo Both servers are starting...
echo Keep this window open while using the app.
echo.

REM Run the frontend dev server
npm run dev
