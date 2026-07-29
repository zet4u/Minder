<#
  Minder — build a standalone Windows app folder with Minder.exe

  Fully offline: it reuses the Electron runtime already unpacked by setup.ps1,
  so nothing is downloaded. No npm install, no Visual Studio, no electron-builder.

  Usage:
    powershell -ExecutionPolicy Bypass -File .\build-exe.ps1
    powershell -ExecutionPolicy Bypass -File .\build-exe.ps1 -Zip
#>
param(
  [switch]$Zip,
  [switch]$NoShortcut
)

$ErrorActionPreference = 'Stop'
$root = if ($PSScriptRoot) { $PSScriptRoot } else { (Get-Location).Path }

Write-Host 'Minder — build exe' -ForegroundColor Cyan
Write-Host "project : $root"

$eDist = Join-Path $root 'node_modules\electron\dist'
$eExe  = Join-Path $eDist 'electron.exe'
if (-not (Test-Path $eExe)) {
  Write-Host ''
  Write-Host 'Electron runtime not found.' -ForegroundColor Red
  Write-Host 'Run setup.ps1 first:' -ForegroundColor Yellow
  Write-Host '  powershell -ExecutionPolicy Bypass -File .\setup.ps1 -ElectronZip "D:\Downloads\electron-v31.4.0-win32-x64.zip" -NoLaunch'
  exit 1
}

$out = Join-Path $root 'dist\Minder'
if (Test-Path $out) {
  Write-Host 'cleaning previous build...'
  Remove-Item $out -Recurse -Force
}
New-Item -ItemType Directory -Path $out -Force | Out-Null

Write-Host 'copying runtime...'
Copy-Item -Path (Join-Path $eDist '*') -Destination $out -Recurse -Force

# drop Electron's built-in demo app so our app becomes the default
foreach ($leftover in @('resources\default_app.asar', 'resources\default_app')) {
  $p = Join-Path $out $leftover
  if (Test-Path $p) { Remove-Item $p -Recurse -Force }
}

Write-Host 'copying application...'
$app = Join-Path $out 'resources\app'
New-Item -ItemType Directory -Path $app -Force | Out-Null
Copy-Item (Join-Path $root 'package.json') -Destination $app -Force
Copy-Item (Join-Path $root 'src')    -Destination $app -Recurse -Force
Copy-Item (Join-Path $root 'assets') -Destination $app -Recurse -Force

$exe = Join-Path $out 'Minder.exe'
Rename-Item -Path (Join-Path $out 'electron.exe') -NewName 'Minder.exe' -Force

# the icon file travels with the build so shortcuts can use it
$ico = Join-Path $root 'build\icon.ico'
if (Test-Path $ico) { Copy-Item $ico -Destination (Join-Path $out 'Minder.ico') -Force }

if (-not $NoShortcut) {
  try {
    $desktop = [Environment]::GetFolderPath('Desktop')
    $lnk = Join-Path $desktop 'Minder.lnk'
    $sh = New-Object -ComObject WScript.Shell
    $s = $sh.CreateShortcut($lnk)
    $s.TargetPath = $exe
    $s.WorkingDirectory = $out
    $s.Description = 'Minder — focus time tracker'
    $icoOut = Join-Path $out 'Minder.ico'
    if (Test-Path $icoOut) { $s.IconLocation = $icoOut }
    $s.Save()
    Write-Host "shortcut: $lnk" -ForegroundColor Green
  } catch {
    Write-Host 'could not create the desktop shortcut (not critical)' -ForegroundColor Yellow
  }
}

if ($Zip) {
  Write-Host 'zipping...'
  $zipPath = Join-Path $root 'dist\Minder-win-x64.zip'
  if (Test-Path $zipPath) { Remove-Item $zipPath -Force }
  Compress-Archive -Path $out -DestinationPath $zipPath -CompressionLevel Optimal
  Write-Host "zip: $zipPath" -ForegroundColor Green
}

$size = [math]::Round(((Get-ChildItem $out -Recurse -File | Measure-Object -Sum Length).Sum / 1MB), 1)
Write-Host ''
Write-Host 'build done' -ForegroundColor Green
Write-Host "folder : $out"
Write-Host "exe    : $exe"
Write-Host "size   : $size MB"
Write-Host ''
Write-Host 'Double-click Minder.exe to run. The whole folder is portable —'
Write-Host 'copy it anywhere (or onto a flash drive) and it works as-is.'
