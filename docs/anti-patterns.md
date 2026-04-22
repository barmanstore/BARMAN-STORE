# Anti-Patterns

See also: [patterns.md](patterns.md), [routing.md](routing.md), [services.md](services.md)

## Current Drift And Debt

- [README.md](../README.md) is not the authoritative route reference. Use [../ROUTES.md](../ROUTES.md).
- Some frontend API wrappers do not map to live backend routes and should not be copied as examples:
  - [src/shared/services/api/cart.js](../src/shared/services/api/cart.js)
  - `statsApi.products()` in [src/shared/services/api/stats.js](../src/shared/services/api/stats.js)
  - unused order verification helpers in [src/shared/services/api/orders.js](../src/shared/services/api/orders.js)
- Some older backend route files still flatten unexpected errors instead of consistently preserving `error.status`.

## Do Not Introduce

- A fake backend `controllers/` mirror that does not match the current architecture
- New mutating `GET` endpoints; the existing `/api/internal/*` GET variants are compatibility exceptions only
- Copied unused dependency destructures in route modules
- Route changes without updating [../ROUTES.md](../ROUTES.md)
- Silent removal of aliases or disabled compatibility endpoints
