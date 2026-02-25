import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.jsx';

const STALE_CHUNK_RELOAD_KEY = 'barman_stale_chunk_reload_once';

const shouldRecoverStaleChunk = (reason) => {
  const message = String(reason?.message || reason || '');
  return (
    message.includes('Failed to fetch dynamically imported module') ||
    message.includes('Importing a module script failed')
  );
};

const recoverFromStaleChunk = (reason) => {
  if (!shouldRecoverStaleChunk(reason) || typeof window === 'undefined') return;
  if (sessionStorage.getItem(STALE_CHUNK_RELOAD_KEY) === '1') return;
  sessionStorage.setItem(STALE_CHUNK_RELOAD_KEY, '1');
  const nextUrl = `${window.location.origin}${window.location.pathname}?v=${Date.now()}${window.location.hash || ''}`;
  window.location.replace(nextUrl);
};

window.addEventListener('error', (event) => recoverFromStaleChunk(event?.error || event?.message));
window.addEventListener('unhandledrejection', (event) => recoverFromStaleChunk(event?.reason));

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
