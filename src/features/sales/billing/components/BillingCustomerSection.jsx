import React, { memo } from 'react';
import { UserPlus } from 'lucide-react';

const BillingCustomerSection = ({
  isOrderLinked,
  isSubmitting,
  customer,
  customersList,
  handleCustomerChange,
  handleAddCustomer,
  fulfillmentMode,
  setFulfillmentMode,
}) => (
  <section className="billing-pos-panel billing-customer-panel">
    <div className="billing-panel-header">
      <div>
        <p className="billing-panel-kicker">Customer</p>
        <h2>Checkout context</h2>
        <p className="billing-panel-copy">Pick a customer only when due matters.</p>
      </div>
      <span className="billing-panel-badge neutral">{isOrderLinked ? 'Linked' : 'Walk-in'}</span>
    </div>

    <div className="billing-customer-block">
      <label className="billing-entry-field" htmlFor="billing-customer-name">
        <span>Customer</span>
        <input
          id="billing-customer-name"
          list="billing-customer-options"
          className="form-input"
          value={customer.name}
          onChange={handleCustomerChange}
          placeholder="Walk-in or saved name"
          autoComplete="name"
          readOnly={isOrderLinked}
        />
        <datalist id="billing-customer-options">
          {customersList.map((entry) => (
            <option key={entry.id} value={entry.name} />
          ))}
        </datalist>
      </label>

      {!isOrderLinked ? (
        <button
          type="button"
          className="billing-secondary-btn"
          onClick={handleAddCustomer}
          disabled={isSubmitting}
        >
          <UserPlus size={16} />
          New Customer
        </button>
      ) : null}

      {customer.phone || customer.email ? (
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
      ) : null}
    </div>

    {isOrderLinked ? (
      <label className="billing-entry-field" htmlFor="billing-fulfillment-mode">
        <span>Mode</span>
        <select
          id="billing-fulfillment-mode"
          className="form-input"
          value={fulfillmentMode}
          onChange={(event) => setFulfillmentMode(String(event.target.value || 'available_now'))}
        >
          <option value="available_now">Available now</option>
          <option value="full_now">Full order</option>
        </select>
      </label>
    ) : null}
  </section>
);

export default memo(BillingCustomerSection);
