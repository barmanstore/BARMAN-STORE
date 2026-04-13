@echo off
setlocal enabledelayedexpansion

for %%I in ("%~dp0..\..") do set "REPO_ROOT=%%~fI"
pushd "%REPO_ROOT%" >nul 2>&1
if errorlevel 1 (
  echo [ERROR] Could not open repository root: "%REPO_ROOT%"
  exit /b 1
)

set "MODE=%~1"
set "VERCEL_NPX=npx --yes vercel@50.26.0"
set "PRIMARY_PROD_ALIAS=barmanstore.vercel.app"
set "EXTRA_PROD_ALIASES=barman-store.vercel.app"
set "LAST_LOG="
set "LATEST_ALIAS="
set "LOG_STAMP="
if /i "%MODE%"=="" set "MODE=vercel"
if /i "%MODE%"=="help" goto :help_success
if /i "%MODE%"=="prepare" goto :prepare
if /i "%MODE%"=="vercel" goto :vercel
if /i "%MODE%"=="git" goto :git_deploy

echo [ERROR] Unknown mode: %MODE%
echo.
goto :help_error

:prepare
for /f %%I in ('powershell -NoProfile -Command "Get-Date -Format yyyyMMdd_HHmmss"') do set "LOG_STAMP=%%I"
set "LAST_LOG=%REPO_ROOT%\tmp.deploy.prepare.%LOG_STAMP%.log"
set "LATEST_ALIAS=%REPO_ROOT%\tmp.deploy.prepare.log"
> "%LAST_LOG%" echo [START] %DATE% %TIME% prepare
echo ========================================
echo Deploy Prepare
echo ========================================
echo [INFO] Writing log to "%LAST_LOG%"
if /i "%OPS_DRY_RUN%"=="1" (
  echo [DRY-RUN] call "%~dp0health-check.bat" quick
  echo [DRY-RUN] npm run build
  >> "%LAST_LOG%" echo [DRY-RUN] call "%~dp0health-check.bat" quick
  >> "%LAST_LOG%" echo [DRY-RUN] npm run build
) else (
  call "%~dp0health-check.bat" quick >> "%LAST_LOG%" 2>&1
  if errorlevel 1 (
    echo [ERROR] Health check failed. Review "%LAST_LOG%"
    goto :end_error
  )
  echo [INFO] Scanning staged files for secret leaks...
  call npm run secrets:scan:staged >> "%LAST_LOG%" 2>&1
  if errorlevel 1 (
    echo [ERROR] Secret scan failed. Review "%LAST_LOG%"
    goto :end_error
  )
)
echo [SUCCESS] Deploy preparation completed.
goto :end_success

:vercel
set "CHANNEL=%~2"
if /i "%CHANNEL%"=="" set "CHANNEL=prod"
for /f %%I in ('powershell -NoProfile -Command "Get-Date -Format yyyyMMdd_HHmmss"') do set "LOG_STAMP=%%I"
set "LAST_LOG=%REPO_ROOT%\tmp.deploy.vercel.%CHANNEL%.%LOG_STAMP%.log"
set "LATEST_ALIAS=%REPO_ROOT%\tmp.deploy.vercel.%CHANNEL%.log"
> "%LAST_LOG%" echo [START] %DATE% %TIME% vercel %CHANNEL%
echo ========================================
echo Deploy to Vercel (%CHANNEL%)
echo ========================================
echo [INFO] Writing log to "%LAST_LOG%"
if /i "%OPS_DRY_RUN%"=="1" (
  echo [DRY-RUN] call "%~dp0health-check.bat" quick
  echo [DRY-RUN] npm run build
  if /i "%CHANNEL%"=="preview" (
    echo [DRY-RUN] %VERCEL_NPX%
    >> "%LAST_LOG%" echo [DRY-RUN] call "%~dp0health-check.bat" quick
    >> "%LAST_LOG%" echo [DRY-RUN] npm run build
    >> "%LAST_LOG%" echo [DRY-RUN] %VERCEL_NPX%
  ) else (
    echo [DRY-RUN] %VERCEL_NPX% --prod
    >> "%LAST_LOG%" echo [DRY-RUN] call "%~dp0health-check.bat" quick
    >> "%LAST_LOG%" echo [DRY-RUN] npm run build
    >> "%LAST_LOG%" echo [DRY-RUN] %VERCEL_NPX% --prod
  )
) else (
  call "%~dp0health-check.bat" quick >> "%LAST_LOG%" 2>&1
  if errorlevel 1 (
    echo [ERROR] Health check failed. Review "%LAST_LOG%"
    goto :end_error
  )
  echo [INFO] Creating production build...
  call npm run build >> "%LAST_LOG%" 2>&1
  if errorlevel 1 (
    echo [ERROR] Build failed. Review "%LAST_LOG%"
    goto :end_error
  )
  if /i "%CHANNEL%"=="preview" (
    echo [INFO] Running: %VERCEL_NPX%
    call %VERCEL_NPX% >> "%LAST_LOG%" 2>&1
  ) else (
    echo [INFO] Running: %VERCEL_NPX% --prod
    call %VERCEL_NPX% --prod >> "%LAST_LOG%" 2>&1
  )
  if errorlevel 1 (
    echo [ERROR] Vercel deploy failed. Review "%LAST_LOG%"
    goto :end_error
  )
  if /i "%CHANNEL%"=="preview" (
    echo [INFO] Preview deploy: skipping alias updates.
  ) else (
    call :set_aliases
  )
)
echo [SUCCESS] Vercel deployment command completed.
goto :end_success

