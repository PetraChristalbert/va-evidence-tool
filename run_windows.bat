@echo off
title VA Evidence Packet Builder
color 0B

echo ========================================================
echo        VA MEDICAL EVIDENCE PROCESSING PLATFORM
echo ========================================================
echo.
echo Checking if Node.js is installed...
node -v >nul 2>&1
IF %ERRORLEVEL% NEQ 0 (
    color 0C
    echo [ERROR] Node.js is not installed! 
    echo Please download it from https://nodejs.org/ and try again.
    echo.
    pause
    exit
)

echo.
echo Installing dependencies (this may take a minute the first time)...
call npm install --silent

echo.
echo Booting up the platform...
echo DO NOT CLOSE THIS WINDOW while using the app!
echo.

start http://localhost:5000
npm start
