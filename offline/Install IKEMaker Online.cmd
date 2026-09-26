@echo off
setlocal
title IKEMaker - Online Bootstrap
set "HERE=%~dp0"
set "INSTALL_LUA=N"
if exist "%HERE%Lua-Language-Server.vsix" set /p "INSTALL_LUA=Optional Lua Language Server is included. Install it too? [y/N]: "
if /I "%INSTALL_LUA%"=="Y" (
  powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%HERE%Install-IKEMaker-Online.ps1" -InstallLuaLanguageServer
) else (
  powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%HERE%Install-IKEMaker-Online.ps1"
)
set "RESULT=%ERRORLEVEL%"
echo.
if "%RESULT%"=="0" (
  echo IKEMaker installation is complete.
) else if "%RESULT%"=="4" (
  echo IKEMaker installed, but the selected optional Lua companion setup is incomplete.
  echo Follow the recovery instructions shown above.
) else (
  echo IKEMaker installation stopped with error %RESULT%.
)
echo.
pause
exit /b %RESULT%
