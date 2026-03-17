const registerProductTemplateRoutes = (deps) => {
  const {
    app,
    requireAdmin,
    XLSX,
    PRODUCT_IMPORT_HEADERS,
    PRODUCT_IMPORT_SAMPLE,
  } = deps;

  app.get('/api/products/template', requireAdmin, async (req, res) => {
    try {
      const format = String(req.query?.format || 'csv').trim().toLowerCase();
      const rows = [PRODUCT_IMPORT_SAMPLE];
      if (format === 'xlsx' || format === 'xls') {
        const sheet = XLSX.utils.json_to_sheet(rows, { header: PRODUCT_IMPORT_HEADERS });
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, sheet, 'Products');
        const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', 'attachment; filename="products-template.xlsx"');
        return res.send(buffer);
      }
      const csv = XLSX.utils.sheet_to_csv(XLSX.utils.json_to_sheet(rows, { header: PRODUCT_IMPORT_HEADERS }));
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', 'attachment; filename="products-template.csv"');
      return res.send(`\uFEFF${csv}`);
    } catch (error) {
      return res.status(500).json({ error: error.message });
    }
  });
};

module.exports = { registerProductTemplateRoutes };
