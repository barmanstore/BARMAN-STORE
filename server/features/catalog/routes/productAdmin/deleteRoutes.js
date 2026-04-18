const registerProductDeleteRoutes = (deps) => {
  const { app, requireAdmin, dbGetAsync, dbRunAsync, logAdminAuditAsync } = deps;

  const doesTableExistAsync = async (tableName) =>
    Boolean(
      (
        await dbGetAsync(
          `SELECT 1 AS ok
       FROM information_schema.tables
       WHERE table_schema = current_schema() AND table_name = ?
       LIMIT 1`,
          [tableName]
        )
      )?.ok
    );

  app.delete('/api/products/:id(\\d+)', requireAdmin, async (req, res) => {
    try {
      const current = await dbGetAsync(`SELECT * FROM products WHERE id = ?`, [req.params.id]);
      if (!current) return res.status(404).json({ error: 'Product not found' });
      await dbRunAsync(`UPDATE products SET is_active = 0 WHERE id = ?`, [req.params.id]);
      await logAdminAuditAsync(req, {
        action: 'product.deactivate',
        entityType: 'product',
        entityId: req.params.id,
        details: { name: current.name || null },
      });
      return res.json({ success: true, message: 'Product deleted successfully' });
    } catch (error) {
      return res.status(500).json({ error: error.message });
    }
  });

  app.delete('/api/products/:id(\\d+)/permanent', requireAdmin, async (req, res) => {
    try {
      const productId = Number(req.params.id);
      const current = await dbGetAsync(`SELECT * FROM products WHERE id = ?`, [productId]);
      if (!current) return res.status(404).json({ error: 'Product not found' });

      const referenceChecks = [
        {
          table: 'order_items',
          sql: 'SELECT COUNT(*) as count FROM order_items WHERE product_id = ?',
        },
        {
          table: 'purchase_order_items',
          sql: 'SELECT COUNT(*) as count FROM purchase_order_items WHERE product_id = ?',
        },
        {
          table: 'purchase_return_items',
          sql: 'SELECT COUNT(*) as count FROM purchase_return_items WHERE product_id = ?',
        },
        {
          table: 'stock_ledger',
          sql: 'SELECT COUNT(*) as count FROM stock_ledger WHERE product_id = ?',
        },
        {
          table: 'batch_stock',
          sql: 'SELECT COUNT(*) as count FROM batch_stock WHERE product_id = ?',
        },
      ];

      const blockingRefs = [];
      for (const check of referenceChecks) {
        if (!(await doesTableExistAsync(check.table))) continue;
        const count = Number((await dbGetAsync(check.sql, [productId]))?.count || 0);
        if (count > 0) blockingRefs.push(`${check.table} (${count})`);
      }
      if (blockingRefs.length) {
        return res.status(409).json({
          error: `Cannot permanently delete product. Referenced in: ${blockingRefs.join(', ')}`,
          references: blockingRefs,
        });
      }

      await dbRunAsync(`DELETE FROM products WHERE id = ?`, [productId]);
      await logAdminAuditAsync(req, {
        action: 'product.permanent_delete',
        entityType: 'product',
        entityId: productId,
        details: { name: current.name || null },
      });
      return res.json({ success: true, message: 'Product permanently deleted' });
    } catch (error) {
      return res.status(500).json({ error: error.message });
    }
  });
};

module.exports = { registerProductDeleteRoutes };
