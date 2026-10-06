# タスク管理 社内共有サーバー セットアップ
# この PC 1 台でアプリを動かしっぱなしにし、ほかの人はブラウザから使う構成にします。
# 通常の install.bat（1 人で使う構成）との違い:
#   - LAN 全体から接続できるように待ち受ける（HOST=0.0.0.0）
#   - サインインしていなくても動くよう、Windows のタスクスケジューラに「起動時に実行」で登録する
#   - 配り物として、ほかの人のデスクトップに置くショートカット（.url）を作る
#   -Port       待ち受けポート（既定: 3000）
#   -Dest       インストール先（既定: %LOCALAPPDATA%\Programs\TaskManage）
#   -NoFirewall ファイアウォールの穴あけを試みない
param(
  [int]$Port = 3000,
  [string]$Dest = (Join-Path $env:LOCALAPPDATA 'Programs\TaskManage'),
  [switch]$NoFirewall
)
# 日本語が文字化けしないよう、出力の文字コードをコンソールと揃える（.bat 側で chcp 65001 済み）
try { [Console]::OutputEncoding = New-Object Text.UTF8Encoding $false } catch { }
$ErrorActionPreference = 'Stop'
$AppName = 'タスク管理'
$TaskName = 'TaskManage Server'
$DataDir = Join-Path $env:LOCALAPPDATA 'task-manage-local\data'

trap {
  Write-Host ''
  Write-Host '*** サーバーのセットアップに失敗しました ***' -ForegroundColor Red
  Write-Host $_.Exception.Message -ForegroundColor Red
  if ($_.InvocationInfo) {
    Write-Host ('  (install-server.ps1 ' + $_.InvocationInfo.ScriptLineNumber + ' 行目)') -ForegroundColor DarkGray
  }
  exit 1
}

$src = Split-Path -Parent $MyInvocation.MyCommand.Path

Write-Host "$AppName を社内共有サーバーとして設定します"
Write-Host ''

# 1. まず通常のインストール（ファイル展開・ショートカット・アプリと機能への登録）を済ませる
#    この PC では自動起動を使わず、タスクスケジューラ側で起動するので -NoLaunch を付ける
$installPs1 = Join-Path $src 'install.ps1'
if (-not (Test-Path $installPs1)) {
  throw "同じフォルダに install.ps1 がありません。配布 ZIP を「すべて展開」したフォルダで実行してください"
}
& $installPs1 -Dest $Dest -NoLaunch
if ($LASTEXITCODE -ne 0 -and $null -ne $LASTEXITCODE) { throw 'インストールに失敗したため中止しました' }

Write-Host ''
Write-Host '--- 共有サーバーの設定 ---'

# 2. 既に動いていれば止める（ポートと PID ファイルを掴んだままだと二重起動になる）
$stopPs1 = Join-Path $Dest 'stop.ps1'
if (Test-Path $stopPs1) { & $stopPs1 -Dest $Dest }

# 3. タスクスケジューラに登録する。
#    「起動時に実行」＋「ユーザーがサインインしていなくても実行」にしたいが、
#    後者はパスワード入力か管理者権限が要るため、既定は「サインイン時に実行」にして
#    管理者で実行できたときだけ「起動時」に切り替える。
$node = (Get-Command node -ErrorAction Stop).Source
$launch = Join-Path $Dest 'launch.cjs'
$isAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole(
  [Security.Principal.WindowsBuiltInRole]::Administrator)

$action = New-ScheduledTaskAction -Execute $node `
  -Argument ('--no-warnings=ExperimentalWarning "' + $launch + '"') -WorkingDirectory $Dest
$settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries `
  -StartWhenAvailable -ExecutionTimeLimit ([TimeSpan]::Zero) -RestartCount 3 -RestartInterval (New-TimeSpan -Minutes 1)

