const { createAppContext } = require('../server/appFactory');
const {
  normalizeRouteKey,
  normalizeRoutePath,
  loadRoutesMarkdown,
} = require('./route-check-utils');

const METHOD_KEYS = ['get', 'post', 'put', 'patch', 'delete', 'head', 'options'];

const joinPaths = (basePath, segment) => {
  const left = normalizeRoutePath(basePath);
  const right = normalizeRoutePath(segment);
  if (!left) return right || '/';
  if (!right || right === '/') return left || '/';
  return normalizeRoutePath(`${left}/${right}`.replace(/\/+/g, '/'));
};

const regexToPath = (layer) => {
  if (!layer || !layer.regexp) return '';
  if (layer.regexp.fast_slash) return '';
  let source = layer.regexp.source || '';
  source = source
    .replace(/\\\//g, '/')
    .replace(/^\^\/?/, '/')
    .replace(/\\\/\?\(\?=\\\/\|\$\)/g, '')
    .replace(/\(\?=\\\/\|\$\)/g, '')
    .replace(/\$$/, '');

  let keyIndex = 0;
  source = source.replace(/\((?:\?:)?[^)]+\)/g, () => {
    if (!Array.isArray(layer.keys) || keyIndex >= layer.keys.length) return '';
    const key = layer.keys[keyIndex];
    keyIndex += 1;
    return `:${key.name}`;
  });

  source = source.replace(/\/+/g, '/');
  if (source !== '/' && source.endsWith('/')) {
    source = source.slice(0, -1);
  }
  return source === '/' ? '' : source;
};

const extractRoutesFromStack = (stack, basePath = '', routes = new Set()) => {
  if (!Array.isArray(stack)) return routes;
  stack.forEach((layer) => {
    if (layer?.route && layer.route.path) {
      const routePaths = Array.isArray(layer.route.path) ? layer.route.path : [layer.route.path];
      const methods = Object.keys(layer.route.methods || {}).filter(
        (method) => layer.route.methods[method]
      );
      routePaths.forEach((routePath) => {
        const fullPath = joinPaths(basePath, routePath);
        methods.forEach((method) => {
          routes.add(normalizeRouteKey(method, fullPath));
        });
      });
      return;
    }

    if (layer?.handle?.stack) {
      const mountPath = regexToPath(layer);
      extractRoutesFromStack(layer.handle.stack, joinPaths(basePath, mountPath), routes);
      return;
    }

    if (layer?.name === 'serveStatic' && layer?.regexp) {
      const mountPath = joinPaths(basePath, regexToPath(layer));
      routes.add(normalizeRouteKey('GET', mountPath || '/'));
      routes.add(normalizeRouteKey('HEAD', mountPath || '/'));
    }
  });

  return routes;
};

const loadMountedRoutes = () => {
  const { app } = createAppContext();
  const stack = app?._router?.stack || [];
  const routes = extractRoutesFromStack(stack);
  return new Set(
    [...routes].filter((route) => {
      const [method, path] = route.split(' ');
      if (!METHOD_KEYS.includes(method.toLowerCase())) return false;
      const normalizedPath = normalizeRoutePath(path);
      if (!normalizedPath) return false;
      if (method.toUpperCase() === 'OPTIONS' && normalizedPath === '*') return false;
      if (method.toUpperCase() === 'GET' || method.toUpperCase() === 'HEAD') {
        if (normalizedPath.startsWith('/uploads') || normalizedPath.startsWith('/api/uploads')) {
          return false;
        }
      }
      return true;
    })
  );
};

const main = () => {
  const documentedRoutes = loadRoutesMarkdown();
  const mountedRoutes = loadMountedRoutes();

  const optionalDocRoutes = new Set([
    normalizeRouteKey('GET', '/uploads/profiles/:file'),
    normalizeRouteKey('HEAD', '/uploads/profiles/:file'),
    normalizeRouteKey('GET', '/api/uploads/profiles/:file'),
    normalizeRouteKey('HEAD', '/api/uploads/profiles/:file'),
  ]);

  const missingInDocs = [...mountedRoutes].filter((route) => !documentedRoutes.has(route));
  const missingInApp = [...documentedRoutes].filter(
    (route) => !mountedRoutes.has(route) && !optionalDocRoutes.has(route)
  );

  if (missingInDocs.length || missingInApp.length) {
    console.error('Route drift detected.');
    if (missingInDocs.length) {
      console.error('\nMounted routes missing from ROUTES.md:');
      missingInDocs.sort().forEach((route) => console.error(`- ${route}`));
    }
    if (missingInApp.length) {
      console.error('\nROUTES.md entries missing from mounted routes:');
      missingInApp.sort().forEach((route) => console.error(`- ${route}`));
    }
    process.exit(1);
  }

  console.log(`Route drift check passed (${mountedRoutes.size} routes).`);
};

main();
