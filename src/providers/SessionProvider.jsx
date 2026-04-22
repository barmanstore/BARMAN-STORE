import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import {
  safeLocalStorageGet,
  safeLocalStorageRemove,
  safeLocalStorageSet,
} from '../shared/utils/storage';
import { registerSessionAccess } from '../shared/services/api/sessionAccess';

const SessionContext = createContext(null);
const USER_STORAGE_KEY = 'user';

const dispatchUserUpdated = () => {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new Event('user-updated'));
};

const normalizeSessionUser = (rawValue) => {
  if (!rawValue || typeof rawValue !== 'object') return null;
  const userId = Number(rawValue?.id || 0) || 0;
  const token = String(rawValue?.token || '').trim();
  if (!userId || !token) return null;
  return {
    ...rawValue,
    id: userId,
    token,
  };
};

export const readStoredSessionUser = () => {
  const savedUser = safeLocalStorageGet(USER_STORAGE_KEY);
  if (!savedUser) return null;
  try {
    const parsedUser = JSON.parse(savedUser);
    const normalized = normalizeSessionUser(parsedUser);
    if (!normalized) {
      safeLocalStorageRemove(USER_STORAGE_KEY);
      return null;
    }
    return normalized;
  } catch (_) {
    safeLocalStorageRemove(USER_STORAGE_KEY);
    return null;
  }
};

export function SessionProvider({ children }) {
  const [user, setUserState] = useState(() => readStoredSessionUser());

  const refreshUser = useCallback(() => {
    setUserState(readStoredSessionUser());
  }, []);

  const setUser = useCallback((nextUser) => {
    const normalized = normalizeSessionUser(nextUser);
    if (!normalized) {
      safeLocalStorageRemove(USER_STORAGE_KEY);
      setUserState(null);
      dispatchUserUpdated();
      return null;
    }
    safeLocalStorageSet(USER_STORAGE_KEY, JSON.stringify(normalized));
    setUserState(normalized);
    dispatchUserUpdated();
    return normalized;
  }, []);

  const clearUser = useCallback(() => {
    safeLocalStorageRemove(USER_STORAGE_KEY);
    setUserState(null);
    dispatchUserUpdated();
  }, []);

  useEffect(() => {
    window.addEventListener('storage', refreshUser);
    window.addEventListener('user-updated', refreshUser);
    return () => {
      window.removeEventListener('storage', refreshUser);
      window.removeEventListener('user-updated', refreshUser);
    };
  }, [refreshUser]);

  useEffect(() => {
    registerSessionAccess({
      getUser: () => user,
      clearUser,
    });
  }, [clearUser, user]);

  const value = useMemo(() => {
    const isLoggedIn = Boolean(
      user?.id ||
      String(user?.token || '').trim() ||
      String(user?.supabase_session?.access_token || '').trim() ||
      String(user?.email || '').trim() ||
      String(user?.phone || '').trim()
    );
    const isAdminUser =
      String(user?.role || '')
        .trim()
        .toLowerCase() === 'admin';
    return {
      user,
      setUser,
      clearUser,
      refreshUser,
      isLoggedIn,
      isAdminUser,
    };
  }, [clearUser, refreshUser, setUser, user]);

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export const useSession = () => {
  const context = useContext(SessionContext);
  if (!context) {
    throw new Error('useSession must be used within SessionProvider');
  }
  return context;
};
