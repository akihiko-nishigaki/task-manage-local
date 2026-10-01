# タスク管理 インストーラ
# このフォルダ（配布 ZIP を展開した場所）のアプリ一式をローカル PC にコピーし、デスクトップとスタートメニューにショートカットを作ります。
# 通常は install.bat をダブルクリックして使います。
#   -Dest        インストール先（既定: %LOCALAPPDATA%\Programs\TaskManage）
#   -ShortcutDir ショートカットを置く場所（既定: デスクトップ）。-NoShortcut で作らない
#   -NoStartMenu スタートメニューにショートカットを作らない
#   -Startup     パソコンの起動時に自動で立ち上げる（スタートアップにショートカットを置く）
#   -NoLaunch    インストール後にアプリを起動しない
param(
  [string]$Dest = (Join-Path $env:LOCALAPPDATA 'Programs\TaskManage'),
  [string]$ShortcutDir = [Environment]::GetFolderPath('Desktop'),
  [switch]$NoShortcut,
  [switch]$NoStartMenu,
  [switch]$Startup,
  [switch]$NoLaunch
)
$ErrorActionPreference = 'Stop'
$AppName = 'タスク管理'
$RegPath = 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall\TaskManage'
$DataDir = Join-Path $env:LOCALAPPDATA 'task-manage-local\data'   # サーバー側 dataDir.ts の既定と同じ
# 失敗しても install.bat が一時停止するので、何が起きたかを読める形で出す
trap {
  Write-Host ''
  Write-Host '*** インストールに失敗しました ***' -ForegroundColor Red
  Write-Host $_.Exception.Message -ForegroundColor Red
  Write-Host ''
  Write-Host '配布 ZIP を展開したフォルダの install.bat を実行しているか確認してください。'
  exit 1
}
# そのフォルダに入っているアプリのバージョン（VERSION ファイル）
function Get-AppVersion([string]$dir) {
  $v = Join-Path $dir 'VERSION'
  if (-not (Test-Path $v)) { return '(なし)' }
  $s = ([IO.File]::ReadAllText($v)).Trim()
  if ($s) { return 'v' + $s } else { return '(不明)' }
}
$src = Split-Path -Parent $MyInvocation.MyCommand.Path
# 配布に含める（= 動作に必要な）ファイルとフォルダ
$files = @('server.cjs', 'launch.cjs', 'TaskManage.vbs', 'app.ico', 'VERSION', 'stop.bat', 'stop.ps1',
  'install.bat', 'install.ps1', 'uninstall.bat', 'uninstall.ps1', 'README.txt')
$dirs = @('web')
# 旧形式のインストーラ（v0.2.1 以前）が置いていたファイル。残っていても害はないが紛らわしいので消す
$obsolete = @('setup.ps1')

Write-Host "$AppName をインストールします"
Write-Host "  コピー元: $src    $(Get-AppVersion $src)"
Write-Host "  コピー先: $Dest    $(Get-AppVersion $Dest)"
Write-Host "  データ  : $DataDir（アンインストールしても消えません）"

foreach ($f in @('server.cjs', 'launch.cjs', 'TaskManage.vbs') + $dirs) {
  if (-not (Test-Path (Join-Path $src $f))) { throw "コピー元に $f がありません。配布 ZIP を展開したフォルダの install.bat を実行してください" }
}

# サーバーは Node.js で動く（node:sqlite を使うため 22.13 以上）
if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
  throw "Node.js が見つかりません。https://nodejs.org/ja から LTS 版（22.13 以上）をインストールしてから、もう一度 install.bat を実行してください"
}
$nodeVer = ((& node -v) | Out-String).Trim().TrimStart('v')
$parsed = $null
if ([version]::TryParse(($nodeVer -replace '-.*$', ''), [ref]$parsed) -and $parsed -lt [version]'22.13') {
  throw "Node.js のバージョンが古すぎます（現在 v$nodeVer）。22.13 以上が必要です。https://nodejs.org/ja から LTS 版を入れ直してください"
}
Write-Host "  Node.js : v$nodeVer"

