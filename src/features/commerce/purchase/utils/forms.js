import { getTodayDate } from '../../../../utils/dateTime';
import { createEmptyOrderItem } from './items';

const createDefaultOrderFormData = () => ({
  distributor_id: '',
  distributor_name: '',
  expected_delivery: getTodayDate(),
  strict_due_date: '',
  strict_due_note: '',
  notes: '',
  items: [createEmptyOrderItem()],
});

const createDefaultProcessFormData = () => ({
  bill_number: '',
  paid_amount: '',
  payment_mode: 'cash',
  payment_reference: '',
  payment_date: getTodayDate(),
  payment_notes: '',
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
