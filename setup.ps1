<#
  Minder - setup
  Unpacks the Electron runtime into node_modules\electron\dist and launches the app.
  Usage:
      powershell -ExecutionPolicy Bypass -File .\setup.ps1
      powershell -ExecutionPolicy Bypass -File .\setup.ps1 -ElectronZip "D:\Downloads\electron-v31.4.0-win32-x64.zip"
#>
param(
  [string]$ElectronZip = "D:\Downloads\electron-v31.4.0-win32-x64.zip",
  [switch]$NoLaunch
)

$ErrorActionPreference = "Stop"
$proj = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $proj

Write-Host "Minder setup" -ForegroundColor Cyan
Write-Host ("project : " + $proj)
Write-Host ("electron: " + $ElectronZip)

$el   = Join-Path $proj "node_modules\electron"
$dist = Join-Path $el "dist"

if (-not (Test-Path (Join-Path $dist "electron.exe"))) {
  if (-not (Test-Path $ElectronZip)) {
    Write-Host ""
    Write-Host "Electron zip not found at: $ElectronZip" -ForegroundColor Red
    Write-Host "Download electron-v31.4.0-win32-x64.zip and pass its path with -ElectronZip" -ForegroundColor Yellow
    exit 1
  }

  New-Item -ItemType Directory -Force $el | Out-Null
  Remove-Item -Recurse -Force $dist -ErrorAction SilentlyContinue
  Write-Host "unpacking electron..." -ForegroundColor DarkGray
  Expand-Archive -Path $ElectronZip -DestinationPath $dist -Force

  # flatten a nested electron-v* folder if the zip contained one
  $nest = Get-ChildItem $dist -Directory | Where-Object { $_.Name -like "electron-v*" }
  if ($nest) {
    Move-Item (Join-Path $nest.FullName "*") $dist -Force
    Remove-Item $nest.FullName -Recurse -Force
  }
  Get-ChildItem $dist -Filter "electron-v*.zip" -ErrorAction SilentlyContinue | Remove-Item -Force
}

# npm wrapper files so `npx electron .` and electron-builder can find the binary too
"electron.exe" | Out-File -Encoding ascii -NoNewline (Join-Path $el "path.txt")
if (-not (Test-Path (Join-Path $el "package.json"))) {
  '{ "name": "electron", "version": "31.4.0", "main": "index.js" }' |
    Out-File -Encoding ascii (Join-Path $el "package.json")
}
if (-not (Test-Path (Join-Path $el "index.js"))) {
  "module.exports = require('path').join(__dirname, 'dist', 'electron.exe')" |
    Out-File -Encoding ascii (Join-Path $el "index.js")
}

# verify
$need = @("electron.exe", "icudtl.dat", "resources.pak", "locales", "resources")
$missing = $need | Where-Object { -not (Test-Path (Join-Path $dist $_)) }
if ($missing) {
  Write-Host ""
  Write-Host ("incomplete electron - missing: " + ($missing -join ", ")) -ForegroundColor Red
  exit 1
}

Write-Host "electron ready" -ForegroundColor Green

if (-not $NoLaunch) {
  Write-Host "starting Minder..." -ForegroundColor Green
  Start-Process -FilePath (Join-Path $dist "electron.exe") -ArgumentList "`"$proj`""
}
