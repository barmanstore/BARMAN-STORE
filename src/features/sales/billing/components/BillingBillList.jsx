import React, { memo } from 'react';
import { PencilLine, RotateCcw, Trash2 } from 'lucide-react';
import { formatCurrency } from '../../../../shared/utils/formatters';

const BillingBillList = ({
  billItems,
  editIndex,
  selectedBillIndex,
  latestAddedItemId,
  lastRemovedItem,
  onSelectItem,
  onDeleteItem,
  onUndoLastRemoval,
}) => (
  <section className="billing-pos-panel billing-bill-panel">
    <div className="billing-panel-header">
      <div>
        <p className="billing-panel-kicker">Bill</p>
        <h2>Items</h2>
        <p className="billing-panel-copy">Tap a row to edit.</p>
      </div>
      {lastRemovedItem ? (
        <button
          type="button"
          className="billing-secondary-btn"
          onClick={onUndoLastRemoval}
        >
          <RotateCcw size={16} />
          Undo
        </button>
      ) : null}
    </div>

    {billItems.length === 0 ? (
      <div className="billing-empty-state">
        <strong>No items yet.</strong>
        <p>Add an item to start.</p>
      </div>
    ) : (
      <div className="billing-bill-list" role="list" aria-label="Live bill items">
        {billItems.map((item, index) => {
          const displayQty = Number(item?.effectiveQty ?? item?.qty ?? 0);
          return (
            <div
              key={item.id}
              role="button"
              tabIndex={0}
              className={`billing-bill-item${
                index === editIndex ? ' is-editing' : ''
              }${index === selectedBillIndex ? ' is-selected' : ''}${
                item.id === latestAddedItemId ? ' is-latest' : ''
              }`}
              onClick={() => onSelectItem(index)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault();
                  onSelectItem(index);
                }
              }}
            >
              <div className="billing-bill-item-top">
                <div className="billing-bill-item-name">
                  <strong>{item.name}</strong>
                  <div className="billing-bill-item-tags">
                    {index === editIndex ? (
                      <span className="billing-line-tag editing">
                        <PencilLine size={12} />
                        Edit
                      </span>
                    ) : null}
                    {item.isCustomItem ? (
                      <span className="billing-line-tag custom">Custom</span>
                    ) : null}
                    {item.stockWarning ? (
                      <span className={`billing-line-tag ${item.stockWarning.tone === 'danger' ? 'danger' : 'warning'}`}>
                        {item.stockWarning.text}
                      </span>
                    ) : null}
                    {item.appliedOfferLabel ? (
                      <span className="billing-line-tag good">Offer</span>
                    ) : null}
                    {item.isManualPrice ? (
                      <span className="billing-line-tag manual">Manual</span>
                    ) : null}
                  </div>
                </div>
                <button
                  type="button"
                  className="billing-line-delete"
                  aria-label={`Delete ${item.name}`}
                  onClick={(event) => {
                    event.stopPropagation();
                    onDeleteItem(index);
                  }}
                >
                  <Trash2 size={16} />
                </button>
              </div>

              <div className="billing-bill-item-detail">
                <span>
                  {displayQty} {item.unit} x {formatCurrency(item.price)} / {item.priceUnit} =
                </span>
                <strong>{formatCurrency(item.amount)}</strong>
              </div>

              {(Number(item.totalDiscount || item.disc || 0) > 0 || item.isPartialLinkedBilling) ? (
                <div className="billing-bill-item-meta">
                  {Number(item.offerDiscount || 0) > 0 ? (
                    <span>
                      Offer {formatCurrency(item.offerDiscount)}
                    </span>
                  ) : null}
                  {Number(item.manualDiscount || 0) > 0 ? (
                    <span>
                      Disc {formatCurrency(item.manualDiscount)}
                    </span>
                  ) : null}
                  {item.isPartialLinkedBilling ? (
                    <span>
                      Now {displayQty}/{Number(item.requestedQty || item.qty || 0)} {item.unit}
                      {Number(item.linkedPendingQty || 0) > 0 ? ` | Left ${Number(item.linkedPendingQty || 0)}` : ''}
                    </span>
                  ) : null}
                </div>
              ) : null}
            </div>
          );
        })}
      </div>
    )}
  </section>
);

export default memo(BillingBillList);
