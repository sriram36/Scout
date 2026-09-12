FROM mcr.microsoft.com/playwright:v1.50.0-noble

WORKDIR /app

# Copy dependency manifests
COPY package*.json ./

# Install production dependencies
RUN npm ci --omit=dev || npm install --omit=dev

# Copy application files
COPY . .

# Environment settings
ENV PORT=3001
ENV HEADLESS=true
ENV NODE_ENV=production

EXPOSE 3001

CMD ["node", "server.js"]
