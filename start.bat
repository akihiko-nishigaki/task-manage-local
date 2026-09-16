@echo off
chcp 65001 >nul
REM Windows: このファイルをダブルクリックするとタスク管理ツールが起動します。
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo.
  echo Node.js がインストールされていません。
  echo https://nodejs.org/ja から LTS 版をインストールしてください。
  echo.
  pause
  exit /b 1
)
node scripts/start.mjs
pause
