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
  fs.rmSync(targetPath, { recursive: true, force: true });
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
