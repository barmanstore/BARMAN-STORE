# API Contract

See also: [../ROUTES.md](../ROUTES.md), [routing.md](routing.md), [services.md](services.md), [../ERROR_HANDLING.md](../ERROR_HANDLING.md)

## Transport Rules

- The default API contract is JSON in and JSON out.
- [src/shared/services/api/core.js](../src/shared/services/api/core.js) automatically adds the bearer token from local storage and JSON-encodes object bodies.
- The same wrapper rejects non-JSON success responses, so download or proxy endpoints need custom handling.

## Common Shapes

- Success:
  - `{ success: true, ... }`
  - resource objects or lists for read endpoints
- Error:
  - `{ error: "..." }`
  - optional `message`, `issues`, `details`, `conflict_type`, or `conflict`

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
