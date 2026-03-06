@echo off
setlocal
set "WORKBENCH=%~dp0scripts\windows\workbench.bat"
if not exist "%WORKBENCH%" (
  echo [ERROR] Missing workbench script: "%WORKBENCH%"
  exit /b 1
)
call "%WORKBENCH%" %*
exit /b %errorlevel%
