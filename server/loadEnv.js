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
    let value = match[2] ?? '';

    const hashIndex = value.indexOf(' #');
    if (hashIndex >= 0) {
      value = value.slice(0, hashIndex);
    }
    value = value.trim();

    if (
      (value.startsWith('"') && value.endsWith('"'))
      || (value.startsWith('\'') && value.endsWith('\''))
    ) {
      value = value.slice(1, -1);
    }

    out[key] = value;
  }
  return out;
};

const loadEnvFile = (filePath) => {
  if (!fs.existsSync(filePath)) return;
  const parsed = parseEnvText(fs.readFileSync(filePath, 'utf8'));
  for (const [key, value] of Object.entries(parsed)) {
    if (process.env[key] === undefined) {
      process.env[key] = value;
    }
  }
};

const loadProjectEnv = () => {
  const projectRoot = path.resolve(__dirname, '..');
  const nodeEnv = String(process.env.NODE_ENV || '').trim();
  const files = [
    '.env',
    '.env.local',
    nodeEnv ? `.env.${nodeEnv}` : '',
    nodeEnv ? `.env.${nodeEnv}.local` : '',
  ].filter(Boolean);

  files.forEach((name) => loadEnvFile(path.join(projectRoot, name)));
};

loadProjectEnv();

module.exports = {
  loadProjectEnv,
};
