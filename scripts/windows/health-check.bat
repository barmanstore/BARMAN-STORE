@echo off
setlocal

for %%I in ("%~dp0..\..") do set "REPO_ROOT=%%~fI"
pushd "%REPO_ROOT%" >nul 2>&1
if errorlevel 1 (
  echo [ERROR] Could not open repository root: "%REPO_ROOT%"
  exit /b 1
)

set "MODE=%~1"
if /i "%MODE%"=="" set "MODE=quick"

if /i "%MODE%"=="help" goto help
if /i "%MODE%"=="quick" goto quick
if /i "%MODE%"=="full" goto full

echo [ERROR] Unknown mode: %MODE%
echo.
goto help_fail

:quick
echo ========================================
echo Health Check (Quick)
echo ========================================
where node >nul 2>&1 || (echo [ERROR] Node.js is not installed or not in PATH.& goto fail)
where npm >nul 2>&1 || (echo [ERROR] npm is not available in PATH.& goto fail)
echo [1/4] Installing dependencies if needed...
if exist node_modules goto quick_after_install
call npm install || goto fail_step
:quick_after_install
if exist node_modules echo [OK] node_modules exists
echo [2/4] Syntax check server/index.js...
node --check server/index.js || goto fail_step
echo [3/4] Running phone workflow smoke test...
call npm run test:phone || goto fail_step
echo [4/4] Running credit history UI smoke test...
call npm run test:credit-ui || goto fail_step
echo [SUCCESS] Quick health check passed.
goto success

:full
echo ========================================
echo Health Check (Full)
echo ========================================
where node >nul 2>&1 || (echo [ERROR] Node.js is not installed or not in PATH.& goto fail)
where npm >nul 2>&1 || (echo [ERROR] npm is not available in PATH.& goto fail)
echo [1/7] Installing dependencies if needed...
if exist node_modules goto full_after_install
call npm install || goto fail_step
:full_after_install
if exist node_modules echo [OK] node_modules exists
echo [2/7] Syntax check server/index.js...
node --check server/index.js || goto fail_step
echo [3/7] Syntax check server/supabaseAuthProvider.js...
node --check server/supabaseAuthProvider.js || goto fail_step
echo [4/7] Running phone workflow smoke test...
call npm run test:phone || goto fail_step
echo [5/7] Running credit history UI smoke test...
call npm run test:credit-ui || goto fail_step
echo [6/7] Scanning staged files for secret leaks...
call npm run secrets:scan:staged || goto fail_step
echo [7/7] Building production bundle...
call npm run build || goto fail_step
echo [SUCCESS] Full health check passed.
goto success

:help
echo ========================================
echo Health Check Utility
echo ========================================
echo Usage:
echo   health-check.bat quick
echo   health-check.bat full
echo.
echo quick: install (if needed), syntax check, smoke tests
echo full : quick + secret scan + production build
goto success

:help_fail
echo ========================================
echo Health Check Utility
echo ========================================
echo Usage:
echo   health-check.bat quick
echo   health-check.bat full
echo.
echo quick: install (if needed), syntax check, smoke tests
echo full : quick + secret scan + production build
goto fail

:fail_step
echo [ERROR] Health check failed.
goto fail

:success
popd
exit /b 0

:fail
popd
exit /b 1
