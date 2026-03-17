const normalizeBaseUrl = (value) => {
  const raw = String(value || '').trim().replace(/\/+$/, '');
  if (!raw) return '';
  try {
    const parsed = new URL(raw);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return '';
    return `${parsed.protocol}//${parsed.host}`;
  } catch (_) {
    return '';
  }
};

const parseStorageErrorMessage = (payload, fallback = 'Storage request failed') => {
  if (!payload || typeof payload !== 'object') return fallback;
  return String(
    payload.error_description
      || payload.msg
      || payload.error
      || payload.message
      || fallback
  );
};

const createProfileImageStorage = ({
  provider,
  supabaseUrl,
  serviceRoleKey,
  bucket,
  profileUploadDir,
  fs,
  path,
  fetch,
} = {}) => {
  const normalizedProvider = String(provider || '').trim().toLowerCase();
  const baseUrl = normalizeBaseUrl(supabaseUrl);
  const normalizedBucket = String(bucket || '').trim();
  const normalizedServiceRoleKey = String(serviceRoleKey || '').trim();
  const supabaseReady = Boolean(baseUrl && normalizedBucket && normalizedServiceRoleKey && fetch);
  const useSupabase = normalizedProvider === 'supabase' || (!normalizedProvider && supabaseReady);

  const ensureLocalDir = () => {
    if (!profileUploadDir || !fs || !fs.existsSync) return;
    if (!fs.existsSync(profileUploadDir)) {
      fs.mkdirSync(profileUploadDir, { recursive: true });
    }
  };

  const buildLocalPath = (fileName) => `/uploads/profiles/${path.basename(String(fileName || ''))}`;
  const buildSupabaseObjectPath = (fileName) => `profiles/${path.basename(String(fileName || ''))}`;
  const buildSupabasePublicUrl = (objectPath) => `${baseUrl}/storage/v1/object/public/${normalizedBucket}/${objectPath}`;

  const uploadToSupabase = async ({ fileName, buffer, contentType }) => {
    if (!supabaseReady) throw new Error('Supabase Storage is not configured');
    const objectPath = buildSupabaseObjectPath(fileName);
    const response = await fetch(`${baseUrl}/storage/v1/object/${normalizedBucket}/${objectPath}`, {
      method: 'POST',
      headers: {
        apikey: normalizedServiceRoleKey,
        Authorization: `Bearer ${normalizedServiceRoleKey}`,
        'Content-Type': contentType || 'application/octet-stream',
        'x-upsert': 'true',
      },
      body: buffer,
    });
    let payload = null;
    try {
      payload = await response.json();
    } catch (_) {
      payload = null;
    }
    if (!response.ok) {
      throw new Error(parseStorageErrorMessage(payload, `Supabase Storage upload failed (${response.status})`));
    }
    return {
      url: buildSupabasePublicUrl(objectPath),
      provider: 'supabase',
      objectPath,
    };
  };

  const uploadToLocal = ({ fileName, buffer }) => {
    ensureLocalDir();
    const safeName = path.basename(String(fileName || ''));
    const absPath = path.join(profileUploadDir, safeName);
    fs.writeFileSync(absPath, buffer);
    return {
      url: buildLocalPath(safeName),
      provider: 'local',
      objectPath: null,
    };
  };

  const uploadProfileImage = async ({ fileName, buffer, contentType }) => {
    if (useSupabase) {
      return uploadToSupabase({ fileName, buffer, contentType });
    }
    return uploadToLocal({ fileName, buffer });
  };

  const deleteLocalByUrl = (profileImage) => {
    const rel = String(profileImage || '').trim();
    if (!rel.startsWith('/uploads/profiles/')) return false;
    const fileName = path.basename(rel);
    const filePath = path.join(profileUploadDir, fileName);
    if (fs.existsSync(filePath)) {
      try {
        fs.unlinkSync(filePath);
      } catch (_) {
        // ignore file delete errors
      }
    }
    return true;
  };

  const deleteSupabaseByUrl = async (profileImage) => {
    if (!supabaseReady) return false;
    const raw = String(profileImage || '').trim();
    const prefix = `${baseUrl}/storage/v1/object/public/${normalizedBucket}/`;
    if (!raw.startsWith(prefix)) return false;
    const objectPath = raw.slice(prefix.length);
    const response = await fetch(`${baseUrl}/storage/v1/object/${normalizedBucket}/${objectPath}`, {
      method: 'DELETE',
      headers: {
        apikey: normalizedServiceRoleKey,
        Authorization: `Bearer ${normalizedServiceRoleKey}`,
      },
    });
    return response.ok;
  };

  const deleteProfileImage = async ({ profileImage } = {}) => {
    const raw = String(profileImage || '').trim();
    if (!raw) return false;
    if (raw.startsWith('/uploads/profiles/')) return deleteLocalByUrl(raw);
    if (raw.startsWith('http')) {
      const deleted = await deleteSupabaseByUrl(raw);
      return deleted;
    }
    return false;
  };

  return {
    uploadProfileImage,
    deleteProfileImage,
    isSupabaseStorage: () => useSupabase,
    isLocalStorage: () => !useSupabase,
  };
};

module.exports = { createProfileImageStorage };
