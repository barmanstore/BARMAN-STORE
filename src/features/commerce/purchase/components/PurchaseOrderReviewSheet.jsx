const formatReviewAmount = (value) => Number(value || 0).toLocaleString(undefined, {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const formatReviewTotalAmount = (value) => Number(value || 0).toLocaleString(undefined, {
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
});

const normalizeDiscountType = (value) => (
  String(value || '').trim().toLowerCase() === 'fixed' ? 'fixed' : 'percent'
);

const PurchaseOrderReviewSheet = ({
  kicker = 'Purchase Order',
  title = 'Review Before Final Submit',
  description = '',
  badgeLabel = '',
  metaItems = [],
  rows = [],
  totals = {},
  notes = [],
  children = null,
}) => (
  <section className="po-review-sheet">
    <div className="po-review-sheet-head bill">
      <div>
        <span className="po-review-print-kicker">{kicker}</span>
        <h4>{title}</h4>
        {description ? <p>{description}</p> : null}
      </div>
      {badgeLabel ? <span className="po-pos-status-chip good">{badgeLabel}</span> : null}
    </div>

    {metaItems.length ? (
      <div className="po-review-print-meta">
        {metaItems.map((item) => (
          <div key={item.label}>
            <span>{item.label}</span>
            <strong>{item.value}</strong>
          </div>
        ))}
      </div>
    ) : null}

    <div className="po-review-bill-table">
      <div className="po-review-bill-head">
        <span>Item</span>
        <span>Qty</span>
        <span>Rate</span>
        <span>GST</span>
        <span>Disc</span>
        <span>Total</span>
      </div>
      {rows.map((row) => {
        const discountType = normalizeDiscountType(row.discountType);
        const discountValue = Number(row.discountValue || 0) || 0;
        const discountLabel = discountValue > 0
          ? `${formatReviewAmount(discountValue)}${discountType === 'fixed' ? '₹' : '%'}`
          : '-';
        return (
          <div key={row.key} className="po-review-bill-row">
            <span>{row.name}</span>
            <span>
              {row.quantity}
              {' '}
              {row.uom}
            </span>
            <span>{formatReviewAmount(row.rate)}</span>
            <span>{formatReviewAmount(row.gstRate)}%</span>
            <span>{discountLabel}</span>
            <strong>{formatReviewAmount(row.total)}</strong>
          </div>
        );
      })}
    </div>

    <div className="po-review-bill-totals">
      <div><span>Subtotal</span><strong>{formatReviewAmount(totals.taxableValue || 0)}</strong></div>
      <div><span>GST</span><strong>{formatReviewAmount(totals.taxAmount || 0)}</strong></div>
      <div className="grand"><span>Total</span><strong>{formatReviewTotalAmount(totals.totalAmount || 0)}</strong></div>
    </div>

    {notes.length ? (
      <div className="po-review-meta-grid">
        {notes.map((note) => (
          <div key={note.label} className="po-review-meta-card">
            <span>{note.label}</span>
            <strong>{note.value}</strong>
          </div>
        ))}
      </div>
    ) : null}

    {children}
  </section>
);

export default PurchaseOrderReviewSheet;
