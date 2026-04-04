@echo off
setlocal
set "REPO_ROOT=%~dp0..\.."
pushd "%REPO_ROOT%" || (
  echo [ERROR] Failed to open repo root: "%REPO_ROOT%"
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
set "NON_INTERACTIVE="
if not "%~1"=="" (
  set "NON_INTERACTIVE=1"
  set "CHOICE=%~1"
  set "ARG2=%~2"
  goto :dispatch
)
if /i "%OPS_INTERACTIVE%"=="1" set "NON_INTERACTIVE="

:menu
cls
echo ========================================
echo BARMAN STORE - Workbench
echo ========================================
echo 1. Git quick commit + push
echo 2. Git status
echo 3. Health check (fast)
echo 4. Health check (quick)
echo 5. Health check (full)
echo 6. Secrets scan (staged)
echo 7. Production build
echo 8. Deploy prepare
echo 9. Deploy Vercel (prod)
echo 10. Deploy Vercel (preview)
echo 11. Deploy by git push (origin main)
echo 12. Start smoke Postgres
echo 13. Stop smoke Postgres
echo 14. Smoke suite (all)
echo 15. Smoke cleanup (dry-run)
echo 16. Smoke cleanup (delete all + verify)
echo 17. Smoke suite + cleanup
echo 18. Phone workflow smoke test
echo 19. Order+billing workflow smoke test
echo 20. PO lifecycle smoke test
echo 21. Category tree smoke test
echo 22. Credit history UI smoke test
echo 23. Migrate DB (Supabase)
echo 24. Code cleanup (preview)
echo 25. Code cleanup (apply)
echo 26. Worktree cleanup (preview)
echo 27. Worktree cleanup (apply)
echo 28. Exit
echo.
set "CHOICE="
set /p CHOICE=Select option [1-28]: 

:dispatch
if "%CHOICE%"=="1" goto :git_quick
if "%CHOICE%"=="2" goto :git_status
if "%CHOICE%"=="3" goto :health_fast
if "%CHOICE%"=="4" goto :health_quick
if "%CHOICE%"=="5" goto :health_full
if "%CHOICE%"=="6" goto :secrets_scan_staged
if "%CHOICE%"=="7" goto :build_production
if "%CHOICE%"=="8" goto :deploy_prepare
if "%CHOICE%"=="9" goto :deploy_vercel_prod
if "%CHOICE%"=="10" goto :deploy_vercel_preview
if "%CHOICE%"=="11" goto :deploy_git
if "%CHOICE%"=="12" goto :smoke_postgres_start
if "%CHOICE%"=="13" goto :smoke_postgres_stop
if "%CHOICE%"=="14" goto :smoke_suite_all
if "%CHOICE%"=="15" goto :smoke_cleanup_dry
if "%CHOICE%"=="16" goto :smoke_cleanup_all_apply_verify
if "%CHOICE%"=="17" goto :smoke_suite_and_cleanup
if "%CHOICE%"=="18" goto :phone_smoke
if "%CHOICE%"=="19" goto :order_flow_smoke
if "%CHOICE%"=="20" goto :po_lifecycle_smoke
if "%CHOICE%"=="21" goto :category_tree_smoke
if "%CHOICE%"=="22" goto :credit_history_smoke
if "%CHOICE%"=="23" goto :db_migrate
if "%CHOICE%"=="24" goto :code_cleanup_preview
if "%CHOICE%"=="25" goto :code_cleanup_apply
if "%CHOICE%"=="26" goto :wt_cleanup_preview
if "%CHOICE%"=="27" goto :wt_cleanup_apply
if "%CHOICE%"=="28" goto :done
if "%CHOICE%"=="" goto :menu
goto :menu

:git_status
call "%~dp0git-maintain.bat" status
goto :pause_and_menu

:git_quick
set "MSG="
if /i "%NON_INTERACTIVE%"=="1" (
  set "MSG=%ARG2%"
) else (
  set /p MSG=Commit message: 
)
if "%MSG%"=="" (
  if /i "%NON_INTERACTIVE%"=="1" (
    echo [ERROR] Commit message is required for non-interactive git quick mode.
    goto :done
  )
  goto :menu
)
call "%~dp0git-maintain.bat" quick "%MSG%" origin main
goto :pause_and_menu

:health_fast
call "%~dp0health-check.bat" fast
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

:smoke_postgres_start
call "%~dp0postgres-smoke-start.bat"
goto :pause_and_menu

:smoke_postgres_stop
call "%~dp0postgres-smoke-stop.bat"
goto :pause_and_menu

:smoke_suite_all
call "%~dp0health-check.bat" smoke
goto :pause_and_menu

:smoke_cleanup_dry
node "%~dp0..\cleanup-smoke-test-data.js"
goto :pause_and_menu

:smoke_cleanup_apply
call :confirm_or_abort "Type YES to delete smoke test data from DB: " || goto :pause_and_menu
node "%~dp0..\cleanup-smoke-test-data.js" --apply
goto :pause_and_menu

:transaction_history_smoke
:credit_history_smoke
call npm run test:credit-ui
goto :pause_and_menu

:smoke_cleanup_all_apply_verify
call :confirm_or_abort "Type YES to delete all smoke test data and verify zero residue: " || goto :pause_and_menu
node "%~dp0..\cleanup-smoke-test-data.js" --apply || goto :pause_and_menu
node "%~dp0..\cleanup-smoke-test-data.js" --fail-on-matches || goto :pause_and_menu
echo [SUCCESS] Smoke cleanup verification passed (no residue found).
goto :pause_and_menu

:smoke_suite_and_cleanup
call "%~dp0health-check.bat" smoke || goto :pause_and_menu
 node "%~dp0..\cleanup-smoke-test-data.js" --apply || goto :pause_and_menu
 node "%~dp0..\cleanup-smoke-test-data.js" --fail-on-matches || goto :pause_and_menu
 echo [SUCCESS] Smoke suite finished and residue cleanup verified.
 goto :pause_and_menu

:code_cleanup_preview
call npm run cleanup:code
goto :pause_and_menu

:code_cleanup_apply
call :confirm_or_abort "Type YES to delete build output and temp workspace artifacts: " || goto :pause_and_menu
call npm run cleanup:code:apply
goto :pause_and_menu

:wt_cleanup_preview
call npm run cleanup:worktree
goto :pause_and_menu

:wt_cleanup_apply
call :confirm_or_abort "Type YES to delete generated worktree artifacts: " || goto :pause_and_menu
call npm run cleanup:worktree:apply
goto :pause_and_menu

:phone_smoke
call npm run test:phone
goto :pause_and_menu

:order_flow_smoke
call npm run test:order-flow
goto :pause_and_menu

:po_lifecycle_smoke
call npm run test:po-lifecycle
goto :pause_and_menu

:category_tree_smoke
call npm run test:category-tree
goto :pause_and_menu

:secrets_scan_staged
call npm run secrets:scan:staged
goto :pause_and_menu

:build_production
call npm run build
goto :pause_and_menu

:confirm_or_abort
set "CONFIRM="
if /i "%NON_INTERACTIVE%"=="1" (
  if /i "%ARG2%"=="YES" exit /b 0
  echo [INFO] Confirmation required. Re-run with YES as the second argument.
  exit /b 1
)
set /p CONFIRM=%~1
if /i "%CONFIRM%"=="YES" exit /b 0
echo [INFO] Cancelled.
exit /b 1

:pause_and_menu
echo.
if /i "%NON_INTERACTIVE%"=="1" goto :done
pause
goto :menu

:done
popd
exit /b 0
