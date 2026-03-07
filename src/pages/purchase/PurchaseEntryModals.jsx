import { Plus, X } from 'lucide-react';
import { formatCurrency } from '../../utils/formatters';

export function QuickPurchaseOrderModal({
  open,
  closeQuickOrderForm,
  poModalRef,
  isMobile,
  poModalSize,
  quickOrderFormData,
  setQuickOrderFormData,
  handleQuickOrderSubmit,
  handleQuickDistributorInputChange,
  distributors,
  handleQuickOrderItemAdd,
  quickOrderProductOptions,
  products,
  findProductForItem,
  getAllowedPurchaseUnitsForProduct,
  resolvePurchaseUnitForProduct,
  handleQuickOrderProductInputChange,
  handleQuickProductFieldFocus,
  handleQuickOrderItemChange,
  handleQuickOrderItemRemove,
  handleOpenProductForm,
  getProductSearchOptionLabel,
  toNumber,
  handlePoModalResizeStart,
  quickOrderSubmitting,
}) {
  if (!open) return null;

  return (
    <div className="modal-overlay" onClick={closeQuickOrderForm}>
      <div
        ref={poModalRef}
        className="modal-content large po-form-modal"
        onClick={(event) => event.stopPropagation()}
        style={isMobile ? undefined : { width: `${poModalSize.width}px`, height: `${poModalSize.height}px` }}
      >
        <div className="modal-header">
          <h2>Quick Purchase Entry</h2>
          <div className="po-modal-header-actions">
            <button
              type="button"
              className="po-header-product-btn"
              onClick={() => handleOpenProductForm('quick')}
            >
              <Plus size={16} /> Add New Product
            </button>
            <button className="close-btn" onClick={closeQuickOrderForm}>
              <X size={24} />
            </button>
          </div>
        </div>
        <form onSubmit={handleQuickOrderSubmit} className="po-entry-form">
          <div className="form-section po-form-section po-form-header">
            <div className="form-row po-info-row">
              <div className="form-group">
                <label>Distributor *</label>
                <input
                  type="text"
                  list="po-distributor-list-quick"
                  value={quickOrderFormData.distributor_name || ''}
                  onChange={(event) => handleQuickDistributorInputChange(event.target.value)}
                  placeholder="Type distributor name"
                  required
                />
                <datalist id="po-distributor-list-quick">
                  {distributors.filter((distributor) => distributor.status === 'active').map((distributor) => (
                    <option key={distributor.id} value={distributor.name} />
                  ))}
                </datalist>
              </div>
              <div className="form-group">
                <label>Date</label>
                <input
                  type="date"
                  value={quickOrderFormData.order_date}
                  onChange={(event) => setQuickOrderFormData((prev) => ({ ...prev, order_date: event.target.value }))}
                />
              </div>
            </div>
            <div className="form-group">
              <label>Notes</label>
              <textarea
                value={quickOrderFormData.notes}
                onChange={(event) => setQuickOrderFormData((prev) => ({ ...prev, notes: event.target.value }))}
                rows="2"
                placeholder="Optional short note"
              />
            </div>
          </div>

          <div className="form-section po-form-section">
            <div className="section-header">
              <h3>Items (Product + Qty)</h3>
            </div>
            <div className="quick-entry-table">
              <table>
                <thead>
                  <tr>
                    <th>Product</th>
                    <th>Qty</th>
                    <th>UOM</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {quickOrderFormData.items.length === 0 ? (
                    <tr>
                      <td colSpan="4" className="empty-state">No rows added</td>
                    </tr>
                  ) : quickOrderFormData.items.map((item, index) => {
                    const selectedProduct = findProductForItem(products, item);
                    const uomOptions = getAllowedPurchaseUnitsForProduct(selectedProduct);
                    const selectedUom = resolvePurchaseUnitForProduct(
                      selectedProduct,
                      item.uom || selectedProduct?.base_unit || selectedProduct?.uom || 'pcs'
                    );
                    return (
                      <tr key={index}>
                        <td>
                          <input
                            type="text"
                            list={`quick-po-product-list-${index}`}
                            value={item.product_query || ''}
                            onChange={(event) => handleQuickOrderProductInputChange(index, event.target.value)}
                            onFocus={() => handleQuickProductFieldFocus(index)}
                            placeholder="Type product name / SKU"
                          />
                          <datalist id={`quick-po-product-list-${index}`}>
                            {quickOrderProductOptions.prioritized.map((product) => (
                              <option key={`quick-recent-${index}-${product.id}`} value={getProductSearchOptionLabel(product, 'recent')} />
                            ))}
                            {quickOrderProductOptions.all.map((product) => (
                              <option key={`quick-all-${index}-${product.id}`} value={getProductSearchOptionLabel(product, 'all')} />
                            ))}
                          </datalist>
                        </td>
                        <td>
                          <input
                            type="number"
                            min="1"
                            value={item.quantity}
                            onChange={(event) => handleQuickOrderItemChange(index, 'quantity', toNumber(event.target.value))}
                          />
                        </td>
                        <td>
                          <select
                            value={selectedUom}
                            onChange={(event) => handleQuickOrderItemChange(index, 'uom', event.target.value)}
                          >
                            {uomOptions.map((uomOption) => (
                              <option key={`quick-item-${index}-uom-${uomOption}`} value={uomOption}>
                                {uomOption}
                              </option>
                            ))}
                          </select>
                        </td>
                        <td>
                          <button type="button" className="remove-item-btn" onClick={() => handleQuickOrderItemRemove(index)}>
                            <X size={16} />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <div className="po-products-actions">
              <button type="button" className="add-item-btn" onClick={handleQuickOrderItemAdd}>
                <Plus size={16} /> Add Row
              </button>
            </div>
          </div>

          <div className="modal-actions">
            <button type="button" className="cancel-btn" onClick={closeQuickOrderForm}>
              Cancel
            </button>
            <button type="submit" className="submit-btn" disabled={quickOrderSubmitting}>
              {quickOrderSubmitting ? 'Saving...' : 'Save Quick Draft'}
            </button>
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

export function PurchaseOrderFormModal({
  open,
  closeOrderForm,
  editingOrderId,
  handleOrderSubmit,
  orderEntryMode,
  setOrderEntryMode,
  orderFormData,
  setOrderFormData,
  handleDistributorInputChange,
  distributors,
  orderProductOptions,
  products,
  findProductForItem,
  calculateOrderItem,
  getAllowedPurchaseUnitsForProduct,
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
  if (!open) return null;

  return (
    <div className="modal-overlay" onClick={closeOrderForm}>
      <div className="modal-content large po-form-modal" onClick={(event) => event.stopPropagation()}>
        <div className="modal-header">
          <h2>{editingOrderId ? 'Edit Purchase Order' : 'Create Purchase Order'}</h2>
          <div className="po-modal-header-actions">
            <button
              type="button"
              className="po-header-product-btn"
              onClick={() => handleOpenProductForm('detailed')}
            >
              <Plus size={16} /> Add New Product
            </button>
            <button className="close-btn" onClick={closeOrderForm}>
              <X size={24} />
            </button>
          </div>
        </div>
        <form onSubmit={handleOrderSubmit} className={`po-entry-form ${orderEntryMode === 'quick' ? 'quick-mode' : ''}`}>
          <div className="po-entry-mode-tabs" role="tablist" aria-label="Purchase entry mode">
            <button
              type="button"
              className={orderEntryMode === 'detailed' ? 'active' : ''}
              onClick={() => setOrderEntryMode('detailed')}
              role="tab"
              aria-selected={orderEntryMode === 'detailed'}
            >
              Detailed Entry
            </button>
            <button
              type="button"
              className={orderEntryMode === 'quick' ? 'active' : ''}
              onClick={() => setOrderEntryMode('quick')}
              role="tab"
              aria-selected={orderEntryMode === 'quick'}
            >
              Quick Entry
            </button>
          </div>
          <div className="form-section po-form-section po-form-header">
            <div className="form-row po-info-row">
              <div className="form-group">
                <label>Distributor *</label>
                <input
                  type="text"
                  list="po-distributor-list"
                  value={orderFormData.distributor_name || ''}
                  onChange={(event) => handleDistributorInputChange(event.target.value)}
                  placeholder="Type distributor name"
                  required
                />
                <datalist id="po-distributor-list">
                  {distributors.filter((distributor) => distributor.status === 'active').map((distributor) => (
                    <option key={distributor.id} value={distributor.name} />
                  ))}
                </datalist>
              </div>
              <div className="form-group">
                <label>Expected Delivery</label>
                <input
                  type="date"
                  value={orderFormData.expected_delivery}
                  onChange={(event) => setOrderFormData((prev) => ({ ...prev, expected_delivery: event.target.value }))}
                />
              </div>
              <div className="form-group">
                <label>Strict Due Date</label>
                <input
                  type="date"
                  value={orderFormData.strict_due_date || ''}
                  onChange={(event) => setOrderFormData((prev) => ({ ...prev, strict_due_date: event.target.value }))}
                />
              </div>
            </div>
            <div className="form-row po-info-row">
              <div className="form-group po-note-group">
                <label>Notes</label>
                <textarea
                  value={orderFormData.notes}
                  onChange={(event) => setOrderFormData((prev) => ({ ...prev, notes: event.target.value }))}
                  rows="2"
                />
              </div>
              <div className="form-group po-note-group">
                <label>Strict Due Note</label>
                <textarea
                  value={orderFormData.strict_due_note || ''}
                  onChange={(event) => setOrderFormData((prev) => ({ ...prev, strict_due_note: event.target.value }))}
                  rows="2"
                  placeholder="Optional hard deadline reason"
                />
              </div>
            </div>
          </div>

          <div className="form-section po-form-section po-products-section">
            <div className="section-header">
              <h3>Order Items</h3>
            </div>
            <div className="items-list">
              {orderFormData.items.map((item, index) => {
                const selectedProduct = findProductForItem(products, item);
                const line = calculateOrderItem(item);
                const uomOptions = getAllowedPurchaseUnitsForProduct(selectedProduct);
                const netCostPerItem = line.quantity > 0 ? (line.totalAmount / line.quantity) : 0;
                return (
                  <div key={index} className="item-row order-item-row po-item-row">
                    <div className="po-item-main">
                      <div className="item-field product">
                        <label>Product</label>
                        <input
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
                        {item.last_purchase_hint && (
                          <small className="field-hint">{item.last_purchase_hint}</small>
                        )}
                      </div>
                      <div className="item-field qty">
                        <label>Qty</label>
                        <input
                          type="number"
                          min="1"
                          value={item.quantity}
                          onChange={(event) => handleOrderItemChange(index, 'quantity', toNumber(event.target.value))}
                        />
                      </div>
                      <div className="item-field uom">
                        <label>UOM</label>
                        <select
                          value={line.uom}
                          onChange={(event) => handleOrderItemChange(index, 'uom', event.target.value)}
                        >
                          {uomOptions.map((uomOption) => (
                            <option key={`order-item-${index}-uom-${uomOption}`} value={uomOption}>
                              {uomOption}
                            </option>
                          ))}
                        </select>
                      </div>
                      {orderEntryMode !== 'quick' && (
                        <>
                          <div className="item-field price">
                            <label>{`Rate (per ${line.baseUnit})`}</label>
                            <input
                              type="number"
                              step="0.01"
                              min="0"
                              value={item.rate ?? item.unit_price}
                              onChange={(event) => handleOrderItemChange(index, 'rate', toNumber(event.target.value))}
                            />
                          </div>
                          <div className="item-field gst">
                            <label>GST %</label>
                            <select
                              value={item.gst_rate}
                              onChange={(event) => handleOrderItemChange(index, 'gst_rate', toNumber(event.target.value))}
                            >
                              {GST_RATE_OPTIONS.map((rate) => (
                                <option key={`gst-${rate}`} value={rate}>
                                  {rate}%
                                </option>
                              ))}
                            </select>
                          </div>
                        </>
                      )}
                    </div>

                    {orderEntryMode !== 'quick' && (
                      <div className="po-item-discount">
                        <div className="item-field discount-type">
                          <label>Discount Type</label>
                          <select
                            value={item.discount_type || 'percent'}
                            onChange={(event) => handleOrderItemChange(index, 'discount_type', event.target.value)}
                          >
                            <option value="percent">%</option>
                            <option value="fixed">Fixed</option>
                          </select>
                        </div>
                        <div className="item-field discount-value">
                          <label>Discount</label>
                          <input
                            type="number"
                            step="0.01"
                            min="0"
                            value={item.discount_value ?? 0}
                            onChange={(event) => handleOrderItemChange(index, 'discount_value', toNumber(event.target.value))}
                          />
                        </div>
                      </div>
                    )}

                    <div className="po-item-amounts">
                      <div className="item-field cost-per-item">
                        <label>Cost Per Item (After Discount + Tax)</label>
                        <span>{formatCurrency(netCostPerItem)}</span>
                      </div>
                      <div className="item-field taxable">
                        <label>Taxable Value</label>
                        <span>{formatCurrency(line.taxableValue)}</span>
                      </div>
                      <div className="item-field tax">
                        <label>Tax</label>
                        <span>{formatCurrency(line.taxAmount)}</span>
                      </div>
                      <div className="item-field total">
                        <label>Total Amount</label>
                        <span>{formatCurrency(line.totalAmount)}</span>
                      </div>
                    </div>

                    <button type="button" className="remove-item-btn po-remove-btn" onClick={() => handleOrderItemRemove(index)}>
                      <X size={16} />
                    </button>
                  </div>
                );
              })}
              {orderFormData.items.length === 0 && (
                <p className="no-items">No items added. Use Add Item below or Add New Product at the top.</p>
              )}
            </div>
            <div className="po-products-actions">
              <button type="button" className="add-item-btn" onClick={handleOrderItemAdd}>
                <Plus size={16} /> Add Item
              </button>
            </div>
          </div>

          <div className="form-section po-form-section po-form-footer">
            <div className="order-summary">
              <div className="summary-row">
                <span>Total Taxable Value</span>
                <strong>{formatCurrency(orderTotals.taxableValue)}</strong>
              </div>
              <div className="summary-row">
                <span>Total Tax</span>
                <strong>{formatCurrency(orderTotals.taxAmount)}</strong>
              </div>
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
      </div>
    </div>
  );
}
