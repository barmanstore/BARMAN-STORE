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

## Admin Analytics Notes

- `GET /api/admin/analytics/summary` now returns visitor/session metrics plus `today_cash_summary`, which keeps current-day billed totals separate from the optional manual cash tally.
- `GET /api/admin/analytics/daily-cash-tally?date=YYYY-MM-DD` returns `{ date, entry }`, where `entry` is `null` until an admin saves a tally for that day.
- `PUT /api/admin/analytics/daily-cash-tally` upserts `{ date, counted_cash_total, note? }` and returns `{ success: true, date, entry, summary }`.

## Purchase Operations Notes

- `GET /api/purchase-operations/summary` keeps returning one shared summary payload for dashboard and purchase planning surfaces.
- `GET /api/distributors/:id/products` returns the selected supplier's active registered product board for PO creation. Purchase create should use that registry as the board seed instead of inferring supplier defaults only from prior PO history.
- Purchase-order create/update item payloads may include `row_source` (`supplier` or `manual`). The backend persists that item-origin hint on `purchase_order_items`, and PO detail/list reads return it with each item row.
- `distributor_insights[*]`, `today_distributors[*]`, `tomorrow_distributors[*]`, and reminder entries may now include `novelty_alerts`, `novelty_summary`, and `has_novelty_alerts` so the UI can flag supplier-linked products that are missing from catalog or outside the recent purchase-habit window without adding a second planning endpoint.
- `POST /api/purchase-orders/:id/distributor-whatsapp` is currently a manual preparation endpoint even though the path keeps the old WhatsApp-send naming. It returns `delivery_scope`, and clients should open `distributor_notice.whatsapp.whatsapp_url` as the launcher flow instead of assuming provider-backed automatic delivery.

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
