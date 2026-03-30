# Backend Route Inventory

Audit snapshot: March 28, 2026.

This file is the backend route source of truth for the current architecture.

See also:

- [AGENTS.md](AGENTS.md)
- [ARCHITECTURE.md](ARCHITECTURE.md)
- [ERROR_HANDLING.md](ERROR_HANDLING.md)
- [docs/routing.md](docs/routing.md)
- [docs/api-contract.md](docs/api-contract.md)

- Backend routes live under `server/`, not `src/`.
- The current backend does not have a dedicated `server/controllers/` tree.
- Frontend API wrappers under `src/shared/services/api/*.js` are consumers of this file, not a separate authority.
- In this repo, route ownership is split between:
  - leaf route modules under `server/features/**/routes/**`
  - named helper/service functions called from those route modules
- The live Express app mounted `173` non-static business/API routes in the audited runtime.
- That count excludes the global `OPTIONS *` handler and the four conditional profile-upload redirect routes documented below when `profileImagePublicBaseUrl` is configured.
- Exact duplicate `METHOD + path` registrations were not found.

## Registration Graph

Top-level route registration flows through these files:

- `server/appFactory.js`
- `server/appFactory/registerFeatures/index.js`
- `server/core/bootstrap/features.js`
- `server/core/bootstrap/featureRegistrars/*.js`
- `server/features/auth/authRoutes.js`
- `server/features/auth/userRoutes.js`
- `server/features/catalog/productRoutes.js`
- `server/features/sales/orderRoutes.js`
- `server/features/sales/billingRoutes.js`
- `server/features/credits/recommendationCreditRoutes.js`
- `server/features/communication/communicationRoutes.js`
- `server/features/commerce/distributorRoutes.js`
- `server/features/commerce/commerceRoutes.js`

Feature-level route aggregators that fan into leaf modules:

- Auth:
  - `server/features/auth/routes/otpRoutes.js`
  - `server/features/auth/routes/emailVerificationRoutes.js`
  - `server/features/auth/routes/phoneChangeAdminRoutes.js`
  - `server/features/auth/routes/contactVerificationAdminRoutes.js`
  - `server/features/auth/routes/userCrudRoutes.js`
- Catalog:
  - `server/features/catalog/routes/productSearchRoutes.js`
  - `server/features/catalog/routes/productAdminRoutes.js`
  - `server/features/catalog/routes/productImportRoutes.js`
  - `server/features/catalog/routes/categoryRoutes.js`
  - `server/features/catalog/routes/productSearch/index.js`
  - `server/features/catalog/routes/productAdmin/index.js`
  - `server/features/catalog/routes/productImport/index.js`
  - `server/features/catalog/routes/category/index.js`
- Sales:
  - `server/features/sales/routes/orderQueryRoutes.js`
- Credits:
  - `server/features/credits/routes/creditIssuesRoutes.js`
  - `server/features/credits/routes/creditLedgerRoutes.js`
  - `server/features/credits/routes/creditLedger/creditLedgerAdjustments.js`
- Commerce:
  - `server/features/commerce/routes/purchaseOrdersRoutes.js`
  - `server/features/commerce/routes/purchaseOrders/purchaseOrdersList.js`
  - `server/features/commerce/routes/purchaseOrders/purchaseOrdersDetails.js`
  - `server/features/commerce/routes/purchaseReturnsRoutes.js`
  - `server/features/commerce/routes/purchaseReturns/index.js`
  - `server/features/commerce/routes/insightsRoutes.js`
  - `server/features/commerce/routes/insights/productInsights.js`

## Handler Families

These helper trees act as the practical controller layer for complex routes:

