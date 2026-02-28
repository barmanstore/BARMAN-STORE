@echo off
setlocal

:menu
cls
echo ========================================
echo BARMAN STORE - Workbench
echo ========================================
echo 1. Git status
echo 2. Git quick commit + push
echo 3. Health check (quick)
echo 4. Health check (full)
echo 5. Deploy prepare
echo 6. Deploy Vercel (prod)
echo 7. Deploy Vercel (preview)
echo 8. Deploy by git push (origin main)
echo 9. Exit
echo.
set /p CHOICE=Select option [1-9]: 

if "%CHOICE%"=="1" goto :git_status
if "%CHOICE%"=="2" goto :git_quick
if "%CHOICE%"=="3" goto :health_quick
if "%CHOICE%"=="4" goto :health_full
if "%CHOICE%"=="5" goto :deploy_prepare
if "%CHOICE%"=="6" goto :deploy_vercel_prod
if "%CHOICE%"=="7" goto :deploy_vercel_preview
if "%CHOICE%"=="8" goto :deploy_git
if "%CHOICE%"=="9" goto :done
goto :menu

:git_status
call "%~dp0git-maintain.bat" status
goto :pause_and_menu

:git_quick
set "MSG="
set /p MSG=Commit message: 
if "%MSG%"=="" goto :menu
call "%~dp0git-maintain.bat" quick "%MSG%" origin main
goto :pause_and_menu

:health_quick
call "%~dp0health-check.bat" quick
goto :pause_and_menu

:health_full
call "%~dp0health-check.bat" full
goto :pause_and_menu

:deploy_prepare
call "%~dp0deploy.bat" prepare
goto :pause_and_menu

:deploy_vercel_prod
call "%~dp0deploy.bat" vercel prod
goto :pause_and_menu

:deploy_vercel_preview
call "%~dp0deploy.bat" vercel preview
goto :pause_and_menu

:deploy_git
call "%~dp0deploy.bat" git origin main
goto :pause_and_menu

:pause_and_menu
echo.
pause
goto :menu

:done
exit /b 0
