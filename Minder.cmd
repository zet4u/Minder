@echo off
cd /d "%~dp0"
if exist "node_modules\electron\dist\electron.exe" (
  start "" "node_modules\electron\dist\electron.exe" "%~dp0"
) else (
  echo.
  echo Electron binary not found.
  echo Run setup.ps1 first - see README.md
  echo.
  pause
)
