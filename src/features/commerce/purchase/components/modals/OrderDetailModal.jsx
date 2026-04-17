import { useDeferredValue, useEffect, useMemo, useState } from 'react';
import { ArrowUpDown, ChevronDown, ChevronUp, MessageCircle, Plus, Printer, Search, Trash2 } from 'lucide-react';
import WindowModal from '../../../../../shared/components/window/WindowModal';
import PurchaseOrderReviewSheet from '../PurchaseOrderReviewSheet';
import { formatCurrencyRounded } from '../../../../../shared/utils/formatters';

const SORTABLE_ORDER_DETAIL_COLUMNS = {
  product: 'product',
  quantity: 'quantity',
  rate: 'rate',
  discount: 'discount',
  gst: 'gst',
  taxable: 'taxable',
  tax: 'tax',
  total: 'total',
};

const compareOrderDetailSortValues = (leftValue, rightValue) => {
  const leftEmpty = leftValue === null || leftValue === undefined || leftValue === '';
  const rightEmpty = rightValue === null || rightValue === undefined || rightValue === '';

  if (leftEmpty && rightEmpty) {
    return 0;
  }

  if (leftEmpty) {
    return 1;
  }

  if (rightEmpty) {
    return -1;
  }

  const leftNumber = Number(leftValue);
  const rightNumber = Number(rightValue);
  const leftIsNumeric = Number.isFinite(leftNumber) && String(leftValue).trim() !== '';
  const rightIsNumeric = Number.isFinite(rightNumber) && String(rightValue).trim() !== '';

  if (leftIsNumeric && rightIsNumeric) {
    return leftNumber - rightNumber;
  }

  return String(leftValue).localeCompare(String(rightValue), undefined, {
    numeric: true,
    sensitivity: 'base',
  });
};

const getOrderDetailSortValue = (row, columnKey) => {
  const item = row?.item || {};
  const line = row?.line || {};

  switch (columnKey) {
    case SORTABLE_ORDER_DETAIL_COLUMNS.product:
      return String(item?.product_name || item?.name || item?.product_query || '').trim().toLowerCase();
    case SORTABLE_ORDER_DETAIL_COLUMNS.quantity:
      return Number(line.quantity || item?.quantity || 0) || 0;
    case SORTABLE_ORDER_DETAIL_COLUMNS.rate:
      return Number(line.rate ?? item?.rate ?? item?.unit_price ?? 0) || 0;
    case SORTABLE_ORDER_DETAIL_COLUMNS.discount:
      return Number(item?.discount_value ?? line.discountValue ?? 0) || 0;
    case SORTABLE_ORDER_DETAIL_COLUMNS.gst:
      return Number(line.gstRate ?? item?.gst_rate ?? 0) || 0;
    case SORTABLE_ORDER_DETAIL_COLUMNS.taxable:
      return Number(line.taxableValue ?? 0) || 0;
    case SORTABLE_ORDER_DETAIL_COLUMNS.tax:
      return Number(line.taxAmount ?? 0) || 0;
    case SORTABLE_ORDER_DETAIL_COLUMNS.total:
      return Number(line.lineTotal ?? line.totalAmount ?? 0) || 0;
    default:
      return String(item?.product_name || item?.name || item?.product_query || '').trim().toLowerCase();
  }
};

const getNextOrderDetailSortConfig = (currentSortConfig, columnKey) => {
  if (currentSortConfig?.key !== columnKey) {
    return { key: columnKey, direction: 'ascending' };
  }

  return {
    key: columnKey,
    direction: currentSortConfig.direction === 'ascending' ? 'descending' : 'ascending',
  };
};

const renderOrderDetailSortIcon = (direction) => {
  if (direction === 'ascending') {
    return <ChevronUp size={14} aria-hidden="true" />;
  }

  if (direction === 'descending') {
    return <ChevronDown size={14} aria-hidden="true" />;
  }

  return <ArrowUpDown size={14} aria-hidden="true" />;
};

const normalizeIntegerInput = (value) => String(value ?? '').replace(/[^\d]/g, '');

