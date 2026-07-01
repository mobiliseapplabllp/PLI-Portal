@echo off
REM One-command local dev on Windows: venv + deps + sample data + server.
cd /d "%~dp0"

python -m venv .venv
call .venv\Scripts\activate.bat
pip install -r requirements.txt
if not exist .env copy .env.example .env

cd backend
python -m app.generate_samples
python -m app.seed
python -m app.export_reports
echo.
echo Open http://localhost:8000  (login: admin@city-general.demo / demo1234)
uvicorn app.main:app --host 0.0.0.0 --port 8000
