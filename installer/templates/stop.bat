@echo off
chcp 65001 >nul
setlocal EnableDelayedExpansion
title タスク管理 の終了

set "PIDFILE=%LOCALAPPDATA%\Programs\TaskManage\app.pid"

if not exist "%PIDFILE%" (
  echo タスク管理は起動していません。
  echo.
  pause
  exit /b 0
)

set /p APPPID=<"%PIDFILE%"
taskkill /PID !APPPID! /T /F >nul 2>nul
del "%PIDFILE%" >nul 2>nul

echo タスク管理を終了しました。
echo.
pause
exit /b 0
