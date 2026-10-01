@echo off
chcp 65001 >nul
setlocal EnableDelayedExpansion
title タスク管理 のアンインストール

set "INSTALL_DIR=%LOCALAPPDATA%\Programs\TaskManage"
set "DATA_ROOT=%LOCALAPPDATA%\task-manage-local"
set "DATA_DIR=%DATA_ROOT%\data"

echo.
echo ==========================================
echo    タスク管理 のアンインストール
echo ==========================================
echo.
echo アプリ本体 : %INSTALL_DIR%
echo データ     : %DATA_DIR%
echo.

set "OK="
set /p OK="アンインストールします。よろしいですか？ (y/N) "
if /i not "!OK!"=="y" (
  echo 中止しました。
  pause
  exit /b 0
)
echo.

REM ---- 起動中なら停止する ----
if exist "%INSTALL_DIR%\app.pid" (
  set /p OLDPID=<"%INSTALL_DIR%\app.pid"
  taskkill /PID !OLDPID! /T /F >nul 2>nul
  del "%INSTALL_DIR%\app.pid" >nul 2>nul
)

echo ショートカットを削除しています...
if exist "%INSTALL_DIR%\setup.ps1" (
  powershell -NoProfile -ExecutionPolicy Bypass -File "%INSTALL_DIR%\setup.ps1" -Mode uninstall -InstallDir "%INSTALL_DIR%"
)

echo.
set "DELDATA="
set /p DELDATA="タスクのデータも削除しますか？ 残す場合は N を選んでください。 (y/N) "
if /i "!DELDATA!"=="y" (
  echo データを削除しています...
  rmdir /s /q "%DATA_ROOT%" >nul 2>nul
) else (
  echo データは %DATA_DIR% に残します。
)

echo アプリ本体を削除しています...
REM 実行中の uninstall.bat 自身を消すため、終了後に削除する
start "" /b cmd /c "timeout /t 2 >nul & rmdir /s /q ""%INSTALL_DIR%"""

echo.
echo アンインストールしました。
echo.
pause
exit /b 0
