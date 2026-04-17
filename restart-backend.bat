@echo off
echo Killing existing Node processes...
taskkill /F /IM node.exe >nul 2>&1
timeout /t 2 /nobreak >nul
echo Starting Backend (port 5100)...
cd /d "C:\Users\mobilise\Desktop\Development Projects\PLI_Portal\backend"
start "PLI-Backend" cmd /k "title PLI Backend && npm run dev"
echo Starting Frontend (port 5173)...
cd /d "C:\Users\mobilise\Desktop\Development Projects\PLI_Portal\frontend"
start "PLI-Frontend" cmd /k "title PLI Frontend && npm run dev"
echo Done! Both servers starting.