- `server/features/sales/routes/orderQueries/orderAdminQueries.js`
- `server/features/sales/routes/orderStatus/*`
- `server/features/sales/routes/billingCreate/*`
- `server/features/commerce/routes/purchaseOrders/listCreate/*`
- `server/features/commerce/routes/purchaseOrders/confirm/*`
- `server/features/commerce/routes/purchaseOrders/receive/*`
- `server/features/commerce/routes/purchaseOrders/purchaseOrdersCancel.js`
- `server/features/commerce/routes/purchaseOrders/purchaseOrdersClose.js`
- `server/features/commerce/routes/purchaseOrders/purchaseOrdersConfirm.js`
- `server/features/commerce/routes/insights/productInsights/*`
- `server/features/commerce/routes/insights/productDetail/*`
- `server/features/communication/routes/messageToCustomer/*`
- `server/features/credits/routes/creditIssues/admin/*`
- `server/features/credits/routes/creditLedger/adjustments/creditEntryImageStorage.js`

## Compatibility And Alias Notes

- `POST /api/orders` is intentionally disabled and returns `410`; the supported create route is `POST /api/orders/create-validated`.
- Password-auth endpoints are intentionally mounted and return `410`:
  - `POST /api/auth/login`
  - `POST /api/auth/register`
  - `POST /api/auth/change-password`
  - `POST /api/auth/request-password-reset`
  - `POST /api/auth/password/recovery/complete`
  - `POST /api/auth/reset-password/otp/verify`
  - `POST /api/auth/reset-password/otp/complete`
- Admin password-reset management endpoints are also compatibility stubs returning `410`:
  - `GET /api/admin/password-reset-requests`
  - `PUT /api/admin/password-reset-requests/:id`
- These internal automation endpoints currently expose both `GET` and `POST`:
  - `/api/internal/phone-change/process`
  - `/api/internal/credits/payment-intelligence/run`
  - `/api/internal/purchase-operations/analytics/run`
  - `/api/internal/purchase-operations/notifications/run`
- Distributor ledger endpoints expose intentional aliases:
  - `GET|POST /api/distributor-ledger`
  - `GET|POST /api/distributors/ledger`
  - `GET|POST /api/distributors/:id/ledger`
  - `POST /api/distributors/:id/transactions`
  - `POST /api/distributors/:id/credit`
  - `GET /api/distributors/:id/credit-history`
- Catalog and insight endpoints with `:id(\d+)` are mounted with numeric-only Express param constraints and are documented exactly as implemented.

## Base And System Routes

- `server/core/httpSetup.js`
  - `GET /`
  - `app.use('/uploads', express.static(UPLOADS_DIR))`
  - `app.use('/api/uploads', express.static(UPLOADS_DIR))`
  - Conditional when `profileImagePublicBaseUrl` is configured:
    - `GET /uploads/profiles/:file`
    - `HEAD /uploads/profiles/:file`
    - `GET /api/uploads/profiles/:file`
    - `HEAD /api/uploads/profiles/:file`

## Auth

- `server/features/auth/routes/otp/otpRequestRoutes.js`
  - `POST /api/auth/otp/request`
- `server/features/auth/routes/otp/otpVerifyRoutes.js`
  - `POST /api/auth/otp/verify`
- `server/features/auth/routes/otp/passwordDisabledRoutes.js`
  - `POST /api/auth/login`
  - `POST /api/auth/register`
  - `POST /api/auth/change-password`
  - `POST /api/auth/request-password-reset`
  - `POST /api/auth/password/recovery/complete`
  - `POST /api/auth/reset-password/otp/verify`
  - `POST /api/auth/reset-password/otp/complete`
- `server/features/auth/routes/sessionRoutes.js`
  - `GET /api/auth/session`
- `server/features/auth/routes/resetModeRoutes.js`
  - `GET /api/auth/reset-mode`
- `server/features/auth/routes/emailVerification/requestRoutes.js`
  - `POST /api/auth/email/verification/request`
- `server/features/auth/routes/emailVerification/requestSelfRoutes.js`
  - `POST /api/auth/email/verification/request-self`
- `server/features/auth/routes/emailVerification/confirmRoutes.js`
  - `POST /api/auth/email/verification/confirm`
