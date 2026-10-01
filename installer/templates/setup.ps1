# ショートカットと「アプリと機能」への登録／解除を行う。
# install.bat / uninstall.bat から呼ばれる。外部への通信は行わない。
param(
  [Parameter(Mandatory = $true)][ValidateSet('install', 'uninstall')][string]$Mode,
  [Parameter(Mandatory = $true)][string]$InstallDir,
  [switch]$Startup
)

$ErrorActionPreference = 'Stop'

$AppName = 'タスク管理'
$RegPath = 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall\TaskManage'

$Desktop = [Environment]::GetFolderPath('Desktop')
$StartMenu = Join-Path $env:APPDATA 'Microsoft\Windows\Start Menu\Programs'
$StartupDir = Join-Path $env:APPDATA 'Microsoft\Windows\Start Menu\Programs\Startup'

$ShortcutPaths = @(
  (Join-Path $Desktop "$AppName.lnk"),
  (Join-Path $StartMenu "$AppName.lnk")
)
$StartupShortcut = Join-Path $StartupDir "$AppName.lnk"

function New-AppShortcut([string]$Path) {
  $shell = New-Object -ComObject WScript.Shell
  $link = $shell.CreateShortcut($Path)
  $link.TargetPath = 'wscript.exe'
  $link.Arguments = '"' + (Join-Path $InstallDir 'TaskManage.vbs') + '"'
  $link.WorkingDirectory = $InstallDir
  $link.Description = '社内タスク管理ツール'
  $icon = Join-Path $InstallDir 'app.ico'
  if (Test-Path $icon) { $link.IconLocation = $icon }
  $link.Save()
}

if ($Mode -eq 'install') {
  foreach ($p in $ShortcutPaths) { New-AppShortcut $p }
  if ($Startup) { New-AppShortcut $StartupShortcut }
  elseif (Test-Path $StartupShortcut) { Remove-Item $StartupShortcut -Force }

  $version = '0.0.0'
  $versionFile = Join-Path $InstallDir 'VERSION'
  if (Test-Path $versionFile) { $version = (Get-Content $versionFile -Raw).Trim() }

  New-Item -Path $RegPath -Force | Out-Null
  Set-ItemProperty -Path $RegPath -Name 'DisplayName' -Value $AppName
  Set-ItemProperty -Path $RegPath -Name 'DisplayVersion' -Value $version
  Set-ItemProperty -Path $RegPath -Name 'InstallLocation' -Value $InstallDir
  Set-ItemProperty -Path $RegPath -Name 'UninstallString' -Value ('"' + (Join-Path $InstallDir 'uninstall.bat') + '"')
  Set-ItemProperty -Path $RegPath -Name 'NoModify' -Value 1 -Type DWord
  Set-ItemProperty -Path $RegPath -Name 'NoRepair' -Value 1 -Type DWord
  $icon = Join-Path $InstallDir 'app.ico'
  if (Test-Path $icon) { Set-ItemProperty -Path $RegPath -Name 'DisplayIcon' -Value $icon }
}
else {
  foreach ($p in ($ShortcutPaths + $StartupShortcut)) {
    if (Test-Path $p) { Remove-Item $p -Force -ErrorAction SilentlyContinue }
  }
  if (Test-Path $RegPath) { Remove-Item $RegPath -Recurse -Force -ErrorAction SilentlyContinue }
}
