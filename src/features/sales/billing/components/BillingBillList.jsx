import React, { memo } from 'react';
import { RotateCcw } from 'lucide-react';
import BillingBillItemRow from './BillingBillItemRow';

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
        {billItems.map((item, index) => (
          <BillingBillItemRow
            key={item.id}
            item={item}
            index={index}
            editIndex={editIndex}
            selectedBillIndex={selectedBillIndex}
            latestAddedItemId={latestAddedItemId}
            onSelectItem={onSelectItem}
            onDeleteItem={onDeleteItem}
          />
        ))}
      </div>
    )}
  </section>
);

export default memo(BillingBillList);
