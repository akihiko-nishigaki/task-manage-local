@echo off
rem Use UTF-8 so the Japanese messages printed by the .ps1 are not garbled.
chcp 65001 >nul
rem Stops the running app (the server started from the shortcut).
rem Keep this file ASCII-only: Japanese here would be garbled by the cmd code page.
rem Messages are printed by stop.ps1. Always pause so they stay on screen.
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0stop.ps1" %*
set "RC=%ERRORLEVEL%"
echo.
pause
exit /b %RC%
