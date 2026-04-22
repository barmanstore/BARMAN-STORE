const fs = require('fs');
const path = require('path');

const parseEnvText = (content) => {
  const out = {};
  const lines = String(content || '').split(/\r?\n/);
  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;

    const match = line.match(/^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
    if (!match) continue;
    const key = match[1];
    let value = String(match[2] ?? '').trim();

    const isQuoted =
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"));

    if (isQuoted) {
      value = value.slice(1, -1);
    } else {
      const hashIndex = value.indexOf(' #');
      if (hashIndex >= 0) {
        value = value.slice(0, hashIndex).trim();
      }
    }

    out[key] = value;
  }
  return out;
};

const loadEnvFile = (filePath, lockedKeys = null) => {
  if (!fs.existsSync(filePath)) return;
  const parsed = parseEnvText(fs.readFileSync(filePath, 'utf8'));
  for (const [key, value] of Object.entries(parsed)) {
    if (lockedKeys?.has(key)) continue;
    process.env[key] = value;
  }
};

const loadProjectEnv = () => {
  const projectRoot = path.resolve(__dirname, '..');
  const nodeEnv = String(process.env.NODE_ENV || '').trim();
  const lockedKeys = new Set(Object.keys(process.env));
  const files = [
    '.env',
    nodeEnv ? `.env.${nodeEnv}` : '',
    '.env.local',
    nodeEnv ? `.env.${nodeEnv}.local` : '',
  ].filter(Boolean);

  files.forEach((name) => loadEnvFile(path.join(projectRoot, name), lockedKeys));
};

loadProjectEnv();

module.exports = {
  loadProjectEnv,
};
