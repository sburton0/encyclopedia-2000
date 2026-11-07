@echo off
rem Double-click to set up this machine as the lab's Windows test computer (see setup-windows.ps1).
rem "setup-windows.cmd check" only reports what's done and what isn't, changing nothing.
if /i "%~1"=="check" (
  powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0setup-windows.ps1" -Check
) else (
  powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0setup-windows.ps1"
)
pause
