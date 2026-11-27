@echo off
cd /d "%~dp0"
set "PATH=C:\Program Files\nodejs;%PATH%"
echo Starting Personal Ledger PWA...
npm.cmd run dev -- --port 5173 --open
pause
