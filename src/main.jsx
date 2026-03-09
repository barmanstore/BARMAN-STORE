import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.jsx';

const STALE_CHUNK_RELOAD_KEY = 'barman_stale_chunk_reload_once';
const STALE_CHUNK_RELOAD_AT_KEY = 'barman_stale_chunk_reload_at';
const CACHE_CLEANUP_MARKER_KEY = 'barman_cache_cleanup_marker_v1';
const CACHE_CLEANUP_VERSION = String(import.meta.env.VITE_CACHE_CLEANUP_VERSION || '').trim();
const CANONICAL_HOST = String(import.meta.env.VITE_CANONICAL_HOST || 'barmanstore.vercel.app').trim().toLowerCase();
const LEGACY_HOSTS = new Set(
  String(import.meta.env.VITE_LEGACY_HOSTS || 'barman-store.vercel.app')
    .split(',')
    .map((value) => String(value || '').trim().toLowerCase())
    .filter(Boolean)
);

if (typeof window !== 'undefined') {
  const host = String(window.location.hostname || '').trim().toLowerCase();
  if (host && LEGACY_HOSTS.has(host) && host !== CANONICAL_HOST) {
    const target = `https://${CANONICAL_HOST}${window.location.pathname}${window.location.search}${window.location.hash}`;
    window.location.replace(target);
  }
}

const getErrorMessage = (reason) => {
  if (!reason) return '';
  if (typeof reason === 'string') return reason;
  if (typeof reason?.message === 'string') return reason.message;
  if (typeof reason?.error?.message === 'string') return reason.error.message;
  return String(reason);
};

const shouldRecoverStaleChunk = (reason) => {
  const message = getErrorMessage(reason);
  return (
    message.includes('Failed to fetch dynamically imported module') ||
    message.includes('Importing a module script failed') ||
    message.includes('Failed to load module script') ||
    message.includes('Loading chunk') ||
    message.includes('ChunkLoadError')
  );
};

const recoverFromStaleChunk = (reason) => {
  if (!shouldRecoverStaleChunk(reason) || typeof window === 'undefined') return;
  try {
    const alreadyRetried = sessionStorage.getItem(STALE_CHUNK_RELOAD_KEY) === '1';
    const lastReloadAt = Number(sessionStorage.getItem(STALE_CHUNK_RELOAD_AT_KEY) || 0);
    const tooSoon = Number.isFinite(lastReloadAt) && (Date.now() - lastReloadAt) < 15000;
    if (alreadyRetried && tooSoon) return;
    sessionStorage.setItem(STALE_CHUNK_RELOAD_KEY, '1');
    sessionStorage.setItem(STALE_CHUNK_RELOAD_AT_KEY, String(Date.now()));
  } catch (_) {
    // Ignore sessionStorage failures and proceed with a one-time reload.
  }
  const nextUrl = new URL(window.location.href);
  nextUrl.searchParams.set('v', String(Date.now()));
  window.location.replace(nextUrl.toString());
};

window.addEventListener('error', (event) => recoverFromStaleChunk(event?.error || event?.message));
window.addEventListener('unhandledrejection', (event) => recoverFromStaleChunk(event?.reason));

const cleanupStaleBrowserCaches = () => {
  if (typeof window === 'undefined') return;
  if (window.location.protocol !== 'https:') return;

  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.getRegistrations()
      .then((regs) => Promise.all(regs.map((reg) => reg.unregister())))
      .catch(() => {});
  }

  if ('caches' in window) {
    caches.keys()
      .then((keys) => Promise.all(
        keys
          .filter((key) => /(workbox|vite|barman|vercel|precache)/i.test(String(key)))
          .map((key) => caches.delete(key))
      ))
      .catch(() => {});
  }
};

const shouldRunCacheCleanup = () => {
  if (typeof window === 'undefined') return false;
  if (!CACHE_CLEANUP_VERSION) return false;
  try {
    const previousVersion = String(localStorage.getItem(CACHE_CLEANUP_MARKER_KEY) || '').trim();
    if (previousVersion === CACHE_CLEANUP_VERSION) return false;
    localStorage.setItem(CACHE_CLEANUP_MARKER_KEY, CACHE_CLEANUP_VERSION);
    return true;
  } catch (_) {
    return false;
  }
};

if (shouldRunCacheCleanup()) {
  cleanupStaleBrowserCaches();
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
