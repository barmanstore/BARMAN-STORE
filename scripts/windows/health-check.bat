@echo off
setlocal

for %%I in ("%~dp0..\..") do set "REPO_ROOT=%%~fI"
pushd "%REPO_ROOT%" >nul 2>&1
if errorlevel 1 (
  echo [ERROR] Could not open repository root: "%REPO_ROOT%"
  exit /b 1
)

set "LOADENV_JS=%REPO_ROOT%\server\loadEnv.js"
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

set "MODE=%~1"
if /i "%MODE%"=="" set "MODE=quick"

if /i "%MODE%"=="help" goto help
if /i "%MODE%"=="quick" goto quick
if /i "%MODE%"=="full" goto full
if /i "%MODE%"=="smoke" goto smoke

echo [ERROR] Unknown mode: %MODE%
echo.
goto help_fail

:quick
echo ========================================
echo Health Check (Quick)
echo ========================================
where node >nul 2>&1 || (echo [ERROR] Node.js is not installed or not in PATH.& goto fail)
where npm >nul 2>&1 || (echo [ERROR] npm is not available in PATH.& goto fail)
echo [1/5] Installing dependencies if needed...
if exist node_modules goto quick_after_install
call npm install || goto fail_step
:quick_after_install
if exist node_modules echo [OK] node_modules exists
echo [2/5] Syntax check server/index.js...
node --check server/index.js || goto fail_step
call :ensure_db_env
if /i "%USE_LOCAL_SMOKE_DB%"=="1" (
  echo [3/5] Running local embedded smoke suite for core checks - steps 3-5...
  call npm run smoke:local:core || goto fail_step
  echo [SUCCESS] Quick health check passed.
  goto success
)
echo [3/5] Running phone workflow smoke test...
call npm run test:phone || goto fail_step
echo [4/5] Running order+billing workflow smoke test...
call npm run test:order-flow || goto fail_step
echo [5/5] Running credit history UI smoke test...
call npm run test:credit-ui || goto fail_step
echo [SUCCESS] Quick health check passed.
goto success

:full
echo ========================================
echo Health Check (Full)
echo ========================================
where node >nul 2>&1 || (echo [ERROR] Node.js is not installed or not in PATH.& goto fail)
where npm >nul 2>&1 || (echo [ERROR] npm is not available in PATH.& goto fail)
echo [1/8] Installing dependencies if needed...
if exist node_modules goto full_after_install
call npm install || goto fail_step
:full_after_install
if exist node_modules echo [OK] node_modules exists
echo [2/8] Syntax check server/index.js...
node --check server/index.js || goto fail_step
echo [3/8] Syntax check server/supabaseAuthProvider.js...
node --check server/supabaseAuthProvider.js || goto fail_step
call :ensure_db_env
if /i "%USE_LOCAL_SMOKE_DB%"=="1" (
  echo [4/8] Running local embedded smoke suite for core checks - steps 4-6...
  call npm run smoke:local:core || goto fail_step
  goto full_after_smoke
)
echo [4/8] Running phone workflow smoke test...
call npm run test:phone || goto fail_step
echo [5/8] Running order+billing workflow smoke test...
call npm run test:order-flow || goto fail_step
echo [6/8] Running credit history UI smoke test...
call npm run test:credit-ui || goto fail_step
:full_after_smoke
echo [7/8] Scanning staged files for secret leaks...
call npm run secrets:scan:staged || goto fail_step
echo [8/8] Building production bundle...
call npm run build || goto fail_step
echo [SUCCESS] Full health check passed.
goto success

