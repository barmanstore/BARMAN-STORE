#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const repoRoot = path.resolve(__dirname, '..');
const args = new Set(process.argv.slice(2));
const apply = args.has('--apply');

const ROOT_EXACT_TARGETS = [
  '.tmp',
  'dist',
  'coverage',
  '.nyc_output',
  '.eslintcache',
  '.stylelintcache',
  '.vite',
  '.cache',
  '.turbo',
  '.vs',
  'playwright-report',
  'test-results',
  'tmp.workbench.input.txt',
];

const NESTED_EXACT_TARGETS = [
  'node_modules/.vite',
  'node_modules/.cache',
  '.vercel/output',
];

const ROOT_PREFIX_PATTERNS = [
  /^tmp\..+$/,
  /^npm-debug\.log.*$/i,
  /^yarn-debug\.log.*$/i,
  /^yarn-error\.log.*$/i,
  /^pnpm-debug\.log.*$/i,
];

const targets = [];
const seenTargets = new Set();
const TRANSIENT_REMOVE_ERROR_CODES = new Set(['EBUSY', 'ENOTEMPTY', 'EPERM']);
const REMOVE_RETRY_ATTEMPTS = 6;
const REMOVE_RETRY_DELAY_MS = 150;

const sleep = (milliseconds) => {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, milliseconds);
};

const addTarget = (label, targetPath) => {
  const resolvedPath = path.resolve(targetPath);
  if (!fs.existsSync(resolvedPath)) return;
  if (seenTargets.has(resolvedPath)) return;
  seenTargets.add(resolvedPath);
  targets.push({
    label,
    path: resolvedPath,
  });
};

const collectTargets = () => {
  ROOT_EXACT_TARGETS.forEach((name) => {
    addTarget(name, path.join(repoRoot, name));
  });

  NESTED_EXACT_TARGETS.forEach((name) => {
    addTarget(name, path.join(repoRoot, name));
  });

  const rootEntries = fs.readdirSync(repoRoot, { withFileTypes: true });
  rootEntries.forEach((entry) => {
    const name = String(entry.name || '');
    if (ROOT_EXACT_TARGETS.includes(name)) return;
    if (!ROOT_PREFIX_PATTERNS.some((pattern) => pattern.test(name))) return;
    addTarget(name, path.join(repoRoot, name));
  });
};

const formatTargetType = (targetPath) => {
  try {
    return fs.statSync(targetPath).isDirectory() ? 'dir ' : 'file';
  } catch (_) {
    return 'file';
  }
};

const removeTarget = (targetPath) => {
  let lastError = null;

  for (let attempt = 1; attempt <= REMOVE_RETRY_ATTEMPTS; attempt += 1) {
    try {
      fs.rmSync(targetPath, {
        recursive: true,
        force: true,
        maxRetries: 4,
        retryDelay: 80,
      });
      return;
    } catch (error) {
      lastError = error;
      const shouldRetry = TRANSIENT_REMOVE_ERROR_CODES.has(error?.code);
      const hasAttemptsLeft = attempt < REMOVE_RETRY_ATTEMPTS;
      if (!shouldRetry || !hasAttemptsLeft) break;
      sleep(REMOVE_RETRY_DELAY_MS * attempt);
    }
  }

  throw lastError;
};

collectTargets();

if (targets.length === 0) {
  console.log('[INFO] No worktree cleanup targets found.');
  process.exit(0);
}

console.log(apply ? '[APPLY] Worktree cleanup targets:' : '[DRY-RUN] Worktree cleanup targets:');
targets
  .sort((a, b) => a.label.localeCompare(b.label))
  .forEach((target) => {
    console.log(` - [${formatTargetType(target.path)}] ${target.label}`);
  });

if (!apply) {
  console.log('[INFO] Re-run with --apply to delete these targets.');
  process.exit(0);
}

targets.forEach((target) => removeTarget(target.path));
console.log(`[SUCCESS] Removed ${targets.length} worktree cleanup target(s).`);
