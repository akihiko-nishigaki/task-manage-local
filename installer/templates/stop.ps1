# タスク管理 の終了
# launch.cjs が書いた app.pid のプロセス（node）を止めます。install.ps1 / uninstall.ps1 からも呼ばれます。
#   -Dest  インストール先（既定: このスクリプトのあるフォルダ）
param([string]$Dest = (Split-Path -Parent $MyInvocation.MyCommand.Path))
# 日本語が文字化けしないよう、出力の文字コードをコンソールと揃える（install.bat 側で chcp 65001 済み）
try { [Console]::OutputEncoding = New-Object Text.UTF8Encoding $false } catch { }
$pidFile = Join-Path $Dest 'app.pid'
if (-not (Test-Path $pidFile)) { Write-Host '  タスク管理は起動していません'; return }
$id = 0
[void][int]::TryParse(([IO.File]::ReadAllText($pidFile)).Trim(), [ref]$id)
$proc = Get-Process -Id $id -ErrorAction SilentlyContinue
# PID が別のプロセスに再利用されていることがあるので、node のときだけ止める
if ($proc -and $proc.ProcessName -eq 'node') {
  Stop-Process -Id $id -Force
  [void]$proc.WaitForExit(5000)
  Write-Host '  起動中のタスク管理を終了しました'
} else {
  Write-Host '  タスク管理は起動していません'
}
Remove-Item -Force $pidFile -ErrorAction SilentlyContinue
