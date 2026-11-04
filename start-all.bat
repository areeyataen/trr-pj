@echo off
title Start Cane Purchasing System
echo ==========================================
echo    Starting .NET Core Backend & Next.js
echo ==========================================

start "Cane Backend (.NET)" cmd /k "cd /d C:\cane-api && dotnet run"
start "Cane Frontend (Next.js)" cmd /k "cd /d C:\cane-web && npm.cmd run dev"

echo.
echo Started successfully!
echo Backend:  http://localhost:5193
echo Frontend: http://localhost:3000
echo ==========================================
pause
