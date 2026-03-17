const checkDuplicatePurchasePayment = async ({
  findDuplicatePurchasePaymentAsync,
  purchaseOrderId,
  distributorId,
  amount,
  reference,
  transactionDate,
  clientRequestId,
}) => {
  return findDuplicatePurchasePaymentAsync({
    purchaseOrderId,
    distributorId,
    amount,
    reference,
    transactionDate,
    clientRequestId,
  });
};

module.exports = { checkDuplicatePurchasePayment };
