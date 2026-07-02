# Multi-stage build: compile the Next.js UI, then serve it + the API from one
# Python image (single container, no Node at runtime).

# ---- stage 1: build the frontend ----
FROM node:22-slim AS web
WORKDIR /web
COPY webapp/package.json webapp/package-lock.json* ./
RUN npm install --no-audit --no-fund
COPY webapp/ ./
RUN npm run build          # -> /web/out (static export)

# ---- stage 2: backend + built UI ----
FROM python:3.11-slim
WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
    libgl1 libglib2.0-0 && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt \
    && pip install --no-cache-dir "psycopg[binary]"   # Postgres driver for compose/cloud

COPY backend ./backend
COPY --from=web /web/out ./backend/static           # main.py serves backend/static

ENV UPLOAD_DIR=/data/uploads
EXPOSE 8000
WORKDIR /app/backend

# Seed once (idempotent) then launch. PORT is honored for cloud platforms.
CMD ["sh", "-c", "python -m app.seed || true; uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8000}"]
