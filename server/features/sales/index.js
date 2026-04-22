const { registerSalesFeature } = require('./registerSalesFeature');
const {
  generateOrderNumber,
  generateBillNumber,
  ORDER_STATUS_ORDERED,
  ORDER_STATUS_RECEIVED,
  normalizeOrderStatus,
  normalizeOrderPaymentStatus,
  normalizePaymentMethod,
} = require('./salesUtils');

module.exports = {
  registerSalesFeature,
  generateOrderNumber,
  generateBillNumber,
  ORDER_STATUS_ORDERED,
  ORDER_STATUS_RECEIVED,
  normalizeOrderStatus,
  normalizeOrderPaymentStatus,
  normalizePaymentMethod,
};
