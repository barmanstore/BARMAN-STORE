const createInputError = (status, message) => Object.assign(new Error(message), { status });

const validatePurchaseOrderInput = async ({ body, getDistributorByIdAsync, normalizePurchaseOrderItems }) => {
  if (!body?.distributor_id) throw createInputError(400, 'distributor_id is required');

  const distributor = await getDistributorByIdAsync(body.distributor_id);
  if (!distributor) throw createInputError(404, 'Distributor not found');

  const items = Array.isArray(body.items) ? body.items : [];
  if (!items.length) throw createInputError(400, 'At least one item is required');

  const normalizedItems = await normalizePurchaseOrderItems(items);

  return { distributor, normalizedItems };
};

module.exports = { validatePurchaseOrderInput };
