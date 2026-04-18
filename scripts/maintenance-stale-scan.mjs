#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, '..');

const SEARCH_ROOTS = ['src', 'server', 'scripts'];

const ROOT_FILES = ['README.md', 'TASKS.md', 'AGENTS.md', 'ROUTES.md', 'package.json', 'ops.bat'];

const TEXT_FILE_EXTENSIONS = new Set([
  '.js',
  '.jsx',
  '.mjs',
  '.cjs',
  '.ts',
  '.tsx',
  '.css',
  '.md',
  '.bat',
  '.json',
  '.ps1',
  '.txt',
]);

const STALE_ARTIFACTS = ['eslint-output.json', 'full-lint-output.txt', 'purchase-cleanup-diff.txt'];

const EXCLUDED_RELATIVE_PATHS = new Set([path.join('scripts', 'maintenance-stale-scan.mjs')]);

const STALE_MARKERS = [/TODO\b/i, /FIXME\b/i, /XXX\b/i, /\bcommented out\b/i];

const COMMENT_LINE_PATTERN = /^\s*(\/\/|\/\*+|\*|<!--|#|rem\b|::)/i;

const shouldSkipDir = (name) =>
  name === 'node_modules' ||
  name === 'dist' ||
  name === 'coverage' ||
  name === '.git' ||
  name === '.vite' ||
  name === '.cache';

const collectFiles = (entryPath, collected) => {
  const stat = fs.statSync(entryPath);
  if (stat.isDirectory()) {
    const baseName = path.basename(entryPath);
    if (shouldSkipDir(baseName)) return;
    for (const child of fs.readdirSync(entryPath)) {
      collectFiles(path.join(entryPath, child), collected);
    }
    return;
  }

  const relativePath = path.relative(repoRoot, entryPath);
  if (EXCLUDED_RELATIVE_PATHS.has(relativePath)) return;

  const ext = path.extname(entryPath).toLowerCase();
  if (!TEXT_FILE_EXTENSIONS.has(ext)) return;
  collected.push(entryPath);
};

const scanFileForMarkers = (filePath) => {
  const relativePath = path.relative(repoRoot, filePath);
  const text = fs.readFileSync(filePath, 'utf8');
  const matches = [];
  text.split(/\r?\n/).forEach((line, index) => {
    if (!COMMENT_LINE_PATTERN.test(line)) return;
    if (!STALE_MARKERS.some((pattern) => pattern.test(line))) return;
    matches.push({
      lineNumber: index + 1,
      line: line.trim(),
    });
  });
  if (!matches.length) return null;
  return { relativePath, matches };
};

const findStaleArtifacts = () => {
  const found = [];
  for (const name of STALE_ARTIFACTS) {
    const targetPath = path.join(repoRoot, name);
    if (fs.existsSync(targetPath)) {
      found.push(name);
    }
  }
  return found;
};

const files = [];
for (const root of SEARCH_ROOTS) {
  collectFiles(path.join(repoRoot, root), files);
}
for (const rootFile of ROOT_FILES) {
  const targetPath = path.join(repoRoot, rootFile);
  if (fs.existsSync(targetPath)) files.push(targetPath);
}

const staleFiles = files.map(scanFileForMarkers).filter(Boolean);

const staleArtifacts = findStaleArtifacts();

if (!staleFiles.length && !staleArtifacts.length) {
  console.log('[SUCCESS] No stale code markers or generated artifacts found.');
  process.exit(0);
}

if (staleArtifacts.length) {
  console.log('[WARN] Generated artifacts detected:');
  staleArtifacts.forEach((name) => {
    console.log(` - ${name}`);
  });
}

if (staleFiles.length) {
  console.log('[WARN] Stale markers detected:');
  staleFiles
    .sort((a, b) => a.relativePath.localeCompare(b.relativePath))
    .forEach((entry) => {
      console.log(` - ${entry.relativePath}`);
      entry.matches.forEach((match) => {
        console.log(`   ${match.lineNumber}: ${match.line}`);
      });
    });
}

process.exit(1);
