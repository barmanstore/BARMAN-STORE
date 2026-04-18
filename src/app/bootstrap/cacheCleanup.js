const CACHE_CLEANUP_MARKER_KEY = 'barman_cache_cleanup_marker_v1';
const CACHE_CLEANUP_VERSION = String(import.meta.env.VITE_CACHE_CLEANUP_VERSION || '').trim();

const cleanupStaleBrowserCaches = () => {
  if (typeof window === 'undefined') return;
  if (window.location.protocol !== 'https:') return;

  if ('serviceWorker' in navigator) {
    navigator.serviceWorker
      .getRegistrations()
      .then((regs) => Promise.all(regs.map((reg) => reg.unregister())))
      .catch(() => {});
  }

  if ('caches' in window) {
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => /(workbox|vite|barman|vercel|precache)/i.test(String(key)))
            .map((key) => caches.delete(key))
        )
      )
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

export const runCacheCleanupIfNeeded = () => {
  if (shouldRunCacheCleanup()) {
    cleanupStaleBrowserCaches();
  }
};
