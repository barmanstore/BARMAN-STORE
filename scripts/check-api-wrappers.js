const fs = require('fs');
const path = require('path');
const {
  normalizeRouteKey,
  normalizeRoutePath,
  loadRoutesMarkdown,
} = require('./route-check-utils');

const API_DIR = path.join(__dirname, '..', 'src', 'shared', 'services', 'api');

const readApiFiles = () =>
  fs
    .readdirSync(API_DIR)
    .filter((file) => file.endsWith('.js'))
    .filter((file) => !['core.js', 'index.js'].includes(file))
    .map((file) => ({
      file,
      content: fs.readFileSync(path.join(API_DIR, file), 'utf8'),
    }));

const findCallEnd = (source, startIndex) => {
  let depth = 0;
  let inString = null;
  let escaped = false;
  for (let i = startIndex; i < source.length; i += 1) {
    const char = source[i];
    if (inString) {
      if (!escaped && char === inString) {
        inString = null;
      }
      escaped = !escaped && char === '\\';
      continue;
    }
    if (char === '"' || char === "'" || char === '`') {
      inString = char;
      escaped = false;
      continue;
    }
    if (char === '(') {
      depth += 1;
      continue;
    }
    if (char === ')') {
      depth -= 1;
      if (depth === 0) return i;
    }
  }
  return -1;
};

const normalizeTemplatePath = (raw) => {
  const trimmed = String(raw || '').trim();
  if (!trimmed) return '';
  const quote = trimmed[0];
  const content = trimmed.slice(1, -1);
  if (quote === '`') {
    const queryIndex = content.indexOf('?');
    const base = queryIndex >= 0 ? content.slice(0, queryIndex) : content;
    if (base.includes('${')) {
      const replaced = base.replace(/\$\{[^}]+\}/g, ':param');
      const truncated = replaced.includes('${') ? replaced.split('${')[0] : replaced;
      return normalizeRoutePath(truncated);
    }
    return normalizeRoutePath(base);
  }
  const queryIndex = content.indexOf('?');
  const base = queryIndex >= 0 ? content.slice(0, queryIndex) : content;
  return normalizeRoutePath(base);
};

const extractApiFetchCalls = (content) => {
  const calls = [];
  let index = 0;
  while (index < content.length) {
    const callIndex = content.indexOf('apiFetch(', index);
    if (callIndex < 0) break;
    const endIndex = findCallEnd(content, callIndex);
    if (endIndex < 0) break;
    const callSource = content.slice(callIndex, endIndex + 1);
    const firstArgMatch = callSource.match(/apiFetch\(\s*([`'"])(\/api[^`'"]*)\1/);
    if (!firstArgMatch) {
      index = endIndex + 1;
      continue;
    }
    const rawPathToken = firstArgMatch[0].replace(/^apiFetch\(\s*/, '').trim();
    const normalizedPath = normalizeTemplatePath(rawPathToken);
    if (!normalizedPath.startsWith('/api')) {
      index = endIndex + 1;
      continue;
    }
    const methodMatch = callSource.match(/method\s*:\s*['"]([A-Z]+)['"]/i);
    const method = methodMatch ? methodMatch[1].toUpperCase() : 'GET';
    calls.push({ method, path: normalizedPath });
    index = endIndex + 1;
  }
  return calls;
};

const main = () => {
  const documentedRoutes = loadRoutesMarkdown();
  const missing = [];

  readApiFiles().forEach(({ file, content }) => {
    const calls = extractApiFetchCalls(content);
    calls.forEach(({ method, path }) => {
      const key = normalizeRouteKey(method, path);
      if (!documentedRoutes.has(key)) {
        missing.push(`${key} (${file})`);
      }
    });
  });

  if (missing.length) {
    console.error('API wrapper endpoints missing from ROUTES.md:');
    missing.sort().forEach((entry) => console.error(`- ${entry}`));
    process.exit(1);
  }

  console.log('API wrapper route check passed.');
};

main();
