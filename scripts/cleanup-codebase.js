#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const repoRoot = path.resolve(__dirname, '..');
const args = new Set(process.argv.slice(2));
const apply = args.has('--apply');

const EXACT_TARGETS = [
  'dist',
  'tmp.workbench.input.txt',
];

const ROOT_PREFIX_PATTERNS = [
  /^tmp\..+$/,
];

const targets = [];

const collectTargets = () => {
  EXACT_TARGETS.forEach((name) => {
    const fullPath = path.join(repoRoot, name);
    if (fs.existsSync(fullPath)) {
      targets.push({
        label: name,
        path: fullPath,
      });
    }
  });

  const rootEntries = fs.readdirSync(repoRoot, { withFileTypes: true });
  rootEntries.forEach((entry) => {
    const name = String(entry.name || '');
    if (EXACT_TARGETS.includes(name)) return;
    if (!ROOT_PREFIX_PATTERNS.some((pattern) => pattern.test(name))) return;
    targets.push({
      label: name,
      path: path.join(repoRoot, name),
    });
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
  console.log('[INFO] No cleanup targets found.');
  process.exit(0);
}

console.log(apply ? '[APPLY] Code cleanup targets:' : '[DRY-RUN] Code cleanup targets:');
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
console.log(`[SUCCESS] Removed ${targets.length} cleanup target(s).`);
