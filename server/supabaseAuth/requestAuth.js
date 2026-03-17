const { parseErrorMessage } = require('./utils');

const createRequestAuth = ({
  isEnabled,
  baseUrl,
  normalizedAnonKey,
  normalizedServiceRoleKey,
}) => {
  return async ({
    path,
    method = 'GET',
    body = null,
    useServiceRole = false,
    accessToken = '',
  }) => {
    const key = useServiceRole ? normalizedServiceRoleKey : normalizedAnonKey;
    if (!isEnabled) throw new Error('Supabase Auth is disabled');
    if (!baseUrl) throw new Error('SUPABASE_URL is required for Supabase Auth');
    if (!key) {
      const missing = useServiceRole ? 'SUPABASE_SERVICE_ROLE_KEY' : 'SUPABASE_ANON_KEY';
      throw new Error(`${missing} is required for Supabase Auth`);
    }

    const headers = {
      apikey: key,
      'Content-Type': 'application/json',
      Authorization: accessToken
        ? `Bearer ${accessToken}`
        : `Bearer ${key}`,
    };

    const response = await fetch(`${baseUrl}${path}`, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });

    let payload = null;
    try {
      payload = await response.json();
    } catch (_) {
      payload = null;
    }

    if (!response.ok) {
      throw new Error(parseErrorMessage(payload, `Supabase Auth failed (${response.status})`));
    }
    return payload || {};
  };
};

module.exports = { createRequestAuth };
