const applyImportBatchRows = async ({ batch, dbTxAsync, processRow, result }) => {
  await dbTxAsync(async () => {
    for (const row of batch.rows) {
      try {
        const outcome = await processRow(row);
        result.created += outcome.created || 0;
        result.updated += outcome.updated || 0;
      } catch (err) {
        result.failed += 1;
        result.errors.push({ row: row.row, message: err.message });
        throw err;
      }
    }
  });
};

module.exports = { applyImportBatchRows };
