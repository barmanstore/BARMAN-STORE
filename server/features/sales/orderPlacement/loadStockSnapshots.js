const { normalizeUomToken } = require('./normalizeUom');

const loadOrderStockSnapshots = async ({ parsedItems, dbGetAsync }) => {
  const stockSnapshotByProductId = new Map();
  for (const it of parsedItems) {
    if (it.is_manual === 1) continue;
    const p = await dbGetAsync('SELECT id, name, stock, uom FROM products WHERE id = ?', [it.product_id]);
    if (!p) throw new Error(`Product ${it.product_id} not found`);
    stockSnapshotByProductId.set(Number(p.id), Math.max(0, Number(p.stock || 0)));
    if (!it.product_name) {
      it.product_name = String(p.name || '').trim() || 'Item';
    }
    it.uom = normalizeUomToken(p.uom, it.uom || 'pcs');
  }

  return { stockSnapshotByProductId };
};

module.exports = { loadOrderStockSnapshots };
