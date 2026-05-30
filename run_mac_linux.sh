#!/bin/bash

echo "========================================================"
echo "       VA MEDICAL EVIDENCE PROCESSING PLATFORM"
echo "========================================================"
echo ""

# Check for Node.js
if ! command -v node &> /dev/null
then
    echo "[ERROR] Node.js is not installed!"
    echo "Please download it from https://nodejs.org/ and try again."
    echo ""
    read -p "Press Enter to exit..."
    exit 1
fi

echo "Installing dependencies (this may take a minute the first time)..."
npm install --silent

echo ""
echo "Booting up the platform..."
echo "DO NOT CLOSE THIS TERMINAL while using the app!"
echo ""

# Try to automatically open the browser
if command -v open &> /dev/null; then 
    open http://localhost:5000
elif command -v xdg-open &> /dev/null; then 
    xdg-open http://localhost:5000 &> /dev/null &
fi

npm start
