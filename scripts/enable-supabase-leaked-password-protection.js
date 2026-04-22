require('../server/loadEnv');

const parseArgValue = (name) => {
  const prefix = `--${name}=`;
  const found = process.argv.slice(2).find((arg) => String(arg || '').startsWith(prefix));
  if (!found) return '';
  return String(found.slice(prefix.length)).trim();
};

const parseBooleanFlag = (name) => process.argv.slice(2).includes(`--${name}`);

const deriveProjectRefFromSupabaseUrl = (value) => {
  const raw = String(value || '').trim();
  if (!raw) return '';
  try {
    const parsed = new URL(raw);
    const match = String(parsed.hostname || '').match(/^([a-z0-9-]+)\.supabase\.(co|com)$/i);
    return match?.[1] ? String(match[1]).toLowerCase() : '';
  } catch (_) {
    return '';
  }
};

const deriveProjectRefFromDbUrl = (value) => {
  const raw = String(value || '').trim();
  if (!raw) return '';
  try {
    const parsed = new URL(raw);
    const username = decodeURIComponent(String(parsed.username || ''));
    const fromUser = username.match(/^postgres\.([a-z0-9-]+)$/i);
    if (fromUser?.[1]) return String(fromUser[1]).toLowerCase();
    const host = String(parsed.hostname || '');
    const fromHost = host.match(/^db\.([a-z0-9-]+)\.supabase\.(co|com)$/i);
    if (fromHost?.[1]) return String(fromHost[1]).toLowerCase();
    return '';
  } catch (_) {
    return '';
  }
};

const resolveProjectRef = () => {
  const fromArg = parseArgValue('project-ref');
  if (fromArg) return fromArg.toLowerCase();
  const fromEnv = String(process.env.SUPABASE_PROJECT_REF || '')
    .trim()
    .toLowerCase();
  if (fromEnv) return fromEnv;
  const fromUrl = deriveProjectRefFromSupabaseUrl(process.env.SUPABASE_URL);
  if (fromUrl) return fromUrl;
  return deriveProjectRefFromDbUrl(process.env.SUPABASE_DB_URL);
};

const resolveAccessToken = () => {
  const fromArg = parseArgValue('access-token');
  if (fromArg) return fromArg;
  const fromEnv = String(
    process.env.SUPABASE_ACCESS_TOKEN || process.env.SUPABASE_MANAGEMENT_API_TOKEN || ''
  ).trim();
  return fromEnv;
};

const requestManagementApi = async ({ projectRef, accessToken, method, body = null }) => {
  const response = await fetch(`https://api.supabase.com/v1/projects/${projectRef}/config/auth`, {
    method,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  const text = await response.text();
  let payload = null;
  try {
    payload = text ? JSON.parse(text) : null;
  } catch (_) {
    payload = { raw: text };
  }

  if (!response.ok) {
    const detail =
      payload?.message || payload?.error || payload?.msg || text || `HTTP ${response.status}`;
    throw new Error(`Supabase Management API ${method} failed: ${detail}`);
  }
  return payload || {};
};

const main = async () => {
  const projectRef = resolveProjectRef();
  const accessToken = resolveAccessToken();
  const dryRun = parseBooleanFlag('dry-run');

  if (!projectRef) {
    throw new Error(
      'Missing project ref. Set SUPABASE_PROJECT_REF or SUPABASE_URL/SUPABASE_DB_URL, or pass --project-ref=<ref>.'
    );
  }
  if (!accessToken) {
    throw new Error(
      'Missing Supabase management token. Set SUPABASE_ACCESS_TOKEN (Dashboard -> Account -> Access Tokens) or pass --access-token=<token>.'
    );
  }

  const current = await requestManagementApi({
    projectRef,
    accessToken,
    method: 'GET',
  });
  const enabled = Boolean(current?.password_hibp_enabled);

  if (enabled) {
    console.log(
      `[SECURITY] Leaked password protection is already enabled for project ${projectRef}.`
    );
    return;
  }

  if (dryRun) {
    console.log(
      `[SECURITY] Dry run: would enable password_hibp_enabled=true for project ${projectRef}.`
    );
    return;
  }

  await requestManagementApi({
    projectRef,
    accessToken,
    method: 'PATCH',
    body: { password_hibp_enabled: true },
  });

  const verify = await requestManagementApi({
    projectRef,
    accessToken,
    method: 'GET',
  });
  if (!Boolean(verify?.password_hibp_enabled)) {
    throw new Error(
      'Setting update returned success but verification read-back is still disabled.'
    );
  }

  console.log(
    `[SECURITY] Enabled leaked password protection (password_hibp_enabled=true) for project ${projectRef}.`
  );
};

main().catch((error) => {
  console.error(`[SECURITY] Failed to update leaked password protection: ${error.message}`);
  process.exit(1);
});
