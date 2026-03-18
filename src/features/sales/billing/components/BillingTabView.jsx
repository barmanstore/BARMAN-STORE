import React from 'react';
import { Plus, Trash2, UserPlus } from 'lucide-react';
import { formatCurrency } from '../../../../shared/utils/formatters';
import CalculatedAmountInput from '../../../../shared/components/CalculatedAmountInput';
import UserEditModal from '../../../../shared/components/UserEditModal';

const BillingTabView = ({
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
  removeItem,
  addItem,
  totalBill,
  fulfillmentMode,
  setFulfillmentMode,
  paidAmount,
  setPaidAmount,
  creditAmount,
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
}) => (
  <div className="billing-content">
    <div className="billing-header">
      <h1>Billing Invoice</h1>
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

    <div className="form-section">
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

    <div className="actions">
      <button onClick={addItem} className="add-btn" aria-label="Add new product">
        <Plus size={18} /> Add Item
      </button>
      <div className="total-section">
        <p>Total Payable:</p>
        <p>{formatCurrency(totalBill)}</p>
      </div>
    </div>

    <div className="form-section">
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
        <label className="form-label">Credit </label>
        <div className="form-input" aria-live="polite">
          {formatCurrency(creditAmount)}
        </div>
      </div>
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

export default BillingTabView;

