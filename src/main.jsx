import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.jsx';
import { applyHostRedirect } from './app/bootstrap/hostRedirect';
import { registerStaleChunkRecovery } from './app/bootstrap/staleChunkRecovery';
import { runCacheCleanupIfNeeded } from './app/bootstrap/cacheCleanup';

applyHostRedirect();
registerStaleChunkRecovery();
runCacheCleanupIfNeeded();

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
