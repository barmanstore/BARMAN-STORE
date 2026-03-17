const sales = require('../../features/sales');

const buildSalesDeps = ({ domain }) => {
  const { contactUtils, notificationUtils } = domain;

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
  };
};

module.exports = { buildSalesDeps };
