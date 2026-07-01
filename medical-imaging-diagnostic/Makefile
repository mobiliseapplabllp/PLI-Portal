# Convenience targets for local development.
# Usage: make setup && make demo   (then open http://localhost:8000)

PY ?= python3
VENV = .venv
BIN = $(VENV)/bin

.PHONY: help setup samples seed reports run demo test real docker clean

help:
	@echo "make setup    - create venv + install core deps"
	@echo "make samples  - generate sample images into sample_data/images"
	@echo "make seed     - create database with sample patients + run AI pipeline"
	@echo "make reports  - export sample reports into sample_data/reports"
	@echo "make run      - start the app (http://localhost:8000)"
	@echo "make demo     - setup + samples + seed + reports + run (one command)"
	@echo "make test     - run pytest smoke tests"
	@echo "make real     - install torch + torchxrayvision (real chest X-ray model)"
	@echo "make docker   - build & run via docker compose (API + Postgres)"
	@echo "make clean    - remove venv, db, uploads"

setup:
	$(PY) -m venv $(VENV)
	$(BIN)/pip install -q --upgrade pip
	$(BIN)/pip install -q -r requirements.txt
	@test -f .env || cp .env.example .env

samples: setup
	cd backend && ../$(BIN)/python -m app.generate_samples

seed: setup
	cd backend && ../$(BIN)/python -m app.seed

reports: setup
	cd backend && ../$(BIN)/python -m app.export_reports

run: setup
	cd backend && ../$(BIN)/uvicorn app.main:app --reload --host 0.0.0.0 --port 8000

demo: samples seed reports
	@echo ""
	@echo "▶ Open http://localhost:8000  (login: admin@city-general.demo / demo1234)"
	cd backend && ../$(BIN)/uvicorn app.main:app --host 0.0.0.0 --port 8000

test: setup
	$(BIN)/pip install -q pytest httpx
	cd backend && ../$(BIN)/python -m pytest -q

real: setup
	$(BIN)/pip install -q torch torchvision --index-url https://download.pytorch.org/whl/cpu
	$(BIN)/pip install -q torchxrayvision
	@echo "Set AI_ENGINE_MODE=real in .env, then 'make run'."

docker:
	docker compose up --build

clean:
	rm -rf $(VENV) backend/mid.db backend/uploads mid.db uploads
