import React from 'react';
import { Package, CheckCircle, Clock } from 'lucide-react';
import { formatDateTime } from '../../../shared/utils/dateTime';

const formatDate = (dateString) => (
  formatDateTime(dateString, 'en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  })
);

const getStatusIcon = (status) => {
  switch (status) {
    case 'received':
      return <CheckCircle size={20} className="status-icon delivered" />;
    case 'ordered':
      return <Clock size={20} className="status-icon pending" />;
    default:
      return <Package size={20} className="status-icon default" />;
  }
};

const getStatusStep = (status) => {
  const steps = ['ordered', 'received'];
  const index = steps.indexOf(status);
  return index >= 0 ? index : 0;
};

const extractQtyLabelFromName = (value) => {
  const raw = String(value || '').trim();
  const match = raw.match(/\s*\[Qty:\s*([^\]]+)\]\s*$/i);
  if (!match) {
    return { name: raw, qtyLabel: '' };
  }
  return {
    name: raw.replace(/\s*\[Qty:\s*([^\]]+)\]\s*$/i, '').trim(),
    qtyLabel: String(match[1] || '').trim(),
  };
};

const getOrderItemDisplay = (item) => {
  const parsed = extractQtyLabelFromName(item?.product_name || item?.name || '');
  const manual = Number(item?.is_manual || 0) === 1 || !Number(item?.product_id || 0);
  const unitPrice = Number(item?.price || 0);
  const quantity = Number(item?.quantity || 0);
  const lineSubtotal = Number(item?.line_subtotal || computedFallbackLineSubtotal(item));
  const computedTotal = Number(item?.total || (quantity * unitPrice));
  const offerDiscount = Math.max(0, Number(item?.offer_discount || 0));
  const manualDiscount = Math.max(0, Number(item?.manual_discount || 0));
  const quantityLabel = String(item?.quantity_label || parsed.qtyLabel || '').trim();
  return {
    name: parsed.name || '-',
    quantityText: quantityLabel || String(quantity > 0 ? quantity : 1),
    unitPrice,
    lineSubtotal,
    total: computedTotal,
    offerDiscount,
    manualDiscount,
    totalDiscount: Math.max(0, offerDiscount + manualDiscount),
    offerLabel: String(item?.offer_label || '').trim(),
    unknownPrice: manual && unitPrice <= 0,
  };
};

function computedFallbackLineSubtotal(item) {
  const quantity = Number(item?.quantity || 0);
  const unitPrice = Number(item?.price || 0);
  return quantity * unitPrice;
}

export {
  formatDate,
  getStatusIcon,
  getStatusStep,
  extractQtyLabelFromName,
  getOrderItemDisplay,
};

