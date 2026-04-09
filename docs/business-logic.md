# Business Logic

See also: [../ROUTES.md](../ROUTES.md), [validation.md](validation.md), [api-contract.md](api-contract.md)

## Auth

- OTP and verification flows are the active auth model:
  - [server/features/auth/routes/otp/otpRequestRoutes.js](../server/features/auth/routes/otp/otpRequestRoutes.js)
  - [server/features/auth/routes/otp/otpVerifyRoutes.js](../server/features/auth/routes/otp/otpVerifyRoutes.js)
- Password-auth routes are compatibility stubs and intentionally return `410` from [server/features/auth/routes/otp/passwordDisabledRoutes.js](../server/features/auth/routes/otp/passwordDisabledRoutes.js). They return JSON telling callers to use OTP or OAuth login, so clients should treat them as permanently disabled compatibility surfaces, not a fallback path to revive.

## User Management

- Admin user-management state rules are documented in [user-management-state-contract.md](user-management-state-contract.md).
- Manual customer credit limits are admin-managed through [server/features/auth/routes/userCrud/userRoleActions.js](../server/features/auth/routes/userCrud/userRoleActions.js) and [server/features/auth/routes/userCrud/profile/profileUpdateFlow.js](../server/features/auth/routes/userCrud/profile/profileUpdateFlow.js). A `credit_limit` of `0` means no enforced limit, so blank admin input must be treated as unrestricted credit.
- Pending phone updates are reviewed through the dedicated admin phone-change queue in [server/features/auth/routes/phoneChangeAdmin/listRoutes.js](../server/features/auth/routes/phoneChangeAdmin/listRoutes.js); they are not part of the base `/api/users` list payload today.

## Orders

- Supported order creation is `POST /api/orders/create-validated`, not the legacy `POST /api/orders`.
- Legacy `POST /api/orders` remains mounted only as a `410` compatibility stub in [server/features/sales/routes/orderCreateRoutes.js](../server/features/sales/routes/orderCreateRoutes.js). Older clients must migrate to `POST /api/orders/create-validated`.
- The shopping cart is a frontend draft, not a backend resource. This is the current architecture boundary, not a missing `/api/cart` implementation. Checkout and order validation begin only at the documented order endpoints; there is no live `/api/cart` backend API.
- Customer profile completeness is enforced before order placement by [server/utils/customerValidation.js](../server/utils/customerValidation.js) and [server/features/sales/routes/orderCreateRoutes.js](../server/features/sales/routes/orderCreateRoutes.js).
- Core placement logic lives in [server/features/sales/orderPlacement.js](../server/features/sales/orderPlacement.js).

## Daily Cash

- Bill-derived daily sales totals remain derived from `bills`; the new daily cash tally must not fabricate or rewrite sales bills just to match counted cash.
- [server/features/communication/routes/analyticsRoutes.js](../server/features/communication/routes/analyticsRoutes.js) now stores a separate `daily_cash_tallies` record per day for the admin-entered counted cash figure and uses it only for admin cash-picture views.
- The manual tally is operational state, not financial ledger state. It adjusts the admin cash picture and variance against billed cash, but it must not change revenue, credit-issued totals, or bill history.

## Purchase Operations

