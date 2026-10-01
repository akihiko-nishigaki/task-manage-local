@echo off
chcp 65001 >nul
setlocal EnableDelayedExpansion
title タスク管理 セットアップ

echo.
echo ==========================================
echo    タスク管理 セットアップ
echo    社内タスク管理ツール（ローカル完結版）
echo ==========================================
echo.

REM ---- Node.js の確認 ----
where node >nul 2>nul
if errorlevel 1 (
  echo [エラー] Node.js が見つかりません。
  echo.
  echo   https://nodejs.org/ja を開いて LTS 版をインストールしたあと、
  echo   もう一度このファイルを実行してください。
  echo.
  pause
  exit /b 1
)

for /f "delims=" %%v in ('node -v') do set "NODEVER=%%v"
set "NV=!NODEVER:v=!"
for /f "tokens=1,2 delims=." %%a in ("!NV!") do (
  set "MAJ=%%a"
  set "MIN=%%b"
)
if !MAJ! LSS 22 goto :oldnode
if !MAJ! EQU 22 if !MIN! LSS 13 goto :oldnode
goto :nodeok

:oldnode
echo [エラー] Node.js のバージョンが古すぎます（現在 !NODEVER!）。
echo         22.13 以上が必要です。https://nodejs.org/ja から LTS 版を入れ直してください。
echo.
pause
exit /b 1

:nodeok
echo Node.js !NODEVER! を確認しました。
echo.

set "INSTALL_DIR=%LOCALAPPDATA%\Programs\TaskManage"
set "DATA_DIR=%LOCALAPPDATA%\task-manage-local\data"
set "HERE=%~dp0"
set "SRCZIP=%HERE%3_program.zip"

if not exist "%SRCZIP%" (
  echo [エラー] インストール用のファイル「3_program.zip」が見つかりません。
  echo.
  echo   zip を「すべて展開」してから、展開先のフォルダにある
  echo   このファイルを実行してください。
  echo   （zip を開いたまま直接実行すると失敗します）
  echo.
  pause
  exit /b 1
)

echo インストール先 : %INSTALL_DIR%
echo データ保存先   : %DATA_DIR%
echo.
echo ※ 管理者権限は不要です。データはアンインストールしても消えません。
echo.
set "OK="
set /p OK="この内容でインストールします。よろしいですか？ (Y/n) "
if /i "!OK!"=="n" (
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

echo ファイルを展開しています...
if exist "%INSTALL_DIR%" rmdir /s /q "%INSTALL_DIR%"
mkdir "%INSTALL_DIR%" >nul 2>nul

REM まず PowerShell で展開し、だめなら Windows 標準の tar を使う。
set "UNPACKED="
powershell -NoProfile -ExecutionPolicy Bypass -Command ^
  "Expand-Archive -LiteralPath '%SRCZIP%' -DestinationPath '%INSTALL_DIR%' -Force" >nul 2>nul
if exist "%INSTALL_DIR%\server.cjs" set "UNPACKED=1"

if not defined UNPACKED (
  where tar >nul 2>nul
  if not errorlevel 1 (
    tar -xf "%SRCZIP%" -C "%INSTALL_DIR%" >nul 2>nul
    if exist "%INSTALL_DIR%\server.cjs" set "UNPACKED=1"
  )
)
if not defined UNPACKED (
  echo [エラー] ファイルの展開に失敗しました。
  echo.
  echo   お手数ですが、次の方法で手動インストールできます。
  echo     1. 「3_program.zip」を右クリックして「すべて展開」
  echo     2. 中身をすべて次のフォルダへコピー
  echo        %INSTALL_DIR%
  echo     3. そのフォルダの TaskManage.vbs をダブルクリック
  echo.
  pause
  exit /b 1
)
mkdir "%DATA_DIR%" >nul 2>nul

echo ショートカットを作成しています...
set "STARTUP_ARG="
set "AUTO="
set /p AUTO="パソコンの起動時に自動で立ち上げますか？ (y/N) "
if /i "!AUTO!"=="y" set "STARTUP_ARG=-Startup"

powershell -NoProfile -ExecutionPolicy Bypass -File "%INSTALL_DIR%\setup.ps1" -Mode install -InstallDir "%INSTALL_DIR%" !STARTUP_ARG!
if errorlevel 1 (
  echo [警告] ショートカットの作成に失敗しました。
  echo        %INSTALL_DIR%\TaskManage.vbs を直接ダブルクリックすれば起動できます。
)

echo.
echo ==========================================
echo    インストールが完了しました
echo ==========================================
echo.
echo  デスクトップの「タスク管理」から起動できます。
echo  アンインストールは「設定 ^> アプリ」または
echo  %INSTALL_DIR%\uninstall.bat から行えます。
echo.

set "RUN="
set /p RUN="今すぐ起動しますか？ (Y/n) "
if /i not "!RUN!"=="n" start "" wscript.exe "%INSTALL_DIR%\TaskManage.vbs"

echo.
pause
exit /b 0
