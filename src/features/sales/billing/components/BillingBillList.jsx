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
        <p className="billing-panel-kicker">Live Bill</p>
        <h2>Latest Item On Top</h2>
        <p className="billing-panel-copy">
          Click a row to edit inline. Delete removes only that line.
        </p>
      </div>
      {lastRemovedItem ? (
        <button
          type="button"
          className="billing-secondary-btn"
          onClick={onUndoLastRemoval}
        >
          <RotateCcw size={16} />
          Undo Last
        </button>
      ) : null}
    </div>

    {billItems.length === 0 ? (
      <div className="billing-empty-state">
        <strong>No items added yet.</strong>
        <p>Use the left panel to scan or search products and add them one by one.</p>
      </div>
    ) : (
      <div className="billing-bill-list" role="list" aria-label="Live bill items">
        {billItems.map((item, index) => {
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
                        Editing
                      </span>
                    ) : null}
                    {item.id === latestAddedItemId ? (
                      <span className="billing-line-tag latest">Latest</span>
                    ) : null}
                    {item.isCustomItem ? (
                      <span className="billing-line-tag custom">Custom</span>
                    ) : null}
                    {item.stockWarning ? (
                      <span className={`billing-line-tag ${item.stockWarning.tone === 'danger' ? 'danger' : 'warning'}`}>
                        {item.stockWarning.text}
                      </span>
                    ) : null}
                    {item.isManualPrice ? (
                      <span className="billing-line-tag manual">Manual Price</span>
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
                  {item.qty} {item.unit} x {formatCurrency(item.price)} / {item.priceUnit} =
                </span>
                <strong>{formatCurrency(item.amount)}</strong>
              </div>

              {(Number(item.disc || 0) > 0 || item.profitValue !== null) ? (
                <div className="billing-bill-item-meta">
                  {Number(item.disc || 0) > 0 ? (
                    <span>
                      Discount: {formatCurrency(item.disc)}
                    </span>
                  ) : null}
                  {item.profitValue !== null ? (
                    <span className={item.profitValue >= 0 ? 'profit' : 'loss'}>
                      Profit: {formatCurrency(item.profitValue)}
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
