# ============================================================
# AdSync Backend — Production Dockerfile (multi-stage)
# Stage 1: Compile TypeScript (needs devDeps)
# Stage 2: Lean runtime (Node only — no Chromium needed)
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

# Only wget needed for healthcheck (no Chromium/Playwright deps)
RUN apt-get update && apt-get install -y --no-install-recommends \
    wget \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Install only production deps
COPY package*.json ./
RUN npm ci --omit=dev

# Copy compiled output from builder
COPY --from=builder /app/dist ./dist

ENV NODE_ENV=production
ENV PORT=3001

EXPOSE 3001

CMD ["node", "dist/server.js"]
