import { Plus, Printer, X } from 'lucide-react';
import WindowModal from '../../../../../shared/components/window/WindowModal';

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
  getOrderDetailItemOriginalLabel,
  handleOrderDetailItemChange,
  getPurchasePackStep,
  getAllowedPurchaseUnitsForProduct,
  handleOrderDetailItemRemove,
  handleOrderDetailItemAdd,
  orderDetailHasComputedChanges,
  orderDetailComputedTotals,
  orderDetailIsEditable,
  orderDetailSaving,
  handleOrderDetailSave,
  openOrderDetailEditMode,
  handlePrintOrderDetail,
  GST_RATE_OPTIONS,
  toNumber,
  formatCurrency,
}) => {
  if (!showOrderDetail) return null;

  return (
    <WindowModal
      open
      title={`Purchase Order: ${orderDetail?.po_number || '-'}`}
      onClose={closeOrderDetail}
      dismissible={!orderDetailSaving}
      themeClassName="purchase-management"
      dialogClassName="modal-content large po-detail-modal"
      headerClassName="modal-header"
      closeButtonClassName="close-btn"
      initialSize={{ width: 1180, height: 820 }}
      minWidth={760}
      minHeight={520}
    >
        {orderDetailLoading || !orderDetail ? (
          <div className="order-detail-body">
            <div className="loading">Loading purchase order details...</div>
          </div>
        ) : (
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
                <thead>
                  <tr>
                    <th>#</th>
                    <th>Product</th>
                    <th>Qty</th>
                    <th>UOM</th>
                    <th>Rate</th>
                    <th>Discount Type</th>
                    <th>Discount</th>
                    <th>GST %</th>
                    <th>Taxable</th>
                    <th>Tax</th>
                    <th>Total</th>
                    {orderDetailEditMode ? <th /> : null}
                  </tr>
                </thead>
                <tbody>
                  {orderDetailItems.map((item, idx) => {
                    const line = getItemFinancials(item);
                    const originalItem = getOrderDetailOriginalItem(item, idx);
                    const originalLine = originalItem ? getItemFinancials(originalItem) : null;
                    const rowChanged = orderDetailEditMode && hasOrderDetailItemChanged(item, idx);
                    const productChanged = orderDetailEditMode && getOrderDetailItemFieldChanged(item, idx, 'product_id');
                    const qtyChanged = orderDetailEditMode && getOrderDetailItemFieldChanged(item, idx, 'quantity');
                    const uomChanged = orderDetailEditMode && getOrderDetailItemFieldChanged(item, idx, 'uom');
                    const rateChanged = orderDetailEditMode && getOrderDetailItemFieldChanged(item, idx, 'rate');
                    const discountTypeChanged = orderDetailEditMode && getOrderDetailItemFieldChanged(item, idx, 'discount_type');
                    const discountValueChanged = orderDetailEditMode && getOrderDetailItemFieldChanged(item, idx, 'discount_value');
                    const gstChanged = orderDetailEditMode && getOrderDetailItemFieldChanged(item, idx, 'gst_rate');
                    const selectedProduct = products.find((product) => String(product?.id || '') === String(item.product_id || '')) || null;
                    const uomOptions = getAllowedPurchaseUnitsForProduct(selectedProduct);
                    return (
                      <tr key={item.id || idx} className={rowChanged ? 'po-detail-row-edited' : ''}>
                        <td>{idx + 1}</td>
                        <td className={productChanged ? 'po-detail-field-changed' : ''}>
                          {orderDetailEditMode ? (
                            <>
                              <input
                                type="text"
                                id={`po-detail-product-${idx}-${item.id}`}
                                name="product_query"
                                list={`po-detail-product-list-${idx}`}
                                value={item.product_query || ''}
                                onChange={(event) => handleOrderDetailProductInputChange(idx, event.target.value)}
                                placeholder="Type product name / SKU"
                              />
                              <datalist id={`po-detail-product-list-${idx}`}>
                                {products.map((product) => (
                                  <option key={`po-detail-product-${idx}-${product.id}`} value={getProductSearchLabel(product)} />
                                ))}
                              </datalist>
                              {productChanged ? (
                                <small className="po-detail-change-note">Was {getOrderDetailItemOriginalLabel(item, idx, 'product_id')}</small>
                              ) : null}
                            </>
                          ) : item.product_name}
                        </td>
                        <td className={qtyChanged ? 'po-detail-field-changed' : ''}>
                          {orderDetailEditMode ? (
                            <>
                              <input
                                type="number"
                                id={`po-detail-qty-${idx}-${item.id}`}
                                name="quantity"
                                min="1"
                                step={getPurchasePackStep(selectedProduct, item.uom || line.uom)}
                                value={item.quantity}
                                onChange={(event) => handleOrderDetailItemChange(idx, 'quantity', event.target.value)}
                              />
                              {qtyChanged ? (
                                <small className="po-detail-change-note">Was {getOrderDetailItemOriginalLabel(item, idx, 'quantity')}</small>
                              ) : null}
                            </>
                          ) : line.quantity}
                        </td>
                        <td className={uomChanged ? 'po-detail-field-changed' : ''}>
                          {orderDetailEditMode ? (
                            <>
                              <select
                                id={`po-detail-uom-${idx}-${item.id}`}
                                name="uom"
                                value={line.uom}
                                onChange={(event) => handleOrderDetailItemChange(idx, 'uom', event.target.value)}
                              >
                                {uomOptions.map((uomOption) => (
                                  <option key={`detail-item-${idx}-uom-${uomOption}`} value={uomOption}>
                                    {uomOption}
                                  </option>
                                ))}
                              </select>
                              {uomChanged ? (
                                <small className="po-detail-change-note">Was {getOrderDetailItemOriginalLabel(item, idx, 'uom')}</small>
                              ) : null}
                            </>
                          ) : (item.uom || '-')}
                        </td>
                        <td className={rateChanged ? 'po-detail-field-changed' : ''}>
                          {orderDetailEditMode ? (
                            <>
                              <input
                                type="number"
                                id={`po-detail-rate-${idx}-${item.id}`}
                                name="rate"
                                step="0.01"
                                min="0"
                                value={item.rate}
                                onChange={(event) => handleOrderDetailItemChange(idx, 'rate', event.target.value)}
                              />
                              {rateChanged ? (
                                <small className="po-detail-change-note">Was {getOrderDetailItemOriginalLabel(item, idx, 'rate')}</small>
                              ) : null}
                            </>
                          ) : formatCurrency(line.rate)}
                        </td>
                        <td className={discountTypeChanged ? 'po-detail-field-changed' : ''}>
                          {orderDetailEditMode ? (
                            <>
                              <select
                                id={`po-detail-disc-type-${idx}-${item.id}`}
                                name="discount_type"
                                value={item.discount_type || 'percent'}
                                onChange={(event) => handleOrderDetailItemChange(idx, 'discount_type', event.target.value)}
                              >
                                <option value="percent">%</option>
                                <option value="fixed">Fixed</option>
                              </select>
                              {discountTypeChanged ? (
                                <small className="po-detail-change-note">Was {getOrderDetailItemOriginalLabel(item, idx, 'discount_type')}</small>
                              ) : null}
                            </>
                          ) : (item.discount_type === 'fixed' ? 'Fixed' : '%')}
                        </td>
                        <td className={discountValueChanged ? 'po-detail-field-changed' : ''}>
                          {orderDetailEditMode ? (
                            <>
                              <input
                                type="number"
                                id={`po-detail-disc-value-${idx}-${item.id}`}
                                name="discount_value"
                                step="0.01"
                                min="0"
                                value={item.discount_value ?? 0}
                                onChange={(event) => handleOrderDetailItemChange(idx, 'discount_value', event.target.value)}
                              />
                              {discountValueChanged ? (
                                <small className="po-detail-change-note">Was {getOrderDetailItemOriginalLabel(item, idx, 'discount_value')}</small>
                              ) : null}
                            </>
                          ) : String(toNumber(item.discount_value || 0))}
                        </td>
                        <td className={gstChanged ? 'po-detail-field-changed' : ''}>
                          {orderDetailEditMode ? (
                            <>
                              <select
                                id={`po-detail-gst-${idx}-${item.id}`}
                                name="gst_rate"
                                value={item.gst_rate}
                                onChange={(event) => handleOrderDetailItemChange(idx, 'gst_rate', event.target.value)}
                              >
                                {GST_RATE_OPTIONS.map((rate) => (
                                  <option key={`detail-item-${idx}-gst-${rate}`} value={rate}>
                                    {rate}%
                                  </option>
                                ))}
                              </select>
                              {gstChanged ? (
                                <small className="po-detail-change-note">Was {getOrderDetailItemOriginalLabel(item, idx, 'gst_rate')}</small>
                              ) : null}
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
                            <button
                              type="button"
                              className="remove-item-btn"
                              onClick={() => handleOrderDetailItemRemove(idx)}
                              aria-label={`Remove item ${idx + 1}`}
                            >
                              <X size={14} />
                            </button>
                          </td>
                        ) : null}
                      </tr>
                    );
                  })}
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
                  <strong>{formatCurrency(orderDetailComputedTotals.totalAmount || 0)}</strong>
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
