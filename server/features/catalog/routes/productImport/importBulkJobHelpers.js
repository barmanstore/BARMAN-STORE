const inferImportSource = (fileName = '') => {
  const raw = String(fileName || '')
    .trim()
    .toLowerCase();
  if (raw.endsWith('.xlsx') || raw.endsWith('.xls')) return 'xlsx';
  return 'csv';
};

const normalizeImportRowAction = (value) => {
  const raw = String(value || '')
    .trim()
    .toLowerCase();
  if (raw === 'update') return 'update';
  return 'create';
};

const buildImportBulkJobItems = (batch = {}) => {
  const rows = Array.isArray(batch?.rows) ? batch.rows : [];
  return rows.map((row) => ({
    source_row_id: Number(row?.row || 0),
    product_id: row?.matched_product_id == null ? null : Number(row.matched_product_id) || null,
    row_action: normalizeImportRowAction(row?.action),
    before_state: row?.before_state && typeof row.before_state === 'object' ? row.before_state : {},
    raw_payload: row?.raw && typeof row.raw === 'object' ? row.raw : {},
    normalized_payload: row?.payload && typeof row.payload === 'object' ? row.payload : {},
  }));
};

const buildImportBulkJobPayload = ({ batchId, checksum, batch = {}, allowIdenticalRows = [] }) => ({
  batch_id: String(batchId || '').trim(),
  checksum: String(checksum || '').trim(),
  mode: String(batch?.mode || 'upsert')
    .trim()
    .toLowerCase(),
  stock_mode: String(batch?.stockMode || 'replace')
    .trim()
    .toLowerCase(),
  source: inferImportSource(batch?.fileName || ''),
  file_name: String(batch?.fileName || '').trim(),
  file_hash: String(checksum || '').trim(),
  row_count: Array.isArray(batch?.rows) ? batch.rows.length : 0,
  allow_identical_rows: Array.isArray(allowIdenticalRows)
    ? allowIdenticalRows
        .map((value) => Number(value) || 0)
        .filter(Boolean)
        .sort((a, b) => a - b)
    : [],
});

const queueImportBulkJobFromBatchAsync = async ({
  catalogBulkJobs,
  req,
  batchId,
  checksum,
  batch,
  allowIdenticalRows = [],
  authUser,
}) =>
  catalogBulkJobs.createBulkJobAsync({
    req,
    operation: 'import_products',
    items: buildImportBulkJobItems(batch),
    payload: buildImportBulkJobPayload({
      batchId,
      checksum,
      batch,
      allowIdenticalRows,
    }),
    createdBy: Number(authUser?.id || 0) || null,
  });

module.exports = {
  buildImportBulkJobItems,
  buildImportBulkJobPayload,
  queueImportBulkJobFromBatchAsync,
};
