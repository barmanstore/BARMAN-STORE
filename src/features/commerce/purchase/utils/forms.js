import { getTodayDate } from '../../../../shared/utils/dateTime';
import { createEmptyOrderItem } from './items';

const createDefaultOrderFormData = () => ({
  distributor_id: '',
  distributor_name: '',
  supplier_id: '',
  supplier_name: '',
  planned_order_date: getTodayDate(),
  expected_delivery: getTodayDate(),
  strict_due_date: '',
  strict_due_note: '',
  notes: '',
  items: [createEmptyOrderItem()],
});

const createDefaultProcessFormData = () => ({
  bill_number: '',
  paid_amount: '',
  payment_split: 'part',
  payment_mode: 'cash',
  payment_reference: '',
  payment_date: getTodayDate(),
  payment_notes: '',
  delivered: true,
});

const createDefaultPoPaymentFormData = () => ({
  amount: '',
  payment_mode: 'cash',
  reference: '',
  transaction_date: getTodayDate(),
  notes: '',
});

const createDefaultLedgerFormData = () => ({
  distributor_id: '',
  type: 'payment',
  amount: '',
  payment_mode: 'cash',
  transaction_date: getTodayDate(),
  reference: '',
  description: '',
});

const createDefaultPoCorrectionFormData = () => ({
  type: 'payment',
  amount: '',
  payment_mode: 'cash',
  transaction_date: getTodayDate(),
  reference: '',
  reason: '',
});

export {
  createDefaultLedgerFormData,
  createDefaultOrderFormData,
  createDefaultPoCorrectionFormData,
  createDefaultPoPaymentFormData,
  createDefaultProcessFormData,
};

