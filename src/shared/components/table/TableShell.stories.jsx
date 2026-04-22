import TableShell from './TableShell';

export default {
  title: 'Shared/TableShell',
  component: TableShell,
  parameters: {
    layout: 'fullscreen',
  },
};

export function Default() {
  return (
    <div style={{ padding: 24, background: '#faf8f5', minHeight: '100vh' }}>
      <TableShell title="Ledger">
        <table className="ledger-table">
          <thead>
            <tr>
              <th>Product</th>
              <th>Type</th>
              <th>Quantity</th>
              <th>Previous</th>
              <th>New Balance</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>Organic Rice 5kg</td>
              <td>Purchase</td>
              <td>+40</td>
              <td>120</td>
              <td>160</td>
            </tr>
            <tr>
              <td>Sunflower Oil 1L</td>
              <td>Sale</td>
              <td>-12</td>
              <td>92</td>
              <td>80</td>
            </tr>
          </tbody>
        </table>
      </TableShell>
    </div>
  );
}

export function Extended() {
  return (
    <div style={{ padding: 24, background: '#faf8f5', minHeight: '100vh' }}>
      <TableShell title="Stock Movements">
        <table className="ledger-table">
          <thead>
            <tr>
              <th>Date</th>
              <th>Product</th>
              <th>Transaction Type</th>
              <th>Reference</th>
              <th>Quantity</th>
              <th>Previous Balance</th>
              <th>New Balance</th>
              <th>Notes</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>2026-04-18</td>
              <td>Organic Rice 5kg</td>
              <td>Purchase</td>
              <td>PO-4412</td>
              <td>+40</td>
              <td>120</td>
              <td>160</td>
              <td>Supplier refill</td>
            </tr>
            <tr>
              <td>2026-04-18</td>
              <td>Sunflower Oil 1L</td>
              <td>Sale</td>
              <td>INV-0891</td>
              <td>-12</td>
              <td>92</td>
              <td>80</td>
              <td>Customer order</td>
            </tr>
            <tr>
              <td>2026-04-17</td>
              <td>Wheat Flour 10kg</td>
              <td>Adjustment</td>
              <td>ADJ-001</td>
              <td>-5</td>
              <td>248</td>
              <td>243</td>
              <td>Stock count variance</td>
            </tr>
            <tr>
              <td>2026-04-17</td>
              <td>Organic Rice 5kg</td>
              <td>Return</td>
              <td>RET-0442</td>
              <td>+8</td>
              <td>152</td>
              <td>160</td>
              <td>Customer return</td>
            </tr>
          </tbody>
        </table>
      </TableShell>
    </div>
  );
}

export function WithHighlight() {
  return (
    <div style={{ padding: 24, background: '#faf8f5', minHeight: '100vh' }}>
      <TableShell title="Recent Transactions">
        <table className="ledger-table">
          <thead>
            <tr>
              <th>Product</th>
              <th>Type</th>
              <th>Amount</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            <tr style={{ background: 'rgba(212, 175, 55, 0.08)' }}>
              <td>Organic Rice 5kg</td>
              <td>Purchase</td>
              <td>+40 units</td>
              <td><span style={{ padding: '0.25rem 0.75rem', background: '#d4af37', color: '#1a1a1a', borderRadius: '0.5rem', fontSize: '0.8rem', fontWeight: 600 }}>Active</span></td>
            </tr>
            <tr>
              <td>Sunflower Oil 1L</td>
              <td>Sale</td>
              <td>-12 units</td>
              <td><span style={{ padding: '0.25rem 0.75rem', background: '#e0e7ff', color: '#4c1d95', borderRadius: '0.5rem', fontSize: '0.8rem', fontWeight: 600 }}>Completed</span></td>
            </tr>
            <tr>
              <td>Wheat Flour</td>
              <td>Return</td>
              <td>+5 units</td>
              <td><span style={{ padding: '0.25rem 0.75rem', background: '#fecaca', color: '#7f1d1d', borderRadius: '0.5rem', fontSize: '0.8rem', fontWeight: 600 }}>Pending</span></td>
            </tr>
          </tbody>
        </table>
      </TableShell>
    </div>
  );
}

export function Compact() {
  return (
    <div style={{ padding: 16, background: '#faf8f5', borderRadius: '0.75rem' }}>
      <TableShell title="Quick Overview">
        <table className="ledger-table" style={{ fontSize: '0.85rem' }}>
          <thead>
            <tr>
              <th>Item</th>
              <th>Change</th>
              <th>New</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>Rice</td>
              <td>+40</td>
              <td>160</td>
            </tr>
            <tr>
              <td>Oil</td>
              <td>-12</td>
              <td>80</td>
            </tr>
          </tbody>
        </table>
      </TableShell>
    </div>
  );
}

export function Scrollable() {
  return (
    <div style={{ padding: 24, background: '#faf8f5', minHeight: '100vh' }}>
      <TableShell title="Large Dataset">
        <div style={{ maxHeight: '500px', overflowY: 'auto' }}>
          <table className="ledger-table">
            <thead style={{ position: 'sticky', top: 0, background: '#fff' }}>
              <tr>
                <th>Product</th>
                <th>Type</th>
                <th>Qty</th>
                <th>Prev</th>
                <th>New</th>
              </tr>
            </thead>
            <tbody>
              {Array.from({ length: 20 }, (_, i) => (
                <tr key={i}>
                  <td>Product {String.fromCharCode(65 + (i % 5))}</td>
                  <td>{['Purchase', 'Sale', 'Return'][i % 3]}</td>
                  <td>{Math.floor(Math.random() * 100)}</td>
                  <td>{Math.floor(Math.random() * 500)}</td>
                  <td>{Math.floor(Math.random() * 500)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </TableShell>
    </div>
  );
}
