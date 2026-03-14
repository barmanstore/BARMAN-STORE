import { Plus, X } from 'lucide-react';
import { formatCurrency } from '../../utils/formatters';
import useLockBodyScroll from '../../hooks/useLockBodyScroll';

export function PurchaseOrderFormModal({
  open,
  closeOrderForm,
  poModalRef,
  isMobile,
  poModalSize,
  handlePoModalResizeStart,
  editingOrderId,
  handleOrderSubmit,
  orderFullMode,
  setOrderFullMode,
  loadingDistributorItems,
  handleLoadDistributorItems,
  orderFormData,
  setOrderFormData,
  handleDistributorInputChange,
  distributors,
  orderProductOptions,
  products,
  findProductForItem,
  calculateOrderItem,
  getAllowedPurchaseUnitsForProduct,
  getPurchasePackStep,
  handleOrderProductInputChange,
  handleOrderProductFieldFocus,
  handleOrderItemChange,
  GST_RATE_OPTIONS,
  toNumber,
  handleOrderItemRemove,
  handleOrderItemAdd,
  handleOpenProductForm,
  orderTotals,
  getProductSearchOptionLabel,
  orderSubmitting,
}) {
  useLockBodyScroll(open);

  if (!open) return null;

  const activeDistributors = distributors.filter((distributor) => distributor.status === 'active');
  const canLoadDistributorItems = Boolean(String(orderFormData.distributor_id || '').trim());

  return (
    <div className="modal-overlay" onClick={closeOrderForm}>
      <div
        ref={poModalRef}
        className="modal-content large po-form-modal po-entry-view-modal"
        onClick={(event) => event.stopPropagation()}
        style={isMobile ? undefined : { width: `${Math.min(poModalSize.width, 1080)}px` }}
      >
        <div className="modal-header">
          <div>
            <h2>{editingOrderId ? 'Edit Purchase Order' : 'Create Purchase Order'}</h2>
            <p className="po-entry-modal-subtitle">Quick entry first. Expand only when rate, GST, or discount details are needed.</p>
          </div>
          <div className="po-modal-header-actions">
            <button
              type="button"
              className="po-header-product-btn"
              onClick={() => handleOpenProductForm()}
            >
              <Plus size={16} /> Add New Product
            </button>
            <button className="close-btn" onClick={closeOrderForm}>
              <X size={24} />
            </button>
          </div>
        </div>

        <form onSubmit={handleOrderSubmit} className="po-entry-form po-entry-view-form" noValidate>
          <div className="po-invoice-preview po-entry-preview">
            <div className="po-invoice-header po-entry-preview-header">
              <div>
                <h3>{editingOrderId ? `PO Edit ${editingOrderId ? `#${editingOrderId}` : ''}` : 'New Purchase Order'}</h3>
                <p>{orderFullMode ? 'Full mode is active. Totals, tax, and discounts recalculate live.' : 'Quick mode shows only distributor, delivery, product, qty, and UOM.'}</p>
              </div>
              <div className="po-entry-toolbar">
                <label className="po-entry-full-toggle">
                  <input
                    id="po-entry-full-mode"
                    name="full_mode"
                    type="checkbox"
                    checked={orderFullMode}
                    onChange={(event) => setOrderFullMode(event.target.checked)}
                  />
                  <span>Full Mode</span>
                </label>
                <button
                  type="button"
                  className="po-icon-action-btn"
                  onClick={handleLoadDistributorItems}
                  disabled={!canLoadDistributorItems || loadingDistributorItems}
                  title={canLoadDistributorItems ? 'Load distributor history items' : 'Select distributor first'}
                >
                  {loadingDistributorItems ? '...' : 'Load'}
                </button>
                <button type="button" className="po-icon-action-btn" onClick={handleOrderItemAdd} title="Add row">
                  <Plus size={16} />
                </button>
              </div>
            </div>

            <div className="po-party-grid po-entry-header-grid">
              <div className="po-party-card">
                <h4>Supplier</h4>
                <div className="form-group">
                  <label htmlFor="po-entry-distributor">Distributor *</label>
                  <input
                    id="po-entry-distributor"
                    name="distributor_name"
                    type="text"
                    list="po-distributor-list"
                    value={orderFormData.distributor_name || ''}
                    onChange={(event) => handleDistributorInputChange(event.target.value)}
                    placeholder="Type distributor name"
                    required
                  />
                  <datalist id="po-distributor-list">
                    {activeDistributors.map((distributor) => (
                      <option key={distributor.id} value={distributor.name} />
                    ))}
                  </datalist>
                </div>
                <div className="form-group">
                  <label htmlFor="po-entry-expected-delivery">Expected Delivery</label>
                  <input
                    id="po-entry-expected-delivery"
                    name="expected_delivery"
                    type="date"
                    value={orderFormData.expected_delivery || ''}
                    onChange={(event) => setOrderFormData((prev) => ({ ...prev, expected_delivery: event.target.value }))}
                  />
                </div>
              </div>

              <div className="po-party-card">
                <h4>Entry Controls</h4>
                <div className="po-entry-stats">
                  <div>
                    <span>Rows</span>
                    <strong>{orderFormData.items.length}</strong>
                  </div>
                  <div>
                    <span>Grand Total</span>
                    <strong>{formatCurrency(orderTotals.totalAmount)}</strong>
                  </div>
                </div>
                {orderFullMode ? (
                  <div className="po-entry-advanced-fields">
                    <div className="form-group">
                      <label htmlFor="po-entry-strict-due-date">Strict Due Date</label>
                      <input
                        id="po-entry-strict-due-date"
                        name="strict_due_date"
                        type="date"
                        value={orderFormData.strict_due_date || ''}
                        onChange={(event) => setOrderFormData((prev) => ({ ...prev, strict_due_date: event.target.value }))}
                      />
                    </div>
                    <div className="form-group">
                      <label htmlFor="po-entry-notes">Notes</label>
                      <textarea
                        id="po-entry-notes"
                        name="notes"
                        rows="2"
                        value={orderFormData.notes || ''}
                        onChange={(event) => setOrderFormData((prev) => ({ ...prev, notes: event.target.value }))}
                      />
                    </div>
                    <div className="form-group">
                      <label htmlFor="po-entry-strict-due-note">Strict Due Note</label>
                      <textarea
                        id="po-entry-strict-due-note"
                        name="strict_due_note"
                        rows="2"
                        value={orderFormData.strict_due_note || ''}
                        onChange={(event) => setOrderFormData((prev) => ({ ...prev, strict_due_note: event.target.value }))}
                        placeholder="Optional hard deadline reason"
                      />
                    </div>
                  </div>
                ) : null}
              </div>
            </div>

            <div className="po-entry-table-shell">
              <table className="po-invoice-table po-entry-table">
                <thead>
                  <tr>
                    <th>#</th>
                    <th>Product</th>
                    <th>Qty</th>
                    <th>UOM</th>
                    {orderFullMode ? <th>Rate</th> : null}
                    {orderFullMode ? <th>Discount Type</th> : null}
                    {orderFullMode ? <th>Discount</th> : null}
                    {orderFullMode ? <th>GST %</th> : null}
                    {orderFullMode ? <th>Taxable</th> : null}
                    {orderFullMode ? <th>Tax</th> : null}
                    {orderFullMode ? <th>Total</th> : null}
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {orderFormData.items.map((item, index) => {
                    const selectedProduct = findProductForItem(products, item);
                    const line = calculateOrderItem(item);
                    const uomOptions = getAllowedPurchaseUnitsForProduct(selectedProduct);
                    const packStep = typeof getPurchasePackStep === 'function'
                      ? getPurchasePackStep(selectedProduct, line.uom)
                      : 1;
                    return (
                      <tr key={`po-entry-row-${index}`} className={toNumber(item.quantity) === 0 ? 'po-entry-row-zero' : ''}>
                        <td>{index + 1}</td>
                        <td>
                          <input
                            id={`po-entry-product-${index}`}
                            name={`product_query_${index}`}
                            type="text"
                            list={`po-product-list-${index}`}
                            value={item.product_query || ''}
                            onChange={(event) => handleOrderProductInputChange(index, event.target.value)}
                            onFocus={() => handleOrderProductFieldFocus(index)}
                            placeholder="Type product name / SKU"
                          />
                          <datalist id={`po-product-list-${index}`}>
                            {orderProductOptions.prioritized.map((product) => (
                              <option key={`order-recent-${index}-${product.id}`} value={getProductSearchOptionLabel(product, 'recent')} />
                            ))}
                            {orderProductOptions.all.map((product) => (
                              <option key={`order-all-${index}-${product.id}`} value={getProductSearchOptionLabel(product, 'all')} />
                            ))}
                          </datalist>
                          {item.last_purchase_hint ? (
                            <small className="field-hint">{item.last_purchase_hint}</small>
                          ) : null}
                        </td>
                        <td>
                          <input
                            id={`po-entry-qty-${index}`}
                            name={`quantity_${index}`}
                            type="number"
                            min="1"
                            step={packStep}
                            value={item.quantity}
                            onChange={(event) => handleOrderItemChange(index, 'quantity', toNumber(event.target.value))}
                          />
                        </td>
                        <td>
                          <select
                            id={`po-entry-uom-${index}`}
                            name={`uom_${index}`}
                            value={line.uom}
                            onChange={(event) => handleOrderItemChange(index, 'uom', event.target.value)}
                          >
                            {uomOptions.map((uomOption) => (
                              <option key={`order-item-${index}-uom-${uomOption}`} value={uomOption}>
                                {uomOption}
                              </option>
                            ))}
                          </select>
                        </td>
                        {orderFullMode ? (
                          <td>
                            <input
                              id={`po-entry-rate-${index}`}
                              name={`rate_${index}`}
                              type="number"
                              step="0.01"
                              min="0"
                              value={item.rate ?? item.unit_price}
                              onChange={(event) => handleOrderItemChange(index, 'rate', toNumber(event.target.value))}
                            />
                          </td>
                        ) : null}
                        {orderFullMode ? (
                          <td>
                            <select
                              id={`po-entry-discount-type-${index}`}
                              name={`discount_type_${index}`}
                              value={item.discount_type || 'percent'}
                              onChange={(event) => handleOrderItemChange(index, 'discount_type', event.target.value)}
                            >
                              <option value="percent">%</option>
                              <option value="fixed">Fixed</option>
                            </select>
                          </td>
                        ) : null}
                        {orderFullMode ? (
                          <td>
                            <input
                              id={`po-entry-discount-value-${index}`}
                              name={`discount_value_${index}`}
                              type="number"
                              step="0.01"
                              min="0"
                              value={item.discount_value ?? 0}
                              onChange={(event) => handleOrderItemChange(index, 'discount_value', toNumber(event.target.value))}
                            />
                          </td>
                        ) : null}
                        {orderFullMode ? (
                          <td>
                            <select
                              id={`po-entry-gst-${index}`}
                              name={`gst_rate_${index}`}
                              value={item.gst_rate}
                              onChange={(event) => handleOrderItemChange(index, 'gst_rate', toNumber(event.target.value))}
                            >
                              {GST_RATE_OPTIONS.map((rate) => (
                                <option key={`gst-${rate}`} value={rate}>
                                  {rate}%
                                </option>
                              ))}
                            </select>
                          </td>
                        ) : null}
                        {orderFullMode ? <td>{formatCurrency(line.taxableValue)}</td> : null}
                        {orderFullMode ? <td>{formatCurrency(line.taxAmount)}</td> : null}
                        {orderFullMode ? <td>{formatCurrency(line.totalAmount)}</td> : null}
                        <td>
                          <button
                            type="button"
                            className="remove-item-btn po-remove-btn"
                            onClick={() => handleOrderItemRemove(index)}
                            aria-label={`Remove row ${index + 1}`}
                          >
                            <X size={16} />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          <div className="form-section po-form-section po-form-footer">
            <div className="order-summary">
              {orderFullMode ? (
                <>
                  <div className="summary-row">
                    <span>Total Taxable Value</span>
                    <strong>{formatCurrency(orderTotals.taxableValue)}</strong>
                  </div>
                  <div className="summary-row">
                    <span>Total Tax</span>
                    <strong>{formatCurrency(orderTotals.taxAmount)}</strong>
                  </div>
                </>
              ) : null}
              <div className="summary-row grand-total">
                <span>Total Amount</span>
                <strong>{formatCurrency(orderTotals.totalAmount)}</strong>
              </div>
            </div>
            <div className="modal-actions">
              <button type="button" className="cancel-btn" onClick={closeOrderForm}>
                Cancel
              </button>
              <button type="submit" className="submit-btn" disabled={orderSubmitting}>
                {orderSubmitting ? 'Saving...' : (editingOrderId ? 'Update Order' : 'Create Order')}
              </button>
            </div>
          </div>
        </form>

        {!isMobile && (
          <button
            type="button"
            className="po-modal-resize-handle"
            onMouseDown={handlePoModalResizeStart}
            aria-label="Resize purchase order form"
            title="Drag to resize"
          />
        )}
      </div>
    </div>
  );
}
