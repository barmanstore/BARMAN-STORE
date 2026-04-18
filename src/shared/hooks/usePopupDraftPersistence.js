import { useEffect, useMemo, useRef } from 'react';
import { broadcastBackofficePopupMessage } from '../utils/backofficePopup';
import { safeLocalStorageGet, safeLocalStorageRemove, safeLocalStorageSet } from '../utils/storage';

function usePopupDraftPersistence({
  kind,
  storageKey,
  enabled,
  isDirty,
  draft,
  onRestore,
  debounceMs = 0,
}) {
  const restoredRef = useRef(false);
  const persistTimeoutRef = useRef(null);
  const stableKey = String(storageKey || '').trim();

  const draftSnapshot = useMemo(
    () => ({
      version: 1,
      draft,
    }),
    [draft]
  );

  useEffect(() => {
    if (!enabled || !stableKey || restoredRef.current) return;
    restoredRef.current = true;
    const raw = safeLocalStorageGet(stableKey);
    if (!raw) return;
    try {
      const parsed = JSON.parse(raw);
      if (!parsed?.draft || typeof onRestore !== 'function') return;
      onRestore(parsed.draft);
    } catch (_) {
      safeLocalStorageRemove(stableKey);
    }
  }, [enabled, onRestore, stableKey]);

  useEffect(() => {
    if (!enabled || !stableKey || !restoredRef.current) return;
    if (persistTimeoutRef.current) {
      clearTimeout(persistTimeoutRef.current);
      persistTimeoutRef.current = null;
    }
    if (!isDirty) {
      safeLocalStorageRemove(stableKey);
      broadcastBackofficePopupMessage({
        type: 'draft-cleared',
        kind,
        updatedAt: Date.now(),
      });
      return;
    }
    const persistDraft = () => {
      const snapshot = {
        ...draftSnapshot,
        updatedAt: Date.now(),
      };
      safeLocalStorageSet(stableKey, JSON.stringify(snapshot));
      broadcastBackofficePopupMessage({
        type: 'draft-updated',
        kind,
        updatedAt: snapshot.updatedAt,
      });
    };
    if (Number(debounceMs || 0) > 0) {
      persistTimeoutRef.current = window.setTimeout(() => {
        persistDraft();
        persistTimeoutRef.current = null;
      }, Number(debounceMs));
      return () => {
        if (persistTimeoutRef.current) {
          clearTimeout(persistTimeoutRef.current);
          persistTimeoutRef.current = null;
        }
      };
    }
    persistDraft();
    return undefined;
  }, [debounceMs, draftSnapshot, enabled, isDirty, kind, stableKey]);

  useEffect(() => {
    if (!enabled || !isDirty) return undefined;
    const handleBeforeUnload = (event) => {
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [enabled, isDirty]);

  useEffect(
    () => () => {
      if (persistTimeoutRef.current) {
        clearTimeout(persistTimeoutRef.current);
        persistTimeoutRef.current = null;
      }
    },
    []
  );
}

export default usePopupDraftPersistence;
