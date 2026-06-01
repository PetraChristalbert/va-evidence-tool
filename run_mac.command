#!/bin/bash

echo "========================================================"
echo "       VA MEDICAL EVIDENCE PROCESSING PLATFORM"
echo "========================================================"
echo ""

# Check for Node.js
if ! command -v node &> /dev/null
then
    echo "[ERROR] Node.js is not installed!"
    echo "Opening your web browser so you can download it..."
    echo ""
    
    # Automatically open the browser to the Node.js download page
    if command -v open &> /dev/null; then 
        open https://nodejs.org/dist/v24.16.0/node-v24.16.0.pkg
    elif command -v xdg-open &> /dev/null; then 
        xdg-open https://nodejs.org/dist/v24.16.0/node-v24.16.0.pkg &> /dev/null &
    fi

    read -p "Press Enter to exit. After installing Node.js, run this script again!"
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
