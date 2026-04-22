const createInputError = (status, message) => Object.assign(new Error(message), { status });

const validatePurchaseOrderPayment = async ({
  orderId,
  body,
  dbGetAsync,
  getDistributorByIdAsync,
  getPurchaseOrderLifecycleStatus,
  canPoAcceptPayment,
  calculatePoPaymentSnapshot,
}) => {
  const order = await dbGetAsync('SELECT * FROM purchase_orders WHERE id = ?', [orderId]);
  if (!order) throw createInputError(404, 'Purchase order not found');

  const poStatus = getPurchaseOrderLifecycleStatus(order);
  if (!canPoAcceptPayment(poStatus)) {
    throw createInputError(
      400,
      'Payments are allowed only for confirmed or part-paid purchase orders'
    );
  }

  const amount = Math.max(0, Number(body?.amount || 0));
  if (amount <= 0) throw createInputError(400, 'amount must be greater than 0');

  const distributorId = Number(order.distributor_id || 0);
  if (!distributorId) {
    throw createInputError(
      400,
      'Purchase order distributor is missing. Reassign the distributor before recording payment.'
    );
  }
  const distributor = await getDistributorByIdAsync(distributorId);
  if (!distributor) {
    throw createInputError(
      400,
      'Purchase order distributor not found. Reassign the distributor before recording payment.'
    );
  }

  const totalSnapshotBefore = calculatePoPaymentSnapshot(
    Number(order.total_amount ?? order.total ?? 0),
    Number(order.paid_amount || 0)
  );
  const balanceDueCents = Math.round(Number(totalSnapshotBefore.balanceDue || 0) * 100);
  const amountCents = Math.round(amount * 100);
  if (amountCents > balanceDueCents) {
    const balanceDueText = (balanceDueCents / 100).toFixed(2);
    throw createInputError(400, `Payment amount cannot exceed balance due (${balanceDueText})`);
  }

  return {
    order,
    poStatus,
    amount,
    distributor,
    distributorId,
    totalSnapshotBefore,
  };
};

module.exports = { validatePurchaseOrderPayment };
