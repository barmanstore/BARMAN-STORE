import { memo } from 'react';
import { X } from 'lucide-react';
import { formatCurrency } from '../../../../shared/utils/formatters';

const hasMeaningfulPoItem = (item = {}) =>
  Number(item?.product_id || 0) > 0 ||
  String(item?.product_query || '').trim().length > 0 ||
  String(item?.product_name || '').trim().length > 0 ||
  Number(item?.rate ?? item?.unit_price ?? 0) > 0 ||
  Number(item?.discount_value || 0) > 0 ||
  String(item?.last_purchase_hint || '').trim().length > 0 ||
  Number(item?.last_purchase_rate || 0) > 0;

const PurchaseOrderPosListCard = memo(
  ({ index, row, activeItemIndex, onSelectItem, onRemoveItem }) => {
    const item = row.item || {};
    const line = row.line || {};
    const displayName =
      String(item?.product_name || item?.product_query || '').trim() || `Draft row ${index + 1}`;
    const isDraft = !hasMeaningfulPoItem(item);
    const displayUom = String(line?.uom || item?.uom || 'pcs').trim() || 'pcs';
    const enteredQuantity = Math.max(0, Number(line.quantity || item?.quantity || 0));

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
        <div className="po-pos-item-card-main">
          <div className="po-pos-item-title">
            <div className="po-pos-item-headline">
              <span className="po-pos-item-row-label">Row {index + 1}</span>
              {isDraft ? <span className="po-pos-item-pill draft">Draft</span> : null}
            </div>
            <strong title={displayName}>{displayName}</strong>
            <div className="po-pos-item-meta">
              <span>
                {enteredQuantity} {displayUom}
              </span>
            </div>
          </div>
          <div className="po-pos-item-side">
            <strong>{formatCurrency(line.totalAmount || 0)}</strong>
            <button
              type="button"
              className="po-pos-remove-btn"
              aria-label={`Remove row ${index + 1}`}
              onClick={(event) => {
                event.stopPropagation();
                onRemoveItem(index);
              }}
            >
              <X size={14} />
            </button>
          </div>
        </div>
      </div>
    );
  },
  (prevProps, nextProps) =>
    prevProps.index === nextProps.index &&
    prevProps.row === nextProps.row &&
    prevProps.activeItemIndex === nextProps.activeItemIndex &&
    prevProps.rowDiagnostics.rateChangeLabel === nextProps.rowDiagnostics.rateChangeLabel &&
    prevProps.rowDiagnostics.rateChangeTone === nextProps.rowDiagnostics.rateChangeTone &&
    prevProps.rowDiagnostics.rateWarningMessage === nextProps.rowDiagnostics.rateWarningMessage &&
    prevProps.rowDiagnostics.rateAcknowledgementMessage ===
      nextProps.rowDiagnostics.rateAcknowledgementMessage &&
    prevProps.rowDiagnostics.rateAcknowledgedLabel ===
      nextProps.rowDiagnostics.rateAcknowledgedLabel &&
    prevProps.rowDiagnostics.discountAppliedLabel ===
      nextProps.rowDiagnostics.discountAppliedLabel &&
    prevProps.rowDiagnostics.discountWarningMessage ===
      nextProps.rowDiagnostics.discountWarningMessage &&
    prevProps.rowDiagnostics.discountAcknowledgementMessage ===
      nextProps.rowDiagnostics.discountAcknowledgementMessage &&
    prevProps.rowDiagnostics.discountAcknowledgedLabel ===
      nextProps.rowDiagnostics.discountAcknowledgedLabel &&
    prevProps.rowDiagnostics.discountBlockingMessage ===
      nextProps.rowDiagnostics.discountBlockingMessage &&
    prevProps.rowDiagnostics.duplicateMessage === nextProps.rowDiagnostics.duplicateMessage
);

PurchaseOrderPosListCard.displayName = 'PurchaseOrderPosListCard';

const PurchaseOrderPosList = ({
  rows,
  activeItemIndex,
  draftDiagnostics,
  onSelectItem,
  onRemoveItem,
}) => {
  const normalizedRows = Array.isArray(rows) ? rows : [];
  const visibleIndexes = normalizedRows
    .reduce((indexes, row, index, source) => {
      const item = row?.item || {};
      if (index === activeItemIndex || hasMeaningfulPoItem(item) || source.length === 1) {
        indexes.push(index);
      }
      return indexes;
    }, [])
    .reverse();

  return (
    <section className="po-pos-panel po-pos-items-panel">
      <div className="po-pos-panel-header">
        <div>
          <h4>
            {visibleIndexes.length} row{visibleIndexes.length === 1 ? '' : 's'}
          </h4>
          <p className="po-pos-panel-note">Select row to edit</p>
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
              activeItemIndex={activeItemIndex}
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
