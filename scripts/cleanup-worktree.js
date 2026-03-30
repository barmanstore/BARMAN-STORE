#!/usr/bin/env node

const path = require('path');
const { createCleanupEngine } = require('./cleanup-engine');

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

const {
  targets,
  collectTargets,
  formatTargetType,
  removeTarget,
} = createCleanupEngine({
  repoRoot,
  exactTargets: ROOT_EXACT_TARGETS,
  nestedTargets: NESTED_EXACT_TARGETS,
  rootPrefixPatterns: ROOT_PREFIX_PATTERNS,
});

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
