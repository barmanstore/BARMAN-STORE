const createSupplierUtils = ({ dbGetAsync, dbAllAsync } = {}) => {
  const getSupplierByIdAsync = async (supplierId) => {
    const normalizedSupplierId = Number(supplierId || 0);
    if (!normalizedSupplierId) return null;
    return dbGetAsync('SELECT * FROM suppliers WHERE id = ?', [normalizedSupplierId]);
  };

  const getSuppliersByDistributorIdAsync = async (distributorId) => {
    const normalizedDistributorId = Number(distributorId || 0);
    if (!normalizedDistributorId) return [];
    return dbAllAsync(
      `SELECT *
       FROM suppliers
       WHERE distributor_id = ?
       ORDER BY is_primary DESC, name ASC`,
      [normalizedDistributorId]
    );
  };

  const getPrimarySupplierByDistributorIdAsync = async (distributorId) => {
    const normalizedDistributorId = Number(distributorId || 0);
    if (!normalizedDistributorId) return null;
    const primary = await dbGetAsync(
      `SELECT *
       FROM suppliers
       WHERE distributor_id = ?
         AND is_primary = TRUE
       ORDER BY id ASC
       LIMIT 1`,
      [normalizedDistributorId]
    );
    if (primary) return primary;
    return dbGetAsync(
      `SELECT *
       FROM suppliers
       WHERE distributor_id = ?
       ORDER BY id ASC
       LIMIT 1`,
      [normalizedDistributorId]
    );
  };

  return {
    getSupplierByIdAsync,
    getSuppliersByDistributorIdAsync,
    getPrimarySupplierByDistributorIdAsync,
  };
};

module.exports = { createSupplierUtils };
