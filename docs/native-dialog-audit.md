# Native Dialog Audit

Inventory of remaining `alert`, `confirm`, and `prompt` usage after the billing viewer cleanup.
Priority is based on user impact, security surface, and whether raw error text is exposed.

| File                                                                       | Dialog Type | Context                                                        | Priority |
| -------------------------------------------------------------------------- | ----------- | -------------------------------------------------------------- | -------- |
| `src/features/sales/billing/hooks/useBillingCreateBill.js`                 | `alert`     | Billing flow success/error notices                             | Medium   |
| `src/features/sales/billing/BillingTab.jsx`                                | `alert`     | Billing UI notifications (copy/share/WhatsApp/customer create) | Medium   |
| `src/features/commerce/purchase/hooks/usePurchaseStatusHandlers.js`        | `alert`     | Purchase status handlers (error notices)                       | High     |
| `src/features/commerce/purchase/hooks/usePurchaseStatusHandlers.js`        | `confirm`   | Purchase order delete confirmation                             | High     |
| `src/features/commerce/purchase/hooks/usePurchaseManagementController.js`  | `confirm`   | Discard draft confirmation                                     | Medium   |
| `src/features/credits/history/hooks/useCreditHistoryTransactions.js`       | `confirm`   | Credit ledger reversal confirmation                            | Medium   |
| `src/features/admin/hooks/useAdminUserActions.js`                          | `confirm`   | Admin delete customer confirmation                             | Medium   |
| `src/features/admin/hooks/useAdminQuickProductActions.js`                  | `confirm`   | Admin quick-add error override (raw error text)                | High     |
| `src/features/admin/hooks/useAdminQuickProductActions.js`                  | `confirm`   | Admin quick-update error override (raw error text)             | High     |
| `src/features/admin/hooks/useAdminProductTable.js`                         | `confirm`   | Admin product edit override (raw error text)                   | High     |
| `src/features/admin/hooks/useAdminProductHandlers.js`                      | `confirm`   | Admin mark product inactive                                    | Medium   |
| `src/features/admin/hooks/useAdminProductHandlers.js`                      | `prompt`    | Admin permanent delete confirmation (freeform prompt)          | High     |
| `src/features/admin/hooks/useAdminOrderActions.js`                         | `confirm`   | Admin order received confirmation                              | Medium   |
| `src/features/admin/hooks/useAdminOrderActions.js`                         | `confirm`   | Admin receive-then-bill confirmation                           | Medium   |
| `src/features/catalog/categories/hooks/useCategoryManagementController.js` | `confirm`   | Category delete confirmation                                   | Medium   |
| `src/features/catalog/products/components/form/ProductForm.jsx`            | `confirm`   | Product save override (raw error text)                         | High     |
| `src/features/customerRequests/hooks/useCustomerRequestActions.js`         | `prompt`    | Admin note prompts                                             | Medium   |
| `src/features/customerRequests/hooks/useCustomerRequestActions.js`         | `prompt`    | Admin approval/rejection prompts                               | Medium   |
| `src/features/distributors/DistributorManagement.jsx`                      | `confirm`   | Distributor delete confirmation                                | Medium   |
| `src/features/marketing/OfferManagement.jsx`                               | `confirm`   | Offer delete confirmation                                      | Medium   |
