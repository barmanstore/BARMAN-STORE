const createInputError = (status, message) => Object.assign(new Error(message), { status });

const validatePurchaseOrderInput = async ({
  body,
  getDistributorByIdAsync,
  getSupplierByIdAsync,
  normalizePurchaseOrderItems,
}) => {
  const supplierId = Number(body?.supplier_id || 0) || null;
  const distributorId = Number(body?.distributor_id || 0) || null;
  let supplier = null;

  if (supplierId && typeof getSupplierByIdAsync === 'function') {
    supplier = await getSupplierByIdAsync(supplierId);
    if (!supplier) throw createInputError(404, 'Supplier not found');
  }

  const resolvedDistributorId = Number(distributorId || supplier?.distributor_id || 0) || null;
  if (!resolvedDistributorId) throw createInputError(400, 'distributor_id is required');
  if (supplier && Number(supplier.distributor_id || 0) !== resolvedDistributorId) {
    throw createInputError(400, 'Supplier does not belong to distributor');
  }

  const distributor = await getDistributorByIdAsync(resolvedDistributorId);
  if (!distributor) throw createInputError(404, 'Distributor not found');

  const items = Array.isArray(body.items) ? body.items : [];
  if (!items.length) throw createInputError(400, 'At least one item is required');

  const plannedOrderDate = String(body?.planned_order_date || '').trim();
  if (!plannedOrderDate) throw createInputError(400, 'planned_order_date is required');

  const normalizedItems = await normalizePurchaseOrderItems(items);

  return {
    distributor,
    supplier,
    distributorId: resolvedDistributorId,
    supplierId: supplier ? Number(supplier.id || 0) : null,
    normalizedItems,
  };
};

module.exports = { validatePurchaseOrderInput };
