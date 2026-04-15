# ============================================================
# AdSync Backend — Production Dockerfile (multi-stage)
# Stage 1: Compile TypeScript (needs devDeps)
# Stage 2: Lean runtime with Playwright/Chromium
# ============================================================

# --- Stage 1: Build ---
FROM node:20-slim AS builder

WORKDIR /app

COPY package*.json ./
# Install ALL deps (including TypeScript devDeps for build)
RUN npm ci

COPY . .
RUN npm run build

# --- Stage 2: Runtime ---
FROM node:20-slim AS runner

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
    libx11-xcb1 \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Install only production deps
COPY package*.json ./
RUN npm ci --omit=dev

# Install Playwright Chromium browser
RUN npx playwright install chromium

# Copy compiled output from builder
COPY --from=builder /app/dist ./dist

ENV NODE_ENV=production
ENV PORT=3001

EXPOSE 3001

CMD ["node", "dist/server.js"]