if ($isAdmin) {
  $trigger = New-ScheduledTaskTrigger -AtStartup
  $principal = New-ScheduledTaskPrincipal -UserId 'SYSTEM' -LogonType ServiceAccount -RunLevel Highest
  $bootNote = 'パソコンの起動時（サインイン前）'
} else {
  $trigger = New-ScheduledTaskTrigger -AtLogOn -User ([Security.Principal.WindowsIdentity]::GetCurrent().Name)
  $principal = New-ScheduledTaskPrincipal -UserId ([Security.Principal.WindowsIdentity]::GetCurrent().Name) -LogonType Interactive
  $bootNote = 'このユーザーのサインイン時'
}

Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false -ErrorAction SilentlyContinue
Register-ScheduledTask -TaskName $TaskName -Action $action -Trigger $trigger -Settings $settings `
  -Principal $principal -Description "$AppName を社内共有サーバーとして常時起動する" | Out-Null
Write-Host "  自動起動を登録しました（$bootNote）"

# 4. LAN 全体で待ち受けるための設定を、インストール先に置いて launch.cjs に読ませる
$conf = @{ host = '0.0.0.0'; port = $Port } | ConvertTo-Json
[IO.File]::WriteAllText((Join-Path $Dest 'server.json'), $conf, (New-Object Text.UTF8Encoding $false))
Write-Host "  待ち受け設定を保存しました（すべてのネットワーク / ポート $Port）"

# 5. ファイアウォールを開ける（管理者でないと登録できない）
if (-not $NoFirewall) {
  if ($isAdmin) {
    Remove-NetFirewallRule -DisplayName "$AppName ($TaskName)" -ErrorAction SilentlyContinue
    New-NetFirewallRule -DisplayName "$AppName ($TaskName)" -Direction Inbound -Action Allow `
      -Protocol TCP -LocalPort $Port -Profile Domain, Private | Out-Null
    Write-Host "  ファイアウォールで TCP $Port を許可しました（ドメイン / プライベート）"
  } else {
    Write-Host "  ファイアウォールの設定は管理者権限が必要です。次を管理者の PowerShell で実行してください:" -ForegroundColor Yellow
    Write-Host "    New-NetFirewallRule -DisplayName '$AppName' -Direction Inbound -Action Allow -Protocol TCP -LocalPort $Port -Profile Domain,Private" -ForegroundColor Yellow
  }
}

# 6. 起動する
Start-ScheduledTask -TaskName $TaskName
Start-Sleep -Seconds 3

# 7. 接続先を調べて、配布用ショートカットを作る
$ips = @(Get-NetIPAddress -AddressFamily IPv4 -ErrorAction SilentlyContinue |
  Where-Object { $_.IPAddress -notlike '127.*' -and $_.IPAddress -notlike '169.254.*' } |
  Select-Object -ExpandProperty IPAddress)
$addr = if ($ips.Count -gt 0) { $ips[0] } else { $env:COMPUTERNAME }
$url = "http://${addr}:$Port"

$urlFile = Join-Path $Dest "$AppName（社内共有）.url"
[IO.File]::WriteAllText($urlFile, "[InternetShortcut]`r`nURL=$url`r`n", (New-Object Text.ASCIIEncoding))

# 動いているか確かめる
$ok = $false
for ($i = 0; $i -lt 20; $i++) {
  try {
    $res = Invoke-WebRequest -Uri "http://127.0.0.1:$Port/api/health" -UseBasicParsing -TimeoutSec 2
    if ($res.StatusCode -eq 200) { $ok = $true; break }
  } catch { Start-Sleep -Milliseconds 500 }
}

Write-Host ''
if ($ok) {
  Write-Host '社内共有サーバーとして動き始めました' -ForegroundColor Green
} else {
  Write-Host '起動を確認できませんでした。タスクスケジューラの「TaskManage Server」の状態を確認してください' -ForegroundColor Yellow
}
Write-Host ''
Write-Host "  ほかの人がブラウザで開くアドレス: $url"
if ($ips.Count -gt 1) {
  Write-Host ("  （この PC のほかのアドレス: " + (($ips | Select-Object -Skip 1) -join ', ') + "）")
}
Write-Host "  データ保存先                    : $DataDir"
Write-Host ''
Write-Host '配り方: 次のショートカットを共有フォルダに置くか、メールで配ってください。'
Write-Host "    $urlFile"
Write-Host ''
Write-Host '※ この PC の電源を入れたままにしてください。電源を切ると全員が使えなくなります。'
Write-Host '※ IP アドレスは変わることがあります。ルーター側で固定するか、PC 名での接続をおすすめします。'
Write-Host ("    PC 名で開く場合: http://$env:COMPUTERNAME" + ":$Port")
