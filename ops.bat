@echo off
setlocal
set "REPO_ROOT=%~dp0"
pushd "%REPO_ROOT%" || (
  echo [ERROR] Failed to open repo root: "%REPO_ROOT%"
  exit /b 1
)
set "LOADENV_JS=%REPO_ROOT%server\loadEnv.js"
if exist "%LOADENV_JS%" (
  echo %NODE_OPTIONS% | find /I "%LOADENV_JS%" >nul
  if errorlevel 1 (
    if defined NODE_OPTIONS (
      set "NODE_OPTIONS=%NODE_OPTIONS% --require %LOADENV_JS%"
    ) else (
      set "NODE_OPTIONS=--require %LOADENV_JS%"
    )
  )
)
set "WORKBENCH=%~dp0scripts\windows\workbench.bat"
if not exist "%WORKBENCH%" (
  echo [ERROR] Missing workbench script: "%WORKBENCH%"
  if "%~1"=="" pause
  popd
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
if "%~1"=="" set "OPS_INTERACTIVE=1"
call "%WORKBENCH%" %*
if "%~1"=="" pause
popd
exit /b %errorlevel%
