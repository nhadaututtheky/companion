@echo off
title Companion Dev
echo.
echo  ===================================
echo   Companion Dev Servers
echo   Server: http://localhost:3579
echo   Web:    http://localhost:3580
echo  ===================================
echo.

:: Kill any existing instances on these ports
for /f "tokens=5" %%a in ('netstat -aon ^| findstr ":3579 " 2^>nul') do taskkill /F /PID %%a 2>/dev/null
for /f "tokens=5" %%a in ('netstat -aon ^| findstr ":3580 " 2^>nul') do taskkill /F /PID %%a 2>/dev/null

echo Starting server (port 3579)...
start "Companion Server" cmd /k "cd /d %~dp0 && set NODE_ENV=development&& set COMPANION_DEV=1&& bun run --hot packages/server/src/index.ts"

timeout /t 2 /nobreak >/dev/null

echo Starting web (port 3580)...
start "Companion Web" cmd /k "cd /d %~dp0 && bun run dev:web"

timeout /t 4 /nobreak >/dev/null

echo Opening browser...
start http://localhost:3580

echo.
echo Both servers started. Close this window to stop monitoring.
echo Press Ctrl+C to exit.
pause >/dev/null
