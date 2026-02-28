@echo off
setlocal

for %%I in ("%~dp0..\..") do set "REPO_ROOT=%%~fI"
pushd "%REPO_ROOT%" >nul 2>&1
if errorlevel 1 (
  echo [ERROR] Could not open repository root: "%REPO_ROOT%"
  exit /b 1
)

echo ========================================
echo Batch Commands Self-Test
echo ========================================

set "OPS_DRY_RUN=1"
echo [INFO] OPS_DRY_RUN=1 enabled for mutating commands
echo.

echo [TEST] git-maintain help
call scripts\windows\git-maintain.bat help || goto :fail
echo [TEST] git-maintain status
call scripts\windows\git-maintain.bat status || goto :fail
echo [TEST] git-maintain pull (dry-run)
call scripts\windows\git-maintain.bat pull origin main || goto :fail
echo [TEST] git-maintain commit (dry-run)
call scripts\windows\git-maintain.bat commit "test: dry-run commit" || goto :fail
echo [TEST] git-maintain push (dry-run)
call scripts\windows\git-maintain.bat push origin main || goto :fail
echo [TEST] git-maintain quick (dry-run)
call scripts\windows\git-maintain.bat quick "test: dry-run quick" origin main || goto :fail
echo.

echo [TEST] health-check help
call scripts\windows\health-check.bat help || goto :fail
echo [TEST] health-check quick
call scripts\windows\health-check.bat quick || goto :fail
echo [TEST] health-check full
call scripts\windows\health-check.bat full || goto :fail
echo.

echo [TEST] deploy help
call scripts\windows\deploy.bat help || goto :fail
echo [TEST] deploy prepare (dry-run)
call scripts\windows\deploy.bat prepare || goto :fail
echo [TEST] deploy vercel preview (dry-run)
call scripts\windows\deploy.bat vercel preview || goto :fail
echo [TEST] deploy vercel prod (dry-run)
call scripts\windows\deploy.bat vercel prod || goto :fail
echo [TEST] deploy git (dry-run)
call scripts\windows\deploy.bat git origin main || goto :fail
echo.

echo [SUCCESS] All batch command tests passed.
popd
exit /b 0

:fail
echo.
echo [ERROR] Self-test failed.
popd
exit /b 1
