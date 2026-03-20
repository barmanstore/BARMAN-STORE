import { memo } from 'react';
import { X } from 'lucide-react';
import { formatCurrency } from '../../../../shared/utils/formatters';
import { getLastPurchaseMeta } from '../utils/orderDrafts';

const hasMeaningfulPoItem = (item = {}) => (
  Number(item?.product_id || 0) > 0
  || String(item?.product_query || '').trim().length > 0
  || String(item?.product_name || '').trim().length > 0
  || Number(item?.rate ?? item?.unit_price ?? 0) > 0
  || Number(item?.discount_value || 0) > 0
  || String(item?.last_purchase_hint || '').trim().length > 0
  || Number(item?.last_purchase_rate || 0) > 0
);

const PurchaseOrderPosListCard = memo(({
  index,
  row,
  rowDiagnostics,
  normalizedRowsLength,
  activeItemIndex,
  orderFullMode,
  onSelectItem,
  onRemoveItem,
}) => {
  const item = row.item || {};
  const line = row.line || {};
  const displayName = String(item?.product_name || item?.product_query || '').trim() || `Draft row ${index + 1}`;
  const isDraft = !hasMeaningfulPoItem(item);
  const displayUom = String(line?.uom || item?.uom || 'pcs').trim() || 'pcs';
  const enteredQuantity = Math.max(0, Number(line.quantity || item?.quantity || 0));
  const grossPerDisplayUnit = enteredQuantity > 0 ? Number(line.grossAmount || 0) / enteredQuantity : 0;
  const taxablePerDisplayUnit = enteredQuantity > 0 ? Number(line.taxableValue || 0) / enteredQuantity : 0;
  const effectivePerDisplayUnit = enteredQuantity > 0 ? Number(line.totalAmount || 0) / enteredQuantity : 0;
  const lastPurchaseMeta = getLastPurchaseMeta(item);
  const lastPurchaseLabel = lastPurchaseMeta.hasValue
    ? [
        lastPurchaseMeta.rate > 0 ? `Last ${formatCurrency(lastPurchaseMeta.rate)}` : 'Last purchase',
        lastPurchaseMeta.distributorName ? `Distributor: ${lastPurchaseMeta.distributorName}` : '',
        lastPurchaseMeta.ageLabel || lastPurchaseMeta.dateLabel,
      ].filter(Boolean).join(' | ') || lastPurchaseMeta.fallbackHint
    : '';

  return (
    <div
      role="button"
      tabIndex={0}
      className={`po-pos-item-card${index === activeItemIndex ? ' active' : ''}${isDraft ? ' draft' : ''}`}
      onClick={() => onSelectItem(index)}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          onSelectItem(index);
        }
      }}
    >
      <div className="po-pos-item-card-top">
        <div className="po-pos-item-title">
          <strong>{displayName}</strong>
          <div className="po-pos-item-tags">
            {index === activeItemIndex ? <span className="active">Active</span> : null}
            {index === normalizedRowsLength - 1 ? <span>Latest</span> : null}
            {isDraft ? <span className="draft">Draft Row</span> : null}
          </div>
        </div>
        <button
          type="button"
          className="po-pos-remove-btn"
          aria-label={`Remove row ${index + 1}`}
          onClick={(event) => {
            event.stopPropagation();
            onRemoveItem(index);
          }}
        >
          <X size={16} />
        </button>
      </div>

      <div className="po-pos-item-metrics">
        <span>
          {enteredQuantity} {displayUom} | Effective {formatCurrency(effectivePerDisplayUnit)} / {displayUom}
        </span>
        <strong>{formatCurrency(line.totalAmount || 0)}</strong>
      </div>

      {orderFullMode ? (
        <div className="po-pos-item-submetrics">
          <span>Base {formatCurrency(grossPerDisplayUnit)} / {displayUom}</span>
          {Number(line.discountAmount || 0) > 0 ? (
            <span>Discount {formatCurrency(line.discountAmount || 0)}</span>
          ) : null}
          <span>Net {formatCurrency(taxablePerDisplayUnit)} / {displayUom}</span>
          <span>Tax {formatCurrency(line.taxAmount || 0)}</span>
          <span>GST {Number(line.gstRate || 0).toFixed(0)}%</span>
        </div>
      ) : null}

      {lastPurchaseLabel || rowDiagnostics.rateChangeLabel || rowDiagnostics.rateAcknowledgementMessage || rowDiagnostics.rateAcknowledgedLabel || rowDiagnostics.discountAppliedLabel || rowDiagnostics.discountWarningMessage || rowDiagnostics.discountAcknowledgedLabel || rowDiagnostics.discountAcknowledgementMessage || rowDiagnostics.discountBlockingMessage || rowDiagnostics.duplicateMessage ? (
        <div className="po-pos-item-status" aria-live="polite">
          {lastPurchaseLabel ? <span className="po-pos-status-chip info">{lastPurchaseLabel}</span> : null}
          {lastPurchaseMeta.poNumber ? (
            <span className="po-pos-status-chip neutral">PO {lastPurchaseMeta.poNumber}</span>
          ) : null}
          {rowDiagnostics.rateChangeLabel ? (
            <span
              className={`po-pos-status-chip ${rowDiagnostics.rateChangeTone || 'neutral'}`}
              title={rowDiagnostics.rateWarningMessage || undefined}
            >
              {rowDiagnostics.rateChangeLabel}
            </span>
          ) : null}
          {rowDiagnostics.rateAcknowledgementMessage ? (
            <span className="po-pos-status-chip danger">{rowDiagnostics.rateAcknowledgementMessage}</span>
          ) : null}
          {rowDiagnostics.rateAcknowledgedLabel ? (
            <span className="po-pos-status-chip good">{rowDiagnostics.rateAcknowledgedLabel}</span>
          ) : null}
          {rowDiagnostics.discountAppliedLabel ? (
            <span className="po-pos-status-chip bad">{rowDiagnostics.discountAppliedLabel}</span>
          ) : null}
          {rowDiagnostics.discountWarningMessage ? (
            <span className="po-pos-status-chip bad">{rowDiagnostics.discountWarningMessage}</span>
          ) : null}
          {rowDiagnostics.discountAcknowledgementMessage ? (
            <span className="po-pos-status-chip danger">{rowDiagnostics.discountAcknowledgementMessage}</span>
          ) : null}
          {rowDiagnostics.discountAcknowledgedLabel ? (
            <span className="po-pos-status-chip good">{rowDiagnostics.discountAcknowledgedLabel}</span>
          ) : null}
          {rowDiagnostics.discountBlockingMessage ? (
            <span className="po-pos-status-chip danger">{rowDiagnostics.discountBlockingMessage}</span>
          ) : null}
          {rowDiagnostics.duplicateMessage ? (
            <span className="po-pos-status-chip danger">{rowDiagnostics.duplicateMessage}</span>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}, (prevProps, nextProps) => (
  prevProps.index === nextProps.index
  && prevProps.row === nextProps.row
  && prevProps.activeItemIndex === nextProps.activeItemIndex
  && prevProps.orderFullMode === nextProps.orderFullMode
  && prevProps.normalizedRowsLength === nextProps.normalizedRowsLength
  && prevProps.rowDiagnostics.rateChangeLabel === nextProps.rowDiagnostics.rateChangeLabel
  && prevProps.rowDiagnostics.rateChangeTone === nextProps.rowDiagnostics.rateChangeTone
  && prevProps.rowDiagnostics.rateWarningMessage === nextProps.rowDiagnostics.rateWarningMessage
  && prevProps.rowDiagnostics.rateAcknowledgementMessage === nextProps.rowDiagnostics.rateAcknowledgementMessage
  && prevProps.rowDiagnostics.rateAcknowledgedLabel === nextProps.rowDiagnostics.rateAcknowledgedLabel
  && prevProps.rowDiagnostics.discountAppliedLabel === nextProps.rowDiagnostics.discountAppliedLabel
  && prevProps.rowDiagnostics.discountWarningMessage === nextProps.rowDiagnostics.discountWarningMessage
  && prevProps.rowDiagnostics.discountAcknowledgementMessage === nextProps.rowDiagnostics.discountAcknowledgementMessage
  && prevProps.rowDiagnostics.discountAcknowledgedLabel === nextProps.rowDiagnostics.discountAcknowledgedLabel
  && prevProps.rowDiagnostics.discountBlockingMessage === nextProps.rowDiagnostics.discountBlockingMessage
  && prevProps.rowDiagnostics.duplicateMessage === nextProps.rowDiagnostics.duplicateMessage
));

const PurchaseOrderPosList = ({
  rows,
  activeItemIndex,
  orderTotals,
  orderFullMode,
  draftDiagnostics,
  onSelectItem,
  onRemoveItem,
}) => {
  const normalizedRows = Array.isArray(rows) ? rows : [];
  const visibleIndexes = normalizedRows.reduce((indexes, row, index, source) => {
    const item = row?.item || {};
    if (index === activeItemIndex || hasMeaningfulPoItem(item) || source.length === 1) {
      indexes.push(index);
    }
    return indexes;
  }, []).reverse();

  return (
    <section className="po-pos-panel po-pos-items-panel">
      <div className="po-pos-panel-header">
        <div>
          <p className="po-pos-panel-kicker">Live PO Items</p>
          <h4>{visibleIndexes.length} visible row{visibleIndexes.length === 1 ? '' : 's'}</h4>
          <p>Click a row to make it active and continue editing in the entry panel.</p>
        </div>
        <div className="po-pos-list-summary">
          <span>Total</span>
          <strong>{formatCurrency(orderTotals.totalAmount)}</strong>
        </div>
      </div>

      <div className="po-pos-items-list" role="list" aria-label="Purchase order items">
        {visibleIndexes.map((index) => {
          const row = normalizedRows[index] || {};
          const rowDiagnostics = draftDiagnostics.rowDiagnostics[index] || {};
          return (
            <PurchaseOrderPosListCard
              key={`po-pos-card-${index}`}
              index={index}
              row={row}
              rowDiagnostics={rowDiagnostics}
              normalizedRowsLength={normalizedRows.length}
              activeItemIndex={activeItemIndex}
              orderFullMode={orderFullMode}
              onSelectItem={onSelectItem}
              onRemoveItem={onRemoveItem}
            />
          );
        })}
      </div>
    </section>
  );
};

export default memo(PurchaseOrderPosList);
