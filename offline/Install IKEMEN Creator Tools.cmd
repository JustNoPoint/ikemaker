@echo off
setlocal EnableDelayedExpansion
title IKEMEN Creator Tools - Offline Installer
set "HERE=%~dp0"
set "VSIX=%HERE%IKEMEN-Creator-Tools.vsix"
set "LUAVSIX=%HERE%Lua-Language-Server.vsix"
set "CODECLI="

if not exist "%VSIX%" (
  echo The installer could not find IKEMEN-Creator-Tools.vsix beside itself.
  echo Extract the entire ZIP first, then run this installer again.
  echo.
  pause
  exit /b 1
)

for %%C in (code.cmd code) do if not defined CODECLI for /f "delims=" %%P in ('where %%C 2^>nul') do if not defined CODECLI set "CODECLI=%%P"
if not defined CODECLI if exist "%LOCALAPPDATA%\Programs\Microsoft VS Code\bin\code.cmd" set "CODECLI=%LOCALAPPDATA%\Programs\Microsoft VS Code\bin\code.cmd"
if not defined CODECLI if exist "%ProgramFiles%\Microsoft VS Code\bin\code.cmd" set "CODECLI=%ProgramFiles%\Microsoft VS Code\bin\code.cmd"
if not defined CODECLI if exist "%ProgramFiles(x86)%\Microsoft VS Code\bin\code.cmd" set "CODECLI=%ProgramFiles(x86)%\Microsoft VS Code\bin\code.cmd"

if not defined CODECLI (
  echo Visual Studio Code was not found.
  echo Install Visual Studio Code, then run this installer again.
  echo No internet is needed after VS Code is installed.
  echo.
  pause
  exit /b 2
)

echo Installing IKEMEN Creator Tools...
call "%CODECLI%" --install-extension "%VSIX%" --force
if errorlevel 1 (
  echo.
  echo Installation failed. You can also install the VSIX from VS Code:
  echo Extensions ^> ... ^> Install from VSIX...
  echo.
  pause
  exit /b 3
)

echo.
if exist "%LUAVSIX%" (
  set "INSTALL_LUA=N"
  set /p "INSTALL_LUA=Optional Lua Language Server is included. Install it too? [y/N]: "
  if /I "!INSTALL_LUA!"=="Y" (
    echo Installing the optional Lua Language Server...
    call "%CODECLI%" --install-extension "%LUAVSIX%" --force
    set "LUA_EXIT=!ERRORLEVEL!"
    if not "!LUA_EXIT!"=="0" goto :luaFailed
    echo Optional Lua Language Server installed.
  ) else (
    echo Optional Lua Language Server skipped. IKEMaker's built-in Lua help remains available.
  )
)

echo Installation complete.
echo SprMaker2 and SndMaker are included and will be found automatically.
if not exist "%LUAVSIX%" echo This package does not contain or install the optional Lua Language Server.
echo Restart Visual Studio Code if it is already open.
echo.
pause
exit /b 0

:luaFailed
echo.
echo IKEMaker installed, but the selected optional Lua companion failed.
echo In VS Code choose Extensions ^> ... ^> Install from VSIX... and select Lua-Language-Server.vsix to retry.
echo.
pause
exit /b 4
