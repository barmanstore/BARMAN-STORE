#!/usr/bin/env node
import { chmodSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { platform } from 'node:os';
import { spawnSync } from 'node:child_process';

const run = (cmd, args, options = {}) => spawnSync(cmd, args, {
  stdio: 'pipe',
  encoding: 'utf8',
  ...options,
});

const ensureGitRepo = () => {
  const check = run('git', ['rev-parse', '--is-inside-work-tree']);
  return check.status === 0 && String(check.stdout || '').trim() === 'true';
};

if (!ensureGitRepo()) {
  console.log('[hooks] Skipped: not inside a git worktree.');
  process.exit(0);
}

const setHooksPath = run('git', ['config', 'core.hooksPath', '.githooks'], { stdio: 'inherit' });
if (setHooksPath.status !== 0) {
  console.error('[hooks] Failed to set core.hooksPath to .githooks');
  process.exit(setHooksPath.status || 1);
}

if (platform() !== 'win32') {
  const hookFiles = ['pre-commit', 'pre-push'];
  for (const name of hookFiles) {
    const hookPath = join('.githooks', name);
    if (existsSync(hookPath)) {
      try {
        chmodSync(hookPath, 0o755);
      } catch (_) {
        // Non-fatal on restricted filesystems.
      }
    }
  }
}

console.log('[hooks] Installed. Git hooks path is .githooks');
