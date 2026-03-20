import { useEffect, useMemo, useState } from 'react';
import {
  createBackofficePopupChannel,
  getBackofficePopupConfig,
  readBackofficePopupStatus,
} from '../utils/backofficePopup';

function useBackofficePopupStatus(kind) {
  const popupKind = String(kind || '').trim().toLowerCase();
  const [status, setStatus] = useState(() => readBackofficePopupStatus(popupKind));

  useEffect(() => {
    setStatus(readBackofficePopupStatus(popupKind));
  }, [popupKind]);

  useEffect(() => {
    if (!popupKind) return undefined;

    const sync = () => setStatus(readBackofficePopupStatus(popupKind));
    const handleStorage = (event) => {
      if (event.key && event.key !== `backoffice_popup_status_${popupKind}`) return;
      sync();
    };

    const channel = createBackofficePopupChannel();
    const handleChannelMessage = (event) => {
      if (event?.data?.type !== 'popup-status') return;
      if (String(event?.data?.kind || '').trim().toLowerCase() !== popupKind) return;
      sync();
    };

    window.addEventListener('storage', handleStorage);
    channel?.addEventListener('message', handleChannelMessage);

    const refreshTimer = window.setInterval(sync, 15000);

    return () => {
      window.removeEventListener('storage', handleStorage);
      window.clearInterval(refreshTimer);
      channel?.removeEventListener('message', handleChannelMessage);
      channel?.close();
    };
  }, [popupKind]);

  return useMemo(() => ({
    ...status,
    label: status.label || getBackofficePopupConfig(popupKind)?.label || '',
  }), [popupKind, status]);
}

export default useBackofficePopupStatus;
