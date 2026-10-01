@echo off
rem Installer: copies this app to the local PC and creates desktop / Start Menu shortcuts.
rem Usage: double-click. (Options are in install.ps1: -Dest, -NoShortcut, -NoStartMenu, -Startup, -NoLaunch)
rem Keep this file ASCII-only: Japanese here would be garbled by the cmd code page.
rem Messages are printed by install.ps1. Always pause so they stay on screen.
if not exist "%~dp0install.ps1" (
  echo install.ps1 was not found next to this file.
  echo Extract the whole zip first ^(right-click the zip - Extract All^),
  echo then run install.bat in the extracted folder.
  echo.
  pause
  exit /b 1
)
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0install.ps1" %*
set "RC=%ERRORLEVEL%"
echo.
pause
exit /b %RC%
