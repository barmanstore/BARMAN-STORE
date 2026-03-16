const generateOrderNumber = () => {
  const now = new Date();
  const y = String(now.getFullYear()).slice(-2);
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  const r = Math.random().toString(36).slice(2, 8).toUpperCase();
  return `ORD-${y}${m}${d}-${r}`;
};

const generateBillNumber = () => `BILL-${Date.now()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;

const ORDER_STATUS_ORDERED = 'ordered';
const ORDER_STATUS_RECEIVED = 'received';
const ORDER_ALLOWED_PAYMENT_STATUSES = new Set(['pending', 'paid', 'partial', 'refunded', 'declined']);

const normalizeOrderStatus = (status, fallback = ORDER_STATUS_ORDERED) => {
  const raw = String(status || '').trim().toLowerCase();
  if (!raw) return fallback;
  if (raw === ORDER_STATUS_ORDERED || raw === 'pending') return ORDER_STATUS_ORDERED;
  if (raw === ORDER_STATUS_RECEIVED || raw === 'confirmed' || raw === 'delivered' || raw === 'processing' || raw === 'shipped') {
    return ORDER_STATUS_RECEIVED;
  }
  return fallback;
};

const normalizeOrderPaymentStatus = (status, orderStatus) => {
  const raw = String(status || '').trim().toLowerCase();
  if (ORDER_ALLOWED_PAYMENT_STATUSES.has(raw)) return raw;
  const normalizedOrderStatus = normalizeOrderStatus(orderStatus, ORDER_STATUS_ORDERED);
  return normalizedOrderStatus === ORDER_STATUS_RECEIVED ? 'pending' : 'pending';
};

const normalizePaymentMethod = (method) => {
  const raw = String(method || '').trim().toLowerCase();
  if (!raw) return 'cash';
  if (raw === 'cod' || raw === 'cash') return 'cash';
  return 'cash';
};

module.exports = {
  generateOrderNumber,
  generateBillNumber,
  ORDER_STATUS_ORDERED,
  ORDER_STATUS_RECEIVED,
  normalizeOrderStatus,
  normalizeOrderPaymentStatus,
  normalizePaymentMethod,
};
