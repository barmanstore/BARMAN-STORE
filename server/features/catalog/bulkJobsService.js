const BULK_JOB_OPERATION = 'bulk_update';
const BULK_JOB_IMPORT_OPERATION = 'import_products';
const BULK_JOB_RUNNER_INTERVAL_MS = 2500;
const BULK_JOB_LEASE_MS = 90000;
const BULK_JOB_BATCH_SIZE = 50;
const BULK_JOB_CURSOR_VERSION = 1;
const PRODUCT_SNAPSHOT_FIELDS = [
  'id',
  'name',
  'description',
  'brand',
  'sub_brand',
  'content',
  'color',
  'price',
  'mrp',
  'uom',
  'sku',
  'barcode',
  'image',
  'stock',
  'category',
  'subcategory',
  'expiry_date',
  'default_discount',
  'discount_type',
  'is_active',
  'created_at',
  'category_id',
  'purchase_pack_size',
  'base_unit',
  'uom_type',
  'conversion_factor',
];

const BULK_JOB_FINAL_STATES = new Set([
  'completed',
  'completed_with_errors',
  'failed',
  'cancelled',
]);

const clampInt = (value, fallback, min, max) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, Math.round(parsed)));
};

const normalizeBulkOperation = (value) =>
  String(value || '')
    .trim()
    .toLowerCase();

const normalizeImportJobMode = (value) => {
  const raw = String(value || '')
    .trim()
    .toLowerCase();
  if (raw === 'create_only' || raw === 'update_only' || raw === 'upsert') return raw;
  return 'upsert';
};

const normalizeImportStockMode = (value) => {
  const raw = String(value || '')
    .trim()
    .toLowerCase();
  if (raw === 'delta' || raw === 'replace') return raw;
  return 'replace';
};

const normalizeBulkProductIds = (values = []) =>
  Array.from(
    new Set(
      (Array.isArray(values) ? values : [])
        .map((value) => Number(value) || 0)
        .filter((value) => Number.isInteger(value) && value > 0)
    )
  ).sort((a, b) => a - b);

const normalizeBulkPayload = (payload = {}) => {
  const normalized = {};
  const rawCategory = String(payload?.category || '').trim();
  if (rawCategory) normalized.category = rawCategory.slice(0, 160);

  const rawPrice = String(payload?.price ?? '').trim();
  if (rawPrice !== '') {
    const value = Number(rawPrice);
    if (Number.isFinite(value) && value >= 0) normalized.price = Number(value.toFixed(2));
  }

  const rawStock = String(payload?.stock ?? '').trim();
  if (rawStock !== '') {
    const value = Number(rawStock);
    if (Number.isFinite(value)) normalized.stock = Math.max(0, Math.round(value));
  }

  const rawStatus = String(payload?.status ?? '').trim();
  if (rawStatus !== '') {
    normalized.is_active = rawStatus === '1' || rawStatus.toLowerCase() === 'active' ? 1 : 0;
  } else if (payload?.is_active !== undefined && payload?.is_active !== null) {
    normalized.is_active = Number(payload.is_active) === 1 ? 1 : 0;
  }

  return normalized;
};

const normalizeBulkPayloadForHash = (payload = {}) => {
  const normalized = normalizeBulkPayload(payload);
  return {
    category: normalized.category || '',
    price: normalized.price ?? null,
    stock: normalized.stock ?? null,
    is_active: normalized.is_active ?? null,
  };
};

const normalizeImportBulkPayloadForHash = (payload = {}) => ({
  batch_id: String(payload?.batch_id || '').trim(),
  checksum: String(payload?.checksum || '').trim(),
  file_name: String(payload?.file_name || '').trim(),
  file_hash: String(payload?.file_hash || '').trim(),
  mode: normalizeImportJobMode(payload?.mode),
  stock_mode: normalizeImportStockMode(payload?.stock_mode),
  source: String(payload?.source || '')
    .trim()
    .toLowerCase(),
  allow_identical_rows: Array.isArray(payload?.allow_identical_rows)
    ? payload.allow_identical_rows
        .map((value) => Number(value) || 0)
        .filter(Boolean)
        .sort((a, b) => a - b)
    : [],
  row_count: Math.max(0, Number(payload?.row_count || 0)),
});

const normalizeImportBulkItemsForHash = (items = []) =>
  (Array.isArray(items) ? items : [])
    .map((item) => ({
      source_row_id: Number(item?.source_row_id || item?.row || 0),
      product_id: item?.product_id == null ? null : Number(item.product_id) || null,
      row_action: String(item?.row_action || '')
        .trim()
        .toLowerCase(),
      before_updated_at: String(item?.before_state?.updated_at || '').trim(),
      raw_payload:
        item?.raw_payload && typeof item.raw_payload === 'object' ? item.raw_payload : {},
      normalized_payload:
        item?.normalized_payload && typeof item.normalized_payload === 'object'
          ? item.normalized_payload
          : {},
      allow_identical_confirmation: Boolean(item?.allow_identical_confirmation),
    }))
    .sort((a, b) => a.source_row_id - b.source_row_id);

const buildRequestHash = (operation, productIds, payload) => {
  const normalizedOperation = normalizeBulkOperation(operation);
  if (normalizedOperation === BULK_JOB_IMPORT_OPERATION) {
    const normalizedPayload = normalizeImportBulkPayloadForHash(payload);
    const normalizedItems = normalizeImportBulkItemsForHash(payload?.items || []);
    return {
      operation: normalizedOperation,
      payload: normalizedPayload,
      items: normalizedItems,
    };
  }

  return {
    operation: normalizedOperation,
    product_ids: normalizeBulkProductIds(productIds),
    payload: normalizeBulkPayloadForHash(payload),
  };
};