const getOrderDetailRowSearchText = (row, products = []) => {
  const item = row?.item || {};
  const matchedProduct = products.find((product) => String(product?.id || '') === String(item?.product_id || '')) || null;

  return [
    item?.product_name,
    item?.name,
    item?.product_query,
    item?.sku,
    matchedProduct?.name,
    matchedProduct?.sku,
  ]
    .filter(Boolean)
    .join(' ')
    .trim()
    .toLowerCase();
};

const OrderDetailModal = ({
  showOrderDetail,
  closeOrderDetail,
  orderDetail,
  orderDetailLoading,
  orderDetailSupplier,
  orderDetailEditMode,
  orderDetailDraft,
  handleOrderDetailFieldChange,
  formatDateTime,
  formatDate,
  getPoLifecycleStatus,
  getPoPaymentStatus,
  getPoPaidAmount,
  getPoBalanceDue,
  getPoNextAction,
  orderDetailItems,
  getItemFinancials,
  getOrderDetailOriginalItem,
  hasOrderDetailItemChanged,
  getOrderDetailItemFieldChanged,
  handleOrderDetailProductInputChange,
  products,
  getProductSearchLabel,
  handleOrderDetailItemChange,
  getPurchasePackStep,
  getAllowedPurchaseUnitsForProduct,
  handleOrderDetailItemRemove,
  handleOrderDetailItemAdd,
  orderDetailHasComputedChanges,
  orderDetailComputedTotals,
  orderDetailDraftDiagnostics,
  orderDetailIsEditable,
  orderDetailSaving,
  handleOrderDetailSave,
  openOrderDetailEditMode,
  handlePrintOrderDetail,
  handleSendDistributorWhatsApp,
  sendingWhatsAppOrderId,
  GST_RATE_OPTIONS,
  toNumber,
  formatCurrency,
}) => {
  const [sortConfig, setSortConfig] = useState({ key: null, direction: null });
  const [itemProductSearch, setItemProductSearch] = useState('');
  const deferredItemProductSearch = useDeferredValue(itemProductSearch);

  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    setSortConfig({ key: null, direction: null });
  }, [orderDetail?.id, orderDetailEditMode]);
  /* eslint-enable react-hooks/set-state-in-effect */

  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    setItemProductSearch('');
  }, [orderDetail?.id]);
  /* eslint-enable react-hooks/set-state-in-effect */

  const orderDetailRows = useMemo(() => {
    const items = Array.isArray(orderDetailItems) ? orderDetailItems : [];

    return items.map((item, originalIndex) => {
      const line = getItemFinancials(item);
      const originalItem = getOrderDetailOriginalItem(item, originalIndex);

      return {
        item,
        originalIndex,
        line,
        originalItem,
      };
    });
  }, [getItemFinancials, getOrderDetailOriginalItem, orderDetailItems]);

  const sortedOrderDetailRows = useMemo(() => {
    if (!sortConfig.key) {
      return orderDetailRows;
    }

    const directionMultiplier = sortConfig.direction === 'descending' ? -1 : 1;

    return [...orderDetailRows].sort((leftRow, rightRow) => {
      const comparison = compareOrderDetailSortValues(
        getOrderDetailSortValue(leftRow, sortConfig.key),
        getOrderDetailSortValue(rightRow, sortConfig.key),
      );

      if (comparison !== 0) {
        return comparison * directionMultiplier;
      }

      return leftRow.originalIndex - rightRow.originalIndex;
    });
  }, [orderDetailRows, sortConfig]);

  const normalizedItemProductSearch = String(deferredItemProductSearch || '').trim().toLowerCase();
  const displayedOrderDetailRows = useMemo(() => {
    if (!normalizedItemProductSearch) {
      return sortedOrderDetailRows;
    }

    return sortedOrderDetailRows.filter((entry) => (
      getOrderDetailRowSearchText(entry, products).includes(normalizedItemProductSearch)
    ));
  }, [normalizedItemProductSearch, products, sortedOrderDetailRows]);

  const renderOrderDetailProductHeader = () => {
    const isActive = sortConfig.key === SORTABLE_ORDER_DETAIL_COLUMNS.product;
    const ariaSort = isActive ? sortConfig.direction : 'none';
    const sortLabel = isActive
      ? `Sort by Product, currently ${sortConfig.direction}`
      : 'Sort by Product';

    return (
      <th className="sortable po-detail-product-header-cell" aria-sort={ariaSort}>
        <div className="po-detail-product-header">
          <button
            type="button"
            className="po-detail-sort-btn po-detail-product-sort-toggle"
            onClick={() => setSortConfig((current) => getNextOrderDetailSortConfig(current, SORTABLE_ORDER_DETAIL_COLUMNS.product))}
            title={sortLabel}
            aria-label={sortLabel}
          >
            <span>Product</span>
            <span className="po-detail-sort-icon" aria-hidden="true">
              {renderOrderDetailSortIcon(isActive ? sortConfig.direction : null)}
            </span>
          </button>
          <label className="po-detail-product-search" htmlFor="po-detail-item-product-search">
            <Search size={12} aria-hidden="true" />
            <input
              id="po-detail-item-product-search"
              type="search"
              value={itemProductSearch}
              onChange={(event) => setItemProductSearch(event.target.value)}
              placeholder="Search row"
              aria-label="Search loaded item rows by product name or SKU"
              disabled={orderDetailSaving}
            />
          </label>
        </div>
      </th>
    );
  };

  const renderOrderDetailSortableHeader = (label, columnKey) => {
    const isActive = sortConfig.key === columnKey;
    const ariaSort = isActive ? sortConfig.direction : 'none';
    const sortLabel = isActive
      ? `Sort by ${label}, currently ${sortConfig.direction}`
      : `Sort by ${label}`;

    return (
      <th className="sortable" aria-sort={ariaSort}>
        <button
          type="button"
          className="po-detail-sort-btn"
          onClick={() => setSortConfig((current) => getNextOrderDetailSortConfig(current, columnKey))}
          title={sortLabel}
          aria-label={sortLabel}
        >
          <span>{label}</span>
          <span className="po-detail-sort-icon" aria-hidden="true">
            {renderOrderDetailSortIcon(isActive ? sortConfig.direction : null)}
          </span>
        </button>
      </th>
    );
  };

  const handleDetailQuantityKeyDown = (event) => {
    if (['e', 'E', '.', ','].includes(event.key)) {
      event.preventDefault();
    }
  };

  const handleDetailQuantityBlur = (index) => (event) => {
    const parsedValue = Number(event.target.value);
    if (!Number.isFinite(parsedValue)) return;
    const normalizedValue = Math.max(0, Math.trunc(parsedValue));
    if (parsedValue !== normalizedValue) {
      handleOrderDetailItemChange(index, 'quantity', normalizedValue);
    }
  };

  const getOrderDetailDiscountType = () => {
    return orderDetailDraft?.items?.[0]?.discount_type || 'percent';
  };

  const handleOrderDetailDiscountTypeChange = (value) => {
    if (!orderDetailDraft?.items?.length) return;
    orderDetailDraft.items.forEach((_, rowIndex) => {
      handleOrderDetailItemChange(rowIndex, 'discount_type', value);
    });
  };

  const renderOrderDetailDiscountHeader = () => {
    if (!orderDetailEditMode) {
      return renderOrderDetailSortableHeader('Disc', SORTABLE_ORDER_DETAIL_COLUMNS.discount);
    }

    return (
      <th>
        <div className="po-invoice-table-discount-header">
          <span>Disc</span>
          <select
            name="discount_type"
            value={getOrderDetailDiscountType()}
            onChange={(event) => handleOrderDetailDiscountTypeChange(event.target.value)}
          >
            <option value="percent">%</option>
            <option value="fixed">Fixed</option>
          </select>
        </div>
      </th>
    );
  };

  const renderOrderDetailRowConfirmButton = (rowDiagnostics, originalIndex, displayIndex) => {
    const needsRateConfirmation = Boolean(rowDiagnostics?.rateRequiresAcknowledgement);
    const needsDiscountConfirmation = Boolean(rowDiagnostics?.discountRequiresAcknowledgement);
    if (!needsRateConfirmation && !needsDiscountConfirmation) return null;

    const title = needsRateConfirmation
      ? rowDiagnostics.rateAcknowledgementMessage || rowDiagnostics.rateWarningMessage || 'Accept price'
      : rowDiagnostics.discountAcknowledgementMessage || rowDiagnostics.discountWarningMessage || 'Confirm discount';
    const ariaLabel = needsRateConfirmation
      ? `Accept rate for item ${displayIndex + 1}`
      : `Confirm discount for item ${displayIndex + 1}`;

    return (
      <button
        type="button"
        className="po-popup-inline-action po-popup-inline-action-small"
        onClick={() => {
          if (needsRateConfirmation) {
            handleOrderDetailItemChange(originalIndex, 'rate_warning_acknowledged', true);
          }
          if (needsDiscountConfirmation) {
            handleOrderDetailItemChange(originalIndex, 'discount_warning_acknowledged', true);
          }
        }}
        disabled={orderDetailSaving}
        title={title}
        aria-label={ariaLabel}
      >
        ✓
      </button>
    );
  };

  if (!showOrderDetail) return null;

  const reviewRows = orderDetailRows.map(({ item, line, originalIndex }) => {
    return {
      key: String(item?.id || `detail-row-${originalIndex}`),
      name: String(item?.product_name || item?.name || item?.product_query || `Row ${originalIndex + 1}`).trim(),
      quantity: Math.max(0, Number(line.quantity || item?.quantity || 0) || 0),
      uom: String(line.uom || item?.uom || 'pcs').trim() || 'pcs',
      rate: Number(line.rate ?? item?.rate ?? item?.unit_price ?? 0) || 0,
      gstRate: Number(line.gstRate ?? item?.gst_rate ?? 0) || 0,
      discountType: item?.discount_type || line.discountType || 'percent',
      discountValue: Number(item?.discount_value ?? line.discountValue ?? 0) || 0,
      total: Number(line.lineTotal ?? line.totalAmount ?? 0) || 0,
    };
  });
  const reviewNotes = [
    {
      label: 'Note',
      value: String(orderDetail?.notes || '').trim(),
    },
    {
      label: 'Strict Due Note',
      value: String(orderDetail?.strict_due_note || '').trim(),
    },
  ].filter((note) => note.value);

  return (
    <WindowModal
      open
      title={`Purchase Order: ${orderDetail?.po_number || '-'}`}
      onClose={closeOrderDetail}
      dismissible={!orderDetailSaving}
      closeOnBackdrop={false}
      themeClassName="purchase-management"
      dialogClassName="purchase-modal-frame large po-detail-modal"
      headerClassName="purchase-modal-header"
      closeButtonClassName="purchase-modal-close-btn"
      initialSize={{ width: 1180, height: 820 }}
      minWidth={760}
      minHeight={520}
    >
        {orderDetailLoading || !orderDetail ? (
          <div className="order-detail-body">
            <div className="loading">Loading purchase order details...</div>
          </div>
        ) : orderDetailEditMode ? (
          <div className="order-detail-body">
            <div className="po-invoice-preview">
              <div className="po-invoice-header">
                <div>
                  <h3>Purchase Order</h3>
                  <p>PO #{orderDetail.po_number}</p>
                </div>
                <div className="po-invoice-meta">
                  <div><span>PO Status</span><strong>{String(getPoLifecycleStatus(orderDetail) || '-').toUpperCase()}</strong></div>
                  <div><span>Payment</span><strong>{String(getPoPaymentStatus(orderDetail) || '-').toUpperCase()}</strong></div>
                  <div><span>Paid</span><strong>{formatCurrency(getPoPaidAmount(orderDetail))}</strong></div>
                  <div><span>Balance</span><strong>{formatCurrency(getPoBalanceDue(orderDetail))}</strong></div>
                  <div><span>Created</span><strong>{formatDateTime(orderDetail.created_at || orderDetail.order_date)}</strong></div>
                  <div>
                    <span>Expected</span>
                    {orderDetailEditMode ? (
                      <input
                        type="date"
                        id="po-detail-expected-delivery"
                        name="expected_delivery"
                        value={orderDetailDraft?.expected_delivery || ''}
                        onChange={(event) => handleOrderDetailFieldChange('expected_delivery', event.target.value)}
                      />
                    ) : (
                      <strong>{formatDate(orderDetail.expected_delivery)}</strong>
                    )}
                  </div>
                  <div><span>Payment Due</span><strong>{formatDate(orderDetail.payment_due_date)}</strong></div>
                  <div>
                    <span>Strict Due</span>
                    {orderDetailEditMode ? (
                      <input
                        type="date"
                        id="po-detail-strict-due-date"
                        name="strict_due_date"
                        value={orderDetailDraft?.strict_due_date || ''}
                        onChange={(event) => handleOrderDetailFieldChange('strict_due_date', event.target.value)}
                      />
                    ) : (
                      <strong>{orderDetail.strict_due_date ? formatDate(orderDetail.strict_due_date) : '-'}</strong>
                    )}
                  </div>
                  <div><span>Next Action</span><strong>{getPoNextAction(orderDetail)}</strong></div>
                  <div><span>Bill No</span><strong>{orderDetail.bill_number || orderDetail.invoice_number || '-'}</strong></div>
                </div>
              </div>

              <div className="po-party-grid">
                <div className="po-party-card">
                  <h4>Supplier</h4>
                  <p>{orderDetailSupplier.name}</p>
                  <p>{orderDetailSupplier.phone}</p>
                  <p>{orderDetailSupplier.address}</p>
                </div>
                <div className="po-party-card">
                  <h4>Notes</h4>
                  {orderDetailEditMode ? (
                    <div className="po-detail-edit-stack">
                      <textarea
                        id="po-detail-notes"
                        name="notes"
                        rows="3"
                        value={orderDetailDraft?.notes || ''}
                        onChange={(event) => handleOrderDetailFieldChange('notes', event.target.value)}
                        placeholder="PO notes"
                      />
                      <textarea
                        id="po-detail-strict-due-note"
                        name="strict_due_note"
                        rows="3"
                        value={orderDetailDraft?.strict_due_note || ''}
                        onChange={(event) => handleOrderDetailFieldChange('strict_due_note', event.target.value)}
                        placeholder="Strict due note"
                      />
                    </div>
                  ) : (
                    <>
                      <p>{orderDetail.notes || '-'}</p>
                      <p>{orderDetail.strict_due_note || 'No strict deadline note'}</p>
                    </>
                  )}
                </div>
              </div>

              <table className="po-invoice-table">
                <colgroup>
                  <col className="po-detail-col-index" />
                  <col className="po-detail-col-product" />
                  <col className="po-detail-col-qty" />
                  <col className="po-detail-col-uom" />
                  <col className="po-detail-col-rate" />
                  <col className="po-detail-col-discount-value" />
                  <col className="po-detail-col-gst" />
                  <col className="po-detail-col-taxable" />
                  <col className="po-detail-col-tax" />
                  <col className="po-detail-col-total" />
                  {orderDetailEditMode ? <col className="po-detail-col-actions" /> : null}
                </colgroup>
                <thead>
                  <tr>
                    <th>#</th>
                    {renderOrderDetailProductHeader()}
                    {renderOrderDetailSortableHeader('Qty', SORTABLE_ORDER_DETAIL_COLUMNS.quantity)}
                    <th>UOM</th>
                    {renderOrderDetailSortableHeader('Rate', SORTABLE_ORDER_DETAIL_COLUMNS.rate)}
                    {renderOrderDetailDiscountHeader()}
                    {renderOrderDetailSortableHeader('GST', SORTABLE_ORDER_DETAIL_COLUMNS.gst)}
                    {renderOrderDetailSortableHeader('Taxable', SORTABLE_ORDER_DETAIL_COLUMNS.taxable)}
                    {renderOrderDetailSortableHeader('Tax', SORTABLE_ORDER_DETAIL_COLUMNS.tax)}
                    {renderOrderDetailSortableHeader('Total', SORTABLE_ORDER_DETAIL_COLUMNS.total)}
                    {orderDetailEditMode ? <th /> : null}
                  </tr>
                </thead>
                <tbody>
                  {displayedOrderDetailRows.length ? displayedOrderDetailRows.map(({ item, originalIndex, line, originalItem }, displayIndex) => {
                    const originalLine = originalItem ? getItemFinancials(originalItem) : null;
                    const rowDiagnostics = orderDetailDraftDiagnostics?.rowDiagnostics?.[originalIndex] || {};
                    const rowChanged = orderDetailEditMode && hasOrderDetailItemChanged(item, originalIndex);
                    const productChanged = orderDetailEditMode && getOrderDetailItemFieldChanged(item, originalIndex, 'product_id');
                    const qtyChanged = orderDetailEditMode && getOrderDetailItemFieldChanged(item, originalIndex, 'quantity');
                    const uomChanged = orderDetailEditMode && getOrderDetailItemFieldChanged(item, originalIndex, 'uom');
                    const rateChanged = orderDetailEditMode && getOrderDetailItemFieldChanged(item, originalIndex, 'rate');
                    const discountValueChanged = orderDetailEditMode && getOrderDetailItemFieldChanged(item, originalIndex, 'discount_value');
                    const gstChanged = orderDetailEditMode && getOrderDetailItemFieldChanged(item, originalIndex, 'gst_rate');
                    const selectedProduct = products.find((product) => String(product?.id || '') === String(item.product_id || '')) || null;
                    const uomOptions = getAllowedPurchaseUnitsForProduct(selectedProduct);
                    const quantityStepRaw = getPurchasePackStep(selectedProduct, item.uom || line.uom);
                    const quantityStep = Number.isFinite(quantityStepRaw) && Number.isInteger(quantityStepRaw)
                      ? quantityStepRaw
                      : 1;
                    return (
                      <tr key={item.id || `detail-row-${originalIndex}`} className={rowChanged ? 'po-detail-row-edited' : ''}>
                        <td>{displayIndex + 1}</td>
                        <td className={productChanged ? 'po-detail-field-changed' : ''}>
                          {orderDetailEditMode ? (
                            <>
                              <input
                                type="text"
                                id={`po-detail-product-${originalIndex}`}
                                name="product_query"
                                list={`po-detail-product-list-${originalIndex}`}
                                value={item.product_query || ''}
                                onChange={(event) => handleOrderDetailProductInputChange(originalIndex, event.target.value)}
                                placeholder="Type product name / SKU"
                              />
                              <datalist id={`po-detail-product-list-${originalIndex}`}>
                                {products.map((product) => (
                                  <option key={`po-detail-product-${originalIndex}-${product.id}`} value={getProductSearchLabel(product)} />
                                ))}
                              </datalist>
                            </>
                          ) : item.product_name}
                        </td>
                        <td className={qtyChanged ? 'po-detail-field-changed' : ''}>
                          {orderDetailEditMode ? (
                            <>
                              <input
                                type="number"
                                id={`po-detail-qty-${originalIndex}`}
                                name="quantity"
                                min="1"
                                step={quantityStep}
                                inputMode="numeric"
                                value={item.quantity}
                                onChange={(event) => handleOrderDetailItemChange(
                                  originalIndex,
                                  'quantity',
                                  normalizeIntegerInput(event.target.value)
                                )}
                                onKeyDown={handleDetailQuantityKeyDown}
                                onBlur={handleDetailQuantityBlur(originalIndex)}
                              />
                            </>
                          ) : line.quantity}
                        </td>
                        <td className={uomChanged ? 'po-detail-field-changed' : ''}>
                          {orderDetailEditMode ? (
                            <>
                              <select
                                id={`po-detail-uom-${originalIndex}`}
                                name="uom"
                                value={line.uom}
                                onChange={(event) => handleOrderDetailItemChange(originalIndex, 'uom', event.target.value)}
                              >
                                {uomOptions.map((uomOption) => (
                                  <option key={`detail-item-${originalIndex}-uom-${uomOption}`} value={uomOption}>
                                    {uomOption}
                                  </option>
                                ))}
                              </select>
                            </>
                          ) : (item.uom || '-')}
                        </td>
                        <td className={rateChanged ? 'po-detail-field-changed' : ''}>
                          {orderDetailEditMode ? (
                            <>
                              <input
                                type="number"
                                id={`po-detail-rate-${originalIndex}`}
                                name="rate"
                                step="0.01"
                                min="0"
                                value={item.rate}
                                onChange={(event) => handleOrderDetailItemChange(originalIndex, 'rate', event.target.value)}
                              />
                            </>
                          ) : (
                            <div>{formatCurrency(line.rate)}</div>
                          )}
                        </td>
                        <td className={discountValueChanged ? 'po-detail-field-changed' : ''}>
                          {orderDetailEditMode ? (
                            <>
                              <input
                                type="number"
                                id={`po-detail-disc-value-${originalIndex}`}
                                name="discount_value"
                                step="0.01"
                                min="0"
                                value={item.discount_value ?? 0}
                                onChange={(event) => handleOrderDetailItemChange(originalIndex, 'discount_value', event.target.value)}
                              />
                            </>
                          ) : String(toNumber(item.discount_value || 0))}
                        </td>
                        <td className={gstChanged ? 'po-detail-field-changed' : ''}>
                          {orderDetailEditMode ? (
                            <>
                              <select
                                id={`po-detail-gst-${originalIndex}`}
                                name="gst_rate"
                                value={item.gst_rate}
                                onChange={(event) => handleOrderDetailItemChange(originalIndex, 'gst_rate', event.target.value)}
                              >
                                {GST_RATE_OPTIONS.map((rate) => (
                                  <option key={`detail-item-${originalIndex}-gst-${rate}`} value={rate}>
                                    {rate}%
                                  </option>
                                ))}
                              </select>
                            </>
                          ) : `${line.gstRate.toFixed(2)}%`}
                        </td>
                        <td className={rowChanged && (!originalLine || Math.abs(line.taxableValue - originalLine.taxableValue) > 0.0001) ? 'po-detail-computed-change' : ''}>
                          {formatCurrency(line.taxableValue)}
                        </td>
                        <td className={rowChanged && (!originalLine || Math.abs(line.taxAmount - originalLine.taxAmount) > 0.0001) ? 'po-detail-computed-change' : ''}>
                          {formatCurrency(line.taxAmount)}
                        </td>
                        <td className={rowChanged && (!originalLine || Math.abs(line.lineTotal - originalLine.lineTotal) > 0.0001) ? 'po-detail-computed-change' : ''}>
                          {formatCurrency(line.lineTotal)}
                        </td>
                        {orderDetailEditMode ? (
                          <td>
                            <div className="po-popup-grid-total-actions">
                              {renderOrderDetailRowConfirmButton(rowDiagnostics, originalIndex, displayIndex)}
                              <button
                                type="button"
                                className="remove-item-btn"
                                onClick={() => handleOrderDetailItemRemove(originalIndex)}
                                aria-label={`Remove item ${displayIndex + 1}`}
                              >
                                <Trash2 size={14} />
                              </button>
                            </div>
                          </td>
                        ) : null}
                      </tr>
                    );
                  }) : (
                    <tr className="po-detail-empty-row">
                      <td colSpan={orderDetailEditMode ? 11 : 10}>No rows match the product search.</td>
                    </tr>
                  )}
                </tbody>
              </table>
              {orderDetailEditMode ? (
                <div className="po-detail-table-actions">
                  <button type="button" className="add-item-btn" onClick={handleOrderDetailItemAdd}>
                    <Plus size={16} /> Add Item
                  </button>
                </div>
              ) : null}

              <div className="po-invoice-summary">
                <div className={`po-summary-row${orderDetailHasComputedChanges ? ' po-detail-computed-change' : ''}`}>
                  <span>Taxable Value</span>
                  <strong>{formatCurrency(orderDetailComputedTotals.taxableValue || 0)}</strong>
                </div>
                <div className={`po-summary-row${orderDetailHasComputedChanges ? ' po-detail-computed-change' : ''}`}>
                  <span>GST</span>
                  <strong>{formatCurrency(orderDetailComputedTotals.taxAmount || 0)}</strong>
                </div>
                <div className={`po-summary-row grand${orderDetailHasComputedChanges ? ' po-detail-computed-change' : ''}`}>
                  <span>Grand Total</span>
                  <strong>{formatCurrencyRounded(orderDetailComputedTotals.totalAmount || 0)}</strong>
                </div>
              </div>

              <div className="po-history-section">
                <div className="po-history-card">
                  <h4>Status Timeline</h4>
                  {(orderDetail.history || []).length ? (
                    <div className="po-history-list">
                      {orderDetail.history.slice(0, 6).map((entry) => (
                        <div key={`history-${entry.id}`} className="po-history-item">
                          <strong>{String(entry.to_status || '-').replace(/_/g, ' ')}</strong>
                          <span>{formatDateTime(entry.created_at)}</span>
                          <small>{entry.note || '-'}</small>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="po-history-empty">No lifecycle history yet.</p>
                  )}
                </div>
                <div className="po-history-card">
                  <h4>Reminder Log</h4>
                  {(orderDetail.reminders || []).length ? (
                    <div className="po-history-list">
                      {orderDetail.reminders.slice(0, 6).map((entry) => (
                        <div key={`reminder-${entry.id}`} className="po-history-item">
                          <strong>{entry.title || entry.reminder_type || 'Reminder'}</strong>
                          <span>{formatDate(entry.scheduled_for)}</span>
                          <small>{entry.message || '-'}</small>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="po-history-empty">No reminders logged yet.</p>
                  )}
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div className="order-detail-body">
            <PurchaseOrderReviewSheet
              kicker="Purchase Order"
              title={`PO #${orderDetail?.po_number || '-'}`}
              description="Printed-bill style review for this purchase order."
              badgeLabel={`${orderDetailItems.length} item${orderDetailItems.length === 1 ? '' : 's'}`}
              metaItems={[
                { label: 'Supplier:', value: String(orderDetailSupplier?.name || '').trim() || 'Not selected' },
                { label: 'Date:', value: formatDate(orderDetail?.order_date || orderDetail?.created_at) },
                { label: 'Delivery:', value: orderDetail?.expected_delivery ? formatDate(orderDetail.expected_delivery) : 'Skipped' },
              ]}
              rows={reviewRows}
              totals={orderDetailComputedTotals}
              notes={reviewNotes}
            />
          </div>
        )}
        <div className="modal-actions">
          {orderDetailIsEditable ? (
              <button
              type="button"
              className="submit-btn"
              onClick={orderDetailEditMode ? handleOrderDetailSave : openOrderDetailEditMode}
              disabled={orderDetailSaving}
            >
              {orderDetailEditMode ? (orderDetailSaving ? 'Saving...' : 'Save') : 'Edit'}
            </button>
          ) : null}
          {orderDetailIsEditable ? (
            <button
              type="button"
              className="submit-btn"
              onClick={() => handleSendDistributorWhatsApp(orderDetail)}
              disabled={!orderDetail || orderDetailEditMode || orderDetailSaving || sendingWhatsAppOrderId === orderDetail?.id}
            >
              <MessageCircle size={16} />
              {sendingWhatsAppOrderId === orderDetail?.id ? 'Preparing...' : 'Prepare WhatsApp (Manual)'}
            </button>
          ) : null}
          <button
            type="button"
            className="submit-btn print-po-btn"
            onClick={() => handlePrintOrderDetail(orderDetail)}
            disabled={!orderDetail || orderDetailEditMode}
          >
            <Printer size={16} /> Print
          </button>
          <button type="button" className="cancel-btn" onClick={closeOrderDetail}>
            Close
          </button>
        </div>
    </WindowModal>
  );
};

export default OrderDetailModal;
