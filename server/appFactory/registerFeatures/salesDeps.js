const sales = require('../../features/sales');

const buildSalesDeps = ({ domain }) => {
  const { contactUtils, notificationUtils, creditUtils } = domain;

  return {
    normalizeOrderStatus: sales.normalizeOrderStatus,
    ORDER_STATUS_ORDERED: sales.ORDER_STATUS_ORDERED,
    ORDER_STATUS_RECEIVED: sales.ORDER_STATUS_RECEIVED,
    normalizeOrderPaymentStatus: sales.normalizeOrderPaymentStatus,
    parseOrderAddress: contactUtils.parseOrderAddress,
    getNormalizedPhoneFromUnknownText: contactUtils.getNormalizedPhoneFromUnknownText,
    normalizePaymentMethod: sales.normalizePaymentMethod,
    generateOrderNumber: sales.generateOrderNumber,
    notifyAdmins: notificationUtils.notifyAdmins,
    generateBillNumber: sales.generateBillNumber,
    recalculateCreditBalancesForUser: creditUtils.recalculateCreditBalancesForUser,
    rebuildCustomerPaymentIntelligence: creditUtils.rebuildCustomerPaymentIntelligence,
    getCustomerCreditProfileAsync: creditUtils.getCustomerCreditProfileAsync,
    getCustomerPaymentSummaryAsync: creditUtils.getCustomerPaymentSummaryAsync,
  };
};

module.exports = { buildSalesDeps };
