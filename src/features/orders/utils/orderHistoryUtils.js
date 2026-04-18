import { Package, Clock, CheckCircle } from 'lucide-react';
import { formatDate as formatDateValue } from '../../../shared/utils/formatters';

const formatDate = (dateString) =>
  formatDateValue(dateString, 'en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });

const getStatusConfig = (status) => {
  const configs = {
    ordered: { icon: Clock, color: 'pending', label: 'Ordered' },
    received: { icon: CheckCircle, color: 'delivered', label: 'Received' },
  };
  return configs[status] || { icon: Package, color: 'default', label: status };
};

const statusFilters = ['all', 'ordered', 'received'];

const sortOptions = [
  { value: 'date_desc', label: 'Newest First' },
  { value: 'date_asc', label: 'Oldest First' },
  { value: 'amount_desc', label: 'Highest Amount' },
  { value: 'amount_asc', label: 'Lowest Amount' },
];

const extractQtyLabelFromName = (value) => {
  const raw = String(value || '').trim();
  const match = raw.match(/\s*\[Qty:\s*([^\]]+)\]\s*$/i);
  if (!match) return { name: raw, qtyLabel: '' };
  return {
    name: raw.replace(/\s*\[Qty:\s*([^\]]+)\]\s*$/i, '').trim(),
    qtyLabel: String(match[1] || '').trim(),
  };
};

const buildCartItemFromOrderItem = (item, index) => {
  const productId = Number(item?.product_id || item?.id || 0);
  const isManual = !(productId > 0);
  const quantity = Math.max(1, Number(item?.quantity || 1));
  const qtyLabel =
    String(item?.quantity_label || item?.qty_text || item?.quantity_text || '').trim() ||
    String(quantity);
  const price = Math.max(0, Number(item?.price || item?.mrp || 0));
  const name = String(item?.product_name || item?.name || 'Item').trim() || 'Item';
  return {
    id: isManual
      ? `manual:last-order:${index}:${name.toLowerCase().replace(/[^a-z0-9]+/g, '-') || 'item'}`
      : productId,
    product_id: isManual ? null : productId,
    name,
    category: String(item?.category || (isManual ? 'Requested / Manual' : 'Product')).trim(),
    image: String(item?.image || item?.product_image || '').trim(),
    price,
    price_unknown: isManual && price <= 0 ? 1 : 0,
    quantity,
    quantity_label: qtyLabel,
    stock: null,
    item_type: isManual ? 'manual' : 'catalog',
    is_manual: isManual ? 1 : 0,
    out_of_stock_request: 0,
  };
};

const buildRepeatCartFromOrder = (order) => {
  const rawItems = Array.isArray(order?.items) ? order.items : [];
  return rawItems.map((item, index) => buildCartItemFromOrderItem(item, index));
};

export {
  formatDate,
  getStatusConfig,
  statusFilters,
  sortOptions,
  extractQtyLabelFromName,
  buildCartItemFromOrderItem,
  buildRepeatCartFromOrder,
};
