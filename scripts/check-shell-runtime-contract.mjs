import {
  collectRepositoryShellRuntimeViolations,
  formatViolations,
} from './shell-runtime-contract-utils.mjs';

const violations = collectRepositoryShellRuntimeViolations();

if (violations.length) {
  console.error('Shell/runtime contract violations detected.');
  console.error(formatViolations(violations));
  process.exit(1);
}

console.log('Shell/runtime contract check passed.');
