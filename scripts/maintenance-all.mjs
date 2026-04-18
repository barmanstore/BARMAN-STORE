#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, '..');
const nodeCmd = process.execPath;

const runScript = (label, scriptName) => {
  console.log(`\n[INFO] ${label}`);
  const result = spawnSync(nodeCmd, [path.join(repoRoot, 'scripts', scriptName)], {
    stdio: 'inherit',
    shell: false,
  });
  if (result.error) {
    console.error(`[ERROR] ${label} failed: ${result.error.message}`);
    return 1;
  }
  if (result.status !== 0) {
    const code = Number.isFinite(result.status) ? result.status : 1;
    console.error(`[ERROR] ${label} failed.`);
    return code;
  }
  return 0;
};

const lintStatus = runScript('Running lint maintenance', 'maintenance-lint.mjs');
const scanStatus = runScript('Running stale-code scan', 'maintenance-stale-scan.mjs');

if (lintStatus === 0 && scanStatus === 0) {
  console.log('\n[SUCCESS] Maintenance bundle passed.');
  process.exit(0);
}

process.exit(lintStatus || scanStatus || 1);
