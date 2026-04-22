const notifyBillCreated = async (deps, context) => {
  const { createAppNotification } = deps;
  const {
    customer,
    billId,
    billNumber,
    totalAmount,
    creditAmount,
    paidAmount,
    normalizedOrderId,
    createdBy,
  } = context;

  const totalAmountText = `Rs ${Number(totalAmount || 0).toFixed(2)}`;
  if (Number(customer.id || 0)) {
    await createAppNotification({
      userId: Number(customer.id),
      title: `Bill ${billNumber} created`,
      message: `A new bill of ${totalAmountText} was created for your account.`,
      level: 'info',
      entityType: 'bill',
      entityId: billId,
      metadata: {
        route: '/my-bills',
        bill_id: Number(billId || 0),
        bill_number: billNumber,
        total_amount: Number(totalAmount || 0),
        credit_amount: Number(creditAmount || 0),
        paid_amount: Number(paidAmount || 0),
        order_id: normalizedOrderId,
      },
      createdBy,
    });
  }
};

module.exports = { notifyBillCreated };
