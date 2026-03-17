require('../server/loadEnv');
const fs = require('fs');
const path = require('path');
const { createPostgresPool } = require('../server/db/postgresScaffold');

const args = process.argv.slice(2);
const hasFlag = (flag) => args.includes(flag);
const getArgValue = (prefix) => {
  const hit = args.find((arg) => arg.startsWith(prefix));
  return hit ? hit.slice(prefix.length) : '';
};

const dryRun = hasFlag('--dry-run') || !hasFlag('--apply');
const limit = Number(getArgValue('--limit=')) || 0;
const onlyMissing = hasFlag('--only-missing');

const supabaseUrlRaw = String(process.env.SUPABASE_URL || '').trim();
const supabaseUrl = supabaseUrlRaw.replace(/\/+$/, '');
const serviceRoleKey = String(process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
const uploadsDir = process.env.UPLOADS_DIR
  ? path.resolve(process.env.UPLOADS_DIR)
  : path.join(path.resolve(__dirname, '..'), 'server', 'uploads');
const profileDir = path.join(uploadsDir, 'profiles');

const resolveContentType = (fileName) => {
  const lower = String(fileName || '').toLowerCase();
  if (lower.endsWith('.jpg') || lower.endsWith('.jpeg')) return 'image/jpeg';
  if (lower.endsWith('.png')) return 'image/png';
  if (lower.endsWith('.webp')) return 'image/webp';
  return 'application/octet-stream';
};

const fetchJson = async (url, options) => {
  const response = await fetch(url, options);
  let payload = null;
  try {
    payload = await response.json();
  } catch (_) {
    payload = null;
  }
  return { response, payload };
};

const listBuckets = async () => {
  const { response, payload } = await fetchJson(`${supabaseUrl}/storage/v1/bucket`, {
    headers: {
      apikey: serviceRoleKey,
      Authorization: `Bearer ${serviceRoleKey}`,
    },
  });
  if (!response.ok) {
    const message = payload?.message || payload?.error || `Supabase bucket list failed (${response.status})`;
    throw new Error(message);
  }
  return Array.isArray(payload) ? payload : [];
};

const createBucket = async (name) => {
  const { response, payload } = await fetchJson(`${supabaseUrl}/storage/v1/bucket`, {
    method: 'POST',
    headers: {
      apikey: serviceRoleKey,
      Authorization: `Bearer ${serviceRoleKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ name, public: true }),
  });
  if (!response.ok) {
    const message = payload?.message || payload?.error || `Bucket create failed (${response.status})`;
    throw new Error(message);
  }
  return payload || { name };
};

const pickBucket = (buckets) => {
  const preferred = ['profile-images', 'profiles', 'avatars', 'public'];
  const byName = (name) => buckets.find((bucket) => String(bucket?.name || '') === name);
  for (const name of preferred) {
    const match = byName(name);
    if (match) return match.name;
  }
  const publicBucket = buckets.find((bucket) => bucket?.public);
  if (publicBucket) return publicBucket.name;
  if (buckets.length === 1) return buckets[0].name;
  return '';
};

const uploadToSupabase = async ({ bucket, fileName, buffer, contentType }) => {
  const objectPath = `profiles/${fileName}`;
  const uploadUrl = `${supabaseUrl}/storage/v1/object/${bucket}/${objectPath}`;
  const { response, payload } = await fetchJson(uploadUrl, {
    method: 'POST',
    headers: {
      apikey: serviceRoleKey,
      Authorization: `Bearer ${serviceRoleKey}`,
      'Content-Type': contentType,
      'x-upsert': 'true',
    },
    body: buffer,
  });
  if (!response.ok) {
    const message = payload?.message || payload?.error || `Upload failed (${response.status})`;
    throw new Error(message);
  }
  return `${supabaseUrl}/storage/v1/object/public/${bucket}/${objectPath}`;
};

const main = async () => {
  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required.');
  }

  let bucket = String(process.env.SUPABASE_STORAGE_BUCKET || process.env.PROFILE_IMAGE_BUCKET || '').trim();
  if (!bucket) {
    const buckets = await listBuckets();
    bucket = pickBucket(buckets);
    if (!bucket) {
      if (buckets.length === 0) {
        const fallbackName = String(process.env.SUPABASE_STORAGE_BUCKET_DEFAULT || 'profile-images').trim();
        const created = await createBucket(fallbackName);
        bucket = created?.name || fallbackName;
        console.log(`[Profile Images] Created public bucket "${bucket}".`);
      } else {
        const available = buckets.map((entry) => `${entry.name}${entry.public ? ' (public)' : ''}`).join(', ');
        throw new Error(`SUPABASE_STORAGE_BUCKET not set and no suitable bucket found. Available: ${available}`);
      }
    }
  }

  if (!fs.existsSync(profileDir)) {
    console.log(`[Profile Images] Local profile directory not found: ${profileDir}`);
  }

  const pool = createPostgresPool();
  const migrated = [];
  const missing = [];
  const failed = [];
  try {
    const { rows } = await pool.query(
      `SELECT id, profile_image
       FROM users
       WHERE profile_image LIKE '/uploads/profiles/%'
          OR profile_image LIKE '/api/uploads/profiles/%'
       ORDER BY id ASC`
    );

    const targetRows = limit > 0 ? rows.slice(0, limit) : rows;
    console.log(`[Profile Images] Found ${rows.length} local profile images${limit ? ` (processing ${targetRows.length})` : ''}.`);
    console.log(`[Profile Images] Bucket: ${bucket}. Dry run: ${dryRun ? 'yes' : 'no'}.`);

    for (const row of targetRows) {
      const rawPath = String(row.profile_image || '').trim();
      const fileName = path.basename(rawPath);
      const filePath = path.join(profileDir, fileName);

      if (!fs.existsSync(filePath)) {
        missing.push({ id: row.id, profile_image: rawPath });
        if (!onlyMissing) {
          console.log(`[Profile Images] Missing file for user ${row.id}: ${filePath}`);
        }
        continue;
      }

      if (onlyMissing) continue;

      try {
        const buffer = fs.readFileSync(filePath);
        const contentType = resolveContentType(fileName);
        const publicUrl = dryRun
          ? `${supabaseUrl}/storage/v1/object/public/${bucket}/profiles/${fileName}`
          : await uploadToSupabase({ bucket, fileName, buffer, contentType });

        if (!dryRun) {
          await pool.query('UPDATE users SET profile_image = $1 WHERE id = $2', [publicUrl, row.id]);
        }
        migrated.push({ id: row.id, profile_image: publicUrl });
        console.log(`[Profile Images] ${dryRun ? 'Would migrate' : 'Migrated'} user ${row.id} -> ${publicUrl}`);
      } catch (error) {
        failed.push({ id: row.id, profile_image: rawPath, error: error.message });
        console.log(`[Profile Images] Failed user ${row.id}: ${error.message}`);
      }
    }
  } finally {
    await pool.end().catch(() => {});
  }

  console.log('');
  console.log(`[Profile Images] Summary:`);
  console.log(`- Migrated: ${migrated.length}`);
  console.log(`- Missing files: ${missing.length}`);
  console.log(`- Failed uploads: ${failed.length}`);
  if (dryRun) {
    console.log(`- Dry run mode was enabled. Re-run with --apply to persist changes.`);
  }
  if (missing.length) {
    console.log(`[Profile Images] Missing file examples:`);
    missing.slice(0, 5).forEach((entry) => {
      console.log(`- user ${entry.id}: ${entry.profile_image}`);
    });
  }
};

main().catch((error) => {
  console.error(`[Profile Images] Migration failed: ${error.message}`);
  process.exit(1);
});
