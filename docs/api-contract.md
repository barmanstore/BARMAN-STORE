# API Contract

See also: [../ROUTES.md](../ROUTES.md), [routing.md](routing.md), [services.md](services.md), [../ERROR_HANDLING.md](../ERROR_HANDLING.md)

## Transport Rules

- The default API contract is JSON in and JSON out.
- [src/shared/services/api/core.js](../src/shared/services/api/core.js) automatically adds the bearer token from local storage and JSON-encodes object bodies.
- The same wrapper clears the persisted `user` session and dispatches `user-updated` when a protected request returns `401`, so stale-token polling stops quickly instead of looping on unauthorized calls.
- The same wrapper rejects non-JSON success responses, so download or proxy endpoints need custom handling.

## Common Shapes

- Success:
  - `{ success: true, ... }`
  - resource objects or lists for read endpoints
  - manual stock sync returns `{ success: true, sync_batch_id, items: [...] }`
- Error:
  - `{ error: "..." }`
  - optional `message`, `issues`, `details`, `conflict_type`, or `conflict`

## Catalog Notes

- `GET /api/products` now supports the v1 catalog contract with server-side `q`, `category`, `brand`, `status`, `low_stock`, `include_inactive`, `sort_field`, `sort_dir`, `cursor`, `limit`, and legacy `page/page_size`.
- The legacy array response path is now bounded. A plain `/api/products` call returns the default batch, while callers can request a larger capped batch with `limit` up to 500.
- Cursor payloads are versioned and opaque. The server encodes the active `sort_field`, `sort_dir`, `last_value`, and `last_id` into the cursor token.
- Object responses use `{ items, page_info, sort, filters, meta }`, with `page_info` owning `next_cursor`, `prev_cursor`, and `has_more`. `meta.total_count` is optional for cursor mode and present for offset pagination.
- The admin client must treat the server response as authoritative and must not re-sort or re-filter the returned product slice locally.
- The product search path uses the maintained `products.search_text` column so list searches do not depend on runtime string concatenation across product fields.

## Product Bulk Job Notes

- `POST /api/admin/products/bulk-jobs` creates a persisted async bulk job for the admin products surface. Supported v1 operations are `bulk_update` and `import_products`.
- Bulk job creation uses `client_request_id` idempotency. Duplicate submits with the same request id return the existing job instead of creating a second job.
- `GET /api/admin/products/bulk-jobs/:id` returns the persisted job record, including `status`, counters, and the stored request payload.
- `GET /api/admin/products/bulk-jobs/:id/items` paginates job items with cursor-based item navigation instead of returning the full item set at once.
- `POST /api/admin/products/bulk-jobs/:id/cancel` requests graceful cancellation. Running jobs stop before the next chunk; work already completed in the current chunk is kept.
- `POST /api/admin/products/bulk-jobs/:id/retry-failed` creates a follow-up retry job for failed or conflicted rows.

## Product Import And Export Notes

- `POST /api/products/import/preview` still stages and validates import rows before execution. The preview payload includes the normalized row data, row-level action, and the matched product snapshot used for conflict checks.
- `POST /api/products/import/confirm` now enqueues an `import_products` bulk job instead of applying rows in a single transaction. The confirm response returns the created job record and the UI should poll that job for the final result summary.
- `GET /api/products/export` now honors the current catalog filter and sort parameters by default. Full-catalog export is explicit via `mode=all`.

## Admin Analytics Notes

- `GET /api/admin/analytics/summary` now returns visitor/session metrics plus `today_cash_summary`, which keeps current-day billed totals separate from the optional manual cash tally.
- `GET /api/admin/analytics/daily-cash-tally?date=YYYY-MM-DD` returns `{ date, entry }`, where `entry` is `null` until an admin saves a tally for that day.
- `PUT /api/admin/analytics/daily-cash-tally` upserts `{ date, counted_cash_total, note? }` and returns `{ success: true, date, entry, summary }`.

## Cashbook Notes

- `GET /api/admin/cashbook` returns `{ range, today_summary, groups }`, where `groups` are date-descending day blocks containing `entries` with `direction`, `badge_label`, and optional `running_balance` fields. The timeline also includes read-only credit-history rows; credit `payment` rows count in cash flow, while credit `given` / manual-sale rows are informational and can be hidden in the cashbook UI.
- `PUT /api/admin/cashbook/opening-balance` upserts `{ date, opening_balance, note? }` and returns `{ success: true, opening_balance, snapshot }`; `snapshot` may be `null` if the post-save reload cannot be built, but the write still succeeds.
- `POST /api/admin/cashbook/entries` accepts only manual entry types (`manual_in`, `manual_out`, `expense`, `adjustment`, `task`), uses request-id idempotency if `client_request_id` is supplied, and returns `{ success: true, entry, snapshot }`.
- `PUT /api/admin/cashbook/entries/:id` updates a manual cashbook entry and returns `{ success: true, entry, snapshot }`.
- `DELETE /api/admin/cashbook/entries/:id` removes a manual cashbook entry and returns `{ success: true, deleted_entry, snapshot }`. Auto and credit-history rows remain read-only.

## Purchase Operations Notes

