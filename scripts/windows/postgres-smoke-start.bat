@echo off
setlocal

set "PG_BIN=C:\Program Files\PostgreSQL\16\bin\pg_ctl.exe"
set "PG_DATA=C:\Users\naren\pgdata\smoke"
set "PG_PORT=55433"
set "PG_LOG=%~dp0..\..\tmp.pg.log"

if not exist "%PG_BIN%" (
  echo [ERROR] pg_ctl not found at "%PG_BIN%"
  exit /b 1
)

if not exist "%PG_DATA%\PG_VERSION" (
  echo [ERROR] Postgres data directory not initialized: "%PG_DATA%"
  exit /b 1
)

echo [INFO] Starting Postgres smoke DB on port %PG_PORT%...
"%PG_BIN%" -D "%PG_DATA%" -o "-p %PG_PORT%" -l "%PG_LOG%" start
exit /b %ERRORLEVEL%
