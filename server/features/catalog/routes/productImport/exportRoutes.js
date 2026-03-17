const registerProductExportRoutes = (deps) => {
  const {
    app,
    requireAdmin,
    dbAllAsync,
    XLSX,
    toProductExportRow,
    PRODUCT_IMPORT_HEADERS,
  } = deps;

  app.get('/api/products/export', requireAdmin, async (req, res) => {
    try {
      const format = String(req.query?.format || 'csv').trim().toLowerCase();
      const includeInactive = String(req.query?.include_inactive || '').trim() === 'true';
      const rows = (await dbAllAsync(
        `SELECT * FROM products ${includeInactive ? '' : 'WHERE COALESCE(is_active,1)=1'} ORDER BY created_at DESC`
      )).map(toProductExportRow);
      if (format === 'xlsx' || format === 'xls') {
        const sheet = XLSX.utils.json_to_sheet(rows, { header: PRODUCT_IMPORT_HEADERS });
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, sheet, 'Products');
        const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', `attachment; filename="products-export-${new Date().toISOString().slice(0, 10)}.xlsx"`);
        return res.send(buffer);
      }
      const csv = XLSX.utils.sheet_to_csv(XLSX.utils.json_to_sheet(rows, { header: PRODUCT_IMPORT_HEADERS }));
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="products-export-${new Date().toISOString().slice(0, 10)}.csv"`);
      return res.send(`\uFEFF${csv}`);
    } catch (error) {
      return res.status(500).json({ error: error.message });
    }
  });
};

module.exports = { registerProductExportRoutes };
