import { useCallback, useMemo, useReducer } from 'react';
import { createEmptyItem } from '../utils/billingLineItemUtils';

const createInitialBillingState = () => ({
  customer: { id: null, name: '', email: '', phone: '', address: '' },
  currentItem: createEmptyItem(),
  billItems: [],
  editIndex: null,
  selectedBillIndex: null,
  lastAddedItemId: null,
  lastRemovedItem: null,
  loading: false,
  error: null,
  isSubmitting: false,
  paidAmount: 0,
  lastShareText: '',
  lastShareNumber: '',
  lastSharePhone: '',
  prefillSummary: '',
  linkedOrderId: 0,
  fulfillmentMode: 'available_now',
  showCustomerCreateModal: false,
  selectedPaymentMethod: 'cash',
  customersList: [],
  productsList: [],
  pendingProductSelectionReview: false,
  productSearchMessage: '',
  createBillConfirmationOpen: false,
  clearBillConfirmationOpen: false,
  entryActionLocked: false,
});

const billingStateKeys = [
  'customer',
  'currentItem',
  'billItems',
  'editIndex',
  'selectedBillIndex',
  'lastAddedItemId',
  'lastRemovedItem',
  'loading',
  'error',
  'isSubmitting',
  'paidAmount',
  'lastShareText',
  'lastShareNumber',
  'lastSharePhone',
  'prefillSummary',
  'linkedOrderId',
  'fulfillmentMode',
  'showCustomerCreateModal',
  'selectedPaymentMethod',
  'customersList',
  'productsList',
  'pendingProductSelectionReview',
  'productSearchMessage',
  'createBillConfirmationOpen',
  'clearBillConfirmationOpen',
  'entryActionLocked',
];

const billingStateReducer = (state, action) => {
  switch (action.type) {
    case 'set': {
      const nextValue =
        typeof action.value === 'function' ? action.value(state[action.key]) : action.value;
      if (Object.is(state[action.key], nextValue)) return state;
      return {
        ...state,
        [action.key]: nextValue,
      };
    }
    case 'patch':
      return {
        ...state,
        ...action.patch,
      };
    case 'reset':
      return createInitialBillingState();
    default:
      return state;
  }
};

const useBillingState = () => {
  const [state, dispatch] = useReducer(billingStateReducer, undefined, createInitialBillingState);

  const setters = useMemo(() => {
    const nextSetters = {};
    billingStateKeys.forEach((key) => {
      nextSetters[`set${key[0].toUpperCase()}${key.slice(1)}`] = (value) => {
        dispatch({ type: 'set', key, value });
      };
    });
    nextSetters.resetBillingState = (patch = {}) => {
      dispatch({ type: 'patch', patch });
    };
    nextSetters.resetAllBillingState = () => {
      dispatch({ type: 'reset' });
    };
    return nextSetters;
  }, []);

  const resetDraftState = useCallback(() => {
    dispatch({ type: 'patch', patch: createInitialBillingState() });
  }, []);

  return {
    ...state,
    ...setters,
    resetDraftState,
  };
};

export default useBillingState;