- `server/features/auth/routes/emailVerification/statusRoutes.js`
  - `GET /api/auth/email/verification/status`
- `server/features/auth/routes/contactVerificationRoutes.js`
  - `GET /api/auth/contact-verification/status`
  - `POST /api/auth/phone/verification/request-self`
- `server/features/auth/routes/phoneVerificationRoutes.js`
  - `POST /api/auth/phone/verification/request`
  - `POST /api/auth/phone/verification/confirm`
  - `GET /api/auth/phone/verification/status`
- `server/features/auth/routes/phoneChangeRoutes.js`
  - `GET /api/auth/phone-change-request/status`
  - `POST /api/auth/phone-change-request/cancel`
  - `GET /api/internal/phone-change/process`
  - `POST /api/internal/phone-change/process`
- `server/features/auth/routes/contactVerificationAdmin/listRoutes.js`
  - `GET /api/admin/contact-verification-requests`
- `server/features/auth/routes/contactVerificationAdmin/approveRoutes.js`
  - `POST /api/admin/contact-verification-requests/:id/approve-send`
- `server/features/auth/routes/contactVerificationAdmin/rejectRoutes.js`
  - `POST /api/admin/contact-verification-requests/:id/reject`
- `server/features/auth/routes/phoneChangeAdmin/listRoutes.js`
  - `GET /api/admin/phone-change-requests`
- `server/features/auth/routes/phoneChangeAdmin/approveRoutes.js`
  - `POST /api/admin/phone-change-requests/:id/approve`
- `server/features/auth/routes/phoneChangeAdmin/rejectRoutes.js`
  - `POST /api/admin/phone-change-requests/:id/reject`
- `server/features/auth/routes/userVerificationAdminRoutes.js`
  - `POST /api/admin/users/:id/email/verify`
  - `POST /api/admin/users/:id/phone/verify`
  - `GET /api/admin/password-reset-requests`
  - `PUT /api/admin/password-reset-requests/:id`

## Users And Customers

- `server/features/auth/routes/userCrud/userAdminList.js`
  - `GET /api/users`
- `server/features/auth/routes/userCrud/userRoleActions.js`
  - `POST /api/users`
  - `DELETE /api/users/:id`
- `server/features/auth/routes/userCrud/userProfileUpdates.js`
  - `GET /api/users/:id`
  - `PUT /api/users/:id`
  - `POST /api/users/:id/profile-image`
- `server/features/auth/routes/customerRoutes.js`
  - `GET /api/customers`
  - `GET /api/customers/search`
  - `GET /api/customers/:id/profile`
- `server/features/auth/routes/customerValidationRoutes.js`
  - `POST /api/orders/validate-customer`

## Catalog

- `server/features/catalog/routes/productSearch/listRoutes.js`
  - `GET /api/products`
- `server/features/catalog/routes/productSearch/detailRoutes.js`
  - `GET /api/products/:id(\d+)`
- `server/features/catalog/routes/productSearch/categoryRoutes.js`
  - `GET /api/products/category/:category`
- `server/features/catalog/routes/productSearch/suggestRoutes.js`
  - `GET /api/products/suggest`
- `server/features/catalog/routes/productSearch/recentlyBoughtRoutes.js`
  - `GET /api/products/recently-bought`
- `server/features/catalog/routes/productSearch/lastPurchaseRoutes.js`
  - `GET /api/products/:id(\d+)/last-purchase`
- `server/features/catalog/routes/productSearch/imageSearchRoutes.js`
  - `GET /api/products/image-search`
- `server/features/catalog/routes/productAdmin/createRoutes.js`
  - `POST /api/products`
- `server/features/catalog/routes/productAdmin/updateRoutes.js`
  - `PUT /api/products/:id(\d+)`
- `server/features/catalog/routes/productAdmin/deleteRoutes.js`
  - `DELETE /api/products/:id(\d+)`
  - `DELETE /api/products/:id(\d+)/permanent`
