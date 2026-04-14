@echo off
setlocal
set ROOT=%~dp0..
pushd "%ROOT%"
node scripts/dev-server.mjs cleanup
set EXITCODE=%ERRORLEVEL%
popd
exit /b %EXITCODE%
