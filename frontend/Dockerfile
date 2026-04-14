# ============================================================
# AdSync Frontend — Multi-stage Dockerfile
# Stage 1: Build the Vite app
# Stage 2: Serve with Nginx
# ============================================================
FROM node:20-slim AS build

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .

# Build production bundle — API calls are proxied via Nginx
RUN npm run build

# ---------- Production stage ----------
FROM nginx:alpine

# Copy custom nginx config for SPA routing + API proxy
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Copy built assets from build stage
COPY --from=build /app/dist /usr/share/nginx/html

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
