# Linux Bash Workflows

This project includes a Linux-native maintenance dashboard in:

- `ops.sh`
- `scripts/linux/workbench.sh`

Use it from a Linux shell with:

```bash
./ops.sh
```

or direct commands such as:

```bash
./ops.sh maintenance:all
./ops.sh db:migrate
./ops.sh deploy:vercel:prod
./ops.sh smoke:review
```

## What It Covers

The Linux dashboard is the shell counterpart to the Windows batch workflow and can run:

- git maintenance
- health checks
- smoke tests
- smoke cleanup
- DB migration
- route and API contract checks
- shell runtime checks
- secrets scan
- code and worktree cleanup
- maintenance lint and stale scans
- production build
- deploy prepare and Vercel deploy commands
- smoke DB review for DBeaver

The `smoke:review` action prints the local smoke-suite database target so you can open the same data set in DBeaver after a smoke run.

## Notes

- It expects `bash`, `node`, `npm`, `git`, and `npx` to be available.
- Shared Supabase values stay in `.env`; localhost-only overrides stay in `.env.local`.
- The Windows-only smoke Postgres start/stop helpers are not part of the Linux dashboard. Use the smoke tests and cleanup commands instead.
- `OPS_DRY_RUN=1` prints commands instead of running them for destructive workflows.
