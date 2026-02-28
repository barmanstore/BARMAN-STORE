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

if /i "%MODE%"=="help" goto :help
if /i "%MODE%"=="quick" goto :quick
if /i "%MODE%"=="full" goto :full

echo [ERROR] Unknown mode: %MODE%
echo.
goto :help_error

:quick
echo ========================================
echo Health Check (Quick)
echo ========================================
node -v >nul 2>&1
if errorlevel 1 (
  echo [ERROR] Node.js is not installed or not in PATH.
  goto :end_error
)
npm -v >nul 2>&1
if errorlevel 1 (
  echo [ERROR] npm is not available in PATH.
  goto :end_error
)
echo [1/4] Installing dependencies if needed...
if not exist node_modules (
  call npm install
  if errorlevel 1 goto :step_failed
) else (
  echo [OK] node_modules exists
)
echo [2/4] Syntax check server/index.js...
node --check server/index.js
if errorlevel 1 goto :step_failed
echo [3/4] Running phone workflow smoke test...
call npm run test:phone
if errorlevel 1 goto :step_failed
echo [4/4] Running credit history UI smoke test...
call npm run test:credit-ui
if errorlevel 1 goto :step_failed
echo [SUCCESS] Quick health check passed.
goto :end_success

:full
echo ========================================
echo Health Check (Full)
echo ========================================
node -v >nul 2>&1
if errorlevel 1 (
  echo [ERROR] Node.js is not installed or not in PATH.
  goto :end_error
)
npm -v >nul 2>&1
if errorlevel 1 (
  echo [ERROR] npm is not available in PATH.
  goto :end_error
)
echo [1/7] Installing dependencies if needed...
if not exist node_modules (
  call npm install
  if errorlevel 1 goto :step_failed
) else (
  echo [OK] node_modules exists
)
echo [2/7] Syntax check server/index.js...
node --check server/index.js
if errorlevel 1 goto :step_failed
echo [3/7] Syntax check server/supabaseAuthProvider.js...
node --check server/supabaseAuthProvider.js
if errorlevel 1 goto :step_failed
echo [4/7] Running phone workflow smoke test...
call npm run test:phone
if errorlevel 1 goto :step_failed
echo [5/7] Running credit history UI smoke test...
call npm run test:credit-ui
if errorlevel 1 goto :step_failed
echo [6/7] Scanning staged files for secret leaks...
call npm run secrets:scan:staged
if errorlevel 1 goto :step_failed
echo [7/7] Building production bundle...
call npm run build
if errorlevel 1 goto :step_failed
echo [SUCCESS] Full health check passed.
goto :end_success

:step_failed
echo [ERROR] Health check failed.
goto :end_error

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
goto :end_success

:help_error
echo ========================================
echo Health Check Utility
echo ========================================
echo Usage:
echo   health-check.bat quick
echo   health-check.bat full
echo.
echo quick: install (if needed), syntax check, smoke tests
echo full : quick + secret scan + production build
goto :end_error

:end_success
popd
exit /b 0

:end_error
popd
exit /b 1
