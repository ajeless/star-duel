@echo off
setlocal
cd /d "%~dp0\.."
node scripts\dev-server.mjs start