- `server/features/catalog/routes/productAdmin/categoryRoutes.js`
  - `PATCH /api/products/:id(\d+)/category`
- `server/features/catalog/routes/productImport/templateRoutes.js`
  - `GET /api/products/template`
- `server/features/catalog/routes/productImport/previewRoutes.js`
  - `POST /api/products/import/preview`
- `server/features/catalog/routes/productImport/exportRoutes.js`
  - `GET /api/products/export`
- `server/features/catalog/routes/productImport/confirmRoutes.js`
  - `POST /api/products/import/confirm`
- `server/features/catalog/routes/category/listRoutes.js`
  - `GET /api/categories`
  - `GET /api/categories/tree`
- `server/features/catalog/routes/category/detailRoutes.js`
  - `GET /api/categories/:id(\d+)`
- `server/features/catalog/routes/category/createRoutes.js`
  - `POST /api/categories`
- `server/features/catalog/routes/category/updateRoutes.js`
  - `PUT /api/categories/:id(\d+)`
- `server/features/catalog/routes/category/deleteRoutes.js`
  - `DELETE /api/categories/:id(\d+)`
- `server/features/catalog/routes/category/moveRoutes.js`
  - `POST /api/categories/:id(\d+)/move`
- `server/features/catalog/routes/category/productsRoutes.js`
  - `GET /api/categories/:id(\d+)/products`

## Sales: Orders And Billing

- `server/features/sales/routes/orderListRoutes.js`
  - `GET /api/orders`
- `server/features/sales/routes/orderQueries/orderUserQueries.js`
  - `GET /api/orders/:id`
  - `GET /api/orders/:id/history`
  - `GET /api/orders/number/:orderNumber`
  - `GET /api/users/:userId/orders`
- `server/features/sales/routes/orderCreateRoutes.js`
  - `POST /api/orders`
  - `POST /api/orders/create-validated`
  - Handler note: `create-validated` delegates the business flow to `placeOrder` from `server/features/sales/orderPlacement.js`.
- `server/features/sales/routes/orderStatusRoutes.js`
  - `PUT /api/orders/:id/status`
- `server/features/sales/routes/orderStatsRoutes.js`
  - `GET /api/stats/orders`
- `server/features/sales/routes/billingUserRoutes.js`
  - `GET /api/users/:userId/bills`
  - `GET /api/users/:userId/bills/:identifier`
- `server/features/sales/routes/billingSearchRoutes.js`
  - `GET /api/billing/customers/search`
  - `GET /api/billing/products/search`
- `server/features/sales/routes/billingCreateRoutes.js`
  - `POST /api/bills/create`
  - Handler note: delegates the multi-step bill creation flow to `server/features/sales/routes/billingCreate/*`.
- `server/features/sales/routes/billingAdminRoutes.js`
  - `GET /api/bills`
  - `GET /api/bills/:id`
  - `DELETE /api/bills/:id`
  - `PUT /api/bills/:id/payment`
  - `GET /api/bills/stats/summary`

## Credits And Recommendations

- `server/features/credits/routes/recommendationsRoutes.js`
  - `POST /api/product-recommendations`
  - `GET /api/product-recommendations/mine`
  - `GET /api/admin/product-recommendations`
  - `PUT /api/admin/product-recommendations/:id`
- `server/features/credits/routes/creditIssues/creditIssuesActions.js`
  - `POST /api/users/:userId/credit-issues`
  - `POST /api/users/:userId/credit-issues/:id/respond`
- `server/features/credits/routes/creditIssues/creditIssuesList.js`
  - `GET /api/users/:userId/credit-history`
    - Query params: `limit` (page size, max 500), `cursor` (pagination cursor), `all=true` (return full history)
  - `GET /api/users/:userId/payment-badges`
  - `GET /api/users/:userId/credit-issues`
