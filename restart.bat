@echo off
echo ==========================================
echo   PLI Portal - Restart Script
echo ==========================================

echo.
echo [1/3] Killing existing Node processes...
taskkill /F /IM node.exe >nul 2>&1
timeout /t 2 /nobreak >nul

echo [2/3] Starting Backend (port 5000)...
cd /d "C:\Users\mobilise\Desktop\Development Projects\PLI_Portal\backend"
start "PLI-Backend" cmd /k "title PLI Backend && npm run dev"

echo [3/3] Starting Frontend (port 5173)...
cd /d "C:\Users\mobilise\Desktop\Development Projects\PLI_Portal\frontend"
start "PLI-Frontend" cmd /k "title PLI Frontend && npm run dev"

echo.
echo ==========================================
echo   Both servers starting in new windows!
echo   Backend:  http://localhost:5000
echo   Frontend: http://localhost:5173
echo ==========================================
pause
