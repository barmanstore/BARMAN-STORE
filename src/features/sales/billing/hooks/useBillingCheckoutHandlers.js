import { useCallback } from 'react';
import { sendWhatsAppSmart } from '../../../../shared/utils/whatsapp';
import { createEmptyItem } from '../utils/billingLineItemUtils';

const normalizeLookupKey = (value = '') => String(value || '').trim().toLowerCase();

const mergeCustomersById = (currentList = [], nextList = []) => {
  const byId = new Map();
  currentList.forEach((customer) => {
    const id = Number(customer?.id || 0);
    if (id > 0) byId.set(id, customer);
  });
  nextList.forEach((customer) => {
    const id = Number(customer?.id || 0);
    if (id > 0) byId.set(id, customer);
  });
  return Array.from(byId.values());
};

const createBlankCustomer = (value = '') => ({
  id: null,
  name: value,
  email: '',
  phone: '',
  address: '',
});

const useBillingCheckoutHandlers = ({
  billingApi,
  customer,
  billItems,
  currentItem,
  customersList,
  totalBill,
  paidAmount,
  selectedPaymentMethod,
  lastShareText,
  lastSharePhone,
  isOrderLinked,
  clearBillConfirmationOpen,
  customerSearchTimeoutRef,
  setCustomer,
  setCustomersList,
  setClearBillConfirmationOpen,
  setSelectedPaymentMethod,
  setPaidAmount,
  setShowCustomerCreateModal,
  setCurrentItem,
  setBillItems,
  setEditIndex,
  setSelectedBillIndex,
  setLastAddedItemId,
  setLastRemovedItem,
  setPrefillSummary,
  setLinkedOrderId,
  setFulfillmentMode,
  setPendingProductSelectionReview,
  setProductSearchMessage,
  setEntryActionLocked,
  setCreateBillConfirmationOpen,
  setError,
  clearSearchState,
  focusEntryField,
  createBillConfirmationSignatureRef,
  setLastShareText,
  setLastShareNumber,
  setLastSharePhone,
}) => {
  const handleSelectCashPayment = useCallback(() => {
    setClearBillConfirmationOpen(false);
    setSelectedPaymentMethod('cash');
    setPaidAmount(totalBill > 0 ? Number(totalBill.toFixed(2)) : 0);
  }, [setClearBillConfirmationOpen, setPaidAmount, setSelectedPaymentMethod, totalBill]);

  const handleSelectUpiPayment = useCallback(() => {
    setClearBillConfirmationOpen(false);
    setSelectedPaymentMethod('upi');
    setPaidAmount(totalBill > 0 ? Number(totalBill.toFixed(2)) : 0);
  }, [setClearBillConfirmationOpen, setPaidAmount, setSelectedPaymentMethod, totalBill]);

  const handleSelectCreditPayment = useCallback(() => {
    setClearBillConfirmationOpen(false);
    setPaidAmount(0);
  }, [setClearBillConfirmationOpen, setPaidAmount]);

  const handleCustomerChange = useCallback((event) => {
    const { value } = event.target;
    setClearBillConfirmationOpen(false);

    if (!billingApi) return;

    if (customerSearchTimeoutRef?.current) {
      clearTimeout(customerSearchTimeoutRef.current);
    }

    const exactMatch = customersList.find((entry) =>
      normalizeLookupKey(entry?.name) === normalizeLookupKey(value)
    );
    if (exactMatch) {
      setCustomer({ ...exactMatch });
      return;
    }

    setCustomer(createBlankCustomer(value));

    if (String(value || '').trim().length >= 2) {
      customerSearchTimeoutRef.current = setTimeout(async () => {
        try {
          const searchResults = await billingApi.searchCustomers(value);
          const list = Array.isArray(searchResults) ? searchResults : [];
          if (list.length > 0) {
            setCustomersList((prev) => mergeCustomersById(prev, list));
            const matched = list.find(
              (entry) => normalizeLookupKey(entry?.name) === normalizeLookupKey(value)
            );
            if (matched) {
              setCustomer({ ...matched });
            }
          }
        } catch (err) {
          console.error('Error searching customers:', err);
        }
      }, 250);
    }
  }, [
    billingApi,
    customersList,
    customerSearchTimeoutRef,
    setClearBillConfirmationOpen,
    setCustomer,
    setCustomersList,
  ]);

  const handleAddCustomer = useCallback(() => {
    if (isOrderLinked) return;
    const name = String(customer?.name || '').trim();
    const existing = customersList.find(
      (entry) => normalizeLookupKey(entry?.name) === normalizeLookupKey(name)
    );
    if (existing) {
      setCustomer({ ...existing });
      alert('Existing customer selected.');
      return;
    }
    setShowCustomerCreateModal(true);
  }, [customer?.name, customersList, isOrderLinked, setCustomer, setShowCustomerCreateModal]);

  const handleCustomerModalSave = useCallback(async (createdUser = null) => {
    try {
      const createdId = Number(createdUser?.id || createdUser?.user_id || 0);
      const createdName = String(createdUser?.name || '').trim().toLowerCase();
      let matched = createdUser && createdId > 0
        ? {
          id: createdId,
          name: String(createdUser?.name || '').trim(),
          email: String(createdUser?.email || '').trim(),
          phone: String(createdUser?.phone || '').trim(),
          address: String(createdUser?.address || '').trim(),
        }
        : null;

      if (!matched && createdName) {
        const latestCustomers = await billingApi.searchCustomers(createdName);
        const list = Array.isArray(latestCustomers) ? latestCustomers : [];
        setCustomersList((prev) => mergeCustomersById(prev, list));
        matched = list.find(
          (entry) => normalizeLookupKey(entry?.name) === createdName
        ) || null;
      }

      if (matched) {
        setCustomersList((prev) => mergeCustomersById(prev, [matched]));
        setCustomer({ ...matched });
      }
    } catch (err) {
      alert(`Customer created, but refresh failed: ${err.message || 'Unknown error'}`);
    } finally {
      focusEntryField('search');
    }
  }, [billingApi, focusEntryField, setCustomer, setCustomersList]);

  const handleCopyShare = useCallback(async () => {
    if (!lastShareText) return;
    try {
      await navigator.clipboard.writeText(lastShareText);
      alert('Bill text copied.');
    } catch (_) {
      alert('Failed to copy bill text.');
    }
  }, [lastShareText]);

  const handleSendWhatsApp = useCallback(async () => {
    if (!lastShareText) return;
    const result = await sendWhatsAppSmart({
      phone: lastSharePhone || customer?.phone,
      text: lastShareText,
    });
    if (result.status === 'blocked_no_phone') {
      alert('Customer phone is missing or invalid. Please update phone and try again.');
      return;
    }
    if (result.status === 'opened_with_copy') {
      alert('Copied message. WhatsApp opened; paste and send to share.');
      return;
    }
    if (result.status === 'opened_without_copy') {
      alert('WhatsApp opened. Please paste the message manually.');
    }
  }, [customer?.phone, lastSharePhone, lastShareText]);

  const handleClear = useCallback(() => {
    const hasDraftContent = Boolean(
      billItems.length > 0
      || String(customer?.name || '').trim()
      || String(customer?.phone || '').trim()
      || String(customer?.email || '').trim()
      || String(customer?.address || '').trim()
      || String(currentItem?.name || '').trim()
      || Number(currentItem?.price || 0) > 0
      || Number(currentItem?.disc || 0) > 0
      || Math.max(1, Number(currentItem?.qty || 1)) !== 1
      || String(paidAmount ?? '').trim()
    );

    if (!hasDraftContent) {
      focusEntryField('search');
      return;
    }

    if (!clearBillConfirmationOpen) {
      setCreateBillConfirmationOpen(false);
      setClearBillConfirmationOpen(true);
      return;
    }

    setCustomer({ id: null, name: '', email: '', phone: '', address: '' });
    setCurrentItem(createEmptyItem());
    setBillItems([]);
    setEditIndex(null);
    setSelectedBillIndex(null);
    setLastAddedItemId(null);
    setLastRemovedItem(null);
    setPaidAmount(0);
    setPrefillSummary('');
    setLinkedOrderId(0);
    setFulfillmentMode('available_now');
    setSelectedPaymentMethod('cash');
    clearSearchState();
    setPendingProductSelectionReview(false);
    setProductSearchMessage('');
    setEntryActionLocked(false);
    createBillConfirmationSignatureRef.current = '';
    setCreateBillConfirmationOpen(false);
    setClearBillConfirmationOpen(false);
    setError(null);
    focusEntryField('search');
  }, [
    billItems.length,
    clearBillConfirmationOpen,
    clearSearchState,
    currentItem?.disc,
    currentItem?.name,
    currentItem?.price,
    currentItem?.qty,
    customer?.name,
    customer?.phone,
    focusEntryField,
    paidAmount,
    createBillConfirmationSignatureRef,
    setBillItems,
    setClearBillConfirmationOpen,
    setCreateBillConfirmationOpen,
    setCurrentItem,
    setCustomer,
    setEditIndex,
    setEntryActionLocked,
    setError,
    setFulfillmentMode,
    setLastAddedItemId,
    setLastRemovedItem,
    setLinkedOrderId,
    setPaidAmount,
    setPendingProductSelectionReview,
    setPrefillSummary,
    setProductSearchMessage,
    setSelectedBillIndex,
    setSelectedPaymentMethod,
  ]);

  const handleCancelClearBillConfirmation = useCallback(() => {
    setClearBillConfirmationOpen(false);
  }, [setClearBillConfirmationOpen]);

  const handleCustomerModalClose = useCallback(() => {
    if (typeof setShowCustomerCreateModal === 'function') {
      setShowCustomerCreateModal(false);
    }
    focusEntryField('search');
  }, [focusEntryField, setShowCustomerCreateModal]);

  const handleCancelCreateBillConfirmation = useCallback(() => {
    createBillConfirmationSignatureRef.current = '';
    setCreateBillConfirmationOpen(false);
  }, [setCreateBillConfirmationOpen, createBillConfirmationSignatureRef]);

  return {
    handleSelectCashPayment,
    handleSelectUpiPayment,
    handleSelectCreditPayment,
    handleCustomerChange,
    handleAddCustomer,
    handleCustomerModalSave,
    handleCopyShare,
    handleSendWhatsApp,
    handleClear,
    handleCancelCreateBillConfirmation,
    handleCancelClearBillConfirmation,
    handleCustomerModalClose,
  };
};

export default useBillingCheckoutHandlers;
