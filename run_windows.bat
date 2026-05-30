@echo off
title VA Evidence Packet Builder
color 0B

echo ========================================================
echo        VA MEDICAL EVIDENCE PROCESSING PLATFORM
echo ========================================================
echo.

:: Automatically download and use a portable version of Node.js if it doesn't exist
if not exist "bin\node\node.exe" (
    color 0E
    echo [First Time Setup] Downloading Portable Node.js Engine...
    echo (This may take a minute, please wait...)
    mkdir bin 2>nul
    curl -# -L -o "bin\node.zip" "https://nodejs.org/dist/v20.11.1/node-v20.11.1-win-x64.zip"
    
    echo Extracting engine...
    tar -xf "bin\node.zip" -C "bin"
    rename "bin\node-v20.11.1-win-x64" "node"
    del "bin\node.zip"
)

:: Set the system path to use our portable Node instead of looking for an installed one
set PATH=%~dp0bin\node;%PATH%

:: Check if the app dependencies exist
if not exist "node_modules" (
    color 0E
    echo [First Time Setup] Installing platform dependencies...
    
    :: Force Playwright to download Chromium inside this folder, not in the user's hidden AppData folder
    set PLAYWRIGHT_BROWSERS_PATH=0
    
    call npm install
)

color 0A
echo.
echo Booting up the platform...
echo DO NOT CLOSE THIS WINDOW while using the app!
echo.

start http://localhost:5000
npm start
