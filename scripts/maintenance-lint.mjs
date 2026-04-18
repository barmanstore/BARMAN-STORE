#!/usr/bin/env node

import { spawnSync } from 'node:child_process';

const npmCmd = 'npm';

const runStep = (label, args) => {
  console.log(`\n[INFO] ${label}`);
  const result = spawnSync(npmCmd, args, {
    stdio: 'inherit',
    shell: process.platform === 'win32',
  });
  if (result.error) {
    console.error(`[ERROR] ${label} failed: ${result.error.message}`);
    process.exit(1);
  }
  if (result.status !== 0) {
    const code = Number.isFinite(result.status) ? result.status : 1;
    console.error(`[ERROR] ${label} failed.`);
    process.exit(code);
  }
};

runStep('Running ESLint', ['run', 'lint', '--', '--max-warnings=0']);
runStep('Running Stylelint', ['run', 'stylelint']);

console.log('\n[SUCCESS] Lint maintenance passed.');