:git_deploy
set "REMOTE=%~2"
set "BRANCH=%~3"
if "%REMOTE%"=="" set "REMOTE=origin"
if "%BRANCH%"=="" set "BRANCH=main"
for /f %%I in ('powershell -NoProfile -Command "Get-Date -Format yyyyMMdd_HHmmss"') do set "LOG_STAMP=%%I"
set "LAST_LOG=%REPO_ROOT%\tmp.deploy.git.%REMOTE%.%BRANCH%.%LOG_STAMP%.log"
set "LATEST_ALIAS=%REPO_ROOT%\tmp.deploy.git.%REMOTE%.%BRANCH%.log"
> "%LAST_LOG%" echo [START] %DATE% %TIME% git %REMOTE% %BRANCH%
echo ========================================
echo Deploy via Git Push
echo ========================================
echo [INFO] Writing log to "%LAST_LOG%"
if /i "%OPS_DRY_RUN%"=="1" (
  echo [DRY-RUN] call "%~dp0health-check.bat" quick
  echo [DRY-RUN] git push %REMOTE% %BRANCH%
  >> "%LAST_LOG%" echo [DRY-RUN] call "%~dp0health-check.bat" quick
  >> "%LAST_LOG%" echo [DRY-RUN] git push %REMOTE% %BRANCH%
) else (
  call "%~dp0health-check.bat" quick >> "%LAST_LOG%" 2>&1
  if errorlevel 1 (
    echo [ERROR] Health check failed. Review "%LAST_LOG%"
    goto :end_error
  )
  echo [INFO] Pushing branch %BRANCH% to %REMOTE%...
  git push %REMOTE% %BRANCH% >> "%LAST_LOG%" 2>&1
  if errorlevel 1 (
    echo [ERROR] Git push failed. Review "%LAST_LOG%"
    goto :end_error
  )
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

:set_aliases
set "LATEST_URL="
for /f "usebackq delims=" %%I in (`powershell -NoProfile -Command "$raw = Get-Content -Path '%LAST_LOG%' -Raw; $clean = [regex]::Replace($raw, '\x1B\[[0-9;?]*[ -/]*[@-~]', ''); $productionMatches = [regex]::Matches($clean, 'Production:\s+(https?://\S+)'); if ($productionMatches.Count -gt 0) { $url = $productionMatches[$productionMatches.Count - 1].Groups[1].Value } else { $vercelMatches = [regex]::Matches($clean, 'https://[A-Za-z0-9./_-]*vercel\.app[A-Za-z0-9./_-]*'); if ($vercelMatches.Count -gt 0) { $url = $vercelMatches[$vercelMatches.Count - 1].Value } else { $url = '' } }; $url = $url.Trim().TrimEnd('/').TrimEnd('.').TrimEnd(',').TrimEnd(';').TrimEnd(')').TrimEnd(']').TrimEnd('}'); Write-Output $url"`) do set "LATEST_URL=%%I"
if not defined LATEST_URL (
  echo [WARN] Could not detect production URL from log. Skipping alias update.
  goto :eof
)
echo [INFO] Updating production aliases to %LATEST_URL%
call :set_single_alias %PRIMARY_PROD_ALIAS%
for %%A in (%EXTRA_PROD_ALIASES%) do (
  call :set_single_alias %%A
)
goto :eof

:set_single_alias
set "TARGET_ALIAS=%~1"
if "%TARGET_ALIAS%"=="" goto :eof
echo [INFO] Alias %TARGET_ALIAS% -> %LATEST_URL%
call %VERCEL_NPX% alias set "%LATEST_URL%" "%TARGET_ALIAS%" >> "%LAST_LOG%" 2>&1
if errorlevel 1 (
  echo [WARN] Failed to set alias %TARGET_ALIAS%. See log.
)
goto :eof

:help_success
call :help_text
goto :end_success

:help_error
call :help_text
goto :end_error

:end_success
if defined LAST_LOG echo [INFO] Log saved to "%LAST_LOG%"
if defined LATEST_ALIAS (
  copy /y "%LAST_LOG%" "%LATEST_ALIAS%" >nul 2>&1
)
popd
exit /b 0

:end_error
if defined LAST_LOG echo [INFO] Log saved to "%LAST_LOG%"
if defined LATEST_ALIAS (
  copy /y "%LAST_LOG%" "%LATEST_ALIAS%" >nul 2>&1
)
popd
exit /b 1