$copied = $true
if ($src.TrimEnd('\') -ieq $Dest.TrimEnd('\')) {
  $copied = $false
  Write-Host ''
  Write-Host '  *** 注意: コピー元とコピー先が同じです。ファイルは入れ替わりません ***' -ForegroundColor Yellow
  Write-Host '      新しい版に入れ替えるときは、配布 ZIP を展開したフォルダの install.bat を' -ForegroundColor Yellow
  Write-Host '      実行してください（インストール済みフォルダの install.bat では更新されません）。' -ForegroundColor Yellow
  Write-Host ''
} else {
  # 起動中だとファイルを入れ替えても古い版が動き続けるので、先に止める
  if (Test-Path (Join-Path $Dest 'app.pid')) { & (Join-Path $src 'stop.ps1') -Dest $Dest }
  New-Item -ItemType Directory -Force -Path $Dest | Out-Null
  foreach ($f in $files) {
    $p = Join-Path $src $f
    if (Test-Path $p) { Copy-Item -Path $p -Destination (Join-Path $Dest $f) -Force }
  }
  foreach ($d in $dirs) {
    $to = Join-Path $Dest $d
    if (Test-Path $to) { Remove-Item -Recurse -Force $to }   # 古い版のファイルを残さない
    Copy-Item -Path (Join-Path $src $d) -Destination $to -Recurse -Force
  }
  foreach ($f in $obsolete) {
    $p = Join-Path $Dest $f
    if (Test-Path $p) { Remove-Item -Force $p }
  }
  Write-Host '  ファイルをコピーしました'
}
New-Item -ItemType Directory -Force -Path $DataDir | Out-Null

# ショートカットは TaskManage.vbs を wscript.exe で開く（黒いウィンドウを出さずに起動するため）
function New-AppShortcut([string]$dir) {
  New-Item -ItemType Directory -Force -Path $dir | Out-Null
  $lnk = Join-Path $dir "$AppName.lnk"
  $shell = New-Object -ComObject WScript.Shell
  $sc = $shell.CreateShortcut($lnk)
  $sc.TargetPath = 'wscript.exe'
  $sc.Arguments = '"' + (Join-Path $Dest 'TaskManage.vbs') + '"'
  $sc.WorkingDirectory = $Dest
  $sc.Description = "$AppName（社内タスク管理ツール）"
  $icon = Join-Path $Dest 'app.ico'
  if (Test-Path $icon) { $sc.IconLocation = $icon }
  $sc.Save()
  Write-Host "  ショートカットを作成: $lnk"
}
$startupDir = Join-Path $env:APPDATA 'Microsoft\Windows\Start Menu\Programs\Startup'
if (-not $NoShortcut) { New-AppShortcut $ShortcutDir }
if (-not $NoStartMenu) { New-AppShortcut (Join-Path $env:APPDATA 'Microsoft\Windows\Start Menu\Programs') }
if ($Startup) {
  New-AppShortcut $startupDir
} elseif (Test-Path (Join-Path $startupDir "$AppName.lnk")) {
  Remove-Item -Force (Join-Path $startupDir "$AppName.lnk")
  Write-Host '  自動起動を解除しました（自動で立ち上げるには -Startup を付けて実行）'
}

# 「設定 > アプリ」の一覧に載せる（そこからアンインストールできるように）
$destVer = Get-AppVersion $Dest
New-Item -Path $RegPath -Force | Out-Null
Set-ItemProperty -Path $RegPath -Name 'DisplayName' -Value $AppName
Set-ItemProperty -Path $RegPath -Name 'DisplayVersion' -Value $destVer.TrimStart('v')
Set-ItemProperty -Path $RegPath -Name 'InstallLocation' -Value $Dest
Set-ItemProperty -Path $RegPath -Name 'UninstallString' -Value ('"' + (Join-Path $Dest 'uninstall.bat') + '"')
Set-ItemProperty -Path $RegPath -Name 'NoModify' -Value 1 -Type DWord
Set-ItemProperty -Path $RegPath -Name 'NoRepair' -Value 1 -Type DWord
$icon = Join-Path $Dest 'app.ico'
if (Test-Path $icon) { Set-ItemProperty -Path $RegPath -Name 'DisplayIcon' -Value $icon }

Write-Host ''
if ($copied) {
  Write-Host "インストールが完了しました。バージョン $destVer" -ForegroundColor Green
} else {
  Write-Host "ファイルは入れ替えていません。今入っているのは $destVer です" -ForegroundColor Yellow
  Write-Host "  ショートカットの作り直しだけ行いました。" -ForegroundColor Yellow
}
Write-Host "  インストール先: $Dest"
Write-Host "  データ保存先  : $DataDir"
Write-Host ''
Write-Host 'デスクトップ / スタートメニューの「タスク管理」で起動できます（既に起動していれば画面が開くだけです）。'
Write-Host "すぐに止めたいときは $(Join-Path $Dest 'stop.bat') を実行してください。"
Write-Host 'アンインストールは「設定 > アプリ」または同じフォルダの uninstall.bat から行えます（データは消しません）。'
if (-not $NoLaunch) { Start-Process -FilePath 'wscript.exe' -ArgumentList ('"' + (Join-Path $Dest 'TaskManage.vbs') + '"') -WorkingDirectory $Dest }
