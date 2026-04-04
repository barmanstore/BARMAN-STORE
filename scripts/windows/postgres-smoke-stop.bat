@echo off
setlocal

set "PG_BIN=C:\Program Files\PostgreSQL\16\bin\pg_ctl.exe"
set "PG_DATA=C:\Users\naren\pgdata\smoke"

if not exist "%PG_BIN%" (
  echo [ERROR] pg_ctl not found at "%PG_BIN%"
  exit /b 1
)

if not exist "%PG_DATA%\PG_VERSION" (
  echo [ERROR] Postgres data directory not initialized: "%PG_DATA%"
  exit /b 1
)

echo [INFO] Stopping Postgres smoke DB...
"%PG_BIN%" -D "%PG_DATA%" stop
exit /b %ERRORLEVEL%