const buildProductSnapshot = (row = {}) => {
  const snapshot = {};
  for (const field of PRODUCT_SNAPSHOT_FIELDS) {
    snapshot[field] = row?.[field] ?? null;
  }
  snapshot.snapshot_hash = null;
  return snapshot;
};

const hashSnapshot = (snapshot = {}) => {
  const stable = {};
  for (const field of PRODUCT_SNAPSHOT_FIELDS) {
    stable[field] = snapshot?.[field] ?? null;
  }
  return stable;
};

const parseJsonMaybe = (value, fallback = {}) => {
  if (value && typeof value === 'object') return value;
  const raw = String(value || '').trim();
  if (!raw) return fallback;
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : fallback;
  } catch (_) {
    return fallback;
  }
};

const buildJobRecord = (row = {}) => ({
  id: Number(row?.id || 0),
  operation: String(row?.operation || ''),
  status: String(row?.status || ''),
  total: Number(row?.total || 0),
  processed: Number(row?.processed || 0),
  succeeded: Number(row?.succeeded || 0),
  failed: Number(row?.failed || 0),
  skipped: Number(row?.skipped || 0),
  conflicts: Number(row?.conflicts || 0),
  payload: parseJsonMaybe(row?.payload, {}),
  request_hash: String(row?.request_hash || ''),
  result_summary: parseJsonMaybe(row?.result_summary, {}),
  idempotency_key: String(row?.idempotency_key || ''),
  created_by: row?.created_by == null ? null : Number(row.created_by),
  created_at: row?.created_at || null,
  updated_at: row?.updated_at || null,
  started_at: row?.started_at || null,
  completed_at: row?.completed_at || null,
  cancel_requested_at: row?.cancel_requested_at || null,
  cancelled_at: row?.cancelled_at || null,
  locked_at: row?.locked_at || null,
  lease_expires_at: row?.lease_expires_at || null,
  locked_by: row?.locked_by || null,
  error_message: row?.error_message || null,
});

const buildJobItemRecord = (row = {}) => ({
  id: Number(row?.id || 0),
  job_id: Number(row?.job_id || 0),
  product_id: row?.product_id == null ? null : Number(row.product_id),
  status: String(row?.status || ''),
  error_message: row?.error_message || null,
  before_state: parseJsonMaybe(row?.before_state, {}),
  after_state: parseJsonMaybe(row?.after_state, {}),
  row_action: String(row?.row_action || 'bulk_update'),
  source_row_id: row?.source_row_id == null ? null : Number(row.source_row_id),
  raw_payload: parseJsonMaybe(row?.raw_payload, {}),
  normalized_payload: parseJsonMaybe(row?.normalized_payload, {}),
  attempt_count: Number(row?.attempt_count || 0),
  last_attempt_at: row?.last_attempt_at || null,
  created_at: row?.created_at || null,
  updated_at: row?.updated_at || null,
});

const encodeCursorToken = (payload) =>
  Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');

const decodeCursorToken = (token) => {
  const raw = String(token || '').trim();
  if (!raw) return null;
  const parsed = JSON.parse(Buffer.from(raw, 'base64url').toString('utf8'));
  return parsed && typeof parsed === 'object' ? parsed : null;
};

