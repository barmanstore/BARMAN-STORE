const resolvePurchaseOrderIdempotency = async ({ req, resolveClientRequestId, dbGetAsync }) => {
  const idempotency = resolveClientRequestId(req);
  if (idempotency.error) return { error: idempotency.error };

  const clientRequestId = idempotency.value;
  if (!clientRequestId) return { clientRequestId: null, existing: null };

  const existing = await dbGetAsync(
    'SELECT id, po_number FROM purchase_orders WHERE client_request_id = ? LIMIT 1',
    [clientRequestId]
  );

  return { clientRequestId, existing };
};

module.exports = { resolvePurchaseOrderIdempotency };