:smoke
echo ========================================
echo Health Check (Smoke Suite)
echo ========================================
where node >nul 2>&1 || (echo [ERROR] Node.js is not installed or not in PATH.& goto fail)
where npm >nul 2>&1 || (echo [ERROR] npm is not available in PATH.& goto fail)
echo [1/6] Installing dependencies if needed...
if exist node_modules goto smoke_after_install
call npm install || goto fail_step
:smoke_after_install
if exist node_modules echo [OK] node_modules exists
call :ensure_db_env
if /i "%USE_LOCAL_SMOKE_DB%"=="1" (
  echo [2/6] Running local embedded smoke suite - steps 2-6...
  call npm run smoke:local:all || goto fail_step
  echo [SUCCESS] Smoke suite passed.
  goto success
)
echo [2/6] Running phone workflow smoke test...
call npm run test:phone || goto fail_step
echo [3/6] Running order+billing workflow smoke test...
call npm run test:order-flow || goto fail_step
echo [4/6] Running PO lifecycle smoke test...
call npm run test:po-lifecycle || goto fail_step
echo [5/6] Running credit history UI smoke test...
call npm run test:credit-ui || goto fail_step
echo [6/6] Running category tree smoke test...
call npm run test:category-tree || goto fail_step
echo [SUCCESS] Smoke suite passed.
goto success

:help
echo ========================================
echo Health Check Utility
echo ========================================
echo Usage:
echo   health-check.bat quick
echo   health-check.bat full
echo   health-check.bat smoke
echo.
echo smoke: install (if needed) + all smoke tests
echo quick: install (if needed), syntax check, core smoke tests
echo full : quick + secret scan + production build
goto success

:help_fail
echo ========================================
echo Health Check Utility
echo ========================================
echo Usage:
echo   health-check.bat quick
echo   health-check.bat full
echo   health-check.bat smoke
echo.
echo smoke: install (if needed) + all smoke tests
echo quick: install (if needed), syntax check, core smoke tests
echo full : quick + secret scan + production build
goto fail

:ensure_db_env
set "HAS_DB_ENV="
set "USE_LOCAL_SMOKE_DB="
if defined SMOKE_TEST_DB_URL set "HAS_DB_ENV=1"
if defined PHONE_TEST_DB_URL set "HAS_DB_ENV=1"
if /i "%SMOKE_TEST_ALLOW_PRIMARY_DB%"=="1" set "HAS_DB_ENV=1"
if defined HAS_DB_ENV goto :eof

call :has_db_in_env_file
if defined HAS_DB_ENV goto :eof

if /i "%SUPABASE_AUTO_START%"=="1" call :start_supabase

set "HAS_DB_ENV="
if defined SMOKE_TEST_DB_URL set "HAS_DB_ENV=1"
if defined PHONE_TEST_DB_URL set "HAS_DB_ENV=1"
if /i "%SMOKE_TEST_ALLOW_PRIMARY_DB%"=="1" set "HAS_DB_ENV=1"
if defined HAS_DB_ENV goto :eof

if exist "%REPO_ROOT%\node_modules\embedded-postgres\dist\index.js" (
  echo [INFO] No dedicated smoke-test database configured. Falling back to repo-local embedded Postgres.
  set "USE_LOCAL_SMOKE_DB=1"
  goto :eof
)

echo [INFO] No dedicated smoke-test database configured. Set SMOKE_TEST_DB_URL and optionally PHONE_TEST_DB_URL.
echo [INFO] Smoke workflows will be skipped to avoid writing to the primary app database.
set "PHONE_TEST_ALLOW_NO_DB=1"
set "SMOKE_ALLOW_NO_DB=1"
goto :eof

:has_db_in_env_file
if not exist "%REPO_ROOT%\.env" goto :eof
findstr /R /I "^SMOKE_TEST_DB_URL=." "%REPO_ROOT%\.env" >nul 2>&1 && set "HAS_DB_ENV=1"
findstr /R /I "^PHONE_TEST_DB_URL=." "%REPO_ROOT%\.env" >nul 2>&1 && set "HAS_DB_ENV=1"
findstr /I "^SMOKE_TEST_ALLOW_PRIMARY_DB=1" "%REPO_ROOT%\.env" >nul 2>&1 && set "HAS_DB_ENV=1"
goto :eof

:start_supabase
where supabase >nul 2>&1
if errorlevel 1 (
  echo [WARN] Supabase CLI not found in PATH. Skipping auto-start.
  goto :eof
)
echo [INFO] Starting local Supabase (supabase start)...
call supabase start
goto :eof

:fail_step
echo [ERROR] Health check failed.
goto fail

:success
popd
exit /b 0

:fail
popd
exit /b 1