const createCatalogBulkJobsService = ({
  dbAllAsync,
  dbGetAsync,
  dbRunAsync,
  dbTxAsync,
  resolveOrCreateCategoryHierarchyAsync,
  logAdminAuditAsync,
  resolveClientRequestId,
  normalizeProductInput,
  validateProductPayload,
  findProductConflictAsync,
  buildProductExactKey,
  normalizeTextKey,
  SQL_INSERT_IGNORE_CATEGORY,
  crypto,
  IS_VERCEL_RUNTIME = false,
  runnerIntervalMs = BULK_JOB_RUNNER_INTERVAL_MS,
  leaseMs = BULK_JOB_LEASE_MS,
  batchSize = BULK_JOB_BATCH_SIZE,
} = {}) => {
  let runnerTimer = null;
  let runnerBusy = false;
  const runnerId = `catalog-bulk-${process.pid}`;
  const leaseWindowMs = clampInt(leaseMs, BULK_JOB_LEASE_MS, 15000, 15 * 60 * 1000);
  const loopIntervalMs = clampInt(runnerIntervalMs, BULK_JOB_RUNNER_INTERVAL_MS, 1000, 30000);
  const chunkSize = clampInt(batchSize, BULK_JOB_BATCH_SIZE, 1, 1000);
  const leaseWindowSeconds = Math.max(1, Math.round(leaseWindowMs / 1000));

  const buildSnapshotHash = (snapshot = {}) => {
    const stable = hashSnapshot(snapshot);
    return crypto.createHash('sha256').update(JSON.stringify(stable)).digest('hex');
  };

  const buildRequestFingerprint = (operation, productIds, payload, items = []) =>
    crypto
      .createHash('sha256')
      .update(
        JSON.stringify({
          ...buildRequestHash(operation, productIds, payload),
          items:
            normalizeBulkOperation(operation) === BULK_JOB_IMPORT_OPERATION
              ? normalizeImportBulkItemsForHash(items)
              : undefined,
        })
      )
      .digest('hex');

  const normalizeJobSummary = (job = {}) => {
    const summary = parseJsonMaybe(job?.result_summary, {});
    return {
      total: Number(job?.total ?? summary?.total ?? 0),
      succeeded: Number(job?.succeeded ?? summary?.succeeded ?? 0),
      failed: Number(job?.failed ?? summary?.failed ?? 0),
      skipped: Number(job?.skipped ?? summary?.skipped ?? 0),
      conflicts: Number(job?.conflicts ?? summary?.conflicts ?? 0),
      created: Number(summary?.created ?? 0),
      updated: Number(summary?.updated ?? 0),
    };
  };

  const buildJobResultSummary = (job = {}) => normalizeJobSummary(job);

  const buildItemCursor = (item) =>
    encodeCursorToken({
      v: BULK_JOB_CURSOR_VERSION,
      last_id: Number(item?.id || 0),
    });

  const getBulkJobByIdAsync = async (jobId) => {
    const row = await dbGetAsync('SELECT * FROM bulk_jobs WHERE id = ? LIMIT 1', [jobId]);
    return row ? buildJobRecord(row) : null;
  };

  const getBulkJobItemsPageAsync = async (
    jobId,
    { cursor = '', limit = BULK_JOB_BATCH_SIZE } = {}
  ) => {
    const pageSize = clampInt(limit, BULK_JOB_BATCH_SIZE, 1, 200);
    const cursorToken = String(cursor || '').trim();
    let cursorId = 0;
    if (cursorToken) {
      let decoded;
      try {
        decoded = decodeCursorToken(cursorToken);
      } catch (error) {
        throw Object.assign(new Error('Invalid cursor token'), {
          status: 400,
          details: error.message,
        });
      }
      if (!decoded || Number(decoded?.v || 0) !== BULK_JOB_CURSOR_VERSION) {
        throw Object.assign(new Error('Invalid cursor token'), { status: 400 });
      }
      cursorId = Number(decoded?.last_id || 0);
      if (!cursorId) {
        throw Object.assign(new Error('Invalid cursor token'), { status: 400 });
      }
    }

    const whereClauses = ['job_id = ?'];
    const params = [jobId];
    if (cursorId) {
      whereClauses.push('id > ?');
      params.push(cursorId);
    }

    const rows = await dbAllAsync(
      `SELECT * FROM bulk_job_items WHERE ${whereClauses.join(' AND ')} ORDER BY id ASC LIMIT ?`,
      [...params, pageSize + 1]
    );
    const totalRows = rows.map(buildJobItemRecord);
    const pageItems = totalRows.slice(0, pageSize);
    const hasMore = totalRows.length > pageSize;
    return {
      items: pageItems,
      page_info: {
        has_more: hasMore,
        next_cursor:
          pageItems.length && hasMore ? buildItemCursor(pageItems[pageItems.length - 1]) : null,
        prev_cursor: pageItems.length && cursorId ? buildItemCursor(pageItems[0]) : null,
      },
      meta: {
        page_size: pageSize,
        page_mode: 'cursor',
      },
    };
  };

  const validateBulkJobRequest = (operation, productIds, items, payload) => {
    const errors = [];
    const normalizedOperation = normalizeBulkOperation(operation);
    if (![BULK_JOB_OPERATION, BULK_JOB_IMPORT_OPERATION].includes(normalizedOperation)) {
      errors.push('Unsupported bulk job operation');
    }
    const ids = normalizeBulkProductIds(productIds);
    const normalizedPayload =
      normalizedOperation === BULK_JOB_IMPORT_OPERATION
        ? normalizeImportBulkPayloadForHash(payload)
        : normalizeBulkPayload(payload);
    const normalizedItems = Array.isArray(items) ? items : [];

    if (normalizedOperation === BULK_JOB_IMPORT_OPERATION) {
      if (normalizedItems.length === 0) errors.push('Import job must include at least one row');
      if (!normalizedPayload.batch_id || !normalizedPayload.checksum) {
        errors.push('Import job must include batch_id and checksum');
      }
    } else {
      if (ids.length === 0) errors.push('Select at least one product first');
      if (Object.keys(normalizedPayload).length === 0) {
        errors.push('Bulk update payload must include at least one field');
      }
    }
    return {
      errors,
      operation: normalizedOperation,
      ids,
      items: normalizedItems,
      normalizedPayload,
    };
  };

  const createBulkJobAsync = async ({
    req,
    operation,
    productIds,
    items,
    payload,
    createdBy = null,
  } = {}) => {
    const {
      errors,
      operation: normalizedOperation,
      ids,
      items: normalizedItems,
      normalizedPayload,
    } = validateBulkJobRequest(operation, productIds, items, payload);
    if (errors.length) {
      throw Object.assign(new Error(errors[0]), { status: 400, details: errors });
    }

    const { value: clientRequestId, error: requestIdError } = resolveClientRequestId
      ? resolveClientRequestId(req)
      : { value: null, error: null };
    if (requestIdError) {
      throw Object.assign(new Error(requestIdError), { status: 400 });
    }

    const requestHash = buildRequestFingerprint(
      normalizedOperation,
      ids,
      normalizedPayload,
      normalizedItems
    );
    if (clientRequestId) {
      const existing = await dbGetAsync(
        'SELECT * FROM bulk_jobs WHERE idempotency_key = ? LIMIT 1',
        [clientRequestId]
      );
      if (existing) {
        const existingJob = buildJobRecord(existing);
        if (String(existingJob.request_hash || '') !== requestHash) {
          throw Object.assign(
            new Error('A bulk job already exists for this idempotency key with different content'),
            {
              status: 409,
              conflict_type: 'bulk_job_idempotency_conflict',
            }
          );
        }
        return { created: false, job: existingJob };
      }
    }

    const insertedJob = await dbTxAsync(async () => {
      const initialSummary =
        normalizedOperation === BULK_JOB_IMPORT_OPERATION
          ? {
              total: normalizedItems.length,
              succeeded: 0,
              created: 0,
              updated: 0,
              failed: 0,
              skipped: 0,
              conflicts: 0,
            }
          : {
              total: ids.length,
              succeeded: 0,
              created: 0,
              updated: 0,
              failed: 0,
              skipped: 0,
              conflicts: 0,
            };
      const header = await dbRunAsync(
        `INSERT INTO bulk_jobs
         (operation, status, total, processed, succeeded, failed, skipped, conflicts, payload, request_hash, result_summary, idempotency_key, created_by, created_at, updated_at, started_at, completed_at, cancel_requested_at, cancelled_at, locked_at, lease_expires_at, locked_by, error_message)
         VALUES (?, 'queued', ?, 0, 0, 0, 0, 0, ?::jsonb, ?, ?::jsonb, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL)`,
        [
          normalizedOperation,
          initialSummary.total,
          JSON.stringify(normalizedPayload),
          requestHash,
          JSON.stringify(initialSummary),
          clientRequestId ||
            `bulk_${crypto.randomUUID ? crypto.randomUUID().replace(/-/g, '') : `${Date.now()}_${Math.random().toString(36).slice(2, 10)}`}`,
          createdBy,
        ]
      );
      const jobId = Number(header?.lastInsertRowid || 0);
      if (normalizedOperation === BULK_JOB_IMPORT_OPERATION) {
        for (const item of normalizedItems) {
          const beforeState = parseJsonMaybe(item.before_state, {});
          const rowAction = String(item.row_action || '')
            .trim()
            .toLowerCase();
          const rawPayload = parseJsonMaybe(item.raw_payload, {});
          const normalizedItemPayload = parseJsonMaybe(item.normalized_payload, {});
          await dbRunAsync(
            `INSERT INTO bulk_job_items
             (job_id, product_id, status, error_message, before_state, after_state, row_action, source_row_id, raw_payload, normalized_payload, attempt_count, last_attempt_at, created_at, updated_at)
             VALUES (?, ?, 'pending', NULL, ?::jsonb, '{}'::jsonb, ?, ?, ?::jsonb, ?::jsonb, 0, NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
            [
              jobId,
              item.product_id == null ? null : Number(item.product_id),
              JSON.stringify(beforeState && Object.keys(beforeState).length ? beforeState : {}),
              rowAction || 'create',
              Number(item.source_row_id || 0) || null,
              JSON.stringify(rawPayload && Object.keys(rawPayload).length ? rawPayload : {}),
              JSON.stringify(
                normalizedItemPayload && Object.keys(normalizedItemPayload).length
                  ? normalizedItemPayload
                  : {}
              ),
            ]
          );
        }
      } else {
        const productRows = await dbAllAsync(
          `SELECT * FROM products WHERE id IN (${ids.map(() => '?').join(', ')}) ORDER BY id ASC`,
          ids
        );
        const rowById = new Map(productRows.map((row) => [Number(row.id || 0), row]));
        const missingIds = ids.filter((id) => !rowById.has(id));
        if (missingIds.length > 0) {
          throw Object.assign(
            new Error(`Selected products no longer exist: ${missingIds.join(', ')}`),
            {
              status: 404,
              details: { missing_ids: missingIds },
            }
          );
        }

        for (const id of ids) {
          const row = rowById.get(id);
          const snapshot = buildProductSnapshot(row);
          snapshot.snapshot_hash = buildSnapshotHash(snapshot);
          await dbRunAsync(
            `INSERT INTO bulk_job_items
             (job_id, product_id, status, error_message, before_state, after_state, row_action, source_row_id, raw_payload, normalized_payload, attempt_count, last_attempt_at, created_at, updated_at)
             VALUES (?, ?, 'pending', NULL, ?::jsonb, '{}'::jsonb, 'bulk_update', NULL, ?::jsonb, ?::jsonb, 0, NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
            [
              jobId,
              id,
              JSON.stringify(snapshot),
              JSON.stringify(normalizedPayload),
              JSON.stringify(normalizedPayload),
            ]
          );
        }
      }
      return buildJobRecord(
        await dbGetAsync('SELECT * FROM bulk_jobs WHERE id = ? LIMIT 1', [jobId])
      );
    });

    if (clientRequestId && insertedJob) {
      await dbRunAsync(
        `UPDATE bulk_jobs
         SET updated_at = CURRENT_TIMESTAMP
         WHERE id = ?`,
        [insertedJob.id]
      ).catch(() => {});
    }

    if (typeof logAdminAuditAsync === 'function' && req) {
      await logAdminAuditAsync(req, {
        action: 'product.bulk_job.create',
        entityType: 'bulk_job',
        entityId: insertedJob.id,
        requestId: clientRequestId || null,
        details: {
          operation: normalizedOperation,
          total: insertedJob.total,
          payload: normalizedPayload,
        },
      });
    }

    void wakeBulkJobRunner();
    return { created: true, job: insertedJob };
  };

  const updateBulkJobProgressAsync = async (jobId) => {
    const job = await dbGetAsync('SELECT * FROM bulk_jobs WHERE id = ? LIMIT 1', [jobId]);
    if (!job) return null;
    const summary = await computeBulkJobSummaryAsync(jobId, normalizeBulkOperation(job.operation));
    return dbRunAsync(
      `UPDATE bulk_jobs
       SET total = ?,
           processed = ?,
           succeeded = ?,
           failed = ?,
           skipped = ?,
           conflicts = ?,
           result_summary = ?::jsonb,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [
        summary.total,
        summary.succeeded + summary.failed + summary.skipped + summary.conflicts,
        summary.succeeded,
        summary.failed,
        summary.skipped,
        summary.conflicts,
        JSON.stringify(summary),
        jobId,
      ]
    );
  };

  const finalizeBulkJobAsync = async (jobId, status, details = {}) =>
    dbRunAsync(
      `UPDATE bulk_jobs
     SET status = ?,
         completed_at = COALESCE(completed_at, CURRENT_TIMESTAMP),
         cancelled_at = ?,
         error_message = ?,
         updated_at = CURRENT_TIMESTAMP
     WHERE id = ?`,
      [
        status,
        status === 'cancelled' ? new Date().toISOString() : null,
        details.error_message || null,
        jobId,
      ]
    );

  const updateBulkJobLeaseAsync = async (jobId, lockedBy = runnerId) =>
    dbRunAsync(
      `UPDATE bulk_jobs
     SET locked_at = CURRENT_TIMESTAMP,
         lease_expires_at = CURRENT_TIMESTAMP + INTERVAL '${leaseWindowSeconds} seconds',
         locked_by = ?,
         updated_at = CURRENT_TIMESTAMP
     WHERE id = ?`,
      [lockedBy, jobId]
    );

  const claimNextJobAsync = async () =>
    dbTxAsync(async () => {
      const row = await dbGetAsync(
        `SELECT *
       FROM bulk_jobs
       WHERE status = 'queued'
         OR (status = 'running' AND lease_expires_at IS NOT NULL AND lease_expires_at < CURRENT_TIMESTAMP)
       ORDER BY created_at ASC, id ASC
       LIMIT 1
       FOR UPDATE SKIP LOCKED`
      );
      if (!row) return null;
      await dbRunAsync(
        `UPDATE bulk_jobs
       SET status = 'running',
           started_at = COALESCE(started_at, CURRENT_TIMESTAMP),
           locked_at = CURRENT_TIMESTAMP,
         lease_expires_at = CURRENT_TIMESTAMP + INTERVAL '${leaseWindowSeconds} seconds',
           locked_by = ?,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
        [runnerId, row.id]
      );
      const job = await dbGetAsync('SELECT * FROM bulk_jobs WHERE id = ? LIMIT 1', [row.id]);
      return buildJobRecord(job);
    });

  const applyBulkUpdateToProductAsync = async ({ currentRow, payload }) => {
    const updates = [];
    const values = [];

    if (Object.prototype.hasOwnProperty.call(payload, 'category')) {
      const categoryResult = resolveOrCreateCategoryHierarchyAsync
        ? await resolveOrCreateCategoryHierarchyAsync({
            category: payload.category,
            subcategory: currentRow?.subcategory || null,
          })
        : null;
      if (categoryResult) {
        updates.push('category = ?');
        values.push(categoryResult.categoryName);
        updates.push('subcategory = ?');
        values.push(categoryResult.subcategoryName || null);
        updates.push('category_id = ?');
        values.push(categoryResult.categoryId || null);
      } else {
        updates.push('category = ?');
        values.push(payload.category);
      }
    }

    if (Object.prototype.hasOwnProperty.call(payload, 'price')) {
      updates.push('price = ?');
      values.push(Number(payload.price || 0));
      updates.push('mrp = COALESCE(mrp, ?)');
      values.push(Number(payload.price || 0));
    }

    if (Object.prototype.hasOwnProperty.call(payload, 'stock')) {
      updates.push('stock = ?');
      values.push(Number(payload.stock || 0));
    }

    if (Object.prototype.hasOwnProperty.call(payload, 'is_active')) {
      updates.push('is_active = ?');
      values.push(Number(payload.is_active) === 1 ? 1 : 0);
    }

    if (updates.length === 0) {
      return { skipped: true };
    }

    await dbRunAsync(`UPDATE products SET ${updates.join(', ')} WHERE id = ?`, [
      ...values,
      currentRow.id,
    ]);
    const updatedRow = await dbGetAsync('SELECT * FROM products WHERE id = ? LIMIT 1', [
      currentRow.id,
    ]);
    return { skipped: false, updatedRow };
  };

  const markBulkJobItemAsync = async ({ itemId, status, errorMessage = null, afterState = null }) =>
    dbRunAsync(
      `UPDATE bulk_job_items
     SET status = ?,
         error_message = ?,
         after_state = ?::jsonb,
         attempt_count = attempt_count + 1,
         last_attempt_at = CURRENT_TIMESTAMP,
         updated_at = CURRENT_TIMESTAMP
     WHERE id = ?`,
      [status, errorMessage, JSON.stringify(afterState || {}), itemId]
    );

  const persistImportProductRowAsync = async ({ action, payload, matchedProductId }) => {
    if (action === 'create') {
      const header = await dbRunAsync(
        `INSERT INTO products
         (name, description, brand, sub_brand, content, color, price, mrp, uom, base_unit, uom_type, conversion_factor, purchase_pack_size, sku, barcode, image, stock, category, subcategory, expiry_date, default_discount, discount_type, is_active)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          payload.name,
          payload.description,
          payload.brand,
          payload.sub_brand,
          payload.content,
          payload.color,
          payload.price,
          payload.mrp,
          payload.uom,
          payload.base_unit,
          payload.uom_type,
          payload.conversion_factor,
          payload.purchase_pack_size,
          payload.sku,
          payload.barcode,
          payload.image,
          payload.stock,
          payload.category,
          payload.subcategory,
          payload.expiry_date,
          payload.default_discount,
          payload.discount_type,
          payload.is_active,
        ]
      );
      await dbRunAsync(SQL_INSERT_IGNORE_CATEGORY, [payload.category, 'Product category']);
      const insertedId = Number(header?.lastInsertRowid || 0);
      const insertedRow = insertedId
        ? await dbGetAsync('SELECT * FROM products WHERE id = ? LIMIT 1', [insertedId])
        : null;
      return { created: 1, updated: 0, updatedRow: insertedRow };
    }

    await dbRunAsync(
      `UPDATE products SET
       name=?, description=?, brand=?, sub_brand=?, content=?, color=?, price=?, mrp=?, uom=?, base_unit=?, uom_type=?, conversion_factor=?, purchase_pack_size=?, sku=?, barcode=?, image=?, stock=?, category=?, subcategory=?, expiry_date=?, default_discount=?, discount_type=?, is_active=?
       WHERE id=?`,
      [
        payload.name,
        payload.description,
        payload.brand,
        payload.sub_brand,
        payload.content,
        payload.color,
        payload.price,
        payload.mrp,
        payload.uom,
        payload.base_unit,
        payload.uom_type,
        payload.conversion_factor,
        payload.purchase_pack_size,
        payload.sku,
        payload.barcode,
        payload.image,
        payload.stock,
        payload.category,
        payload.subcategory,
        payload.expiry_date,
        payload.default_discount,
        payload.discount_type,
        payload.is_active,
        matchedProductId,
      ]
    );
    await dbRunAsync(SQL_INSERT_IGNORE_CATEGORY, [payload.category, 'Product category']);
    const updatedRow = await dbGetAsync('SELECT * FROM products WHERE id = ? LIMIT 1', [
      matchedProductId,
    ]);
    return { created: 0, updated: 1, updatedRow };
  };

  const processBulkUpdateJobItemAsync = async (job, item, payload) => {
    const currentRow = await dbGetAsync('SELECT * FROM products WHERE id = ? LIMIT 1', [
      item.product_id,
    ]);
    if (!currentRow) {
      await markBulkJobItemAsync({
        itemId: item.id,
        status: 'failed',
        errorMessage: 'Product no longer exists',
      });
      return { status: 'failed' };
    }

    const currentSnapshot = buildProductSnapshot(currentRow);
    const currentHash = buildSnapshotHash(currentSnapshot);
    const beforeState = parseJsonMaybe(item.before_state, {});
    const expectedHash = String(beforeState?.snapshot_hash || '');
    if (expectedHash && expectedHash !== currentHash) {
      await markBulkJobItemAsync({
        itemId: item.id,
        status: 'conflict',
        errorMessage: 'Product changed after selection',
      });
      return { status: 'conflict' };
    }

    const result = await applyBulkUpdateToProductAsync({ currentRow, payload });
    if (result?.skipped) {
      await markBulkJobItemAsync({
        itemId: item.id,
        status: 'skipped',
        afterState: { ...currentSnapshot, snapshot_hash: currentHash },
      });
      return { status: 'skipped' };
    }

    const updatedSnapshot = buildProductSnapshot(result.updatedRow || currentRow);
    updatedSnapshot.snapshot_hash = buildSnapshotHash(updatedSnapshot);
    await markBulkJobItemAsync({
      itemId: item.id,
      status: 'succeeded',
      afterState: updatedSnapshot,
    });
    return { status: 'succeeded', updated: 1 };
  };

  const processImportJobItemAsync = async (job, item, payload) => {
    const sourceRowId = Number(item.source_row_id || 0);
    const rowAction = String(item.row_action || 'create')
      .trim()
      .toLowerCase();
    const normalizedPayload = parseJsonMaybe(item.normalized_payload, {});
    const rawPayload = parseJsonMaybe(item.raw_payload, {});
    const allowIdenticalRows = new Set(
      Array.isArray(payload?.allow_identical_rows)
        ? payload.allow_identical_rows.map((value) => Number(value) || 0).filter(Boolean)
        : []
    );
    const allowIdentical = allowIdenticalRows.has(sourceRowId);
    const targetProductId = item.product_id == null ? null : Number(item.product_id);
    const currentRow = targetProductId
      ? await dbGetAsync('SELECT * FROM products WHERE id = ? LIMIT 1', [targetProductId])
      : null;

    if (rowAction === 'update' && !targetProductId) {
      await markBulkJobItemAsync({
        itemId: item.id,
        status: 'failed',
        errorMessage: 'Import row is missing a matched product id',
      });
      return { status: 'failed' };
    }

    if (targetProductId && !currentRow) {
      await markBulkJobItemAsync({
        itemId: item.id,
        status: 'conflict',
        errorMessage: 'Matched product no longer exists',
      });
      return { status: 'conflict' };
    }

    const beforeState = parseJsonMaybe(item.before_state, {});
    const expectedUpdatedAt = String(beforeState?.updated_at || '').trim();
    if (
      expectedUpdatedAt &&
      currentRow &&
      String(currentRow.updated_at || '') !== expectedUpdatedAt
    ) {
      await markBulkJobItemAsync({
        itemId: item.id,
        status: 'conflict',
        errorMessage: 'Product changed after import preview',
      });
      return { status: 'conflict' };
    }

    const payloadToPersist =
      Object.keys(normalizedPayload).length > 0
        ? normalizedPayload
        : normalizeProductInput(rawPayload, currentRow || null);
    const validationErrors = validateProductPayload(payloadToPersist);
    if (validationErrors.length) {
      await markBulkJobItemAsync({
        itemId: item.id,
        status: 'failed',
        errorMessage: validationErrors.join('; '),
      });
      return { status: 'failed' };
    }

    const duplicate = await findProductConflictAsync(payloadToPersist, {
      excludeId: targetProductId || null,
    });
    if (duplicate) {
      if (duplicate.severity === 'confirm' && !allowIdentical) {
        await markBulkJobItemAsync({
          itemId: item.id,
          status: 'failed',
          errorMessage: `${duplicate.message} (row ${sourceRowId} requires allow_identical choice)`,
        });
        return { status: 'failed' };
      }
      if (duplicate.severity !== 'confirm') {
        await markBulkJobItemAsync({
          itemId: item.id,
          status: 'failed',
          errorMessage: duplicate.message,
        });
        return { status: 'failed' };
      }
    }

    if (rowAction === 'update' && !currentRow) {
      await markBulkJobItemAsync({
        itemId: item.id,
        status: 'conflict',
        errorMessage: 'Matched product no longer exists',
      });
      return { status: 'conflict' };
    }

    const persistResult = await persistImportProductRowAsync({
      action: rowAction === 'update' ? 'update' : 'create',
      payload: payloadToPersist,
      matchedProductId: targetProductId,
    });
    const afterSnapshot = buildProductSnapshot(persistResult.updatedRow || currentRow || {});
    afterSnapshot.snapshot_hash = buildSnapshotHash(afterSnapshot);
    await markBulkJobItemAsync({
      itemId: item.id,
      status: 'succeeded',
      afterState: afterSnapshot,
    });
    return {
      status: 'succeeded',
      created: persistResult.created,
      updated: persistResult.updated,
    };
  };

  const processBulkJobItemAsync = async (job, item, payload) => {
    const operation = normalizeBulkOperation(job?.operation);
    if (operation === BULK_JOB_IMPORT_OPERATION) {
      return processImportJobItemAsync(job, item, payload);
    }
    return processBulkUpdateJobItemAsync(job, item, payload);
  };

  const computeBulkJobSummaryAsync = async (jobId, operation = BULK_JOB_OPERATION) => {
    const row = await dbGetAsync(
      `SELECT
         COUNT(*) AS total,
         SUM(CASE WHEN status = 'succeeded' THEN 1 ELSE 0 END) AS succeeded,
         SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) AS failed,
         SUM(CASE WHEN status = 'skipped' THEN 1 ELSE 0 END) AS skipped,
         SUM(CASE WHEN status = 'conflict' THEN 1 ELSE 0 END) AS conflicts,
         SUM(CASE WHEN status = 'succeeded' AND COALESCE(row_action, 'bulk_update') = 'create' THEN 1 ELSE 0 END) AS created,
         SUM(CASE WHEN status = 'succeeded' AND COALESCE(row_action, 'bulk_update') IN ('update', 'bulk_update') THEN 1 ELSE 0 END) AS updated
       FROM bulk_job_items
       WHERE job_id = ?`,
      [jobId]
    );
    const total = Number(row?.total || 0);
    const succeeded = Number(row?.succeeded || 0);
    const failed = Number(row?.failed || 0);
    const skipped = Number(row?.skipped || 0);
    const conflicts = Number(row?.conflicts || 0);
    const created = operation === BULK_JOB_IMPORT_OPERATION ? Number(row?.created || 0) : 0;
    const updated = Number(row?.updated || 0);
    return {
      total,
      succeeded,
      failed,
      skipped,
      conflicts,
      created,
      updated,
    };
  };

  const processJobChunkAsync = async (job) => {
    const pendingItems = await dbAllAsync(
      `SELECT * FROM bulk_job_items
       WHERE job_id = ? AND status = 'pending'
       ORDER BY id ASC
       LIMIT ?`,
      [job.id, chunkSize]
    );
    if (!pendingItems.length) {
      return { processedAny: false };
    }

    const payload = parseJsonMaybe(job.payload, {});
    for (const item of pendingItems) {
      await processBulkJobItemAsync(job, item, payload);
    }

    const summary = await computeBulkJobSummaryAsync(job.id, normalizeBulkOperation(job.operation));
    await dbRunAsync(
      `UPDATE bulk_jobs
       SET total = ?,
           processed = ?,
           succeeded = ?,
           failed = ?,
           skipped = ?,
           conflicts = ?,
           result_summary = ?::jsonb,
           updated_at = CURRENT_TIMESTAMP,
         lease_expires_at = CURRENT_TIMESTAMP + INTERVAL '${leaseWindowSeconds} seconds',
           locked_by = ?
       WHERE id = ?`,
      [
        summary.total,
        summary.succeeded + summary.failed + summary.skipped + summary.conflicts,
        summary.succeeded,
        summary.failed,
        summary.skipped,
        summary.conflicts,
        JSON.stringify(summary),
        runnerId,
        job.id,
      ]
    );
    return { processedAny: true, summary };
  };

  const finalizeJobIfNeededAsync = async (job) => {
    const latestJob = await getBulkJobByIdAsync(job.id);
    if (!latestJob) return null;

    const pendingCountRow = await dbGetAsync(
      `SELECT COUNT(*) AS count
       FROM bulk_job_items
       WHERE job_id = ? AND status = 'pending'`,
      [job.id]
    );
    const pendingCount = Number(pendingCountRow?.count || 0);
    if (pendingCount > 0 && !latestJob.cancel_requested_at) {
      return latestJob;
    }

    if (latestJob.cancel_requested_at) {
      await dbRunAsync(
        `UPDATE bulk_jobs
         SET status = 'cancelled',
             cancelled_at = COALESCE(cancelled_at, CURRENT_TIMESTAMP),
             completed_at = COALESCE(completed_at, CURRENT_TIMESTAMP),
             updated_at = CURRENT_TIMESTAMP
         WHERE id = ?`,
        [job.id]
      );
      return getBulkJobByIdAsync(job.id);
    }

    const summary = normalizeJobSummary(latestJob);
    const finalStatus =
      summary.failed > 0 || summary.conflicts > 0 ? 'completed_with_errors' : 'completed';
    await dbRunAsync(
      `UPDATE bulk_jobs
       SET status = ?,
           completed_at = COALESCE(completed_at, CURRENT_TIMESTAMP),
           updated_at = CURRENT_TIMESTAMP,
           lease_expires_at = NULL,
           locked_by = NULL
       WHERE id = ?`,
      [finalStatus, job.id]
    );
    return getBulkJobByIdAsync(job.id);
  };

  const runBulkJobAsync = async () => {
    if (runnerBusy) return false;
    runnerBusy = true;
    try {
      // Drain the queue one job at a time with a single in-process runner.
      for (;;) {
        const job = await claimNextJobAsync();
        if (!job) break;

        let nextChunk = await processJobChunkAsync(job);
        while (nextChunk.processedAny) {
          const currentJob = await getBulkJobByIdAsync(job.id);
          if (!currentJob) break;
          if (currentJob.cancel_requested_at) break;
          nextChunk = await processJobChunkAsync(currentJob);
        }

        await finalizeJobIfNeededAsync(job);
      }
      return true;
    } catch (error) {
      console.warn('[CATALOG_BULK] Runner failed:', error?.message || error);
      return false;
    } finally {
      runnerBusy = false;
    }
  };

  const wakeBulkJobRunner = async () => {
    if (IS_VERCEL_RUNTIME) return false;
    return runBulkJobAsync();
  };

  const startBulkJobRunner = () => {
    if (IS_VERCEL_RUNTIME) return;
    if (runnerTimer) return;
    runnerTimer = setInterval(() => {
      void runBulkJobAsync();
    }, loopIntervalMs);
    void runBulkJobAsync();
  };

  const stopBulkJobRunner = () => {
    if (!runnerTimer) return;
    clearInterval(runnerTimer);
    runnerTimer = null;
  };

  const cancelBulkJobAsync = async ({ jobId, req } = {}) => {
    const job = await getBulkJobByIdAsync(jobId);
    if (!job) {
      throw Object.assign(new Error('Bulk job not found'), { status: 404 });
    }
    if (BULK_JOB_FINAL_STATES.has(job.status)) {
      return { job };
    }

    const nextStatus = job.status === 'queued' ? 'cancelled' : 'cancel_requested';
    const nextSet =
      nextStatus === 'cancelled'
        ? {
            status: 'cancelled',
            cancelledAtSql: 'CURRENT_TIMESTAMP',
            cancelRequestedAtSql: 'CURRENT_TIMESTAMP',
          }
        : {
            status: 'cancel_requested',
            cancelledAtSql: 'NULL',
            cancelRequestedAtSql: 'CURRENT_TIMESTAMP',
          };

    await dbRunAsync(
      `UPDATE bulk_jobs
       SET status = ?,
           cancel_requested_at = ${nextSet.cancelRequestedAtSql},
           cancelled_at = ${nextSet.cancelledAtSql},
           updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [nextSet.status, job.id]
    );

    if (typeof logAdminAuditAsync === 'function' && req) {
      await logAdminAuditAsync(req, {
        action: 'product.bulk_job.cancel',
        entityType: 'bulk_job',
        entityId: job.id,
        details: { status: nextSet.status },
      });
    }

    void wakeBulkJobRunner();
    return { job: await getBulkJobByIdAsync(job.id) };
  };

  const retryFailedBulkJobAsync = async ({ jobId, req, clientRequestId = null } = {}) => {
    const job = await getBulkJobByIdAsync(jobId);
    if (!job) {
      throw Object.assign(new Error('Bulk job not found'), { status: 404 });
    }
    const items = await dbAllAsync(
      `SELECT * FROM bulk_job_items WHERE job_id = ? AND status IN ('failed', 'conflict') ORDER BY id ASC`,
      [jobId]
    );
    if (!items.length) {
      throw Object.assign(new Error('No failed items to retry'), { status: 409 });
    }

    const payload = parseJsonMaybe(job.payload, {});
    const retryItems = items.map((item) => ({
      product_id: item.product_id == null ? null : Number(item.product_id),
      source_row_id: item.source_row_id == null ? null : Number(item.source_row_id),
      row_action: String(item.row_action || '')
        .trim()
        .toLowerCase(),
      before_state: parseJsonMaybe(item.before_state, {}),
      raw_payload: parseJsonMaybe(item.raw_payload, {}),
      normalized_payload: parseJsonMaybe(item.normalized_payload, {}),
    }));
    const retryResult = await createBulkJobAsync({
      req,
      operation: job.operation,
      productIds: retryItems.map((item) => Number(item.product_id || 0)).filter(Boolean),
      items: retryItems,
      payload,
      createdBy: job.created_by,
    });

    if (typeof logAdminAuditAsync === 'function' && req) {
      await logAdminAuditAsync(req, {
        action: 'product.bulk_job.retry_failed',
        entityType: 'bulk_job',
        entityId: retryResult.job.id,
        requestId: clientRequestId || null,
        details: {
          source_job_id: job.id,
          retry_item_count: items.length,
        },
      });
    }

    return retryResult;
  };

  return {
    BULK_JOB_OPERATION,
    getBulkJobByIdAsync,
    getBulkJobItemsPageAsync,
    createBulkJobAsync,
    cancelBulkJobAsync,
    retryFailedBulkJobAsync,
    startBulkJobRunner,
    stopBulkJobRunner,
    wakeBulkJobRunner,
    buildJobRecord,
    buildJobItemRecord,
    normalizeBulkPayload,
    normalizeBulkProductIds,
    buildRequestHash,
  };
};

module.exports = { createCatalogBulkJobsService };
