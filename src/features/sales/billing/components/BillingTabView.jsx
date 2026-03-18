import React, { useEffect, useMemo, useState } from 'react';
import { CreditCard, Plus, Search, ShoppingCart, Trash2, UserPlus } from 'lucide-react';
import { formatCurrency } from '../../../../shared/utils/formatters';
import CalculatedAmountInput from '../../../../shared/components/CalculatedAmountInput';
import UserEditModal from '../../../../shared/components/UserEditModal';

const BillingTabView = ({
  isMobile,
  isOrderLinked,
  isSubmitting,
  handleAddCustomer,
  prefillSummary,
  error,
  loading,
  customer,
  customersList,
  handleCustomerChange,
  items,
  productsList,
  getProductOptionLabel,
  getProductForLine,
  getAllowedUnitsForProduct,
  resolveLineUnitForProduct,
  handleProductChange,
  productSearchInputRef,
  productSearchQuery,
  setProductSearchQuery,
  productSearchResults,
  productSearchLoading,
  activeProductSuggestionIndex,
  handleQuickAddKeyDown,
  handleQuickAddSelect,
  removeItem,
  addItem,
  subtotalAmount,
  totalDiscount,
  totalBill,
  paidClamped,
  paymentIntent,
  selectedPaymentMethod,
  effectivePaymentMethod,
  setSelectedPaymentMethod,
  handleSelectFullPayment,
  handleSelectPartialPayment,
  handleSelectFullCredit,
  fulfillmentMode,
  setFulfillmentMode,
  paidAmount,
  setPaidAmount,
  creditAmount,
  activeLineItemsCount,
  paymentStatusLabel,
  onClear,
  handleCreateBill,
  lastShareText,
  lastShareNumber,
  handleCopyShare,
  handleSendWhatsApp,
  showCustomerCreateModal,
  handleCustomerModalClose,
  handleCustomerModalSave,
  customerCreateName,
}) => {
  const [mobileView, setMobileView] = useState('search');

  useEffect(() => {
    if (!isMobile) {
      setMobileView('search');
    }
  }, [isMobile]);

  const recentProductResults = useMemo(() => {
    if (String(productSearchQuery || '').trim()) {
      return productSearchResults.slice(0, 8);
    }
    return isMobile ? productsList.slice(0, 6) : [];
  }, [isMobile, productSearchQuery, productSearchResults, productsList]);

  const handleMobilePrimaryAction = () => {
    if (mobileView === 'checkout') {
      handleCreateBill();
      return;
    }
    setMobileView('checkout');
  };

  return (
  <div className={`billing-content${isMobile ? ' billing-content-mobile' : ''}`}>
    <div className="billing-header">
      <div>
        <h1>Billing Invoice</h1>
        <p className="billing-header-copy">
          {isMobile ? 'Mobile POS mode with search, cart, and checkout steps.' : 'POS-style quick billing with live totals and fast add.'}
        </p>
      </div>
      <div className="billing-header-actions">
        <div className="billing-header-chip">
          <span>Lines</span>
          <strong>{activeLineItemsCount}</strong>
        </div>
        <div className="billing-header-chip">
          <span>Total</span>
          <strong>{formatCurrency(totalBill)}</strong>
        </div>
        {!isOrderLinked ? (
          <button
            type="button"
            className="add-customer-btn"
            onClick={handleAddCustomer}
            disabled={isSubmitting}
            aria-label="Add customer"
          >
            <UserPlus size={16} />
            Add Customer
          </button>
        ) : null}
      </div>
    </div>
    {prefillSummary ? <div className="billing-prefill-note">{prefillSummary}</div> : null}
    {isOrderLinked ? (
      <div className="billing-prefill-note">
        Linked order mode: customer details are locked. You can edit bill items, quantities, prices, and add/remove rows.
      </div>
    ) : null}

    {error && (
      <div className="error-message" role="alert">
        {error}
      </div>
    )}

    {loading && <div className="loading-indicator">Loading...</div>}

    {isMobile ? (
      <div className="billing-mobile-stepper" role="tablist" aria-label="Billing steps">
        <button
          type="button"
          className={`billing-mobile-step${mobileView === 'search' ? ' active' : ''}`}
          onClick={() => setMobileView('search')}
        >
          <Search size={16} />
          Search
        </button>
        <button
          type="button"
          className={`billing-mobile-step${mobileView === 'cart' ? ' active' : ''}`}
          onClick={() => setMobileView('cart')}
        >
          <ShoppingCart size={16} />
          Cart
        </button>
        <button
          type="button"
          className={`billing-mobile-step${mobileView === 'checkout' ? ' active' : ''}`}
          onClick={() => setMobileView('checkout')}
        >
          <CreditCard size={16} />
          Checkout
        </button>
      </div>
    ) : null}

    <div className={`billing-pos-layout${isMobile ? ' billing-pos-layout-mobile' : ''}`}>
      <section className={`billing-pos-left${isMobile ? ` billing-mobile-panel ${mobileView === 'search' ? 'active' : ''}` : ''}`}>
        <div className="billing-pos-card">
          <div className="billing-card-header">
            <div>
              <h2>Customer</h2>
              <p>Select the customer before checkout.</p>
            </div>
          </div>
          <div className="form-row">
            <label className="form-label" htmlFor="customerName">Customer Name {isOrderLinked ? '' : '*'}</label>
            <input
              id="customerName"
              list="customer-list"
              className="form-input"
              value={customer.name}
              onChange={handleCustomerChange}
              placeholder="Type or select name..."
              aria-label="Customer name"
              aria-autocomplete="list"
              autoComplete="name"
              required={!isOrderLinked}
              readOnly={isOrderLinked}
            />
            <datalist id="customer-list">
              {customersList.map((c) => (
                <option key={c.id} value={c.name} />
              ))}
            </datalist>
          </div>
          <div className="billing-customer-meta">
            <div>
              <span>Phone</span>
              <strong>{customer.phone || '-'}</strong>
            </div>
            <div>
              <span>Email</span>
              <strong>{customer.email || '-'}</strong>
            </div>
          </div>
        </div>

        <div className="billing-pos-card billing-pos-search-card">
          <div className="billing-card-header">
            <div>
              <h2>{isMobile ? 'Search & Add' : 'Quick Add'}</h2>
              <p>{isMobile ? 'Tap large product cards or press Enter to add instantly.' : 'Search by name, SKU, or barcode. Press Enter to add.'}</p>
            </div>
          </div>
          <input
            ref={productSearchInputRef}
            id="billing-quick-add"
            type="text"
            className="form-input billing-search-input"
            value={productSearchQuery}
            onChange={(event) => setProductSearchQuery(event.target.value)}
            onKeyDown={handleQuickAddKeyDown}
            placeholder="Search product, SKU, barcode..."
            autoComplete="off"
          />
          <div className="billing-search-help">
            <span>Enter</span>
            adds highlighted product
          </div>
          {productSearchLoading ? <div className="billing-search-loading">Searching products...</div> : null}
          {!String(productSearchQuery || '').trim() && isMobile && recentProductResults.length > 0 ? (
            <div className="billing-mobile-recent-label">Recent products</div>
          ) : null}
          {String(productSearchQuery || '').trim() && !productSearchLoading && recentProductResults.length === 0 ? (
            <div className="billing-search-empty">No products matched this search.</div>
          ) : null}
          {recentProductResults.length > 0 ? (
            <div className={`billing-search-results${isMobile ? ' mobile' : ''}`} role="listbox" aria-label="Quick add product results">
              {recentProductResults.map((product, index) => (
                <button
                  key={product.id}
                  type="button"
                  className={`billing-search-result${String(productSearchQuery || '').trim() && index === activeProductSuggestionIndex ? ' active' : ''}`}
                  onClick={() => handleQuickAddSelect(product)}
                >
                  <span className="billing-search-result-name">{product.name}</span>
                  <span className="billing-search-result-meta">{getProductOptionLabel(product)}</span>
                </button>
              ))}
            </div>
          ) : null}
        </div>
      </section>

      <section className={`billing-pos-center${isMobile ? ` billing-mobile-panel ${mobileView === 'cart' ? 'active' : ''}` : ''}`}>
        <div className="billing-pos-card billing-lines-card">
          <div className="billing-card-header">
            <div>
              <h2>{isMobile ? 'Cart' : 'Bill Lines'}</h2>
              <p>{isMobile ? 'Edit line items with larger touch targets.' : 'Edit quantities, units, discounts, and final line amounts.'}</p>
            </div>
            <button onClick={addItem} className="add-btn" aria-label="Add new product">
              <Plus size={18} /> {isMobile ? 'Add Manual Row' : 'Add Row'}
            </button>
          </div>

          <div className="table-container">
            <table className="billing-table">
              <thead>
                <tr>
                  <th>Product Name</th>
                  <th className="w-24">Price</th>
                  <th className="w-20">Qty</th>
                  <th className="w-24">Unit</th>
                  <th className="w-28">Disc</th>
                  <th className="w-32">Amount</th>
                  <th className="w-12"></th>
                </tr>
              </thead>
              <tbody>
                {items.map((item, index) => {
                  const rowProduct = getProductForLine(item);
                  const unitOptions = rowProduct ? getAllowedUnitsForProduct(rowProduct) : [];
                  const selectedUnit = rowProduct
                    ? resolveLineUnitForProduct(rowProduct, item.unit)
                    : (String(item.unit || '').trim() || 'pcs');
                  return (
                    <tr key={item.id}>
                      <td data-label="Product Name">
                        <input
                          id={`product-name-${item.id}`}
                          name="product_name"
                          list="product-list"
                          value={item.name}
                          onChange={(e) => handleProductChange(index, 'name', e.target.value)}
                          aria-label="Product name"
                          placeholder="Type or select product..."
                          autoComplete="off"
                        />
                        <datalist id="product-list">
                          {productsList.map((p) => (
                            <option key={p.id} value={getProductOptionLabel(p)} />
                          ))}
                        </datalist>
                      </td>
                      <td data-label="Price">
                        <input
                          type="number"
                          id={`product-price-${item.id}`}
                          name="price"
                          value={item.price}
                          onChange={(e) => handleProductChange(index, 'price', e.target.value)}
                          aria-label="Price per unit"
                          min="0"
                          step="0.01"
                        />
                      </td>
                      <td data-label="Quantity">
                        <input
                          type="number"
                          id={`product-qty-${item.id}`}
                          name="qty"
                          value={item.qty}
                          onChange={(e) => handleProductChange(index, 'qty', e.target.value)}
                          aria-label="Quantity"
                          min="1"
                        />
                      </td>
                      <td data-label="Unit">
                        {rowProduct ? (
                          <select
                            id={`product-unit-${item.id}`}
                            name="unit"
                            value={selectedUnit}
                            onChange={(e) => handleProductChange(index, 'unit', e.target.value)}
                            aria-label="Unit of measurement"
                          >
                            {unitOptions.map((unitOption) => (
                              <option key={`${item.id}-unit-${unitOption}`} value={unitOption}>
                                {unitOption}
                              </option>
                            ))}
                          </select>
                        ) : (
                          <input
                            type="text"
                            id={`product-unit-${item.id}`}
                            name="unit"
                            value={item.unit}
                            onChange={(e) => handleProductChange(index, 'unit', e.target.value)}
                            aria-label="Unit of measurement"
                            placeholder="pcs, kg, etc."
                          />
                        )}
                      </td>
                      <td data-label="Discount">
                        <div className="discount-field">
                          <input
                            type="number"
                            id={`product-disc-${item.id}`}
                            name="disc"
                            value={item.disc}
                            onChange={(e) => handleProductChange(index, 'disc', e.target.value)}
                            aria-label="Discount value"
                            min="0"
                            step={item.discType === 'percentage' ? '1' : '0.01'}
                            className="disc-input"
                          />
                          <select
                            id={`product-disc-type-${item.id}`}
                            name="discType"
                            value={item.discType}
                            onChange={(e) => handleProductChange(index, 'discType', e.target.value)}
                            aria-label="Discount type"
                            className="disc-type-select"
                          >
                            <option value="fixed">Rs</option>
                            <option value="percentage">%</option>
                          </select>
                        </div>
                      </td>
                      <td className="amount-cell" data-label="Amount">{formatCurrency(item.amount)}</td>
                      <td className="text-center" data-label="Action">
                        <button
                          onClick={() => removeItem(index)}
                          disabled={items.length === 1}
                          className="delete-btn"
                          aria-label="Remove item"
                        >
                          <Trash2 size={18} />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      <aside className={`billing-pos-right${isMobile ? ` billing-mobile-panel ${mobileView === 'checkout' ? 'active' : ''}` : ''}`}>
        <div className="billing-pos-card billing-summary-card">
          <div className="billing-card-header">
            <div>
              <h2>Checkout</h2>
              <p>Confirm totals and collect payment.</p>
            </div>
            <span className={`billing-status-badge ${creditAmount > 0 ? 'pending' : 'paid'}`}>
              {paymentStatusLabel}
            </span>
          </div>

          {isOrderLinked ? (
            <div className="form-row">
              <label className="form-label" htmlFor="fulfillmentMode">Billing Mode</label>
              <select
                id="fulfillmentMode"
                className="form-input"
                value={fulfillmentMode}
                onChange={(e) => setFulfillmentMode(String(e.target.value || 'available_now'))}
              >
                <option value="available_now">Bill available now</option>
                <option value="full_now">Bill full now</option>
              </select>
            </div>
          ) : null}

          <div className="billing-summary-grid">
            <div>
              <span>Subtotal</span>
              <strong>{formatCurrency(subtotalAmount)}</strong>
            </div>
            <div>
              <span>Discount</span>
              <strong>{formatCurrency(totalDiscount)}</strong>
            </div>
            <div className="emphasis">
              <span>Final Total</span>
              <strong>{formatCurrency(totalBill)}</strong>
            </div>
            <div>
              <span>Paid</span>
              <strong>{formatCurrency(paidClamped)}</strong>
            </div>
            <div className={creditAmount > 0 ? 'due' : 'settled'}>
              <span>Due</span>
              <strong>{formatCurrency(creditAmount)}</strong>
            </div>
          </div>

          <div className="billing-payment-intents" role="group" aria-label="Payment intent">
            <button
              type="button"
              className={`billing-intent-btn${paymentIntent === 'full_payment' ? ' active' : ''}`}
              onClick={handleSelectFullPayment}
            >
              Full Payment
            </button>
            <button
              type="button"
              className={`billing-intent-btn${paymentIntent === 'partial_payment' ? ' active' : ''}`}
              onClick={handleSelectPartialPayment}
            >
              Partial
            </button>
            <button
              type="button"
              className={`billing-intent-btn${paymentIntent === 'full_credit' ? ' active' : ''}`}
              onClick={handleSelectFullCredit}
            >
              Full Credit
            </button>
          </div>

          <div className="form-row">
            <label className="form-label" htmlFor="paidAmount">Paid Amount</label>
            <CalculatedAmountInput
              id="paidAmount"
              name="paid_amount"
              min={0}
              max={totalBill}
              value={paidAmount}
              onValueChange={setPaidAmount}
              inputClassName="form-input"
              placeholder="Enter paid amount or expression"
            />
          </div>

          <div className="form-row">
            <label className="form-label" htmlFor="billing-payment-method">Payment Method</label>
            {paymentIntent === 'full_credit' ? (
              <div className="billing-payment-method-display">
                Credit
              </div>
            ) : (
              <select
                id="billing-payment-method"
                className="form-input"
                value={selectedPaymentMethod}
                onChange={(event) => setSelectedPaymentMethod(String(event.target.value || 'cash'))}
              >
                <option value="cash">Cash</option>
                <option value="upi">UPI</option>
                <option value="card">Card</option>
                <option value="bank">Bank</option>
              </select>
            )}
          </div>

          <div className="billing-payment-note">
            <span>Stored Method</span>
            <strong>{effectivePaymentMethod}</strong>
          </div>

          <div className="billing-form-controls">
            <button className="reset" onClick={onClear}>
              Clear
            </button>
            <button
              className="submit"
              onClick={handleCreateBill}
              disabled={isSubmitting}
            >
              Create Bill
            </button>
          </div>
        </div>
      </aside>
    </div>

    {isMobile ? (
      <div className="billing-mobile-footer">
        <div className="billing-mobile-footer-summary">
          <div>
            <span>Total</span>
            <strong>{formatCurrency(totalBill)}</strong>
          </div>
          <div className={creditAmount > 0 ? 'due' : 'settled'}>
            <span>Due</span>
            <strong>{formatCurrency(creditAmount)}</strong>
          </div>
        </div>
        <div className="billing-mobile-footer-nav">
          <button
            type="button"
            className={`billing-mobile-nav-btn${mobileView === 'search' ? ' active' : ''}`}
            onClick={() => setMobileView('search')}
          >
            Search
          </button>
          <button
            type="button"
            className={`billing-mobile-nav-btn${mobileView === 'cart' ? ' active' : ''}`}
            onClick={() => setMobileView('cart')}
          >
            Cart ({activeLineItemsCount})
          </button>
          <button
            type="button"
            className={`billing-mobile-nav-btn${mobileView === 'checkout' ? ' active' : ''}`}
            onClick={() => setMobileView('checkout')}
          >
            Checkout
          </button>
        </div>
        <button
          type="button"
          className="billing-mobile-footer-primary"
          onClick={handleMobilePrimaryAction}
          disabled={isSubmitting}
        >
          {mobileView === 'checkout' ? 'Create Bill' : 'Review & Pay'}
        </button>
      </div>
    ) : null}

    {lastShareText && (
      <div className="share-box">
        <div className="share-header">
          <strong>Share Bill {lastShareNumber ? `#${lastShareNumber}` : ''}</strong>
        </div>
        <textarea className="share-text" id="billing-share-text" name="share_text" readOnly value={lastShareText} />
        <div className="share-actions">
          <button className="share-btn" onClick={handleCopyShare}>Copy</button>
          <button
            type="button"
            className="share-btn whatsapp"
            onClick={handleSendWhatsApp}
          >
            WhatsApp
          </button>
        </div>
      </div>
    )}
    {showCustomerCreateModal ? (
      <UserEditModal
        isCreate={true}
        createPrefill={{ name: customerCreateName }}
        onClose={handleCustomerModalClose}
        onSave={handleCustomerModalSave}
      />
    ) : null}
  </div>
  );
};

export default BillingTabView;

