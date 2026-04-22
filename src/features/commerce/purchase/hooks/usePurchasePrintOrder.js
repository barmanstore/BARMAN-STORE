import { useCallback } from 'react';

const usePurchasePrintOrder = ({
  products,
  distributors,
  getOrderDistributorInfo,
  resolvePurchaseUnitForProduct,
  getProductUomProfile,
  toBaseQtyForProduct,
  toNumber,
  getOrderDisplayTotal,
  getPoLifecycleStatus,
  getPoPaymentStatus,
  getPoPaidAmount,
  getPoBalanceDue,
  formatDate,
  formatCurrency,
  escapeHtml,
  printHtmlDocument,
  setError,
  findProductForItem,
  calculateOrderItem,
}) => {
  const getItemFinancials = useCallback(
    (item) => {
      const quantity = Math.max(0, toNumber(item?.quantity));
      const product = findProductForItem(products, item);
      const profile = getProductUomProfile(product);
      const fallbackUom = resolvePurchaseUnitForProduct(product, item?.uom || profile.baseUnit);
      const calculatedLine =
        typeof calculateOrderItem === 'function' ? calculateOrderItem(item) : null;
      const uom = calculatedLine?.uom || fallbackUom;
      const quantityInBase =
        Number(calculatedLine?.quantityInBase ?? toBaseQtyForProduct(quantity, uom, product)) || 0;
      const rate = Math.max(0, toNumber(calculatedLine?.rate ?? item?.rate ?? item?.unit_price));
      const grossAmount = Number(calculatedLine?.grossAmount ?? quantityInBase * rate) || 0;
      const discountType =
        String(calculatedLine?.discountType || item?.discount_type || 'percent')
          .trim()
          .toLowerCase() === 'fixed'
          ? 'fixed'
          : 'percent';
      const discountValue = Math.max(
        0,
        toNumber(calculatedLine?.discountValue ?? item?.discount_value)
      );
      const discountAmountFallback =
        discountType === 'fixed' ? discountValue : (grossAmount * discountValue) / 100;
      const discountAmount =
        Number(
          calculatedLine?.discountAmount ??
            Math.max(0, Math.min(discountAmountFallback, grossAmount))
        ) || 0;
      const taxableValue =
        Number(calculatedLine?.taxableValue ?? Math.max(0, grossAmount - discountAmount)) || 0;
      const gstRate = Math.max(0, toNumber(calculatedLine?.gstRate ?? item?.gst_rate));
      const taxAmount = Number(calculatedLine?.taxAmount ?? (taxableValue * gstRate) / 100) || 0;
      const lineTotal = Number(calculatedLine?.totalAmount ?? taxableValue + taxAmount) || 0;
      const grossPerDisplayUnit = quantity > 0 ? grossAmount / quantity : rate;
      const taxablePerDisplayUnit = quantity > 0 ? taxableValue / quantity : taxableValue;
      const effectivePerDisplayUnit = quantity > 0 ? lineTotal / quantity : lineTotal;
      return {
        quantity,
        quantityInBase,
        uom,
        rate,
        grossAmount,
        discountType,
        discountValue,
        discountAmount,
        taxableValue,
        taxAmount,
        lineTotal,
        totalAmount: lineTotal,
        gstRate,
        baseUnit: profile.baseUnit,
        grossPerDisplayUnit,
        taxablePerDisplayUnit,
        effectivePerDisplayUnit,
      };
    },
    [
      products,
      findProductForItem,
      getProductUomProfile,
      toNumber,
      resolvePurchaseUnitForProduct,
      toBaseQtyForProduct,
      calculateOrderItem,
    ]
  );

  const buildPurchaseOrderPrintHtml = useCallback(
    (order) => {
      const items = Array.isArray(order?.items) ? order.items : [];
      const supplier = getOrderDistributorInfo(order, distributors);
      const rows = items
        .map((item, index) => {
          const line = getItemFinancials(item);
          return `
        <tr>
          <td>${index + 1}</td>
          <td>${escapeHtml(item?.product_name || '-')}</td>
          <td>${line.quantity}</td>
          <td>${escapeHtml(line.uom || '-')}</td>
          <td>
            <div><strong>Base ${formatCurrency(line.rate)}</strong> / ${escapeHtml(line.baseUnit || 'pcs')}</div>
            <div class="po-print-rate-meta">Net ${formatCurrency(line.taxablePerDisplayUnit)} / ${escapeHtml(line.uom || 'pcs')} before GST</div>
            <div class="po-print-rate-meta">Effective ${formatCurrency(line.effectivePerDisplayUnit)} / ${escapeHtml(line.uom || 'pcs')}</div>
          </td>
          <td>${line.gstRate.toFixed(2)}%</td>
          <td>${formatCurrency(line.taxableValue)}</td>
          <td>${formatCurrency(line.taxAmount)}</td>
          <td>${formatCurrency(line.lineTotal)}</td>
        </tr>
      `;
        })
        .join('');

      const taxable = toNumber(order?.taxable_value);
      const tax = toNumber(order?.tax_amount);
      const grand = toNumber(order?.total_amount || getOrderDisplayTotal(order));

      return `
      <div class="po-print">
        <div class="po-print-header">
          <div>
            <h1>Purchase Order</h1>
            <div class="muted">PO #${order?.po_number || '-'}</div>
          </div>
          <div class="meta">
            <div><strong>PO Status:</strong> ${String(getPoLifecycleStatus(order) || '-').toUpperCase()}</div>
            <div><strong>Payment:</strong> ${String(getPoPaymentStatus(order) || '-').toUpperCase()}</div>
            <div><strong>Paid:</strong> ${formatCurrency(getPoPaidAmount(order))}</div>
            <div><strong>Balance:</strong> ${formatCurrency(getPoBalanceDue(order))}</div>
            <div><strong>Date:</strong> ${formatDate(order?.created_at || order?.order_date)}</div>
            <div><strong>Expected:</strong> ${formatDate(order?.expected_delivery)}</div>
            <div><strong>Bill No:</strong> ${order?.bill_number || order?.invoice_number || '-'}</div>
          </div>
        </div>

        <div class="po-print-party">
          <div>
            <h3>Supplier</h3>
            <div>${escapeHtml(supplier.name)}</div>
            <div>${escapeHtml(supplier.phone)}</div>
            <div>${escapeHtml(supplier.address)}</div>
          </div>
          <div>
            <h3>Order Notes</h3>
            <div>${escapeHtml(order?.notes || '-')}</div>
          </div>
        </div>

        <table class="po-print-table">
          <thead>
            <tr>
              <th>#</th>
              <th>Product</th>
              <th>Qty</th>
              <th>UOM</th>
              <th>Pricing</th>
              <th>GST %</th>
              <th>Taxable</th>
              <th>Tax</th>
              <th>Total</th>
            </tr>
          </thead>
          <tbody>${rows || '<tr><td colspan="9">No items</td></tr>'}</tbody>
        </table>

        <div class="po-print-summary">
          <div><span>Taxable Value</span><strong>${formatCurrency(taxable)}</strong></div>
          <div><span>GST</span><strong>${formatCurrency(tax)}</strong></div>
          <div class="grand"><span>Grand Total</span><strong>${formatCurrency(grand)}</strong></div>
        </div>
      </div>
    `;
    },
    [
      distributors,
      getOrderDistributorInfo,
      getItemFinancials,
      escapeHtml,
      formatCurrency,
      toNumber,
      getOrderDisplayTotal,
      getPoLifecycleStatus,
      getPoPaymentStatus,
      getPoPaidAmount,
      getPoBalanceDue,
      formatDate,
    ]
  );

  const handlePrintOrderDetail = useCallback(
    (order) => {
      if (!order) return;
      const html = buildPurchaseOrderPrintHtml(order);
      printHtmlDocument({
        title: `PO ${order?.po_number || ''}`,
        bodyHtml: html,
        cssText: `
        .po-print { max-width: 980px; margin: 0 auto; }
        .po-print-header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 16px; }
        .po-print-header h1 { margin: 0 0 6px; font-size: 26px; }
        .muted { color: #555; font-size: 13px; }
        .meta { font-size: 13px; line-height: 1.6; text-align: right; }
        .po-print-party { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin: 16px 0; }
        .po-print-party h3 { margin: 0 0 8px; font-size: 13px; text-transform: uppercase; color: #444; }
        .po-print-table { width: 100%; border-collapse: collapse; font-size: 12px; }
        .po-print-table th, .po-print-table td { border: 1px solid #d1d5db; padding: 7px; text-align: left; }
        .po-print-table thead th { background: #f3f4f6; font-weight: 700; }
        .po-print-rate-meta { margin-top: 3px; color: #4b5563; font-size: 11px; }
        .po-print-summary { margin-top: 14px; margin-left: auto; width: 320px; }
        .po-print-summary div { display: flex; justify-content: space-between; padding: 6px 0; border-bottom: 1px solid #e5e7eb; font-size: 13px; }
        .po-print-summary .grand { font-size: 15px; font-weight: 700; border-bottom: none; }
        @media print {
          body { margin: 0; padding: 10mm; }
          .po-print-table tr { page-break-inside: avoid; }
        }
      `,
        onError: (message) => setError(message),
      });
    },
    [buildPurchaseOrderPrintHtml, printHtmlDocument, setError]
  );

  return {
    handlePrintOrderDetail,
    getItemFinancials,
  };
};

export default usePurchasePrintOrder;
