#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const TRANSIENT_REMOVE_ERROR_CODES = new Set(['EBUSY', 'ENOTEMPTY', 'EPERM']);
const REMOVE_RETRY_ATTEMPTS = 6;
const REMOVE_RETRY_DELAY_MS = 150;

const sleep = (milliseconds) => {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, milliseconds);
};

const createCleanupEngine = ({
  repoRoot,
  exactTargets = [],
  nestedTargets = [],
  rootPrefixPatterns = [],
} = {}) => {
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
    exactTargets.forEach((name) => {
      addTarget(name, path.join(repoRoot, name));
    });

    nestedTargets.forEach((name) => {
      addTarget(name, path.join(repoRoot, name));
    });

    const rootEntries = fs.readdirSync(repoRoot, { withFileTypes: true });
    rootEntries.forEach((entry) => {
      const name = String(entry.name || '');
      if (exactTargets.includes(name)) return;
      if (!rootPrefixPatterns.some((pattern) => pattern.test(name))) return;
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

  return {
    targets,
    addTarget,
    collectTargets,
    formatTargetType,
    removeTarget,
  };
};

module.exports = {
  createCleanupEngine,
  TRANSIENT_REMOVE_ERROR_CODES,
  REMOVE_RETRY_ATTEMPTS,
  REMOVE_RETRY_DELAY_MS,
  sleep,
};
