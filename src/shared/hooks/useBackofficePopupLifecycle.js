import { useEffect, useMemo } from 'react';
import {
  clearBackofficePopupStatus,
  getBackofficePopupConfig,
  writeBackofficePopupStatus,
} from '../utils/backofficePopup';

const createSessionId = () => {
  if (typeof window !== 'undefined' && window.crypto?.randomUUID) {
    return window.crypto.randomUUID();
  }
  return `popup_${Date.now()}_${Math.random().toString(36).slice(2, 12)}`;
};

function useBackofficePopupLifecycle(kind) {
  const popupKind = String(kind || '')
    .trim()
    .toLowerCase();
  const config = useMemo(() => getBackofficePopupConfig(popupKind), [popupKind]);
  // Create sessionId once and reuse it via useMemo
  const sessionId = useMemo(() => createSessionId(), []);

  useEffect(() => {
    if (!config) return undefined;

    const publishOpen = () => {
      writeBackofficePopupStatus(popupKind, {
        isOpen: true,
        sessionId,
        updatedAt: Date.now(),
        label: config.label,
      });
    };
    const publishClose = () => {
      clearBackofficePopupStatus(popupKind, sessionId);
    };

    publishOpen();
    const heartbeatId = window.setInterval(publishOpen, 15000);
    window.addEventListener('beforeunload', publishClose);
    window.addEventListener('pagehide', publishClose);

    return () => {
      window.clearInterval(heartbeatId);
      window.removeEventListener('beforeunload', publishClose);
      window.removeEventListener('pagehide', publishClose);
      publishClose();
    };
  }, [config, popupKind, sessionId]);

  return {
    kind: popupKind,
    label: config?.label || '',
    sessionId,
  };
}

export default useBackofficePopupLifecycle;
