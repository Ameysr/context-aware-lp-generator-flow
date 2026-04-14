# ============================================================
# AdSync Backend — Production Dockerfile
# Node 20 + Playwright Chromium for headless scraping
# ============================================================
FROM node:20-slim AS base

# Install Playwright system dependencies (Chromium)
RUN apt-get update && apt-get install -y --no-install-recommends \
    wget \
    ca-certificates \
    fonts-liberation \
    libnss3 \
    libatk-bridge2.0-0 \
    libdrm2 \
    libxcomposite1 \
    libxdamage1 \
    libxrandr2 \
    libgbm1 \
    libasound2 \
    libpango-1.0-0 \
    libcairo2 \
    libcups2 \
    libxss1 \
    libgtk-3-0 \
    libx11-xcb1 \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# ---------- Dependencies ----------
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

# Install Playwright Chromium browser
RUN npx playwright install chromium

# ---------- Source ----------
COPY . .

# ---------- Build ----------
RUN npm run build

# ---------- Runtime ----------
ENV NODE_ENV=production
ENV PORT=3001

EXPOSE 3001

CMD ["node", "dist/server.js"]
