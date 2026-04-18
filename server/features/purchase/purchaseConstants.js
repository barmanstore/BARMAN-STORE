const generatePONumber = () =>
  `PO-${Date.now()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
const generateReturnNumber = () =>
  `RET-${Date.now()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;

const PO_LIFECYCLE_PREPARED = 'prepared';
const PO_LIFECYCLE_SENT = 'sent';
const PO_LIFECYCLE_REVISED = 'revised';
const PO_LIFECYCLE_CONFIRMED = 'confirmed';
const PO_LIFECYCLE_PART_PAID = 'part_paid';
const PO_LIFECYCLE_FULLY_PAID = 'fully_paid';
const PO_LIFECYCLE_CLOSED = 'closed';
const PO_LIFECYCLE_CANCELLED = 'cancelled';

const PO_PAYMENT_UNPAID = 'unpaid';
const PO_PAYMENT_PART_PAID = 'part_paid';
const PO_PAYMENT_PAID = 'paid';

const PURCHASE_WEEKDAYS = [
  'Sunday',
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
];

const PURCHASE_ACTION_ROLLUP_FIELDS = [
  { key: 'po_created', label: 'PO Created' },
  { key: 'po_sent', label: 'PO Sent' },
  { key: 'po_revised', label: 'PO Revised' },
  { key: 'po_confirmed', label: 'PO Confirmed' },
  { key: 'po_part_paid', label: 'PO Part Paid' },
  { key: 'po_fully_paid', label: 'PO Fully Paid' },
  { key: 'po_closed', label: 'PO Closed' },
  { key: 'po_cancelled', label: 'PO Cancelled' },
  { key: 'delivery_received', label: 'Delivery Received' },
  { key: 'payment', label: 'Payments' },
  { key: 'return', label: 'Returns' },
  { key: 'ledger_manual', label: 'Ledger Manual' },
  { key: 'reminder_sent', label: 'Reminders Sent' },
];

const PURCHASE_ACTION_STATUS_MAP = new Map([
  [PO_LIFECYCLE_SENT, 'po_sent'],
  [PO_LIFECYCLE_REVISED, 'po_revised'],
  [PO_LIFECYCLE_CONFIRMED, 'po_confirmed'],
  [PO_LIFECYCLE_PART_PAID, 'po_part_paid'],
  [PO_LIFECYCLE_FULLY_PAID, 'po_fully_paid'],
  [PO_LIFECYCLE_CLOSED, 'po_closed'],
  [PO_LIFECYCLE_CANCELLED, 'po_cancelled'],
]);

module.exports = {
  generatePONumber,
  generateReturnNumber,
  PO_LIFECYCLE_PREPARED,
  PO_LIFECYCLE_SENT,
  PO_LIFECYCLE_REVISED,
  PO_LIFECYCLE_CONFIRMED,
  PO_LIFECYCLE_PART_PAID,
  PO_LIFECYCLE_FULLY_PAID,
  PO_LIFECYCLE_CLOSED,
  PO_LIFECYCLE_CANCELLED,
  PO_PAYMENT_UNPAID,
  PO_PAYMENT_PART_PAID,
  PO_PAYMENT_PAID,
  PURCHASE_WEEKDAYS,
  PURCHASE_ACTION_ROLLUP_FIELDS,
  PURCHASE_ACTION_STATUS_MAP,
};