- Purchase-order lifecycle constants live in [server/features/purchase/purchaseConstants.js](../server/features/purchase/purchaseConstants.js).
- Frontend purchase screens normalize the same lifecycle states in [src/features/commerce/purchase/utils/orders.js](../src/features/commerce/purchase/utils/orders.js).
- The current repo guardrail is lifecycle smoke coverage in [scripts/test-po-lifecycle-flow.mjs](../scripts/test-po-lifecycle-flow.mjs) via `npm run test:po-lifecycle`, but there is no dedicated parity check between these two files. Do not change one side without the other.
- Supplier-linked PO board membership should come from the supplier-owned `suppliers.products_supplied` group, not from ad hoc purchase-history-only inference. The product-board routes may enrich those rows with `supplier_products` metadata and last-purchase context, and the PO edit modal can remove any loaded row when the operator needs to revise the order.
- Saved PO items should persist `row_source` as `supplier` or `manual` so reopened orders, later analysis, and supplier-default lock behavior can distinguish registry-loaded rows from extra-added rows without re-inferring that origin from history.
- Supplier schedules are now owned by `suppliers` (child records under distributors). Purchase-operations planning should read `schedule_type` and `schedule_day` from the supplier, falling back to distributor-level data only for legacy rows without a supplier mapping, and that legacy fallback should prefer `visit_day` over old `order_day` when both exist.
- Distributor admin editing should treat salesperson identity and product-group scope as supplier-owned data. The distributor management UI should not collect distributor-level `salesman_name` or `products_supplied`; supplier-level `products_supplied` stays optional in admin, is backfilled from supplier-specific learned rows and PO history, and should auto-learn new PO items for that supplier on save. Manual supplier-group edits are authoritative for current delivery scope: removing a product from a supplier group must mark that supplier-product registry unavailable until a future saved PO for the same supplier re-learns it. Purchase insight fallback should still prefer aggregated supplier `products_supplied` values before the distributor legacy column.
- Distributor reassignment is allowed only for suppliers that are already non-primary. Admin edit may move a non-primary supplier to another distributor, but a current primary supplier must first hand off primary ownership before its distributor can change.
- Distributor and supplier cleanup should prefer inactive/archive state over hard delete. Hard delete is an exception path only for unused records; distributor delete should be blocked while supplier children or PO history exist, and supplier delete should be blocked while it is primary or still has learned supplier-product state or PO history.
- Supplier novelty alerts in purchase planning are summary-derived operational hints, not a second catalog system. [server/services/purchaseOperations/summaryInsights/distributorInsights.js](../server/services/purchaseOperations/summaryInsights/distributorInsights.js) compares supplier product knowledge against the real `products` catalog plus the recent store purchase-habit window, then the purchase planning UI only renders those flags; do not move that comparison into ad hoc frontend heuristics.
- Purchase visit handling is now supplier-day state, not browser-local planning override state. The routine board still starts from schedule rows, but completion comes from shared summary data: `isHandled = poDone || visitClosed`.
- `poDone` must be derived from the normalized PO lifecycle (`confirmed`, `part_paid`, `fully_paid`, `closed`) on purchase orders anchored to the supplier visit by immutable `planned_order_date`. Payment activity stays display-only for the board and must not hide a visit by itself.
- `visitClosed` is the one explicit manual decision for the routine board. It is persisted in `supplier_visits`, can only be changed for today through the purchase-operations visit routes, and is the only manual alternative to a committed PO for clearing a supplier from today's active list.
- Irregular supplier planning should stay actionable when possible. If an irregular supplier has no clean next-order prediction, the shared purchase-operations summary may still fall back to the best available actionable date from strict due, payment due, inferred due, or current outstanding pressure before treating that supplier as fully unscheduled.
- Manual restock sync is an admin operations tool, not a second stock source. The Products-side restock dashboard keeps counted-stock drafts in the browser only, then `POST /api/stock-ledger/adjustments` applies the live `products.stock` update in `set` mode and writes matching `stock_ledger` `ADJUSTMENT` rows together.
- Stock History remains the audit surface for manual restock sync. Do not add a parallel persisted restock table or a reverse system-to-dashboard sync route just to track or refresh UI drafts.
- Restock distributor visibility must stay product-specific. The dashboard should show suppliers from the product's supplier relationship data, not the full distributor catalog, and successful PO flows should continue teaching missing supplier-product links through the existing purchase-order create/receive logic.
- Restock-to-PO handoff stays inside the purchase feature. The restock workspace may open the existing purchase flow with suggested items and operator-entered PO quantities from the selection controls; if one distributor is selected it may prefill that distributor, and if none is selected it should still open a draft PO with the chosen items instead of blocking the handoff. Handoff payloads may include the selected product's current UOM snapshot so purchase drafts stay aligned even if the purchase lookup cache is briefly stale.

## Offers

- Offer eligibility and pricing are server-side in [server/features/offers/offerEngine.js](../server/features/offers/offerEngine.js).
- Active offers are loaded through [server/features/offers/offerEngine.js](../server/features/offers/offerEngine.js) with a short-lived active-offer cache. Admin offer create, update, and delete flows in [server/features/commerce/routes/offersRoutes.js](../server/features/commerce/routes/offersRoutes.js) invalidate that cache.
- Cart and checkout previews use the shared preview path in [src/shared/hooks/useOfferPricingPreview.js](../src/shared/hooks/useOfferPricingPreview.js), but final pricing is recomputed server-side during [server/features/sales/orderPlacement.js](../server/features/sales/orderPlacement.js) and [server/features/sales/routes/billingCreate/build/buildBillItems.js](../server/features/sales/routes/billingCreate/build/buildBillItems.js). Frontend offer badges are presentation only, and previewed discounts can change if active offers or server-side eligibility context changes before placement or billing.

