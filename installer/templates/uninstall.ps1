# タスク管理 アンインストーラ
# 起動中のアプリを止め、ショートカット（デスクトップ / スタートメニュー / スタートアップ）と
# 「設定 > アプリ」の登録、インストール先のアプリ一式を削除します。
# タスクのデータ（%LOCALAPPDATA%\task-manage-local）は、-RemoveData を付けたときだけ削除します。
#   -Dest        インストール先（既定: このスクリプトのあるフォルダ）
#   -ShortcutDir ショートカットの場所（既定: デスクトップ）
#   -RemoveData  タスクのデータも削除する（元に戻せません）
param(
  [string]$Dest = (Split-Path -Parent $MyInvocation.MyCommand.Path),
  [string]$ShortcutDir = [Environment]::GetFolderPath('Desktop'),
  [switch]$RemoveData
)
# 日本語が文字化けしないよう、出力の文字コードをコンソールと揃える（install.bat 側で chcp 65001 済み）
try { [Console]::OutputEncoding = New-Object Text.UTF8Encoding $false } catch { }
$ErrorActionPreference = 'Stop'
$AppName = 'タスク管理'
$RegPath = 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall\TaskManage'
$DataRoot = Join-Path $env:LOCALAPPDATA 'task-manage-local'

$stop = Join-Path $Dest 'stop.ps1'
if (Test-Path $stop) { & $stop -Dest $Dest }

$programs = Join-Path $env:APPDATA 'Microsoft\Windows\Start Menu\Programs'
foreach ($dir in @($ShortcutDir, $programs, (Join-Path $programs 'Startup'))) {
  $lnk = Join-Path $dir "$AppName.lnk"
  if (Test-Path $lnk) { Remove-Item -Force $lnk; Write-Host "  ショートカットを削除: $lnk" }
}
if (Test-Path $RegPath) { Remove-Item -Recurse -Force $RegPath; Write-Host '  「設定 > アプリ」の登録を削除しました' }

# 安全のため、アプリのファイル（server.cjs と launch.cjs）があるフォルダだけを消す
if ((Test-Path (Join-Path $Dest 'server.cjs')) -and (Test-Path (Join-Path $Dest 'launch.cjs'))) {
  # 実行中のこのスクリプト自身を含むフォルダなので、削除は別プロセスに任せる
  Write-Host "  アプリのフォルダを削除: $Dest"
  Start-Process -FilePath 'cmd.exe' -ArgumentList "/c timeout /t 2 /nobreak >nul & rmdir /s /q `"$Dest`"" -WindowStyle Hidden
} else {
  Write-Host "  $Dest はアプリのフォルダではないため削除しません"
}

if ($RemoveData) {
  if (Test-Path $DataRoot) { Remove-Item -Recurse -Force $DataRoot; Write-Host "  データを削除: $DataRoot" }
  Write-Host 'アンインストールしました（データも削除しました）。'
} else {
  Write-Host 'アンインストールしました（データは残っています）。'
  Write-Host "  データ: $(Join-Path $DataRoot 'data')"
  Write-Host '  データも消すときは uninstall.ps1 を -RemoveData 付きで実行するか、上のフォルダを削除してください。'
}
