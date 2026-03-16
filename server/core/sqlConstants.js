const SQL_INSERT_IGNORE_CATEGORY = `INSERT INTO categories (name, description, parent_id) VALUES (?, ?, NULL) ON CONFLICT DO NOTHING`;
const SQL_UPSERT_VISITOR_SESSION = `INSERT INTO visitor_sessions (session_id, user_id, started_at, last_seen_at, last_path, referrer, user_agent, ip_hash)
   VALUES (?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, ?, ?, ?, ?)
   ON CONFLICT(session_id) DO UPDATE SET
     last_seen_at = CURRENT_TIMESTAMP,
     last_path = EXCLUDED.last_path,
     user_id = COALESCE(visitor_sessions.user_id, EXCLUDED.user_id),
     referrer = COALESCE(visitor_sessions.referrer, EXCLUDED.referrer),
     user_agent = COALESCE(visitor_sessions.user_agent, EXCLUDED.user_agent),
     ip_hash = COALESCE(visitor_sessions.ip_hash, EXCLUDED.ip_hash),
     ended_at = NULL`;
const SQL_UPSERT_IMPORT_BATCH = `INSERT INTO import_batches (batch_id, kind, created_by, payload, checksum, status, expires_at)
   VALUES (?, ?, ?, ?, ?, ?, TO_TIMESTAMP(? / 1000.0))
   ON CONFLICT(batch_id) DO UPDATE SET
     kind = EXCLUDED.kind,
     created_by = EXCLUDED.created_by,
     payload = EXCLUDED.payload,
     checksum = EXCLUDED.checksum,
     status = EXCLUDED.status,
     expires_at = EXCLUDED.expires_at`;
const SQL_CAST_TO_INT = `(
    CASE
      WHEN dl.source_id IS NULL THEN NULL
      WHEN btrim(dl.source_id) ~ '^[0-9]+$' THEN CAST(btrim(dl.source_id) AS BIGINT)
      WHEN btrim(dl.source_id) ~ '^[0-9]+\\.0+$' THEN CAST(split_part(btrim(dl.source_id), '.', 1) AS BIGINT)
      ELSE NULL
    END
  )`;

module.exports = {
  SQL_INSERT_IGNORE_CATEGORY,
  SQL_UPSERT_VISITOR_SESSION,
  SQL_UPSERT_IMPORT_BATCH,
  SQL_CAST_TO_INT,
};
