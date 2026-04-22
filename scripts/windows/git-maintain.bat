@echo off
setlocal enabledelayedexpansion

for %%I in ("%~dp0..\..") do set "REPO_ROOT=%%~fI"
pushd "%REPO_ROOT%" >nul 2>&1
if errorlevel 1 (
  echo [ERROR] Could not open repository root: "%REPO_ROOT%"
  exit /b 1
)

git --version >nul 2>&1
if errorlevel 1 (
  echo [ERROR] Git is not installed or not in PATH.
  popd
  exit /b 1
)

set "CMD=%~1"
if /i "%CMD%"=="" goto :help_success
if /i "%CMD%"=="help" goto :help_success
if /i "%CMD%"=="status" goto :status
if /i "%CMD%"=="pull" goto :pull
if /i "%CMD%"=="commit" goto :commit
if /i "%CMD%"=="push" goto :push
if /i "%CMD%"=="quick" goto :quick

echo [ERROR] Unknown command: %CMD%
echo.
goto :help_error

:status
git status --short --branch
if errorlevel 1 goto :git_failed
echo.
git log -n 5 --oneline
if errorlevel 1 goto :git_failed
goto :success

:run_git
set "ACTION=%~1"
set "COMMAND_LINE=git %~2 %~3 %4 %5 %6 %7 %8 %9"
if /i "%OPS_DRY_RUN%"=="1" (
  echo [DRY-RUN] %ACTION%
  echo [DRY-RUN] %COMMAND_LINE%
  exit /b 0
)
git %~2 %~3 %4 %5 %6 %7 %8 %9
exit /b %errorlevel%

:pull
set "REMOTE=%~2"
set "BRANCH=%~3"
if "%REMOTE%"=="" set "REMOTE=origin"
if "%BRANCH%"=="" (
  for /f %%B in ('git rev-parse --abbrev-ref HEAD') do set "BRANCH=%%B"
)
echo [INFO] Pulling latest changes from %REMOTE%/%BRANCH% ...
call :run_git "Pull latest changes" pull %REMOTE% %BRANCH%
if errorlevel 1 goto :git_failed
goto :success

:commit
set "MSG=%~2"
if "%MSG%"=="" (
  echo [ERROR] Commit message is required.
  echo Example: git-maintain.bat commit "fix: update oauth flow"
  goto :end_error
)
echo [INFO] Staging all tracked and untracked changes...
call :run_git "Stage all changes" add -A
if errorlevel 1 goto :git_failed
echo [INFO] Creating commit...
call :run_git "Create commit" commit -m "%MSG%"
if errorlevel 1 goto :git_failed
goto :success

:push
set "REMOTE=%~2"
set "BRANCH=%~3"
if "%REMOTE%"=="" set "REMOTE=origin"
if "%BRANCH%"=="" (
  for /f %%B in ('git rev-parse --abbrev-ref HEAD') do set "BRANCH=%%B"
)
echo [INFO] Pushing to %REMOTE%/%BRANCH% ...
call :run_git "Push changes" push %REMOTE% %BRANCH%
if errorlevel 1 goto :git_failed
goto :success

:quick
set "MSG=%~2"
set "REMOTE=%~3"
set "BRANCH=%~4"
if "%MSG%"=="" (
  echo [ERROR] Commit message is required.
  echo Example: git-maintain.bat quick "feat: add health checks" origin main
  goto :end_error
)
if "%REMOTE%"=="" set "REMOTE=origin"
if "%BRANCH%"=="" (
  for /f %%B in ('git rev-parse --abbrev-ref HEAD') do set "BRANCH=%%B"
)
echo [INFO] Staging changes...
call :run_git "Stage all changes" add -A
if errorlevel 1 goto :git_failed
echo [INFO] Committing...
call :run_git "Create commit" commit -m "%MSG%"
if errorlevel 1 goto :git_failed
echo [INFO] Pushing to %REMOTE%/%BRANCH% ...
call :run_git "Push changes" push %REMOTE% %BRANCH%
if errorlevel 1 goto :git_failed
goto :success

:git_failed
echo [ERROR] Git command failed.
goto :end_error

:help_text
echo ========================================
echo Git Maintenance Utility
echo ========================================
echo Usage:
echo   git-maintain.bat status
echo   git-maintain.bat pull [remote] [branch]
echo   git-maintain.bat commit "message"
echo   git-maintain.bat push [remote] [branch]
echo   git-maintain.bat quick "message" [remote] [branch]
echo.
echo Examples:
echo   git-maintain.bat status
echo   git-maintain.bat commit "fix: login redirect on mobile"
echo   git-maintain.bat push origin main
echo   git-maintain.bat quick "feat: add batch scripts" origin main
goto :eof

:help_success
call :help_text
goto :success

:help_error
call :help_text
goto :end_error

:success
popd
exit /b 0

:end_error
popd
exit /b 1