- `server/features/credits/routes/creditIssues/creditIssuesAdmin.js`
  - `GET /api/admin/credit-issues`
  - `PUT /api/admin/credit-issues/:id`
  - Handler note: delegates admin work to `server/features/credits/routes/creditIssues/admin/listIssues.js` and `resolveIssue.js`.
- `server/features/credits/routes/creditLedger/creditLedgerReports.js`
  - `POST /api/credit/check-limit`
  - `GET /api/credit/aging`
- `server/features/credits/routes/creditLedger/creditLedgerWhatsAppLogs.js`
  - `POST /api/credit/whatsapp/launch-log`
- `server/features/credits/routes/creditLedger/creditPaymentIntelligenceJob.js`
  - `GET /api/internal/credits/payment-intelligence/run`
  - `POST /api/internal/credits/payment-intelligence/run`
- `server/features/credits/routes/creditLedger/creditLedgerList.js`
  - `GET /api/users/:userId/credit-balance`
  - `GET /api/credit/ledger`
- `server/features/credits/routes/creditLedger/adjustments/createRoutes.js`
  - `POST /api/users/:userId/credit`
- `server/features/credits/routes/creditLedger/adjustments/updateRoutes.js`
  - `PUT /api/users/:userId/credit/:entryId`
- `server/features/credits/routes/creditLedger/adjustments/deleteRoutes.js`
  - `DELETE /api/users/:userId/credit/:entryId`

## Communication And Notifications

- `server/features/communication/routes/notifyRoutes.js`
  - `POST /api/notify-order/:orderId`
- `server/features/communication/routes/mediaProxyRoutes.js`
  - `GET /api/media/proxy`
- `server/features/communication/routes/analyticsRoutes.js`
  - `POST /api/analytics/session/start`
  - `POST /api/analytics/session/heartbeat`
  - `GET /api/admin/analytics/summary`
- `server/features/communication/routes/adminNotificationRoutes.js`
  - `POST /api/admin/notifications/email/prepare`
  - `POST /api/admin/notifications/whatsapp/prepare`
  - `POST /api/admin/notifications/:id/mark-sent`
- `server/features/communication/routes/userNotificationRoutes.js`
  - `GET /api/notifications/me`
  - `GET /api/notifications/me/unread-count`
  - `POST /api/notifications/:id/read`
  - `POST /api/notifications/read-all`
- `server/features/communication/routes/notificationPurgeRoutes.js`
  - `POST /api/internal/notifications/purge`
- `server/features/communication/routes/purchaseOperationNotificationRoutes.js`
  - `GET /api/internal/purchase-operations/notifications/run`
  - `POST /api/internal/purchase-operations/notifications/run`
- `server/features/communication/routes/messageRecipientRoutes.js`
  - `GET /api/notifications/message-recipients`
- `server/features/communication/routes/messageToAdminRoutes.js`
  - `POST /api/notifications/messages/to-admin`
- `server/features/communication/routes/messageToCustomerRoutes.js`
  - `POST /api/notifications/messages/to-customers`
  - Handler note: request parsing, batching, recipient resolution, and notification helpers live in `server/features/communication/routes/messageToCustomer/*`.

## Commerce: Distributors, Purchasing, Stock, Offers, Insights

- `server/features/commerce/distributorRoutes.js`
  - `GET /api/distributors`
  - `GET /api/distributors/:id`
  - `POST /api/distributors`
  - `PUT /api/distributors/:id`
  - `DELETE /api/distributors/:id`
  - `GET /api/distributor-ledger`
  - `GET /api/distributors/ledger`
  - `GET /api/distributors/:id/ledger`
  - `GET /api/distributors/:id/credit-history`
  - `POST /api/distributor-ledger`
  - `POST /api/distributors/ledger`
  - `POST /api/distributors/:id/ledger`
  - `POST /api/distributors/:id/transactions`
  - `POST /api/distributors/:id/credit`
- `server/features/commerce/routes/insights/productInsightsList.js`
  - `GET /api/insights/products`
