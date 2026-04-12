import { useCallback } from 'react';
import { createEmptyItem } from '../utils/billingLineItemUtils';
import { toPricingQtyFromProduct } from '../utils/billingUnitUtils';

const PRODUCT_CACHE_LIMIT = 160;
const normalizeLookupKey = (value = '') => String(value || '').trim().toLowerCase();
const normalizeCustomItemName = (value = '') => String(value || '')
  .trim()
  .replace(/\s+/g, ' ')
  .toLowerCase();
const roundMoney = (value = 0) => Math.round((Number(value) || 0) * 100) / 100;

const mergeProductsById = (currentList = [], nextList = [], maxItems = PRODUCT_CACHE_LIMIT) => {
  const merged = [];
  const seen = new Set();

  [...nextList, ...currentList].forEach((product) => {
    const id = Number(product?.id || 0);
    if (id <= 0 || seen.has(id)) return;
    seen.add(id);
    merged.push(product);
  });

  return merged.slice(0, maxItems);
};

const getBillingItemType = (item = {}) => {
  const productId = Number(item?.productId || item?.product_id || 0);
  if (productId > 0) return 'inventory';
  if (String(item?.type || '').trim().toLowerCase() === 'custom' || Boolean(item?.isCustom)) {
    return 'custom';
  }
  return 'inventory';
};

const canMergeBillItems = (existingItem = {}, nextItem = {}) => {
  if (getBillingItemType(existingItem) !== 'inventory' || getBillingItemType(nextItem) !== 'inventory') {
    return false;
  }

  const existingProductId = Number(existingItem?.productId || existingItem?.product_id || 0);
  const nextProductId = Number(nextItem?.productId || nextItem?.product_id || 0);
  if (existingProductId <= 0 || nextProductId <= 0) return false;
  if (existingProductId !== nextProductId) return false;

  return (
    normalizeLookupKey(existingItem?.unit || 'pcs') === normalizeLookupKey(nextItem?.unit || 'pcs')
    && roundMoney(existingItem?.price) === roundMoney(nextItem?.price)
    && String(existingItem?.discType || 'fixed') === String(nextItem?.discType || 'fixed')
    && roundMoney(existingItem?.disc) === roundMoney(nextItem?.disc)
  );
};

