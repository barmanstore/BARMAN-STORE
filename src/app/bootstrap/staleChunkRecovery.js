const STALE_CHUNK_RELOAD_KEY = 'barman_stale_chunk_reload_once';
const STALE_CHUNK_RELOAD_AT_KEY = 'barman_stale_chunk_reload_at';

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

export const registerStaleChunkRecovery = () => {
  if (typeof window === 'undefined') return;
  window.addEventListener('error', (event) => recoverFromStaleChunk(event?.error || event?.message));
  window.addEventListener('unhandledrejection', (event) => recoverFromStaleChunk(event?.reason));
};
