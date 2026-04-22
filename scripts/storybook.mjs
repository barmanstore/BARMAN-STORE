import { mkdirSync, existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';

const repoRoot = path.resolve(process.cwd());
const storybookHome = path.join(repoRoot, '.local', 'storybook-home');

if (!existsSync(storybookHome)) {
  mkdirSync(storybookHome, { recursive: true });
}

const args = process.argv.slice(2);
const env = {
  ...process.env,
  HOME: storybookHome,
  USERPROFILE: storybookHome,
  STORYBOOK_DISABLE_TELEMETRY: '1',
};

const bin = path.join(
  repoRoot,
  'node_modules',
  '.bin',
  process.platform === 'win32' ? 'storybook.cmd' : 'storybook'
);
const result = spawnSync(bin, args, {
  stdio: 'inherit',
  env,
  shell: process.platform === 'win32',
});

if (result.error) {
  console.error(result.error);
}
if (typeof result.status === 'number' && result.status !== 0) {
  console.error(`Storybook exited with status ${result.status}`);
}

process.exit(result.status ?? 1);
