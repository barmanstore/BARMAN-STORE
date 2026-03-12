@echo off
setlocal
set "NON_INTERACTIVE="
if not "%~1"=="" (
  set "NON_INTERACTIVE=1"
  set "CHOICE=%~1"
  goto :dispatch
)

:menu
cls
echo ========================================
echo BARMAN STORE - Workbench
echo ========================================
echo 1. Git quick commit + push
echo 2. Deploy prepare
echo 3. Deploy Vercel (prod)
echo 4. Deploy Vercel (preview)
echo 5. Deploy by git push (origin main)
echo 6. Smoke suite (all)
echo 7. Smoke cleanup (dry-run)
echo 8. Smoke cleanup (delete all + verify)
echo 9. Smoke suite + cleanup
echo 10. Code cleanup (preview)
echo 11. Code cleanup (apply)
echo 12. Git status
echo 13. Transaction history smoke test
echo 14. Health check (quick)
echo 15. Health check (full)
echo 16. Migrate DB (Supabase)
echo 17. Exit
echo.
set "CHOICE="
set /p CHOICE=Select option [1-17]: 
if errorlevel 1 goto :done

:dispatch
if "%CHOICE%"=="1" goto :git_quick
if "%CHOICE%"=="2" goto :deploy_prepare
if "%CHOICE%"=="3" goto :deploy_vercel_prod
if "%CHOICE%"=="4" goto :deploy_vercel_preview
if "%CHOICE%"=="5" goto :deploy_git
if "%CHOICE%"=="6" goto :smoke_suite_all
if "%CHOICE%"=="7" goto :smoke_cleanup_dry
if "%CHOICE%"=="8" goto :smoke_cleanup_all_apply_verify
if "%CHOICE%"=="9" goto :smoke_suite_and_cleanup
if "%CHOICE%"=="10" goto :code_cleanup_preview
if "%CHOICE%"=="11" goto :code_cleanup_apply
if "%CHOICE%"=="12" goto :git_status
if "%CHOICE%"=="13" goto :transaction_history_smoke
if "%CHOICE%"=="14" goto :health_quick
if "%CHOICE%"=="15" goto :health_full
if "%CHOICE%"=="16" goto :db_migrate
if "%CHOICE%"=="17" goto :done
if "%CHOICE%"=="" goto :menu
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

:db_migrate
call npm run db:supabase:migrate
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

:smoke_suite_all
call :run_smoke_suite
goto :pause_and_menu

:smoke_cleanup_dry
node "%~dp0..\cleanup-smoke-test-data.js"
goto :pause_and_menu

:smoke_cleanup_apply
set "CONFIRM="
set /p CONFIRM=Type YES to delete smoke test data from DB: 
if /i not "%CONFIRM%"=="YES" goto :pause_and_menu
node "%~dp0..\cleanup-smoke-test-data.js" --apply
goto :pause_and_menu

:transaction_history_smoke
call npm run test:credit-ui
goto :pause_and_menu

:smoke_cleanup_all_apply_verify
set "CONFIRM="
set /p CONFIRM=Type YES to delete all smoke test data and verify zero residue: 
if /i not "%CONFIRM%"=="YES" goto :pause_and_menu
node "%~dp0..\cleanup-smoke-test-data.js" --apply || goto :pause_and_menu
node "%~dp0..\cleanup-smoke-test-data.js" --fail-on-matches || goto :pause_and_menu
echo [SUCCESS] Smoke cleanup verification passed (no residue found).
goto :pause_and_menu

:smoke_suite_and_cleanup
call :run_smoke_suite
if errorlevel 1 goto :pause_and_menu
node "%~dp0..\cleanup-smoke-test-data.js" --apply || goto :pause_and_menu
node "%~dp0..\cleanup-smoke-test-data.js" --fail-on-matches || goto :pause_and_menu
echo [SUCCESS] Smoke suite finished and residue cleanup verified.
goto :pause_and_menu

:code_cleanup_preview
call npm run cleanup:code
goto :pause_and_menu

:code_cleanup_apply
set "CONFIRM="
set /p CONFIRM=Type YES to delete build output and temp workspace artifacts: 
if /i not "%CONFIRM%"=="YES" goto :pause_and_menu
call npm run cleanup:code:apply
goto :pause_and_menu

:run_smoke_suite
call npm test || exit /b 1
exit /b 0

:pause_and_menu
echo.
if /i "%NON_INTERACTIVE%"=="1" goto :done
pause
goto :menu

:done
exit /b 0
