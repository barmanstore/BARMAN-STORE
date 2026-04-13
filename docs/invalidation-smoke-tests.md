# Invalidation Smoke Tests

Use these four checks after any change to product, purchase-order, ledger, or stock refresh wiring.

## Product

- Create a product in admin.
- Open the PO entry modal without refreshing the page.
- Confirm the new product appears in the combobox/search results immediately.

## Purchase Order -> Stock

- Mark a purchase order as received or processed.
- Open the restock dashboard without refreshing.
- Confirm the stock quantities and mismatch indicators reflect the change immediately.

## Purchase Order -> Ledger

- Record a supplier payment.
- Open Credit Khata without refreshing.
- Confirm the balance and payment history reflect the payment immediately.

## Full PO Fan-out

- Process a purchase order to its final status.
- Check the product list, Credit Khata, and restock dashboard in one session.
- Confirm product stock, ledger balance, and restock data all update from the same action without a manual reload.
