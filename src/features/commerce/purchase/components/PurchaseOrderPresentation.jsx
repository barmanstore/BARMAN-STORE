export const getStatusBadge = (order, getPoLifecycleStatus) => {
  const lifecycleStatus = getPoLifecycleStatus(order);
  const statusConfig = {
    prepared: { label: 'Prepared', class: 'registered' },
    sent: { label: 'Sent', class: 'shipped' },
    revised: { label: 'Revised', class: 'pending' },
    confirmed: { label: 'Confirmed', class: 'processed' },
    part_paid: { label: 'Part Paid', class: 'received' },
    fully_paid: { label: 'Fully Paid', class: 'received' },
    closed: { label: 'Closed', class: 'received' },
    cancelled: { label: 'Cancelled', class: 'cancelled' },
  };
  const config = statusConfig[lifecycleStatus] || { label: lifecycleStatus || '-', class: '' };
  return <span className={`status-badge ${config.class}`}>{config.label}</span>;
};

export const getPoPaymentBadge = (order, getPoPaymentStatus) => {
  const paymentStatus = getPoPaymentStatus(order);
  const paymentConfig = {
    unpaid: { label: 'Unpaid', class: 'unpaid' },
    part_paid: { label: 'Part Paid', class: 'part-paid' },
    paid: { label: 'Paid', class: 'paid' },
  };
  const config = paymentConfig[paymentStatus] || paymentConfig.unpaid;
  return <span className={`payment-status-badge ${config.class}`}>{config.label}</span>;
};

export const getLedgerRowStatusClass = (entry, normalizePoPaymentStatus) => {
  const rawLinkedStatus = entry?.linked_po_payment_status ?? entry?.po_payment_status;
  if (
    rawLinkedStatus === undefined ||
    rawLinkedStatus === null ||
    String(rawLinkedStatus).trim() === ''
  )
    return '';
  const linkedStatus = normalizePoPaymentStatus(rawLinkedStatus);
  if (!linkedStatus) return '';
  if (linkedStatus === 'paid') return 'ledger-row-paid';
  if (linkedStatus === 'part_paid') return 'ledger-row-part-paid';
  if (linkedStatus === 'unpaid') return 'ledger-row-unpaid';
  return '';
};

export const getDistributorPhoneFromContacts = (contacts) => {
  if (!contacts) return '';
  if (typeof contacts === 'object' && contacts.phone) return String(contacts.phone);
  const raw = String(contacts).trim();
  if (!raw) return '';
  try {
    const parsed = JSON.parse(raw);
    return String(parsed?.phone || '');
  } catch (_) {
    return '';
  }
};

export const getOrderDistributorInfo = (order, distributors = []) => {
  if (!order) return { name: '-', phone: '-', address: '-', contacts: '' };
  const distributor = distributors.find((d) => String(d.id) === String(order.distributor_id));
  const contacts = order.distributor_contacts || distributor?.contacts || '';
  const phoneFromContacts = getDistributorPhoneFromContacts(contacts);
  return {
    name: order.supplier_name || order.distributor_name || distributor?.name || '-',
    phone:
      order.supplier_phone ||
      order.supplier_alt_phone ||
      order.distributor_phone ||
      distributor?.phone ||
      phoneFromContacts ||
      '-',
    address: order.distributor_address || distributor?.address || '-',
    contacts,
  };
};
