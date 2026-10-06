@echo off
rem Use UTF-8 so the Japanese messages printed by the .ps1 are not garbled.
chcp 65001 >nul
rem Sets this PC up as the shared server: LAN binding + auto start + firewall rule.
rem Run as administrator if possible (needed to start before sign-in and to open the firewall).
rem Keep this file ASCII-only: Japanese here would be garbled by the cmd code page.
if not exist "%~dp0install-server.ps1" goto :notextracted
if not exist "%~dp0program.zip" goto :notextracted
goto :run

:notextracted
echo install-server.ps1 or program.zip was not found next to this file.
echo Extract the whole zip first ^(right-click the zip - Extract All^),
echo then run install-server.bat in the extracted folder.
echo.
pause
exit /b 1

:run
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0install-server.ps1" %*
set "RC=%ERRORLEVEL%"
echo.
pause
exit /b %RC%
