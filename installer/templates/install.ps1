# タスク管理 インストーラ
# このフォルダ（配布 ZIP を展開した場所）の program.zip を展開してローカル PC にインストールし、
# デスクトップとスタートメニューにショートカットを作ります。
# 通常は install.bat をダブルクリックして使います。
#   -Dest        インストール先（既定: %LOCALAPPDATA%\Programs\TaskManage）
#   -ShortcutDir ショートカットを置く場所（既定: デスクトップ）。-NoShortcut で作らない
#   -NoStartMenu スタートメニューにショートカットを作らない
#   -Startup     パソコンの起動時に自動で立ち上げる（スタートアップにショートカットを置く）
#   -NoLaunch    インストール後にアプリを起動しない
#   -SharedDataDir  データの置き場所をファイルサーバーの共有フォルダにする（例: \\fileserver\share\task）。
#                   参加する全員が同じフォルダを指定してインストールする。サーバーは各自の PC で動く。
#   -UseLocalData   共有フォルダの指定をやめて、この PC だけで使う構成に戻す
param(
  [string]$Dest = (Join-Path $env:LOCALAPPDATA 'Programs\TaskManage'),
  [string]$ShortcutDir = [Environment]::GetFolderPath('Desktop'),
  [switch]$NoShortcut,
  [switch]$NoStartMenu,
  [switch]$Startup,
  [switch]$NoLaunch,
  [string]$SharedDataDir = '',
  [switch]$UseLocalData
)
# 日本語が文字化けしないよう、出力の文字コードをコンソールと揃える（install.bat 側で chcp 65001 済み）
try { [Console]::OutputEncoding = New-Object Text.UTF8Encoding $false } catch { }
$ErrorActionPreference = 'Stop'
$AppName = 'タスク管理'
$RegPath = 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall\TaskManage'
$DataDir = Join-Path $env:LOCALAPPDATA 'task-manage-local\data'   # サーバー側 dataDir.ts の既定と同じ
# 失敗しても install.bat が一時停止するので、何が起きたかを読める形で出す
trap {
  Write-Host ''
  Write-Host '*** インストールに失敗しました ***' -ForegroundColor Red
  Write-Host $_.Exception.Message -ForegroundColor Red
  # 問い合わせ時に原因を特定できるよう、どの行で止まったかも出す
  if ($_.InvocationInfo) { Write-Host ('  (install.ps1 ' + $_.InvocationInfo.ScriptLineNumber + ' 行目)') -ForegroundColor DarkGray }
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
$payload = Join-Path $src 'program.zip'
# 配布物のバージョン。VERSION は program.zip の中なので、ビルド時にここへ埋め込む
$SrcVersion = '0.0.0'
# 旧形式のインストーラ（v0.2.2 以前）が置いていたファイル。残っていても害はないが紛らわしいので消す
$obsolete = @('setup.ps1', 'install.bat', 'install.ps1')

Write-Host "$AppName をインストールします"
Write-Host "  インストール元: $src    v$SrcVersion"
Write-Host "  インストール先: $Dest    $(Get-AppVersion $Dest)"

# ファイルサーバー運用: server.json の dataDir に共有フォルダを書く。
# 入れ替え（更新）のときは、-SharedDataDir を付けなくても前回の指定を引き継ぐ。
$confPath = Join-Path $Dest 'server.json'
$conf = [ordered]@{}
if (Test-Path $confPath) {
  try {
    $existing = [IO.File]::ReadAllText($confPath) | ConvertFrom-Json
    foreach ($p in $existing.PSObject.Properties) { $conf[$p.Name] = $p.Value }
  } catch { $conf = [ordered]@{} }
}
if ($SharedDataDir -and $UseLocalData) { throw '-SharedDataDir と -UseLocalData は同時に指定できません' }
if ($SharedDataDir) { $conf['dataDir'] = $SharedDataDir.Trim() }
if ($UseLocalData -and $conf.Contains('dataDir')) { $conf.Remove('dataDir') }
$SharedDir = if ($conf.Contains('dataDir') -and $conf['dataDir']) { [string]$conf['dataDir'] } else { '' }
if ($SharedDir) {
  Write-Host "  データ        : $SharedDir（ファイルサーバーの共有フォルダ。みんなで同じデータを使います）"
} else {
  Write-Host "  データ        : $DataDir（アンインストールしても消えません）"
}

if (-not (Test-Path $payload)) {
  throw "同じフォルダに program.zip がありません。配布 ZIP を「すべて展開」したフォルダの install.bat を実行してください"
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

# 共有フォルダを使う場合は、入れ替えを始める前に「そこへ読み書きできるか」を確かめる
if ($SharedDir) {
  if (-not (Test-Path -LiteralPath $SharedDir)) {
    try { New-Item -ItemType Directory -Force -Path $SharedDir | Out-Null } catch { }
  }
  if (-not (Test-Path -LiteralPath $SharedDir)) {
    throw "共有フォルダ $SharedDir に接続できません。パスが正しいか、ネットワークに繋がっているかを確認してください"
  }
  $probe = Join-Path $SharedDir ('.write-test-' + [guid]::NewGuid().ToString('N'))
  try {
    [IO.File]::WriteAllText($probe, 'ok')
    Remove-Item -LiteralPath $probe -Force
  } catch {
    throw "共有フォルダ $SharedDir に書き込めません。アクセス権（変更の許可）を確認してください"
  }
  Write-Host '  共有フォルダへの読み書き: OK'
}

# 起動中だとファイルを入れ替えても古い版が動き続けるので、先に止める
if (Test-Path (Join-Path $Dest 'app.pid')) {
  $stopPs1 = Join-Path $Dest 'stop.ps1'
  if (Test-Path $stopPs1) { & $stopPs1 -Dest $Dest }
}
New-Item -ItemType Directory -Force -Path $Dest | Out-Null
# 古い版のファイルを残さないよう、画面ファイルは入れ替える前に消す
$webDir = Join-Path $Dest 'web'
if (Test-Path $webDir) { Remove-Item -Recurse -Force $webDir }

# program.zip を展開する。Expand-Archive が使えない環境では Windows 標準の tar を使う
$unpacked = $false
try {
  Expand-Archive -LiteralPath $payload -DestinationPath $Dest -Force
  $unpacked = Test-Path (Join-Path $Dest 'server.cjs')
} catch {
  $unpacked = $false
}
if (-not $unpacked -and (Get-Command tar -ErrorAction SilentlyContinue)) {
  & tar -xf $payload -C $Dest
  $unpacked = Test-Path (Join-Path $Dest 'server.cjs')
}
if (-not $unpacked) {
  throw "program.zip を展開できませんでした。program.zip を手動で $Dest に展開してから、TaskManage.vbs をダブルクリックしてください"
}
Write-Host '  ファイルを展開しました'

foreach ($f in $obsolete) {
  $p = Join-Path $Dest $f
  if (Test-Path $p) { Remove-Item -Force $p }
}
# server.json（共有フォルダの指定など）。入れ替えても消えないよう、program.zip には含めずここで書く
if ($conf.Count -gt 0) {
  [IO.File]::WriteAllText($confPath, ($conf | ConvertTo-Json), (New-Object Text.UTF8Encoding $false))
} elseif (Test-Path $confPath) {
  Remove-Item -LiteralPath $confPath -Force
}
if (-not $SharedDir) { New-Item -ItemType Directory -Force -Path $DataDir | Out-Null }

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
Write-Host "インストールが完了しました。バージョン $destVer" -ForegroundColor Green
Write-Host "  インストール先: $Dest"
if ($SharedDir) {
  Write-Host "  データ保存先  : $SharedDir（共有フォルダ。自動バックアップは同じ場所の backups フォルダ）"
} else {
  Write-Host "  データ保存先  : $DataDir"
}
Write-Host ''
Write-Host 'デスクトップ / スタートメニューの「タスク管理」で起動できます（既に起動していれば画面が開くだけです）。'
Write-Host "すぐに止めたいときは $(Join-Path $Dest 'stop.bat') を実行してください。"
Write-Host 'アンインストールは「設定 > アプリ」または同じフォルダの uninstall.bat から行えます（データは消しません）。'
if (-not $NoLaunch) { Start-Process -FilePath 'wscript.exe' -ArgumentList ('"' + (Join-Path $Dest 'TaskManage.vbs') + '"') -WorkingDirectory $Dest }
