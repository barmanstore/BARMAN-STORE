import assert from 'node:assert/strict';
import {
  collectPathnamePredicateViolations,
  collectRepositoryShellRuntimeViolations,
} from './shell-runtime-contract-utils.mjs';
import {
  selectTopEscapeEntry,
  shouldLockOverlayBackground,
} from '../src/providers/overlayStackUtils.mjs';
import {
  acquireInertBackgroundLock,
  createInertBackgroundState,
} from '../src/shared/hooks/inertBackgroundRuntime.mjs';

const wrapSnippet = (source) => `function __shellRuntimeCheck__() {\n${source}\n}\n`;

const expectNoViolations = (source, relativePath, label) => {
  const violations = collectPathnamePredicateViolations({ source: wrapSnippet(source), relativePath });
  assert.equal(
    violations.length,
    0,
    `${label} should not trigger pathname heuristic violations.\n${violations.map((item) => item.message).join('\n')}`
  );
};

const expectViolations = (source, relativePath, label) => {
  const violations = collectPathnamePredicateViolations({ source: wrapSnippet(source), relativePath });
  assert.ok(violations.length > 0, `${label} should trigger pathname heuristic violations.`);
};

const createMockBackgroundRoot = ({
  supportsInert = true,
  inert = false,
  pointerEvents = '',
  ariaHidden = null,
} = {}) => {
  const attributes = {};
  if (ariaHidden != null) {
    attributes['aria-hidden'] = ariaHidden;
  }

  const element = {
    style: {
      pointerEvents,
    },
    getAttribute(name) {
      return Object.prototype.hasOwnProperty.call(attributes, name) ? attributes[name] : null;
    },
    setAttribute(name, value) {
      attributes[name] = String(value);
    },
    removeAttribute(name) {
      delete attributes[name];
    },
  };

  if (supportsInert) {
    element.inert = inert;
  }

  return element;
};

const runPathnameVerification = () => {
  const blocklistedFile = 'src/RootShell.jsx';
  const uiFile = 'src/shared/components/mobile/MobileFooter.jsx';

  expectNoViolations('const url = `${canonicalHost}${location.pathname}`;', blocklistedFile, 'Passive string construction');
  expectNoViolations('useEffect(() => { trackPage(pathname); }, [pathname]);', blocklistedFile, 'Effect dependency array');
  expectNoViolations('const current = location.pathname;', blocklistedFile, 'Assignment without branch');
  expectNoViolations('navigate(location.pathname + search);', blocklistedFile, 'Argument passthrough');
  expectNoViolations("const normalized = pathname || '/';", blocklistedFile, 'Normalization with ||');
  expectNoViolations("const normalized = pathname ?? '/';", blocklistedFile, 'Normalization with ??');
  expectNoViolations("const path = `${location.pathname || '/'}${location.search || ''}`;", blocklistedFile, 'Template literal fallback');
  expectNoViolations("const isStorePage = location.pathname === '/store';", uiFile, 'UI pathname read outside blocklist');

  expectViolations("if (pathname === '/popup') { closeShell(); }", blocklistedFile, 'if equality');
  expectViolations("pathname.startsWith('/popup') ? a : b;", blocklistedFile, 'Ternary predicate');
  expectViolations("switch (pathname) { case '/admin': break; default: break; }", blocklistedFile, 'Switch predicate');
  expectViolations("pathname.startsWith('/popup') && setVariant('none');", blocklistedFile, '&& side effect');
  expectViolations("!pathname.includes('/store') || activateChrome();", blocklistedFile, '|| side effect');
  expectViolations("const isPopup = pathname.startsWith('/popup');", blocklistedFile, 'Stored predicate');
  expectViolations("const config = { isPopup: pathname.startsWith('/popup') };", blocklistedFile, 'Property predicate');
  expectViolations("return pathname.startsWith('/popup');", blocklistedFile, 'Return predicate');
  expectViolations("if (/^\\/popup/.test(pathname)) { closeShell(); }", blocklistedFile, 'Regex test predicate');
};

