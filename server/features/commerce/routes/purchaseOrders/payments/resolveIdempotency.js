const resolvePurchasePaymentIdempotency = (req, resolveClientRequestId) => {
  const idempotency = resolveClientRequestId(req);
  if (idempotency.error) return { error: idempotency.error };
  return { clientRequestId: idempotency.value || null };
};

module.exports = { resolvePurchasePaymentIdempotency };
