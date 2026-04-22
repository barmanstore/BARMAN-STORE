#!/usr/bin/env bash
set -u

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
cd "$REPO_ROOT" || {
  echo "[ERROR] Failed to open repo root: \"$REPO_ROOT\""
  exit 1
}

DRY_RUN="${OPS_DRY_RUN:-0}"
PRIMARY_PROD_ALIAS="barmanstore.vercel.app"
EXTRA_PROD_ALIASES=("barman-store.vercel.app")

require_cmd() {
  command -v "$1" >/dev/null 2>&1 || {
    echo "[ERROR] $1 is not installed or not in PATH."
    return 1
  }
}

run_cmd() {
  if [[ "$DRY_RUN" == "1" ]]; then
    printf '[DRY-RUN]'
    printf ' %q' "$@"
    printf '\n'
    return 0
  fi
  "$@"
}

run_git() {
  require_cmd git || return 1
  run_cmd git "$@"
}

run_npm() {
  require_cmd node || return 1
  require_cmd npm || return 1
  run_cmd npm "$@"
}

run_npx() {
  require_cmd npx || return 1
  run_cmd npx "$@"
}

ensure_node_tools() {
  require_cmd node || return 1
  require_cmd npm || return 1
}

ensure_git_tool() {
  require_cmd git || return 1
}

ensure_dependencies() {
  ensure_node_tools || return 1
  if [[ ! -d node_modules ]]; then
    echo "[INFO] Installing dependencies..."
    run_npm install || return 1
    return 0
  fi
  echo "[OK] node_modules exists"
}

current_branch() {
  local branch
  branch="$(git rev-parse --abbrev-ref HEAD 2>/dev/null || true)"
  branch="${branch//$'\r'/}"
  if [[ -z "$branch" || "$branch" == "HEAD" ]]; then
    branch="main"
  fi
  printf '%s' "$branch"
}

