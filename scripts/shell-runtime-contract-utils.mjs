import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as babelParser from '@babel/parser';
import traverseModule from '@babel/traverse';

const { parse } = babelParser;
const traverse = traverseModule.default || traverseModule;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
export const REPO_ROOT = path.resolve(__dirname, '..');
export const SRC_ROOT = path.join(REPO_ROOT, 'src');
const SOURCE_FILE_EXTENSIONS = new Set(['.js', '.jsx', '.mjs']);
const PATHNAME_PREDICATE_METHODS = new Set([
  'startsWith',
  'endsWith',
  'includes',
  'match',
  'search',
]);
const PATHNAME_COMPARISON_OPERATORS = new Set(['===', '!==', '<', '>', '<=', '>=']);

export const OVERLAY_PROVIDER_FILE = 'src/providers/OverlayProvider.jsx';
export const ROOT_SHELL_FILE = 'src/RootShell.jsx';
export const BODY_STYLE_ALLOWLIST = new Set(['src/shared/hooks/useLockBodyScroll.js']);
export const BODY_CLASSLIST_ALLOWLIST = new Map([
  [ROOT_SHELL_FILE, { allowedClasses: null }],
  [
    'src/features/commerce/purchase/hooks/usePoModalSizing.js',
    { allowedClasses: new Set(['po-modal-resizing']) },
  ],
]);
export const HEADER_HEIGHT_ALLOWLIST = new Set([
  'src/shells/DefaultShell.jsx',
  'src/shells/AccountShell.jsx',
  'src/shells/ImmersiveShell.jsx',
  'src/shells/NoShell.jsx',
]);
export const INERT_OWNER_ALLOWLIST = new Set([OVERLAY_PROVIDER_FILE]);
export const PATHNAME_BLOCKLIST_FILES = new Set([
  ROOT_SHELL_FILE,
  'src/shared/components/window/WindowManagerProvider.jsx',
  'src/shared/components/backoffice/BackofficePopupGuard.jsx',
  'src/shared/components/runtime/GlobalAdminShortcuts.jsx',
]);

const isObjectLike = (value) => value && typeof value === 'object';

const normalizeRelativePath = (filePath) =>
  path.relative(REPO_ROOT, filePath).split(path.sep).join('/');

const isSourceFile = (filePath) => SOURCE_FILE_EXTENSIONS.has(path.extname(filePath));

export const listSourceFiles = (rootDir = SRC_ROOT) => {
  const queue = [rootDir];
  const results = [];
  while (queue.length) {
    const current = queue.pop();
    const entries = fs.readdirSync(current, { withFileTypes: true });
    entries.forEach((entry) => {
      const nextPath = path.join(current, entry.name);
      if (entry.isDirectory()) {
        queue.push(nextPath);
        return;
      }
      if (entry.isFile() && isSourceFile(nextPath)) {
        results.push(nextPath);
      }
    });
  }
  return results.sort();
};

export const parseModule = (source, filePath = 'inline.jsx') =>
  parse(source, {
    sourceType: 'module',
    sourceFilename: filePath,
    errorRecovery: false,
    plugins: [
      'jsx',
      'importMeta',
      'optionalChaining',
      'nullishCoalescingOperator',
      'objectRestSpread',
      'topLevelAwait',
    ],
  });

const getLocation = (node) => ({
  line: Number(node?.loc?.start?.line || 1),
  column: Number(node?.loc?.start?.column || 0) + 1,
});

const makeViolation = (relativePath, node, message) => ({
  file: relativePath,
  line: getLocation(node).line,
  column: getLocation(node).column,
  message,
});

const getPropertyName = (node) => {
  if (!node) return '';
  if (node.type === 'Identifier') return node.name;
  if (node.type === 'StringLiteral') return node.value;
  return '';
};

const unwrapNode = (node) => {
  let current = node;
  while (current?.type === 'ParenthesizedExpression') {
    current = current.expression;
  }
  return current;
};

const isMemberChain = (node, parts) => {
  let current = unwrapNode(node);
  for (let index = parts.length - 1; index > 0; index -= 1) {
    if (!current || current.type !== 'MemberExpression') return false;
    if (getPropertyName(current.property) !== parts[index]) return false;
    current = unwrapNode(current.object);
  }
  return current?.type === 'Identifier' && current.name === parts[0];
};

