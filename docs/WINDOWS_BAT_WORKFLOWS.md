# Windows Batch Workflows

This project now includes Windows automation scripts in:

- `scripts/windows/git-maintain.bat`
- `scripts/windows/health-check.bat`
- `scripts/windows/deploy.bat`
- `scripts/windows/workbench.bat` (interactive menu)

## 1) Git and GitHub maintenance

### Show status

```bat
scripts\windows\git-maintain.bat status
```

### Commit only

```bat
scripts\windows\git-maintain.bat commit "fix: update profile flow"
```

### Push only

```bat
scripts\windows\git-maintain.bat push origin main
```

### Commit + push in one command

```bat
scripts\windows\git-maintain.bat quick "feat: add batch automation" origin main
```

## 2) Health checks (project maintenance)

### Quick checks (recommended before every push)

```bat
scripts\windows\health-check.bat quick
```

Runs:

- dependency check/install if needed
- `node --check server/index.js`
- `npm run test:phone`
- `npm run test:order-flow`
- `npm run test:credit-ui`
  Notes:
  The health-check script now tries to start the local smoke Postgres cluster first. It only falls back to the embedded Postgres runner if you set `ALLOW_EMBEDDED_SMOKE_DB=1`. For `npm run smoke:local:*`, you can force the embedded runner by setting `LOCAL_SMOKE_DB_FORCE_EMBEDDED=1`.

### Smoke suite only

```bat
scripts\windows\health-check.bat smoke
```

Runs:

- dependency check/install if needed
- `npm run test:phone`
- `npm run test:order-flow`
- `npm run test:po-lifecycle`
- `npm run test:credit-ui`
- `npm run test:category-tree`

### Full checks (recommended before release)

```bat
scripts\windows\health-check.bat full
```

Runs quick checks plus:

- `node --check server/supabaseAuthProvider.js`
- `npm run secrets:scan:staged`
- `npm run build`

## 3) Deploy workflows

### Prepare only (validate + build)

```bat
scripts\windows\deploy.bat prepare
```

### Deploy to Vercel production

```bat
scripts\windows\deploy.bat vercel prod
```

### Deploy to Vercel preview

```bat
scripts\windows\deploy.bat vercel preview
```

### Deploy via Git push (for Git-based CI/CD)

```bat
scripts\windows\deploy.bat git origin main
```

## 4) Interactive mode

Open menu:

```bat
scripts\windows\workbench.bat
```

Use this if you prefer selecting options instead of remembering commands.

Notable maintenance entries in the workbench:

- smoke suite and individual smoke-test runners
- smoke cleanup dry-run / apply + verify
- code cleanup preview / apply
- worktree cleanup preview / apply
- maintenance lint sweep
- stale code scan
- full maintenance bundle
- staged secret scan
- production build

The smoke Postgres helper on option 12 checks whether the persistent cluster at `C:\Users\naren\pgdata\smoke` is already accepting connections, then waits up to 300 seconds for startup and crash recovery so a slow recovery does not fail the menu action prematurely.

## 5) Cleanup helpers

### Code cleanup

```bat
npm run cleanup:code
npm run cleanup:code:apply
```

Targets build output and common code-generation temp artifacts.

### Worktree cleanup

```bat
npm run cleanup:worktree
npm run cleanup:worktree:apply
```

Targets generated workspace artifacts such as cache directories, reports, `.vs`, and nested Vite caches without touching tracked files.

### Maintenance lint sweep

```bat
npm run maintenance:lint
```

Runs the full `src` ESLint pass followed by the CSS Stylelint pass.

### Stale code scan

```bat
npm run maintenance:scan
```

Scans `src`, `server`, and `scripts` for obvious stale markers like `TODO`, `FIXME`, `XXX`, or `commented out`, and flags known generated artifacts at the repo root if they reappear.

### Full maintenance bundle

```bat
npm run maintenance:all
```

Runs both maintenance checks in sequence.

## Recommended procedure

1. Run quick health check:

```bat
scripts\windows\health-check.bat quick
```

2. Commit and push:

```bat
scripts\windows\git-maintain.bat quick "your message" origin main
```

3. Deploy:

```bat
scripts\windows\deploy.bat vercel prod
```

## Notes

- Run commands from repository root in PowerShell or Command Prompt.
- For Vercel deploy, ensure you are logged in (`npx vercel login`) at least once.
- If a step fails, the script stops with non-zero exit code to prevent partial workflows.
