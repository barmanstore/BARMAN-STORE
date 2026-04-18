const fs = require('fs');
const path = require('path');

const ROUTES_PATH = path.join(__dirname, '..', 'ROUTES.md');

const normalizeRoutePath = (value) => {
  const raw = String(value || '').trim();
  if (!raw) return '';
  let normalized = raw.replace(/\\+/g, '\\');
  normalized = normalized.replace(/:\w+\([^/]+\)/g, ':param');
  normalized = normalized.replace(/:\w+/g, ':param');
  if (normalized !== '/' && normalized.endsWith('/')) {
    normalized = normalized.replace(/\/+$/, '');
  }
  return normalized;
};

const normalizeRouteKey = (method, routePath) => {
  const verb = String(method || '')
    .trim()
    .toUpperCase();
  return `${verb} ${normalizeRoutePath(routePath)}`;
};

const parseRoutesMarkdown = (content) => {
  const routes = new Set();
  const regex = /`([A-Z|]+)\s+([^`]+)`/g;
  let match = null;
  while ((match = regex.exec(content))) {
    const methodsToken = match[1];
    const pathToken = match[2];
    if (!methodsToken || !pathToken) continue;
    if (!String(pathToken).trim().startsWith('/')) continue;
    const methods = methodsToken
      .split('|')
      .map((method) => method.trim())
      .filter(Boolean);
    const normalizedPath = normalizeRoutePath(pathToken);
    methods.forEach((method) => routes.add(normalizeRouteKey(method, normalizedPath)));
  }
  return routes;
};

const loadRoutesMarkdown = () => parseRoutesMarkdown(fs.readFileSync(ROUTES_PATH, 'utf8'));

module.exports = {
  ROUTES_PATH,
  normalizeRoutePath,
  normalizeRouteKey,
  parseRoutesMarkdown,
  loadRoutesMarkdown,
};
