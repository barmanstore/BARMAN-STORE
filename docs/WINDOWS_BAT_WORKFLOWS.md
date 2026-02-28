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
- `npm run test:credit-ui`

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
