#!/usr/bin/env bash
# One-command local dev: install deps, seed sample data, launch the app.
set -euo pipefail
cd "$(dirname "$0")/.."

python3 -m venv .venv
# shellcheck disable=SC1091
source .venv/bin/activate
pip install -q -r requirements.txt

cp -n .env.example .env || true

cd backend
python -m app.seed
echo ""
echo "▶ Open http://localhost:8000  (login: admin@city-general.demo / demo1234)"
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
