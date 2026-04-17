@echo off
echo ==========================================
echo   PLI Portal - Seed + Restart Script
echo ==========================================

echo.
echo [1/4] Killing existing Node processes...
taskkill /F /IM node.exe >nul 2>&1
timeout /t 2 /nobreak >nul

echo [2/4] Running seed script...
cd /d "C:\Users\mobilise\Desktop\Development Projects\PLI_Portal\backend"
call npm run seed
if %errorlevel% neq 0 (
    echo SEED FAILED! Fix errors and try again.
    pause
    exit /b 1
)

echo.
echo [3/4] Starting Backend (port 5100)...
start "PLI-Backend" cmd /k "title PLI Backend && npm run dev"

echo [4/4] Starting Frontend (port 5173)...
cd /d "C:\Users\mobilise\Desktop\Development Projects\PLI_Portal\frontend"
start "PLI-Frontend" cmd /k "title PLI Frontend && npm run dev"

echo.
echo ==========================================
echo   Seed complete, both servers starting!
echo   Backend:  http://localhost:5100
echo   Frontend: http://localhost:5173
echo ==========================================
pause