const useBillingItemHandlers = ({
  currentItem,
  billItems,
  editIndex,
  selectedBillIndex,
  lastAddedItemId,
  lastRemovedItem,
  productSearchResults,
  productSearchLoading,
  pendingProductSelectionReview,
  entryActionLocked,
  hasExplicitSuggestionChoice,
  setCurrentItem,
  setBillItems,
  setEditIndex,
  setSelectedBillIndex,
  setLastAddedItemId,
  setLastRemovedItem,
  setPendingProductSelectionReview,
  setProductSearchMessage,
  setHasExplicitSuggestionChoice,
  setClearBillConfirmationOpen,
  setError,
  setProductsList,
  setActiveProductSuggestionIndex,
  setEntryActionLocked,
  clearSearchState,
  focusEntryField,
  lockEntryActions,
  getProductForLine,
  normalizeBillingItem,
  buildBillingItemFromProduct,
  resolveExactProductMatch,
  resolveHighlightedProduct,
}) => {
  const resetEntryForm = useCallback((options = {}) => {
    setCurrentItem(createEmptyItem());
    setEditIndex(null);
    clearSearchState();
    setPendingProductSelectionReview(false);
    setProductSearchMessage('');
    setEntryActionLocked(false);
    if (options.clearError !== false) {
      setError(null);
    }
    if (options.focusField !== false) {
      focusEntryField('search');
    }
  }, [
    clearSearchState,
    focusEntryField,
    setCurrentItem,
    setEditIndex,
    setPendingProductSelectionReview,
    setProductSearchMessage,
    setError,
    setEntryActionLocked,
  ]);

  const handleCurrentItemChange = useCallback((field, value) => {
    if (['name', 'price', 'qty', 'unit', 'disc'].includes(field)) {
      setPendingProductSelectionReview(false);
    }
    setClearBillConfirmationOpen(false);
    if (field === 'name') {
      setProductSearchMessage('');
      setHasExplicitSuggestionChoice(false);
    }
    setCurrentItem((prev) => {
      if (field === 'name') {
        const rawValue = String(value || '');
        const previousProduct = getProductForLine(prev);
        const previousStillMatches = previousProduct && [
          normalizeLookupKey(previousProduct?.name),
          normalizeLookupKey(previousProduct?.sku),
          normalizeLookupKey(previousProduct?.barcode),
        ].includes(normalizeLookupKey(rawValue));
        const nextIsCustom = rawValue.trim()
          ? Boolean(prev?.isCustom) && !previousStillMatches
          : false;

        return {
          ...prev,
          name: nextIsCustom ? normalizeCustomItemName(rawValue) : rawValue,
          productId: previousStillMatches ? prev.productId : null,
          type: rawValue.trim() ? (nextIsCustom ? 'custom' : 'inventory') : 'inventory',
          isCustom: nextIsCustom,
        };
      }

      if (field === 'price') {
        return normalizeBillingItem({ ...prev, price: value });
      }

      if (field === 'qty') {
        return normalizeBillingItem({ ...prev, qty: value });
      }

      if (field === 'unit') {
        return normalizeBillingItem({ ...prev, unit: value });
      }

      if (field === 'disc') {
        return normalizeBillingItem({ ...prev, disc: value });
      }

      if (field === 'discType') {
        return normalizeBillingItem({ ...prev, discType: 'fixed' });
      }

      return normalizeBillingItem({ ...prev, [field]: value });
    });
    setError(null);
  }, [
    getProductForLine,
    normalizeBillingItem,
    setClearBillConfirmationOpen,
    setCurrentItem,
    setError,
    setHasExplicitSuggestionChoice,
    setPendingProductSelectionReview,
    setProductSearchMessage,
  ]);

  const handleSelectSearchProduct = useCallback((product, focusField = 'qty') => {
    if (!product) return null;
    const nextItem = buildBillingItemFromProduct(product, currentItem);
    setCurrentItem(nextItem);
    setProductsList((prev) => mergeProductsById(prev, [product]));
    clearSearchState();
    setClearBillConfirmationOpen(false);
    setPendingProductSelectionReview(true);
    setProductSearchMessage('');
    setError(null);
    lockEntryActions(200);
    if (focusField) {
      focusEntryField(focusField, {
        select: focusField === 'price' || focusField === 'qty' || focusField === 'disc',
      });
    }
    return nextItem;
  }, [
    buildBillingItemFromProduct,
    clearSearchState,
    currentItem,
    focusEntryField,
    lockEntryActions,
    setClearBillConfirmationOpen,
    setCurrentItem,
    setError,
    setPendingProductSelectionReview,
    setProductSearchMessage,
    setProductsList,
  ]);

  const getCurrentItemValidationError = useCallback((item) => {
    const draft = normalizeBillingItem(item);
    const allowMissingProduct = getBillingItemType(draft) === 'custom';
    const product = getProductForLine(draft);
    const pricingQty = toPricingQtyFromProduct(draft.qty, draft.unit, product);
    const lineSubtotal = roundMoney((Number(draft?.price || 0) || 0) * pricingQty);
    const discountValue = Math.max(0, Number(draft?.disc ?? draft?.discount ?? 0) || 0);

    if (!String(draft?.name || '').trim()) {
      return 'Product or custom name is required.';
    }
    if (Number(draft?.qty || 0) <= 0) {
      return 'Quantity must be at least 1.';
    }
    if (discountValue > lineSubtotal) {
      return 'Discount cannot exceed the item total.';
    }
    if (Number(draft?.amount || 0) <= 0) {
      return 'Line total must be greater than zero.';
    }
    if (!allowMissingProduct && !draft?.isCustom && !Number(draft?.productId || 0)) {
      return 'Pick a product from search or use Add Custom Item.';
    }
    return '';
  }, [getProductForLine, normalizeBillingItem]);

  const handleStartCustomItem = useCallback((rawName = '') => {
    const trimmedName = normalizeCustomItemName(rawName);
    if (!trimmedName) return;

    setCurrentItem((prev) => normalizeBillingItem({
      ...prev,
      type: 'custom',
      name: trimmedName,
      productId: null,
      isCustom: true,
    }));
    clearSearchState();
    setClearBillConfirmationOpen(false);
    setPendingProductSelectionReview(false);
    setProductSearchMessage('');
    setError(null);
    lockEntryActions(200);
    focusEntryField('qty', { select: true });
  }, [
    clearSearchState,
    focusEntryField,
    lockEntryActions,
    normalizeBillingItem,
    setClearBillConfirmationOpen,
    setCurrentItem,
    setError,
    setPendingProductSelectionReview,
    setProductSearchMessage,
  ]);

  const handleCommitCurrentItem = useCallback((options = {}) => {
    const force = Boolean(options?.force);
    if (entryActionLocked) return false;
    let nextItem = normalizeBillingItem(options?.draftItem || currentItem);

    if (!Number(nextItem?.productId || 0)) {
      const exactMatch = resolveExactProductMatch(nextItem?.name, productSearchResults);
      if (exactMatch && getBillingItemType(nextItem) !== 'custom') {
        nextItem = buildBillingItemFromProduct(exactMatch, nextItem);
      }
    }

    nextItem = normalizeBillingItem(nextItem);

    if (
      pendingProductSelectionReview
      && !force
      && getBillingItemType(nextItem) === 'inventory'
      && Number(nextItem?.productId || 0) > 0
    ) {
      setError('Product ready. Press Enter in Qty to add.');
      focusEntryField('qty', { select: true });
      return false;
    }

    const validationError = getCurrentItemValidationError(nextItem);
    if (validationError) {
      setError(validationError);
      return false;
    }

    setError(null);
    const persistedItem = {
      ...nextItem,
      id: nextItem?.id || createEmptyItem().id,
    };
    let nextSelectedBillIndex = editIndex === null ? 0 : editIndex;
    let nextLastAddedItemId = editIndex === null ? persistedItem.id : null;

    setBillItems((prev) => {
      if (editIndex === null) {
        const mergeIndex = prev.findIndex((entry) => canMergeBillItems(entry, persistedItem));
        if (mergeIndex >= 0) {
          const mergeTarget = prev[mergeIndex];
          const mergedItem = normalizeBillingItem({
            ...mergeTarget,
            ...persistedItem,
            id: mergeTarget.id,
            qty: Number(mergeTarget?.qty || 0) + Number(persistedItem?.qty || 0),
          });
          const remainingItems = prev.filter((_, index) => index !== mergeIndex);
          nextSelectedBillIndex = 0;
          nextLastAddedItemId = mergeTarget.id;
          return [mergedItem, ...remainingItems];
        }
        return [persistedItem, ...prev];
      }
      return prev.map((entry, index) => (index === editIndex ? persistedItem : entry));
    });
    setSelectedBillIndex(nextSelectedBillIndex);
    setLastAddedItemId(nextLastAddedItemId);
    setLastRemovedItem(null);
    setCurrentItem(createEmptyItem());
    setEditIndex(null);
    clearSearchState();
    setClearBillConfirmationOpen(false);
    setPendingProductSelectionReview(false);
    lockEntryActions(200);
    focusEntryField('search');
    return true;
  }, [
    buildBillingItemFromProduct,
    clearSearchState,
    currentItem,
    editIndex,
    entryActionLocked,
    focusEntryField,
    getCurrentItemValidationError,
    normalizeBillingItem,
    pendingProductSelectionReview,
    productSearchResults,
    resolveExactProductMatch,
    setBillItems,
    setClearBillConfirmationOpen,
    setCurrentItem,
    setEditIndex,
    setError,
    setLastAddedItemId,
    setLastRemovedItem,
    setPendingProductSelectionReview,
    setSelectedBillIndex,
    lockEntryActions,
  ]);

  const handleCancelEdit = useCallback(() => {
    resetEntryForm();
  }, [resetEntryForm]);

  const handleSelectBillItem = useCallback((index) => {
    const item = billItems[index];
    if (!item) return;

    setCurrentItem(normalizeBillingItem(item));
    setEditIndex(index);
    setSelectedBillIndex(index);
    clearSearchState();
    setPendingProductSelectionReview(false);
    setProductSearchMessage('');
    setClearBillConfirmationOpen(false);
    setError(null);
    focusEntryField('search');
  }, [
    billItems,
    clearSearchState,
    focusEntryField,
    normalizeBillingItem,
    setClearBillConfirmationOpen,
    setCurrentItem,
    setEditIndex,
    setError,
    setPendingProductSelectionReview,
    setProductSearchMessage,
    setSelectedBillIndex,
  ]);

  const handleDeleteBillItem = useCallback((index) => {
    const removedItem = billItems[index];
    if (!removedItem) return;

    setBillItems((prev) => prev.filter((_, itemIndex) => itemIndex !== index));
    setLastRemovedItem({ item: removedItem, index });
    setClearBillConfirmationOpen(false);
    if (removedItem.id === lastAddedItemId) {
      setLastAddedItemId(null);
    }

    if (editIndex === index) {
      resetEntryForm();
    } else if (editIndex !== null && editIndex > index) {
      setEditIndex(editIndex - 1);
    }

    const nextLength = billItems.length - 1;
    if (nextLength <= 0) {
      setSelectedBillIndex(null);
      return;
    }

    if (selectedBillIndex === null) {
      setSelectedBillIndex(0);
      return;
    }

    if (selectedBillIndex === index) {
      setSelectedBillIndex(Math.min(index, nextLength - 1));
      return;
    }

    if (selectedBillIndex > index) {
      setSelectedBillIndex(selectedBillIndex - 1);
    }
  }, [
    billItems,
    editIndex,
    lastAddedItemId,
    resetEntryForm,
    selectedBillIndex,
    setBillItems,
    setClearBillConfirmationOpen,
    setEditIndex,
    setLastAddedItemId,
    setLastRemovedItem,
    setSelectedBillIndex,
  ]);

  const handleUndoLastRemoval = useCallback(() => {
    if (!lastRemovedItem?.item) return;

    setBillItems((prev) => {
      const nextItems = [...prev];
      const insertAt = Math.min(lastRemovedItem.index, nextItems.length);
      nextItems.splice(insertAt, 0, lastRemovedItem.item);
      return nextItems;
    });
    setSelectedBillIndex(lastRemovedItem.index);
    setLastRemovedItem(null);
    setClearBillConfirmationOpen(false);
    setProductSearchMessage('');
    focusEntryField('search');
  }, [
    focusEntryField,
    lastRemovedItem,
    setBillItems,
    setClearBillConfirmationOpen,
    setLastRemovedItem,
    setProductSearchMessage,
    setSelectedBillIndex,
  ]);

  const handleProductSearchKeyDown = useCallback((event) => {
    const handleSearchEnter = () => {
      const query = normalizeLookupKey(currentItem?.name);
      const highlightedProduct = resolveHighlightedProduct();
      const exactMatch = resolveExactProductMatch(currentItem?.name, productSearchResults);
      const exactCodeMatch = exactMatch && [
        normalizeLookupKey(exactMatch?.sku),
        normalizeLookupKey(exactMatch?.barcode),
      ].includes(query);

      if (exactCodeMatch) {
        handleSelectSearchProduct(exactMatch, 'qty');
        return;
      }

      if (productSearchResults.length === 1 && highlightedProduct) {
        handleSelectSearchProduct(highlightedProduct, 'qty');
        return;
      }

      if (productSearchResults.length > 1) {
        if (hasExplicitSuggestionChoice && highlightedProduct) {
          handleSelectSearchProduct(highlightedProduct, 'qty');
          return;
        }
        setProductSearchMessage('Multiple matches. Use arrows or click.');
        return;
      }

      if (Number(currentItem?.productId || 0) > 0) {
        focusEntryField('qty', { select: true });
        return;
      }

      if (productSearchLoading) {
        setProductSearchMessage('Searching. Press Enter again.');
        return;
      }

      if (String(currentItem?.name || '').trim()) {
        handleStartCustomItem(currentItem?.name);
      }
    };

    const highlightedProduct = resolveHighlightedProduct();
    const hasTypedQuery = Boolean(String(currentItem?.name || '').trim());

    if (event.ctrlKey && event.key === 'Enter') {
      event.preventDefault();
      if (entryActionLocked) return;
      if (!Number(currentItem?.productId || 0) && hasTypedQuery) {
        handleStartCustomItem(currentItem?.name);
        return;
      }
      handleCommitCurrentItem({ force: true });
      return;
    }

    if (event.key === 'Escape') {
      event.preventDefault();
      handleCancelEdit();
      return;
    }

    if (event.key === 'ArrowDown') {
      if (!productSearchResults.length) return;
      event.preventDefault();
      setHasExplicitSuggestionChoice(true);
      setProductSearchMessage('');
      setError(null);
      setActiveProductSuggestionIndex((prev) => Math.min(prev + 1, productSearchResults.length - 1));
      return;
    }

    if (event.key === 'ArrowUp') {
      if (!productSearchResults.length) return;
      event.preventDefault();
      setHasExplicitSuggestionChoice(true);
      setProductSearchMessage('');
      setError(null);
      setActiveProductSuggestionIndex((prev) => Math.max(prev - 1, 0));
      return;
    }

    if (
      event.key === 'Tab'
      && !event.shiftKey
      && !event.ctrlKey
      && !event.altKey
      && !event.metaKey
      && !Number(currentItem?.productId || 0)
      && hasTypedQuery
    ) {
      if (productSearchResults.length > 1 && !hasExplicitSuggestionChoice) {
        event.preventDefault();
        setProductSearchMessage('Multiple matches. Use arrows or click.');
        return;
      }
      if (!highlightedProduct) {
        event.preventDefault();
        setProductSearchMessage(
          productSearchLoading
            ? 'Searching. Wait or press Enter for custom.'
            : 'No exact match. Press Enter for custom or keep typing.'
        );
        return;
      }
      event.preventDefault();
      setProductSearchMessage('');
      handleSelectSearchProduct(highlightedProduct, 'qty');
      return;
    }

    if (event.key !== 'Enter') return;

    event.preventDefault();
    if (entryActionLocked) return;
    setProductSearchMessage('');
    handleSearchEnter();
  }, [
    currentItem,
    entryActionLocked,
    focusEntryField,
    hasExplicitSuggestionChoice,
    handleCancelEdit,
    handleCommitCurrentItem,
    handleSelectSearchProduct,
    handleStartCustomItem,
    productSearchLoading,
    productSearchResults,
    resolveExactProductMatch,
    resolveHighlightedProduct,
    setActiveProductSuggestionIndex,
    setError,
    setHasExplicitSuggestionChoice,
    setProductSearchMessage,
  ]);

  const handleEntryFieldKeyDown = useCallback((field) => (event) => {
    if (event.ctrlKey && event.key === 'Enter') {
      event.preventDefault();
      if (entryActionLocked) return;
      handleCommitCurrentItem({ force: true });
      return;
    }

    if (event.key === 'Escape') {
      event.preventDefault();
      handleCancelEdit();
      return;
    }

    if (event.key !== 'Enter') return;

    event.preventDefault();
    if (entryActionLocked) return;

    if (pendingProductSelectionReview) {
      setPendingProductSelectionReview(false);
    }

    const hasResolvedPrice = Number(currentItem?.price || 0) > 0;

    if (field === 'qty') {
      if (!event.shiftKey && hasResolvedPrice) {
        handleCommitCurrentItem();
        return;
      }

      focusEntryField('price', { select: true });
      return;
    }

    if (field === 'price') {
      if (event.shiftKey) {
        focusEntryField('disc', { select: true });
        return;
      }

      if (hasResolvedPrice) {
        handleCommitCurrentItem();
        return;
      }
    }

    const nextFieldByCurrentField = {
      disc: 'submit',
      unit: 'submit',
    };
    const nextField = nextFieldByCurrentField[field];

    if (nextField === 'submit') {
      handleCommitCurrentItem();
      return;
    }

    focusEntryField(nextField, {
      select: nextField === 'qty' || nextField === 'price' || nextField === 'disc',
    });
  }, [
    currentItem?.price,
    entryActionLocked,
    focusEntryField,
    handleCancelEdit,
    handleCommitCurrentItem,
    pendingProductSelectionReview,
    setPendingProductSelectionReview,
  ]);

  return {
    handleCurrentItemChange,
    handleSelectSearchProduct,
    handleStartCustomItem,
    handleCommitCurrentItem,
    handleCancelEdit,
    handleSelectBillItem,
    handleDeleteBillItem,
    handleUndoLastRemoval,
    handleProductSearchKeyDown,
    handleEntryFieldKeyDown,
  };
};

export default useBillingItemHandlers;
