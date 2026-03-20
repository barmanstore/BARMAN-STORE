const PurchaseDistributorSelector = ({
  activeDistributors,
  orderFormData,
  handleDistributorInputChange,
  setOrderFormData,
}) => (
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
        {activeDistributors.map((distributor) => <option key={distributor.id} value={distributor.name} />)}
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
);

export default PurchaseDistributorSelector;