## Credit

- Credit issue resolution in [server/features/credits/routes/creditIssues/admin/resolveIssue.js](../server/features/credits/routes/creditIssues/admin/resolveIssue.js) can create correction ledger entries and trigger balance recalculation.
- Treat admin issue resolution as a financial workflow, not a UI-only status toggle.
- Credit payment score and aging output now come from the shared payment-intelligence scoring in [server/features/credits/utils/creditBadges.js](../server/features/credits/utils/creditBadges.js), backed by derived period rebuilds in [server/features/credits/utils/paymentIntelligence.js](../server/features/credits/utils/paymentIntelligence.js). Credit-history badges, WhatsApp credit messaging, and the admin aging report must stay aligned to that shared scoring output.
- Critical ledger invariant: every credit ledger entry must store a `due_date` value. For manual credits, if not provided, it is computed once from the entry date plus the customer’s current status window (`Excellent` 7, `Very Good` 15, `Good` 30, `Average` 45, `Needs Attention` 60, `Problem` 90, `Defaulter` 180) unless a positive `credit_terms_days` override exists; it must not be recomputed later during rebuilds or display flows.
- Payment periods are derived from `credit_history` and rebuilt with deterministic FIFO ordering. `customer_payment_periods` is derived operational state and must not be manually edited.
- Stored payment-intelligence snapshots are versioned operational data. If the shared scoring model changes, snapshot reads must rebuild or reject stale rows instead of silently serving old badge/status output.
- FIFO ordering is absolute: `transaction_ts ASC, created_at ASC, id ASC`. `transaction_ts` is required for all entries; no COALESCE fallbacks.
- Credit-history badge reads must reflect the current rebuilt ledger state for the user. Do not add response caching that can serve stale payment-badge or “maintain score by” data after a credit mutation.
- Admin aging reads may use `customer_credit_aging_snapshots` for speed, but they must only trust snapshots built with the current scoring-model version. Missing or stale snapshots should trigger rebuild/init behavior, not misleading admin output.
- Overpayments are allowed and excess amounts are tracked as `unapplied_credit` in the payment-intelligence snapshot, but they must not improve scoring or reduce missed/late metrics.
- The canonical customer-facing “maintain score by” deadline is the active FIFO cycle due date for the oldest unpaid entry. It is derived from that oldest unpaid entry’s start date plus the customer’s current status window, so it can move forward after partial FIFO payments and must not be written back onto old ledger rows.
- Credit-impacting admin mutations in [server/features/credits/routes/creditLedger/adjustments/createRoutes.js](../server/features/credits/routes/creditLedger/adjustments/createRoutes.js), [server/features/credits/routes/creditLedger/adjustments/updateRoutes.js](../server/features/credits/routes/creditLedger/adjustments/updateRoutes.js), [server/features/credits/routes/creditLedger/adjustments/deleteRoutes.js](../server/features/credits/routes/creditLedger/adjustments/deleteRoutes.js), and [server/features/credits/routes/creditIssues/admin/resolveIssue.js](../server/features/credits/routes/creditIssues/admin/resolveIssue.js) rebuild both running balances and payment-intelligence state. The internal rollover route [server/features/credits/routes/creditLedger/creditPaymentIntelligenceJob.js](../server/features/credits/routes/creditLedger/creditPaymentIntelligenceJob.js) exists for overdue and score refresh runs only; it does not replace mutation-time balance recalculation.
- Customers stay `New` (`customer_tag = insufficient_history`) until the first payment cycle is fully judged. Do not expose a placeholder score in UI, WhatsApp, or reports before that first judged cycle.
- The active scoring contract is cycle-based: the oldest unpaid FIFO entry is the active cycle anchor, one failed cycle only downgrades one status step at a time, and the next wider window then starts from that same oldest unpaid entry date.
- The shared status ladder is `Excellent` `7d`, `Very Good` `15d`, `Good` `30d`, `Average` `45d`, `Needs Attention` `60d`, `Problem` `90d`, `Defaulter` `180d`, each with the short shared `3` day grace rule.
- Earlier settlement inside the current cycle still produces a better score than last-day settlement, but customers must not collapse straight to `Defaulter` just because several old ledger rows remain unpaid at once.
- The customer credit-history page may show a monthly statement / bill-style summary for clarity, but that view is derived presentation only. `credit_history`, FIFO settlement, aging, and the shared payment-intelligence output remain the source of truth.
