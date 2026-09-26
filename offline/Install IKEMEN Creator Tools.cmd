@echo off
setlocal
title IKEMEN Creator Tools - Offline Installer
set "HERE=%~dp0"
set "VSIX=%HERE%IKEMEN-Creator-Tools.vsix"
set "LUAVSIX=%HERE%Lua-Language-Server.vsix"
set "CODECLI="
set "LUA_RESULT=0"

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

if exist "%LUAVSIX%" (
  echo Installing the recommended Lua Language Server...
  call "%CODECLI%" --install-extension "%LUAVSIX%" --force
  if errorlevel 1 set "LUA_RESULT=1"
  echo.
) else (
  set "LUA_RESULT=2"
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
if not "%LUA_RESULT%"=="0" (
  echo IKEMaker installed, but companion setup is incomplete.
  if "%LUA_RESULT%"=="1" echo The Lua Language Server installer returned an error.
  if "%LUA_RESULT%"=="2" echo Lua-Language-Server.vsix was missing from the extracted package.
  echo Re-extract or download the complete tester ZIP, then in VS Code choose:
  echo Extensions ^> ... ^> Install from VSIX... ^> Lua-Language-Server.vsix
  echo Restart Visual Studio Code afterward.
  echo.
  pause
  exit /b 4
)

echo Installation complete.
echo SprMaker2 and SndMaker are included and will be found automatically.
echo Lua Language Server is included as the recommended general Lua editor.
echo Restart Visual Studio Code if it is already open.
echo.
pause
exit /b 0
