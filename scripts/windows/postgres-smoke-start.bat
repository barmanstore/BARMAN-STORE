@echo off
setlocal

set "PG_BIN=C:\Program Files\PostgreSQL\16\bin\pg_ctl.exe"
set "PG_ISREADY=%PG_BIN:pg_ctl.exe=pg_isready.exe%"
set "PG_DATA=C:\Users\naren\pgdata\smoke"
set "PG_PORT=55433"
set "PG_START_TIMEOUT=300"
set "PG_POLL_INTERVAL=5"
set "PG_LOG=%~dp0..\..\tmp.pg.log"

if not exist "%PG_BIN%" (
  echo [ERROR] pg_ctl not found at "%PG_BIN%"
  exit /b 1
)

if not exist "%PG_ISREADY%" (
  echo [ERROR] pg_isready not found at "%PG_ISREADY%"
  exit /b 1
)

if not exist "%PG_DATA%\PG_VERSION" (
  echo [ERROR] Postgres data directory not initialized: "%PG_DATA%"
  exit /b 1
)

"%PG_ISREADY%" -h 127.0.0.1 -p %PG_PORT% -d postgres >nul 2>&1
if not errorlevel 1 (
  echo [INFO] Postgres smoke DB is already accepting connections on port %PG_PORT%.
  exit /b 0
)

echo [INFO] Starting Postgres smoke DB on port %PG_PORT%...
echo [INFO] Waiting up to %PG_START_TIMEOUT% seconds for startup and crash recovery...
"%PG_BIN%" -D "%PG_DATA%" -o "-p %PG_PORT%" -l "%PG_LOG%" -W start
set "PG_CTL_EXIT=%ERRORLEVEL%"
if not "%PG_CTL_EXIT%"=="0" (
  echo [WARN] pg_ctl returned %PG_CTL_EXIT%; continuing to wait for readiness...
)

set /a PG_READY_WAIT=0
:wait_for_ready
"%PG_ISREADY%" -h 127.0.0.1 -p %PG_PORT% -d postgres >nul 2>&1
if not errorlevel 1 (
  echo [INFO] Postgres smoke DB is ready on port %PG_PORT%.
  exit /b 0
)

if %PG_READY_WAIT% GEQ %PG_START_TIMEOUT% goto :ready_timeout
timeout /t %PG_POLL_INTERVAL% /nobreak >nul
set /a PG_READY_WAIT+=PG_POLL_INTERVAL
goto wait_for_ready

:ready_timeout
echo [ERROR] Postgres smoke DB did not become ready within %PG_START_TIMEOUT% seconds.
exit /b 1
