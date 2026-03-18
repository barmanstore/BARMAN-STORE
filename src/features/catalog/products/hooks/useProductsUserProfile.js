import { useEffect, useState } from 'react';
import { resolveMediaSourceForDisplay } from '../api/index.js';
import { readLocalUser } from '../utils/productHelpers.js';

const useProductsUserProfile = () => {
  const [localUser, setLocalUser] = useState(() => readLocalUser());
  const [avatarLoadFailed, setAvatarLoadFailed] = useState(false);
  const [avatarSrc, setAvatarSrc] = useState('');

  useEffect(() => {
    if (typeof window === 'undefined') return undefined;
    const syncUser = () => setLocalUser(readLocalUser());
    window.addEventListener('storage', syncUser);
    window.addEventListener('user-updated', syncUser);
    return () => {
      window.removeEventListener('storage', syncUser);
      window.removeEventListener('user-updated', syncUser);
    };
  }, []);

  useEffect(() => {
    setAvatarLoadFailed(false);
  }, [localUser?.profile_image]);

  useEffect(() => {
    let cancelled = false;
    let revokeUrl = null;
    const run = async () => {
      if (avatarLoadFailed || !localUser?.profile_image) {
        setAvatarSrc('');
        return;
      }
      const resolved = await resolveMediaSourceForDisplay(localUser.profile_image);
      if (cancelled) {
        if (resolved.revoke && resolved.src) URL.revokeObjectURL(resolved.src);
        return;
      }
      setAvatarSrc(resolved.src || '');
      revokeUrl = resolved.revoke ? resolved.src : null;
    };
    run();
    return () => {
      cancelled = true;
      if (revokeUrl) URL.revokeObjectURL(revokeUrl);
    };
  }, [localUser?.profile_image, avatarLoadFailed]);

  return {
    localUser,
    avatarLoadFailed,
    avatarSrc,
    setAvatarLoadFailed,
  };
};

export default useProductsUserProfile;

