@echo off
setlocal
title IKEMaker - Online Bootstrap
set "HERE=%~dp0"
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%HERE%Install-IKEMaker-Online.ps1"
set "RESULT=%ERRORLEVEL%"
echo.
if "%RESULT%"=="0" (
  echo IKEMaker and companion installation is complete.
) else if "%RESULT%"=="4" (
  echo IKEMaker installed, but Lua companion setup is incomplete.
  echo Follow the recovery instructions shown above.
) else (
  echo IKEMaker installation stopped with error %RESULT%.
)
echo.
pause
exit /b %RESULT%
