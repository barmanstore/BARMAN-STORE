import { useEffect, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import { analyticsApi } from '../../services/api';
import { safeLocalStorageGet, safeLocalStorageSet } from '../../utils/storage';

const VISITOR_SESSION_STORAGE_KEY = 'visitor_session_id';

const createVisitorSessionId = () => {
  if (typeof window !== 'undefined' && window.crypto?.randomUUID) {
    return window.crypto.randomUUID();
  }
  return `${Date.now()}_${Math.random().toString(36).slice(2, 12)}`;
};

const runWhenIdle = (task, timeout = 1000) => {
  if (typeof window === 'undefined' || typeof task !== 'function') return () => {};
  if (typeof window.requestIdleCallback === 'function') {
    const id = window.requestIdleCallback(() => task(), { timeout });
    return () => window.cancelIdleCallback(id);
  }
  const id = window.setTimeout(() => task(), Math.min(timeout, 250));
  return () => window.clearTimeout(id);
};

function VisitorTracker() {
  const location = useLocation();
  const sessionIdRef = useRef('');
  const latestPathRef = useRef('/');

  useEffect(() => {
    if (typeof window === 'undefined') return undefined;
    let existingSessionId = String(safeLocalStorageGet(VISITOR_SESSION_STORAGE_KEY) || '').trim();
    if (!existingSessionId) {
      existingSessionId = createVisitorSessionId();
      safeLocalStorageSet(VISITOR_SESSION_STORAGE_KEY, existingSessionId);
    }
    sessionIdRef.current = existingSessionId;
    latestPathRef.current = `${location.pathname || '/'}${location.search || ''}`;
    const cancelIdle = runWhenIdle(() => {
      analyticsApi.startSession({
        session_id: existingSessionId,
        path: latestPathRef.current,
        referrer: typeof document !== 'undefined' ? document.referrer || '' : '',
      }).catch(() => {});
    }, 1200);
    return () => cancelIdle();
  }, []);

  useEffect(() => {
    const currentPath = `${location.pathname || '/'}${location.search || ''}`;
    latestPathRef.current = currentPath;
    if (!sessionIdRef.current) return undefined;
    const cancelIdle = runWhenIdle(() => {
      analyticsApi.heartbeat({
        session_id: sessionIdRef.current,
        path: currentPath,
      }).catch(() => {});
    }, 900);
    return () => cancelIdle();
  }, [location.pathname, location.search]);

  useEffect(() => {
    if (typeof window === 'undefined') return undefined;
    const interval = window.setInterval(() => {
      if (!sessionIdRef.current) return;
      if (document.visibilityState !== 'visible') return;
      analyticsApi.heartbeat({
        session_id: sessionIdRef.current,
        path: latestPathRef.current || '/',
      }).catch(() => {});
    }, 45000);
    return () => window.clearInterval(interval);
  }, []);

  return null;
}

export default VisitorTracker;