default_git_remote() {
  local upstream=""
  local remote_name=""
  local remotes=()

  upstream="$(git rev-parse --abbrev-ref --symbolic-full-name @{u} 2>/dev/null || true)"
  upstream="${upstream//$'\r'/}"
  if [[ -n "$upstream" && "$upstream" != "@{u}" ]]; then
    remote_name="${upstream%%/*}"
    if [[ -n "$remote_name" ]]; then
      printf '%s' "$remote_name"
      return 0
    fi
  fi

  while IFS= read -r remote_name; do
    remote_name="${remote_name//$'\r'/}"
    [[ -n "$remote_name" ]] && remotes+=("$remote_name")
  done < <(git remote 2>/dev/null || true)

  for remote_name in "${remotes[@]}"; do
    if [[ "$remote_name" == "origin" ]]; then
      printf '%s' "$remote_name"
      return 0
    fi
  done

  if [[ ${#remotes[@]} -gt 0 ]]; then
    printf '%s' "${remotes[0]}"
    return 0
  fi

  echo "[ERROR] No git remote configured."
  return 1
}

resolve_git_remote() {
  local remote="${1:-}"
  if [[ -n "$remote" ]]; then
    printf '%s' "$remote"
    return 0
  fi

  default_git_remote
}

pause_prompt() {
  [[ -t 0 && -t 1 ]] || return 0
  printf '\n'
  read -r -p "Press Enter to return to menu..." _
}

confirm_or_abort() {
  local prompt="${1:-Type YES to continue: }"
  local answer=""

  if [[ ! -t 0 ]]; then
    echo "[INFO] Confirmation required, but no interactive terminal is available."
    return 1
  fi

  read -r -p "$prompt" answer
  if [[ "$answer" != "YES" ]]; then
    echo "[INFO] Cancelled."
    return 1
  fi

  return 0
}

run_node_script() {
  ensure_node_tools || return 1
  run_cmd node "$@"
}

show_banner() {
  if [[ -t 1 ]]; then
    clear >/dev/null 2>&1 || true
  fi
  cat <<'EOF'
========================================
BARMAN STORE - Linux Workbench
========================================
EOF
}

show_menu() {
  show_banner
  cat <<'EOF'
1. Git status
2. Git quick commit + push
3. Git pull
4. Health check (fast)
5. Health check (quick)
6. Health check (full)
7. DB connectivity check
8. Smoke suite (all)
9. Smoke cleanup (dry-run)
10. Smoke cleanup (delete all + verify)
11. Phone workflow smoke test
12. Order+billing workflow smoke test
13. PO lifecycle smoke test
14. Category tree smoke test
15. Credit history UI smoke test
16. Migrate DB (Supabase)
17. Route checks
18. API wrapper checks
19. Shell runtime contract check
20. Shell runtime contract tests
21. Secrets scan (staged)
22. Production build
23. Code cleanup (preview)
24. Code cleanup (apply)
25. Worktree cleanup (preview)
26. Worktree cleanup (apply)
27. Maintenance lint sweep
28. Stale code scan
29. Maintenance all
30. Deploy prepare
31. Deploy Vercel (prod)
32. Deploy Vercel (preview)
33. Deploy by git push
34. Smoke DB review
35. Exit
EOF
  printf '\n'
}

git_status() {
  ensure_git_tool || return 1
  run_cmd git status --short --branch || return 1
  printf '\n'
  run_cmd git log -n 5 --oneline || return 1
}

git_pull() {
  ensure_git_tool || return 1
  local remote
  remote="$(resolve_git_remote "${1:-}")" || return 1
  local branch="${2:-$(current_branch)}"
  echo "[INFO] Pulling latest changes from ${remote}/${branch} ..."
  run_cmd git pull "$remote" "$branch"
}

git_push() {
  ensure_git_tool || return 1
  local remote
  remote="$(resolve_git_remote "${1:-}")" || return 1
  local branch="${2:-$(current_branch)}"
  echo "[INFO] Pushing to ${remote}/${branch} ..."
  run_cmd git push "$remote" "$branch"
}

git_quick() {
  ensure_git_tool || return 1
  local message="${1:-}"
  local remote
  remote="$(resolve_git_remote "${2:-}")" || return 1
  local branch="${3:-$(current_branch)}"

  if [[ -z "$message" ]]; then
    if [[ -t 0 ]]; then
      read -r -p "Commit message: " message
    fi
  fi

  if [[ -z "$message" ]]; then
    echo "[ERROR] Commit message is required."
    return 1
  fi

  echo "[INFO] Staging changes..."
  run_cmd git add -A || return 1
  if git diff --cached --quiet >/dev/null 2>&1; then
    echo "[INFO] No staged changes detected; pushing current branch instead."
    echo "[INFO] Pushing to ${remote}/${branch} ..."
    run_cmd git push "$remote" "$branch" || return 1
    return 0
  fi
  echo "[INFO] Committing..."
  run_cmd git commit -m "$message" || return 1
  echo "[INFO] Pushing to ${remote}/${branch} ..."
  run_cmd git push "$remote" "$branch" || return 1
}

health_fast() {
  ensure_dependencies || return 1
  echo "========================================"
  echo "Health Check (Fast)"
  echo "========================================"
  echo "[1/2] Syntax check server/index.js..."
  run_cmd node --check server/index.js || return 1
  echo "[2/2] Scanning staged files for secret leaks..."
  run_npm run secrets:scan:staged || return 1
  echo "[SUCCESS] Fast health check passed."
}

health_quick() {
  ensure_dependencies || return 1
  echo "========================================"
  echo "Health Check (Quick)"
  echo "========================================"
  echo "[1/4] Syntax check server/index.js..."
  run_cmd node --check server/index.js || return 1
  echo "[2/4] Running phone workflow smoke test..."
  run_npm run test:phone || return 1
  echo "[3/4] Running order+billing workflow smoke test..."
  run_npm run test:order-flow || return 1
  echo "[4/4] Running credit history UI smoke test..."
  run_npm run test:credit-ui || return 1
  echo "[SUCCESS] Quick health check passed."
}

health_full() {
  ensure_dependencies || return 1
  echo "========================================"
  echo "Health Check (Full)"
  echo "========================================"
  echo "[1/8] Syntax check server/index.js..."
  run_cmd node --check server/index.js || return 1
  echo "[2/8] Syntax check server/supabaseAuthProvider.js..."
  run_cmd node --check server/supabaseAuthProvider.js || return 1
  echo "[3/8] Running phone workflow smoke test..."
  run_npm run test:phone || return 1
  echo "[4/8] Running order+billing workflow smoke test..."
  run_npm run test:order-flow || return 1
  echo "[5/8] Running credit history UI smoke test..."
  run_npm run test:credit-ui || return 1
  echo "[6/8] Running category tree smoke test..."
  run_npm run test:category-tree || return 1
  echo "[7/8] Scanning staged files for secret leaks..."
  run_npm run secrets:scan:staged || return 1
  echo "[8/8] Building production bundle..."
  run_npm run build || return 1
  echo "[SUCCESS] Full health check passed."
}

db_check() {
  ensure_node_tools || return 1
  run_npm run db:supabase:check || return 1
}

smoke_suite() {
  ensure_dependencies || return 1
  echo "========================================"
  echo "Smoke Suite"
  echo "========================================"
  run_npm run test:phone || return 1
  run_npm run test:order-flow || return 1
  run_npm run test:po-lifecycle || return 1
  run_npm run test:credit-ui || return 1
  run_npm run test:category-tree || return 1
  echo "[SUCCESS] Smoke suite passed."
}

smoke_cleanup_dry() {
  run_node_script scripts/cleanup-smoke-test-data.js || return 1
}

smoke_cleanup_apply_verify() {
  if ! confirm_or_abort "Type YES to delete all smoke test data and verify zero residue: "; then
    return 1
  fi
  run_node_script scripts/cleanup-smoke-test-data.js --apply || return 1
  run_node_script scripts/cleanup-smoke-test-data.js --fail-on-matches || return 1
  echo "[SUCCESS] Smoke cleanup verification passed (no residue found)."
}

smoke_db_review() {
  ensure_node_tools || return 1
  node scripts/smoke-db-review.mjs || return 1
}

phone_smoke() {
  ensure_node_tools || return 1
  run_npm run test:phone || return 1
}

order_flow_smoke() {
  ensure_node_tools || return 1
  run_npm run test:order-flow || return 1
}

po_lifecycle_smoke() {
  ensure_node_tools || return 1
  run_npm run test:po-lifecycle || return 1
}

category_tree_smoke() {
  ensure_node_tools || return 1
  run_npm run test:category-tree || return 1
}

credit_history_smoke() {
  ensure_node_tools || return 1
  run_npm run test:credit-ui || return 1
}

db_migrate() {
  ensure_node_tools || return 1
  run_npm run db:supabase:migrate || return 1
}

check_routes() {
  ensure_node_tools || return 1
  run_npm run check:routes || return 1
}

check_api_wrappers() {
  ensure_node_tools || return 1
  run_npm run check:api-wrappers || return 1
}

check_shell_runtime() {
  ensure_node_tools || return 1
  run_npm run check:shell-runtime || return 1
}

test_shell_runtime() {
  ensure_node_tools || return 1
  run_npm run test:shell-runtime || return 1
}

secrets_scan_staged() {
  ensure_node_tools || return 1
  run_npm run secrets:scan:staged || return 1
}

build_production() {
  ensure_node_tools || return 1
  run_npm run build || return 1
}

cleanup_code_preview() {
  ensure_node_tools || return 1
  run_npm run cleanup:code || return 1
}

cleanup_code_apply() {
  ensure_node_tools || return 1
  if ! confirm_or_abort "Type YES to delete build output and temp workspace artifacts: "; then
    return 1
  fi
  run_npm run cleanup:code:apply || return 1
}

cleanup_worktree_preview() {
  ensure_node_tools || return 1
  run_npm run cleanup:worktree || return 1
}

cleanup_worktree_apply() {
  ensure_node_tools || return 1
  if ! confirm_or_abort "Type YES to delete generated worktree artifacts: "; then
    return 1
  fi
  run_npm run cleanup:worktree:apply || return 1
}

maintenance_lint() {
  ensure_node_tools || return 1
  run_npm run maintenance:lint || return 1
}

maintenance_scan() {
  ensure_node_tools || return 1
  run_npm run maintenance:scan || return 1
}

maintenance_all() {
  ensure_node_tools || return 1
  run_npm run maintenance:all || return 1
}

deploy_prepare() {
  health_quick || return 1
  build_production || return 1
}

deploy_vercel_prod() {
  local log_file
  local latest_url=""
  local remote_url

  health_quick || return 1
  build_production || return 1

  echo "========================================"
  echo "Deploy to Vercel (prod)"
  echo "========================================"
  log_file="$(mktemp "${TMPDIR:-/tmp}/barman-deploy.prod.XXXXXX.log")"
  echo "[INFO] Writing log to \"$log_file\""

  if [[ "$DRY_RUN" == "1" ]]; then
    echo "[DRY-RUN] npx --yes vercel@50.26.0 --prod"
    echo "[DRY-RUN] npx --yes vercel@50.26.0 alias set <deployment-url> $PRIMARY_PROD_ALIAS"
    for remote_url in "${EXTRA_PROD_ALIASES[@]}"; do
      echo "[DRY-RUN] npx --yes vercel@50.26.0 alias set <deployment-url> $remote_url"
    done
    return 0
  fi

  if ! npx --yes vercel@50.26.0 --prod 2>&1 | tee "$log_file"; then
    echo "[ERROR] Vercel deploy failed. Review \"$log_file\""
    return 1
  fi

  latest_url="$(grep -Eo 'https://[^[:space:]]*vercel\.app[^[:space:]]*' "$log_file" | tail -n1 || true)"
  latest_url="${latest_url%%[).,;]}"
  latest_url="${latest_url%/}"

  if [[ -z "$latest_url" ]]; then
    echo "[WARN] Could not detect production URL from log. Skipping alias update."
    return 0
  fi

  echo "[INFO] Updating production aliases to $latest_url"
  run_npx --yes vercel@50.26.0 alias set "$latest_url" "$PRIMARY_PROD_ALIAS" || true
  for remote_url in "${EXTRA_PROD_ALIASES[@]}"; do
    run_npx --yes vercel@50.26.0 alias set "$latest_url" "$remote_url" || true
  done
}

deploy_vercel_preview() {
  health_quick || return 1
  build_production || return 1
  echo "========================================"
  echo "Deploy to Vercel (preview)"
  echo "========================================"
  if [[ "$DRY_RUN" == "1" ]]; then
    echo "[DRY-RUN] npx --yes vercel@50.26.0"
    return 0
  fi
  run_npx --yes vercel@50.26.0 || return 1
}

deploy_git() {
  ensure_git_tool || return 1
  health_quick || return 1
  local remote
  remote="$(resolve_git_remote "${1:-}")" || return 1
  local branch="${2:-$(current_branch)}"
  echo "[INFO] Pushing to ${remote}/${branch} ..."
  run_cmd git push "$remote" "$branch" || return 1
}

dispatch_choice() {
  local choice="${1:-}"

  case "$choice" in
    1|git:status|git-status|status)
      git_status
      ;;
    2|git:quick|git-quick)
      git_quick "${2:-}" "${3:-}" "${4:-}"
      ;;
    3|git:pull|git-pull)
      git_pull "${2:-}" "${3:-}"
      ;;
    4|health:fast|health-fast)
      health_fast
      ;;
    5|health:quick|health-quick)
      health_quick
      ;;
    6|health:full|health-full)
      health_full
      ;;
    7|db:check|db-check|db:supabase:check)
      db_check
      ;;
    8|smoke|smoke:all)
      smoke_suite
      ;;
    9|smoke:cleanup|smoke-cleanup|cleanup:smoke)
      smoke_cleanup_dry
      ;;
    10|smoke:cleanup:verify|cleanup:smoke:verify)
      smoke_cleanup_apply_verify
      ;;
    11|test:phone|phone-smoke)
      phone_smoke
      ;;
    12|test:order-flow|order-flow-smoke)
      order_flow_smoke
      ;;
    13|test:po-lifecycle|po-lifecycle-smoke)
      po_lifecycle_smoke
      ;;
    14|test:category-tree|category-tree-smoke)
      category_tree_smoke
      ;;
    15|test:credit-ui|credit-history-smoke)
      credit_history_smoke
      ;;
    16|db:migrate|migrate|db-migrate)
      db_migrate
      ;;
    17|check:routes|routes-check)
      check_routes
      ;;
    18|check:api-wrappers|api-wrappers-check)
      check_api_wrappers
      ;;
    19|check:shell-runtime|shell-runtime-check)
      check_shell_runtime
      ;;
    20|test:shell-runtime|shell-runtime-test)
      test_shell_runtime
      ;;
    21|secrets:scan:staged|secrets-scan-staged)
      secrets_scan_staged
      ;;
    22|build|production-build)
      build_production
      ;;
    23|cleanup:code|code-cleanup)
      cleanup_code_preview
      ;;
    24|cleanup:code:apply|code-cleanup-apply)
      cleanup_code_apply
      ;;
    25|cleanup:worktree|worktree-cleanup)
      cleanup_worktree_preview
      ;;
    26|cleanup:worktree:apply|worktree-cleanup-apply)
      cleanup_worktree_apply
      ;;
    27|maintenance:lint|maintenance-lint)
      maintenance_lint
      ;;
    28|maintenance:scan|maintenance-scan)
      maintenance_scan
      ;;
    29|maintenance:all|maintenance-all|maintenance)
      maintenance_all
      ;;
    30|deploy:prepare|deploy-prepare)
      deploy_prepare
      ;;
    31|deploy:vercel:prod|deploy-vercel-prod)
      deploy_vercel_prod
      ;;
    32|deploy:vercel:preview|deploy-vercel-preview)
      deploy_vercel_preview
      ;;
    33|deploy:git|deploy-git)
      deploy_git "${2:-}" "${3:-}"
      ;;
    34|smoke:review|smoke-review)
      smoke_db_review
      ;;
    *)
      echo "[ERROR] Unknown command or menu choice: $choice"
      return 2
      ;;
  esac
}

run_menu() {
  while true; do
    show_menu
    read -r -p "Select option [1-35]: " choice
    case "$choice" in
      ""|help|menu)
        continue
        ;;
    q|quit|exit|35)
      return 0
      ;;
    esac
    dispatch_choice "$choice"
    local status=$?
    if [[ $status -ne 0 ]]; then
      echo "[ERROR] Command failed with status $status."
      pause_prompt
      continue
    fi
    pause_prompt
  done
}

if [[ $# -eq 0 ]]; then
  run_menu
  exit $?
fi

case "$1" in
  ""|help|menu)
    show_menu
    exit 0
    ;;
  q|quit|exit)
    exit 0
    ;;
esac

dispatch_choice "$1" "${2:-}" "${3:-}" "${4:-}"
status=$?
if [[ $status -ne 0 ]]; then
  echo "[ERROR] Command failed with status $status."
fi
exit "$status"