const isUseLocationPathname = (node) => {
  const target = unwrapNode(node);
  if (!target || target.type !== 'MemberExpression') return false;
  if (getPropertyName(target.property) !== 'pathname') return false;
  const objectNode = unwrapNode(target.object);
  return (
    objectNode?.type === 'CallExpression' &&
    objectNode.callee?.type === 'Identifier' &&
    objectNode.callee.name === 'useLocation'
  );
};

const isPathnameRead = (node) => {
  const target = unwrapNode(node);
  if (!target) return false;
  if (target.type === 'Identifier' && target.name === 'pathname') return true;
  if (isMemberChain(target, ['location', 'pathname'])) return true;
  if (isMemberChain(target, ['window', 'location', 'pathname'])) return true;
  return isUseLocationPathname(target);
};

const containsPathnameRead = (node) => {
  const target = unwrapNode(node);
  if (!isObjectLike(target)) return false;
  if (isPathnameRead(target)) return true;
  if (Array.isArray(target)) {
    return target.some((child) => containsPathnameRead(child));
  }
  return Object.entries(target).some(([key, value]) => {
    if (key === 'loc' || key === 'start' || key === 'end' || key === 'extra') return false;
    if (!isObjectLike(value)) return false;
    return containsPathnameRead(value);
  });
};

const isPathnamePredicateCall = (node) => {
  const target = unwrapNode(node);
  if (!target || target.type !== 'CallExpression') return false;
  const callee = unwrapNode(target.callee);
  if (!callee || callee.type !== 'MemberExpression') return false;
  const propertyName = getPropertyName(callee.property);
  if (PATHNAME_PREDICATE_METHODS.has(propertyName)) {
    return containsPathnameRead(callee.object);
  }
  if (propertyName === 'test') {
    return target.arguments.some((argument) => containsPathnameRead(argument));
  }
  return false;
};

const getPathnameBlocklistMatch = (relativePath) => {
  if (relativePath === 'src/providers/RoutePolicyProvider.jsx') return false;
  if (PATHNAME_BLOCKLIST_FILES.has(relativePath)) return true;
  if (relativePath.startsWith('src/shells/') && relativePath.endsWith('.jsx')) return true;
  if (relativePath.startsWith('src/providers/') && relativePath.endsWith('.jsx')) return true;
  return false;
};

const collectTextMatches = (source, pattern) => {
  const matches = [];
  let match;
  while ((match = pattern.exec(source))) {
    matches.push({
      index: match.index,
      match: match[0],
    });
  }
  return matches;
};

const getLineFromIndex = (source, index) => {
  const slice = source.slice(0, index);
  const lines = slice.split('\n');
  return {
    line: lines.length,
    column: String(lines[lines.length - 1] || '').length + 1,
  };
};

const makeTextViolation = (relativePath, source, index, message) => {
  const location = getLineFromIndex(source, index);
  return {
    file: relativePath,
    line: location.line,
    column: location.column,
    message,
  };
};

export const collectPathnamePredicateViolations = ({
  source,
  relativePath,
  skipBlocklist = false,
}) => {
  if (!skipBlocklist && !getPathnameBlocklistMatch(relativePath)) return [];

  const ast = parseModule(source, relativePath);
  const violations = [];
  const seen = new Set();

  const pushViolation = (node, message) => {
    const key = `${node.start}:${message}`;
    if (seen.has(key)) return;
    seen.add(key);
    violations.push(makeViolation(relativePath, node, message));
  };

  traverse(ast, {
    BinaryExpression(pathRef) {
      const { node } = pathRef;
      if (!PATHNAME_COMPARISON_OPERATORS.has(node.operator)) return;
      if (!containsPathnameRead(node.left) && !containsPathnameRead(node.right)) return;
      pushViolation(node, 'Pathname predicate heuristic detected in a shell/runtime owner file.');
    },
    CallExpression(pathRef) {
      if (!isPathnamePredicateCall(pathRef.node)) return;
      pushViolation(
        pathRef.node,
        'Pathname predicate heuristic detected in a shell/runtime owner file.'
      );
    },
    SwitchStatement(pathRef) {
      if (!containsPathnameRead(pathRef.node.discriminant)) return;
      pushViolation(
        pathRef.node,
        'Pathname switch heuristic detected in a shell/runtime owner file.'
      );
    },
  });

  return violations;
};

