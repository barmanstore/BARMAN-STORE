# Error Handling Standards

See also: [AGENTS.md](AGENTS.md), [ROUTES.md](ROUTES.md), [docs/api-contract.md](docs/api-contract.md), [docs/validation.md](docs/validation.md)

## Backend Response Rules

- Default API behavior is JSON with an explicit status code.
- Successful mutations usually return `{ success: true, ... }`.
- Failures usually return `{ error: "..." }`, with optional `message`, `issues`, `details`, or conflict metadata.
- Preserve `error.status` when helper or service code sets it. Do not flatten a known `404` or `409` into `400` or `500`.

## Status Code Baseline

- `200`: reads and idempotent success
- `201`: created resources
- `400`: validation and malformed input
- `401` or `403`: authentication and capability failures
- `404`: missing resource
- `409`: dedupe or business conflict
- `410`: intentionally disabled compatibility endpoints
- `503`: transient upstream or database saturation, including retryable auth lookups and list reads
- `500+`: runtime or upstream failures

## Current Examples

- Runtime readiness failures return JSON `500` from [server/core/httpSetup.js](server/core/httpSetup.js).
- Shared route error handling utilities live in [server/core/routeErrors.js](server/core/routeErrors.js) and preserve `error.status` when emitting JSON.
- Auth guards and selected list/profile routes may return `503` when the database pool is temporarily saturated so clients can retry without treating the session as invalid.
- Validated order creation returns structured `400` issues for incomplete profiles in [server/features/sales/routes/orderCreateRoutes.js](server/features/sales/routes/orderCreateRoutes.js).
- Credit issue resolution uses thrown errors with `status` in [server/features/credits/routes/creditIssues/admin/resolveIssue.js](server/features/credits/routes/creditIssues/admin/resolveIssue.js).
- Password-auth compatibility endpoints intentionally return `410` and stay documented in [ROUTES.md](ROUTES.md).

## Frontend Rules

- [src/shared/services/api/core.js](src/shared/services/api/core.js) expects JSON responses and throws an `Error` with `status` and `payload` when the response is not OK.
- Controller hooks should surface API failures through existing page state or notification patterns instead of swallowing them.
- Do not introduce frontend code that assumes non-JSON API responses unless the endpoint is a documented exception.

## Exceptions

- Redirects and static file handling in [server/core/httpSetup.js](server/core/httpSetup.js)
- Binary or proxy-style transport endpoints such as [server/features/communication/routes/mediaProxyRoutes.js](server/features/communication/routes/mediaProxyRoutes.js)
- Export or template download endpoints that should be handled outside the generic JSON wrapper