- `GET /api/purchase-operations/summary` keeps returning one shared summary payload for dashboard and purchase planning surfaces. The payload now stays backward-compatible for existing summary cards while also returning `supplier_visits`, a supplier-day overlay with `poDone`, `paymentDone`, `visitClosed`, and `isHandled`.
- `GET /api/stock-ledger` and `GET /api/stock-ledger/product/:productId` may include `po_number` for incoming purchase-order rows and `bill_number` for outgoing stock rows tied to bills or bill-backed orders. The history page uses those fields as a secondary line under the product name instead of restoring extra reference columns.
- `POST /api/purchase-operations/visit/close` and `POST /api/purchase-operations/visit/reopen` persist today-only supplier visit decisions. Both return the normalized supplier-day visit row that was written.
- `GET /api/distributors/:id/products` returns the selected supplier's active PO board for PO creation. Board membership is sourced from that supplier's `products_supplied` group, with `supplier_products` used only as metadata/fallback enrichment, and the route rejects a `supplier_id` that does not belong to the distributor.
- `GET /api/suppliers` and `GET /api/distributors/:id/suppliers` expose supplier child records under each distributor, including supplier-owned `products_supplied`; PO entry now selects a supplier first and carries `supplier_id` through saves.
- `GET /api/suppliers/:id/products` returns the supplier-owned PO board sourced from `suppliers.products_supplied`; if that group is blank because the supplier has not been backfilled yet, the backend may temporarily fall back to the supplier registry rows so older environments do not go blank during migration rollout.
- `POST /api/suppliers` and `PUT /api/suppliers/:id` accept optional `products_supplied`; the backend also auto-learns and updates that field from saved PO items for the selected supplier, and the PO client force-refreshes that supplier board after successful save/edit. Manual supplier-group edits also reconcile `supplier_products.is_available`, so removing a product from the group hides it from the active supplier board until a later saved PO for that supplier adds it back.
- `PUT /api/suppliers/:id` may also change `distributor_id` for a supplier that is not currently primary. When that happens, the backend carries the supplier's `supplier_products` registry to the new distributor id as part of the same update.
- `DELETE /api/distributors/:id` is now guarded for safety and returns `400` when supplier children or purchase-order history still exist; normal admin cleanup should use inactive/archive instead of hard delete.
- `DELETE /api/suppliers/:id` is now guarded for safety and returns `400` when the supplier is still the effective primary supplier, has purchase-order history, or still has learned `supplier_products` state; normal admin cleanup should use inactive/archive instead of hard delete.
- `POST /api/purchase-orders` and `PUT /api/purchase-orders/:id` accept `supplier_id`, `planned_order_date`, and return `supplier_name` on reads so the UI can show the correct supplier even when multiple suppliers share one distributor. `planned_order_date` is the visit anchor used by purchase planning; current rollout keeps a temporary backend fallback for older clients, but edit flows must preserve the existing stored anchor instead of recomputing it from delivery-date changes.
- Purchase-order create/update item payloads may include `row_source` (`supplier` or `manual`). The backend persists that item-origin hint on `purchase_order_items`, and PO detail/list reads return it with each item row.
- `PUT /api/purchase-orders/:id/status` with a confirm-style payload (`status=processed`) accepts `delivered` as a boolean. The confirm modal defaults it to `true`, so unchecking the box records a confirmed PO without delivery while preserving the existing bill/payment flow.
- `distributor_insights[*]`, `today_distributors[*]`, `tomorrow_distributors[*]`, and reminder entries may now include `novelty_alerts`, `novelty_summary`, and `has_novelty_alerts` so the UI can flag supplier-linked products that are missing from catalog or outside the recent purchase-habit window without adding a second planning endpoint.
- `POST /api/purchase-orders/:id/distributor-whatsapp` is currently a manual preparation endpoint even though the path keeps the old WhatsApp-send naming. It returns `delivery_scope`, and clients should open `distributor_notice.whatsapp.whatsapp_url` as the launcher flow instead of assuming provider-backed automatic delivery.
- `POST /api/purchase-orders/:id/payments` accepts only confirmed or part-paid purchase orders. Fully paid purchase orders are close-only and should not post another payment row.

## Auth Delivery Mode Notes

- `GET /api/auth/reset-mode` may still report the configured `whatsapp_delivery_mode`, but callers should trust `whatsapp_delivery_scope`, `whatsapp_provider_supports_send`, and `whatsapp_provider_ready` for actual send capability.
- `GET /api/auth/phone/verification/status` now mirrors that distinction with `delivery_scope`, `provider_supports_send`, and `provider_ready` so UI or admin diagnostics do not mistake config presence for live provider delivery.

## Idempotency And Request Identity

- Client request IDs are created by [src/shared/services/api/core.js](../src/shared/services/api/core.js).
- Purchase-order and messaging flows already use request identity patterns to avoid duplicate mutations.
- Keep request-id support when editing those flows; do not silently strip it from payloads.

## Known Exceptions

- Static and redirect routes from [server/core/httpSetup.js](../server/core/httpSetup.js)
- Media proxy transport in [server/features/communication/routes/mediaProxyRoutes.js](../server/features/communication/routes/mediaProxyRoutes.js)
- Export and template download endpoints under product import routes

## Alignment Rule

- Live backend paths and methods come from [../ROUTES.md](../ROUTES.md).
- If `src/shared/services/api/*.js` disagrees with [../ROUTES.md](../ROUTES.md), fix the wrapper or document the drift immediately.
- `POST /api/offers/preview` stays public for cart and checkout, but customer-linked eligibility is not generally client-authoritative. Public and customer-authenticated calls resolve preview identity from the authenticated session only; the one exception is authenticated admin billing preview, which may pass the selected billing customer in `offer_context.customer_user_id`.