- `server/features/commerce/routes/insights/productInsightsDetail.js`
  - `GET /api/insights/products/:id(\d+)`
- `server/features/commerce/routes/insights/distributorInsights.js`
  - `GET /api/insights/distributors`
  - `GET /api/insights/distributors/:id(\d+)/products`
- `server/features/commerce/routes/insights/supplierInsights.js`
  - `GET /api/products/:id(\d+)/suppliers`
- `server/features/commerce/routes/purchaseOperationsRoutes.js`
  - `GET /api/purchase-operations/summary`
  - `GET /api/internal/purchase-operations/analytics/run`
  - `POST /api/internal/purchase-operations/analytics/run`
  - Handler note: delegates response ownership to `handlePurchaseOperationsSummary` from `server/services/purchaseOperations/summary.js`.
- `server/features/commerce/routes/purchaseOrders/purchaseOrdersListRead.js`
  - `GET /api/purchase-orders`
- `server/features/commerce/routes/purchaseOrders/purchaseOrdersListCreate.js`
  - `POST /api/purchase-orders`
  - Handler note: delegates validation, idempotency, transaction creation, and audit logging to `server/features/commerce/routes/purchaseOrders/listCreate/*`.
- `server/features/commerce/routes/purchaseOrders/purchaseOrdersRead.js`
  - `GET /api/purchase-orders/:id`
- `server/features/commerce/routes/purchaseOrders/purchaseOrdersEdit.js`
  - `PUT /api/purchase-orders/:id`
- `server/features/commerce/routes/purchaseOrders/purchaseOrdersDelete.js`
  - `DELETE /api/purchase-orders/:id`
- `server/features/commerce/routes/purchaseOrders/purchaseOrdersStatus.js`
  - `PUT /api/purchase-orders/:id/status`
  - Handler note: dispatches to confirm/cancel/close helpers in the same route subtree.
- `server/features/commerce/routes/purchaseOrders/purchaseOrdersPayments.js`
  - `POST /api/purchase-orders/:id/payments`
- `server/features/commerce/routes/purchaseOrders/purchaseOrdersReceive.js`
  - `POST /api/purchase-orders/:id/receive`
- `server/features/commerce/routes/purchaseOrders/purchaseOrdersWhatsApp.js`
  - `POST /api/purchase-orders/:id/distributor-whatsapp`
- `server/features/commerce/routes/purchaseReturns/listRoutes.js`
  - `GET /api/purchase-returns`
- `server/features/commerce/routes/purchaseReturns/detailRoutes.js`
  - `GET /api/purchase-returns/:id`
- `server/features/commerce/routes/purchaseReturns/createRoutes.js`
  - `POST /api/purchase-returns`
- `server/features/commerce/routes/purchaseReturns/updateRoutes.js`
  - `PUT /api/purchase-returns/:id`
- `server/features/commerce/routes/purchaseReturns/deleteRoutes.js`
  - `DELETE /api/purchase-returns/:id`
- `server/features/commerce/routes/stockRoutes.js`
  - `GET /api/stock-ledger`
  - `GET /api/stock-ledger/product/:productId`
  - `GET /api/stock-ledger/batch/:batchNumber`
  - `GET /api/stock-ledger/summary`
  - `POST /api/stock/verify`
- `server/features/commerce/routes/offersRoutes.js`
  - `GET /api/offers`
  - `POST /api/offers/preview`
  - `POST /api/offers`
  - `PUT /api/offers/:id`
  - `DELETE /api/offers/:id`

## Audit Findings Embedded In The Inventory

- Every mounted route resolved to a real inline handler or delegated helper function.
- The backend does not implement the requested `route file -> controller file` pairing pattern; it uses feature route modules plus same-feature helpers/services instead.
- The old README API reference is materially incomplete and includes invalid placeholder endpoints. Treat this file, not `README.md`, as the authoritative route list.