const runOverlayVerification = () => {
  const sheetEntry = {
    id: 'sheet',
    type: 'overlay',
    zIndex: 2100,
    onEscape() {},
    sequence: 1,
  };
  const popupEntry = {
    id: 'popup',
    type: 'overlay',
    zIndex: 4200,
    onEscape() {},
    sequence: 2,
  };
  const mobileMenuEntry = {
    id: 'mobile-menu',
    type: 'chrome',
    zIndex: 1600,
    onEscape() {},
    sequence: 3,
  };

  assert.equal(selectTopEscapeEntry([sheetEntry, popupEntry])?.id, 'popup', 'Higher overlay z-index should win.');
  assert.equal(shouldLockOverlayBackground([mobileMenuEntry]), false, 'Chrome-only stacks must not lock the background.');
  assert.equal(shouldLockOverlayBackground([mobileMenuEntry, sheetEntry]), true, 'Overlay stacks must lock the background.');

  let order = 1;
  const dynamicWindowEntry = {
    id: 'window',
    type: 'overlay',
    getZIndex: () => 3600 + order,
    onEscape() {},
    sequence: 4,
  };
  assert.equal(selectTopEscapeEntry([sheetEntry, dynamicWindowEntry])?.id, 'window', 'Dynamic window z-index should outrank the sheet.');
  order = 12;
  assert.equal(selectTopEscapeEntry([sheetEntry, dynamicWindowEntry])?.id, 'window', 'Dynamic getZIndex should be evaluated at routing time.');

  const olderChromeEntry = { id: 'older', type: 'chrome', zIndex: 1600, onEscape() {}, sequence: 5 };
  const newerChromeEntry = { id: 'newer', type: 'chrome', zIndex: 1600, onEscape() {}, sequence: 6 };
  assert.equal(selectTopEscapeEntry([olderChromeEntry, newerChromeEntry])?.id, 'newer', 'Sequence should break equal-z-index ties.');
};

const runInertVerification = () => {
  const state = createInertBackgroundState();
  const background = createMockBackgroundRoot();

  const releaseWindow = acquireInertBackgroundLock(state, background);
  assert.equal(state.lockCount, 1, 'First lock should increment the counter.');
  assert.equal(background.inert, true, 'Background should inert on first lock.');
  assert.equal(background.getAttribute('aria-hidden'), 'true', 'Background should be aria-hidden on first lock.');

  const releaseSheet = acquireInertBackgroundLock(state, background);
  assert.equal(state.lockCount, 2, 'Second lock should increment the counter.');
  releaseSheet();
  assert.equal(state.lockCount, 1, 'Closing one overlay should keep the background locked.');
  assert.equal(background.inert, true, 'Background should remain inert while one overlay is still open.');
  releaseWindow();
  assert.equal(state.lockCount, 0, 'Last unlock should clear the counter.');
  assert.equal(background.inert, false, 'Last unlock should restore inert state.');
  assert.equal(background.getAttribute('aria-hidden'), null, 'Last unlock should restore aria-hidden.');
  assert.equal(state.snapshot, null, 'Snapshot should clear after the final unlock.');

  const overlapState = createInertBackgroundState();
  const overlapBackground = createMockBackgroundRoot();
  const releaseFirst = acquireInertBackgroundLock(overlapState, overlapBackground);
  const releaseSecond = acquireInertBackgroundLock(overlapState, overlapBackground);
  releaseFirst();
  assert.equal(overlapBackground.inert, true, 'Intermediate unlock must not re-enable the background.');
  releaseSecond();
  assert.equal(overlapBackground.inert, false, 'Final unlock should restore the background.');

  const snapshotState = createInertBackgroundState();
  const priorStateBackground = createMockBackgroundRoot({
    inert: true,
    pointerEvents: 'none',
    ariaHidden: 'true',
  });
  const releasePriorState = acquireInertBackgroundLock(snapshotState, priorStateBackground);
  releasePriorState();
  assert.equal(priorStateBackground.inert, true, 'Prior inert state must restore exactly.');
  assert.equal(priorStateBackground.style.pointerEvents, 'none', 'Prior pointer-events state must restore exactly.');
  assert.equal(priorStateBackground.getAttribute('aria-hidden'), 'true', 'Prior aria-hidden state must restore exactly.');

  const fallbackState = createInertBackgroundState();
  const fallbackBackground = createMockBackgroundRoot({
    supportsInert: false,
    pointerEvents: '',
    ariaHidden: null,
  });
  const releaseFallback = acquireInertBackgroundLock(fallbackState, fallbackBackground);
  assert.equal(fallbackBackground.style.pointerEvents, 'none', 'Fallback mode should use pointer-events locking.');
  releaseFallback();
  assert.equal(fallbackBackground.style.pointerEvents, '', 'Fallback mode should restore pointer-events.');

  const freshSnapshotState = createInertBackgroundState();
  const freshSnapshotBackground = createMockBackgroundRoot();
  const releaseA = acquireInertBackgroundLock(freshSnapshotState, freshSnapshotBackground);
  releaseA();
  assert.equal(freshSnapshotState.snapshot, null, 'Snapshot must clear after a no-overlap session.');
  freshSnapshotBackground.inert = true;
  const releaseB = acquireInertBackgroundLock(freshSnapshotState, freshSnapshotBackground);
  releaseB();
  assert.equal(freshSnapshotBackground.inert, true, 'Fresh sessions must restore against a fresh snapshot.');
};

const runRepositoryCheck = () => {
  const violations = collectRepositoryShellRuntimeViolations();
  assert.equal(
    violations.length,
    0,
    `Repository shell/runtime contract should already pass.\n${violations.map((item) => `${item.file}:${item.line}:${item.column} ${item.message}`).join('\n')}`
  );
};

runRepositoryCheck();
runPathnameVerification();
runOverlayVerification();
runInertVerification();

console.log('Shell/runtime verification passed.');
