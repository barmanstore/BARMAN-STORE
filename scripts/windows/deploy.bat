@echo off
setlocal enabledelayedexpansion

for %%I in ("%~dp0..\..") do set "REPO_ROOT=%%~fI"
pushd "%REPO_ROOT%" >nul 2>&1
if errorlevel 1 (
  echo [ERROR] Could not open repository root: "%REPO_ROOT%"
  exit /b 1
)

set "MODE=%~1"
if /i "%MODE%"=="" set "MODE=vercel"
if /i "%MODE%"=="help" goto :help_success
if /i "%MODE%"=="prepare" goto :prepare
if /i "%MODE%"=="vercel" goto :vercel
if /i "%MODE%"=="git" goto :git_deploy

echo [ERROR] Unknown mode: %MODE%
echo.
goto :help_error

:prepare
echo ========================================
echo Deploy Prepare
echo ========================================
if /i "%OPS_DRY_RUN%"=="1" (
  echo [DRY-RUN] call "%~dp0health-check.bat" quick
  echo [DRY-RUN] npm run build
) else (
  call "%~dp0health-check.bat" quick
  if errorlevel 1 goto :end_error
  echo [INFO] Creating production build...
  call npm run build
  if errorlevel 1 goto :end_error
)
echo [SUCCESS] Deploy preparation completed.
goto :end_success

:vercel
set "CHANNEL=%~2"
if /i "%CHANNEL%"=="" set "CHANNEL=prod"
echo ========================================
echo Deploy to Vercel (%CHANNEL%)
echo ========================================
if /i "%OPS_DRY_RUN%"=="1" (
  echo [DRY-RUN] call "%~dp0health-check.bat" quick
  echo [DRY-RUN] npm run build
  if /i "%CHANNEL%"=="preview" (
    echo [DRY-RUN] npx vercel
  ) else (
    echo [DRY-RUN] npx vercel --prod
  )
) else (
  call "%~dp0health-check.bat" quick
  if errorlevel 1 goto :end_error
  echo [INFO] Creating production build...
  call npm run build
  if errorlevel 1 goto :end_error
  if /i "%CHANNEL%"=="preview" (
    echo [INFO] Running: npx vercel
    call npx vercel
  ) else (
    echo [INFO] Running: npx vercel --prod
    call npx vercel --prod
  )
  if errorlevel 1 goto :end_error
)
echo [SUCCESS] Vercel deployment command completed.
goto :end_success

:git_deploy
set "REMOTE=%~2"
set "BRANCH=%~3"
if "%REMOTE%"=="" set "REMOTE=origin"
if "%BRANCH%"=="" set "BRANCH=main"
echo ========================================
echo Deploy via Git Push
echo ========================================
if /i "%OPS_DRY_RUN%"=="1" (
  echo [DRY-RUN] call "%~dp0health-check.bat" quick
  echo [DRY-RUN] git push %REMOTE% %BRANCH%
) else (
  call "%~dp0health-check.bat" quick
  if errorlevel 1 goto :end_error
  echo [INFO] Pushing branch %BRANCH% to %REMOTE%...
  git push %REMOTE% %BRANCH%
  if errorlevel 1 goto :end_error
)
echo [SUCCESS] Git push completed.
goto :end_success

:help_text
echo ========================================
echo Deploy Utility
echo ========================================
echo Usage:
echo   deploy.bat prepare
echo   deploy.bat vercel [prod^|preview]
echo   deploy.bat git [remote] [branch]
echo.
echo Examples:
echo   deploy.bat prepare
echo   deploy.bat vercel prod
echo   deploy.bat vercel preview
echo   deploy.bat git origin main
goto :eof

:help_success
call :help_text
goto :end_success

:help_error
call :help_text
goto :end_error

:end_success
popd
exit /b 0

:end_error
popd
exit /b 1
