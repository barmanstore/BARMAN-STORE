#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const args = new Set(process.argv.slice(2));
const mode = args.has('--all') ? 'all' : 'staged';

const run = (cmd, cmdArgs, options = {}) =>
  spawnSync(cmd, cmdArgs, {
    stdio: 'pipe',
    encoding: 'utf8',
    ...options,
  });

const stagedFiles = () => {
  const out = run('git', ['diff', '--cached', '--name-only', '--diff-filter=ACMRT']);
  if (out.status !== 0) return [];
  return String(out.stdout || '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
};

const allFiles = () => {
  const out = run('git', ['ls-files']);
  if (out.status !== 0) return [];
  return String(out.stdout || '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
};

const readBlob = (filePath) => {
  const out = run('git', ['show', `:${filePath}`]);
  if (out.status !== 0) return '';
  return String(out.stdout || '');
};

const readHead = (filePath) => {
  const out = run('git', ['show', `HEAD:${filePath}`]);
  if (out.status === 0) return String(out.stdout || '');
  try {
    return readFileSync(filePath, 'utf8');
  } catch (_) {
    // Ignore read failures.
  }
  return '';
};

const isLikelyBinary = (content) => content.includes('\u0000');

const isPlaceholder = (value) => {
  const normalized = String(value || '')
    .trim()
    .toLowerCase();
  if (!normalized) return true;
  return [
    '<password>',
    '<token>',
    '<secret>',
    '<ref>',
    'example',
    'your_',
    'replace_with',
    'changeme',
  ].some((marker) => normalized.includes(marker));
};

const skipPath = (filePath) => {
  if (!filePath) return true;
  return ['node_modules/', 'dist/', '.git/', 'tmp.'].some((prefix) => filePath.startsWith(prefix));
};

const isEnvLikeFile = (filePath) => {
  const normalized = String(filePath || '').replace(/\\/g, '/');
  return /(^|\/)\.env(\.|$)/.test(normalized);
};

const patterns = [
  {
    id: 'private-key',
    regex: /-----BEGIN [A-Z ]*PRIVATE KEY-----/,
    message: 'Private key material detected',
  },
  {
    id: 'repo-auth-token',
    regex: /\beyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\b/,
    message: 'Possible repo auth token detected (base64url payload.signature)',
  },
  {
    id: 'google-api-key',
    regex: /\bAIza[0-9A-Za-z\-_]{35}\b/,
    message: 'Google API key format detected',
  },
  {
    id: 'aws-access-key',
    regex: /\bAKIA[0-9A-Z]{16}\b/,
    message: 'AWS access key format detected',
  },
  {
    id: 'postgres-uri-password',
    regex: /\bpostgres(?:ql)?:\/\/[^:\s]+:[^@\s]+@/i,
    message: 'Postgres URI with embedded password detected',
  },
];

const sensitiveAssignment =
  /^\s*(?:export\s+)?([A-Z][A-Z0-9_]*(?:SECRET|TOKEN|PASSWORD|API_KEY|SERVICE_ROLE_KEY))\s*=\s*(.+)\s*$/;
const findings = [];

const files = mode === 'all' ? allFiles() : stagedFiles();
for (const filePath of files) {
  if (skipPath(filePath)) continue;
  const content = mode === 'all' ? readHead(filePath) : readBlob(filePath);
  if (!content || isLikelyBinary(content)) continue;
  const lines = content.split(/\r?\n/);

  lines.forEach((line, index) => {
    const lineNo = index + 1;
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) return;

    for (const pattern of patterns) {
      if (pattern.regex.test(line)) {
        if (pattern.id === 'postgres-uri-password' && isPlaceholder(line)) continue;
        findings.push({
          filePath,
          lineNo,
          id: pattern.id,
          message: pattern.message,
          snippet: trimmed.slice(0, 180),
        });
      }
    }

    if (!isEnvLikeFile(filePath)) return;

    const assign = line.match(sensitiveAssignment);
    if (!assign) return;
    const key = String(assign[1] || '').trim();
    const rawValue = String(assign[2] || '')
      .trim()
      .replace(/^['"]|['"]$/g, '');
    if (isPlaceholder(rawValue)) return;
    if (/^false$|^true$|^[0-9]+$/i.test(rawValue)) return;
    findings.push({
      filePath,
      lineNo,
      id: 'sensitive-assignment',
      message: `Sensitive assignment detected (${key})`,
      snippet: `${key}=***`,
    });
  });
}

if (!findings.length) {
  console.log(`[secret-scan] OK (${mode})`);
  process.exit(0);
}

console.error(`[secret-scan] Found ${findings.length} potential secret(s):`);
for (const finding of findings) {
  console.error(`- ${finding.filePath}:${finding.lineNo} [${finding.id}] ${finding.message}`);
}
console.error(
  '[secret-scan] Commit/push blocked. Move secrets to environment variables and retry.'
);
process.exit(1);
