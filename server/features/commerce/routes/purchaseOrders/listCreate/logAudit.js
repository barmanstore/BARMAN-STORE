const logPurchaseOrderCreateAudit = async ({
  req,
  logAdminAuditAsync,
  clientRequestId,
  orderId,
  poNumber,
  totalAmount,
  normalizedItems,
  distributorId,
}) => {
  await logAdminAuditAsync(req, {
    action: 'purchase_order.create',
    entityType: 'purchase_order',
    entityId: orderId,
    requestId: clientRequestId,
    details: {
      po_number: poNumber,
      distributor_id: Number(distributorId || 0),
      total_amount: Number(totalAmount || 0),
      items_count: normalizedItems.length,
    },
  });
};

module.exports = { logPurchaseOrderCreateAudit };
