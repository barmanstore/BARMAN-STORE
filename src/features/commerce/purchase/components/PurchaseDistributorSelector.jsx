const PurchaseDistributorSelector = ({
  activeSuppliers,
  orderFormData,
  handleDistributorInputChange,
  distributorInputRef,
}) => (
  <section className="po-supplier-select-shell">
    <div className="po-supplier-select-head">
      <span className="po-supplier-select-label">Supplier</span>
      <h3>Select Supplier</h3>
      <p>Select the supplier first to load the supplier product board.</p>
    </div>
    <div className="form-group">
      <label htmlFor="po-entry-distributor">Select Supplier *</label>
      <input
        ref={distributorInputRef}
        id="po-entry-distributor"
        name="supplier_name"
        type="text"
        list="po-distributor-list"
        value={orderFormData.supplier_name || ''}
        onChange={(event) => handleDistributorInputChange(event.target.value)}
        placeholder="Type supplier name"
        required
      />
      <datalist id="po-distributor-list">
        {activeSuppliers.map((supplier) => (
          <option
            key={supplier.id}
            value={supplier.name}
            label={supplier.distributor_name || undefined}
          />
        ))}
      </datalist>
    </div>
  </section>
);

export default PurchaseDistributorSelector;
