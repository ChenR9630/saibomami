@echo off
setlocal
title NEKO.SYNC Client
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0start-desktop-windows.ps1" %*
if errorlevel 1 (
  echo.
  echo NEKO.SYNC Client failed to start.
  echo See %%LOCALAPPDATA%%\NEKO.SYNC\windows-client.log for details.
  echo.
  pause
)
