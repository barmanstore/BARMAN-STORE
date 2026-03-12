@echo off
setlocal
set "WORKBENCH=%~dp0scripts\windows\workbench.bat"
if not exist "%WORKBENCH%" (
  echo [ERROR] Missing workbench script: "%WORKBENCH%"
  exit /b 1
)
if /i "%~1"=="migrate" (
  call "%WORKBENCH%" 16
  exit /b %errorlevel%
)
if /i "%~1"=="db:migrate" (
  call "%WORKBENCH%" 16
  exit /b %errorlevel%
)
call "%WORKBENCH%" %*
exit /b %errorlevel%
