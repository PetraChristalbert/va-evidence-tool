FROM mcr.microsoft.com/playwright:v1.44.0-jammy

WORKDIR /app

# Copy package.json and install dependencies
COPY package*.json ./
RUN npm install

# Install Playwright browsers (already in the image, but good to be sure)
RUN npx playwright install chromium

COPY . .

# Run the Node.js worker
CMD ["node", "worker.js"]
