# UI And UX

See also: [frontend.md](frontend.md), [patterns.md](patterns.md), [anti-patterns.md](anti-patterns.md)

## Current UI Structure

- The shared shell is [src/shared/components/AppShell.jsx](../src/shared/components/AppShell.jsx).
- Routing is lazy-loaded in [src/app/appRoutes.jsx](../src/app/appRoutes.jsx).
- [src/App.jsx](../src/App.jsx) manages mobile menu locking, popup shortcuts, notifications, and shell-level keyboard behavior.

## Existing Interaction Patterns

- Admin navigation is tab-driven and URL-backed through the admin sidebar config and [src/features/admin/hooks/useAdminPageController.js](../src/features/admin/hooks/useAdminPageController.js).
- Purchase and billing have popup flows as well as embedded admin views.
- Storefront pages combine product browsing, notifications, and mobile-first interaction patterns in [src/features/catalog/products/hooks/useProductsController.js](../src/features/catalog/products/hooks/useProductsController.js).

## Change Rules

- Preserve responsive behavior. This app already diverges between mobile and desktop for key flows.
- Reuse existing notification, modal, popup, and body-lock behavior instead of introducing parallel UI state systems.
- Keep new UI work inside the owning feature tree unless it is truly shared.