export const collectShellRuntimeViolationsForFile = (absolutePath) => {
  const source = fs.readFileSync(absolutePath, 'utf8');
  const relativePath = normalizeRelativePath(absolutePath);
  const ast = parseModule(source, relativePath);
  const violations = [];
  const push = (violation) => violations.push(violation);

  traverse(ast, {
    CallExpression(pathRef) {
      const { node } = pathRef;
      if (
        node.callee?.type === 'Identifier' &&
        node.callee.name === 'createPortal' &&
        relativePath !== OVERLAY_PROVIDER_FILE
      ) {
        push(
          makeViolation(
            relativePath,
            node,
            'ReactDOM.createPortal is only allowed in OverlayProvider.'
          )
        );
      }

      if (
        node.callee?.type === 'Identifier' &&
        node.callee.name === 'useInertBackground' &&
        !INERT_OWNER_ALLOWLIST.has(relativePath)
      ) {
        push(
          makeViolation(
            relativePath,
            node,
            'useInertBackground is only allowed in OverlayProvider.'
          )
        );
      }

      if (node.callee?.type !== 'MemberExpression') return;

      if (isMemberChain(node.callee.object, ['document', 'body', 'classList'])) {
        const methodName = getPropertyName(node.callee.property);
        if (!['add', 'remove'].includes(methodName)) {
          push(
            makeViolation(
              relativePath,
              node,
              'document.body.classList may only use add/remove in the allowlisted runtime owners.'
            )
          );
          return;
        }
        const allowlistEntry = BODY_CLASSLIST_ALLOWLIST.get(relativePath);
        if (!allowlistEntry) {
          push(
            makeViolation(
              relativePath,
              node,
              'document.body.classList is only allowed in RootShell and the PO resize hook.'
            )
          );
          return;
        }
        if (allowlistEntry.allowedClasses instanceof Set) {
          const classLiteral = node.arguments[0];
          const className = classLiteral?.type === 'StringLiteral' ? classLiteral.value : '';
          if (!allowlistEntry.allowedClasses.has(className)) {
            push(
              makeViolation(
                relativePath,
                node,
                'This body class mutation is not part of the allowlisted shell/runtime contract.'
              )
            );
          }
        }
      }

      if (
        isMemberChain(node.callee.object, ['document', 'documentElement', 'style']) &&
        getPropertyName(node.callee.property) === 'setProperty'
      ) {
        const firstArg = node.arguments[0];
        if (
          firstArg?.type === 'StringLiteral' &&
          firstArg.value === '--app-header-height' &&
          !HEADER_HEIGHT_ALLOWLIST.has(relativePath)
        ) {
          push(
            makeViolation(
              relativePath,
              node,
              '--app-header-height may only be written by shell variant owners.'
            )
          );
        }
      }
    },
  });

  collectTextMatches(source, /\b(?:document\.body\.style|body\.style)\./g).forEach(({ index }) => {
    if (BODY_STYLE_ALLOWLIST.has(relativePath)) return;
    push(
      makeTextViolation(
        relativePath,
        source,
        index,
        'document.body.style writes are only allowed in useLockBodyScroll.'
      )
    );
  });

  return [...violations, ...collectPathnamePredicateViolations({ source, relativePath })];
};

export const collectRepositoryShellRuntimeViolations = () =>
  listSourceFiles()
    .flatMap((absolutePath) => collectShellRuntimeViolationsForFile(absolutePath))
    .sort((left, right) => {
      const fileDelta = left.file.localeCompare(right.file);
      if (fileDelta !== 0) return fileDelta;
      const lineDelta = left.line - right.line;
      if (lineDelta !== 0) return lineDelta;
      return left.column - right.column;
    });

export const formatViolations = (violations) =>
  violations
    .map(
      (violation) =>
        `- ${violation.file}:${violation.line}:${violation.column} ${violation.message}`
    )
    .join('\n');
