# ── Stage 1: Build Frontend ──
FROM node:20-alpine AS frontend-build
WORKDIR /app/frontend
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci
COPY frontend/ .
COPY .env.example /app/.env.production
ARG BUILD_VITE_API_URL=""
ARG BUILD_VITE_SUPABASE_URL=""
ARG BUILD_VITE_SUPABASE_ANON_KEY=""
RUN set -e; \
    if [ -n "$BUILD_VITE_API_URL" ] || [ -n "$BUILD_VITE_SUPABASE_URL" ] || [ -n "$BUILD_VITE_SUPABASE_ANON_KEY" ]; then \
      printf 'VITE_API_URL=%s\nVITE_SUPABASE_URL=%s\nVITE_SUPABASE_ANON_KEY=%s\n' "$BUILD_VITE_API_URL" "$BUILD_VITE_SUPABASE_URL" "$BUILD_VITE_SUPABASE_ANON_KEY" > /app/.env.production.local; \
    fi; \
    npm run build

# ── Stage 2: Production ──
FROM python:3.11-slim
WORKDIR /app

# System dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    nginx supervisor curl \
    && rm -rf /var/lib/apt/lists/*

# Python dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Backend source
COPY main.py pipeline.py pkps_sync.py ./
COPY .env.example .env.example

# Frontend build output
COPY --from=frontend-build /app/frontend/dist /var/www/frontend

# Runtime directories
RUN mkdir -p /app/storage/thumbnails /app/cache

# Nginx config
COPY docker/nginx.conf /etc/nginx/sites-available/default

# Supervisor config (manages nginx + uvicorn)
COPY docker/supervisord.conf /etc/supervisor/conf.d/app.conf

EXPOSE 80

# Health check
HEALTHCHECK --interval=30s --timeout=10s --retries=3 \
    CMD curl -f http://localhost:8000/api/analysis/history/kps/export/json || exit 1

CMD ["supervisord", "-n", "-c", "/etc/supervisor/conf.d/app.conf"]
