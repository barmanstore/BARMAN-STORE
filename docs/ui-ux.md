# UI And UX

See also: [frontend.md](frontend.md), [patterns.md](patterns.md), [anti-patterns.md](anti-patterns.md), [user-management-state-contract.md](user-management-state-contract.md)

## Current UI Structure

- [src/RootShell.jsx](../src/RootShell.jsx) is the only global chrome owner.
- Route policy is resolved in [src/providers/RoutePolicyProvider.jsx](../src/providers/RoutePolicyProvider.jsx) from [src/app/routeDefinitions.jsx](../src/app/routeDefinitions.jsx).
- Shell variants are explicit:
  - [src/shells/DefaultShell.jsx](../src/shells/DefaultShell.jsx)
  - [src/shells/AccountShell.jsx](../src/shells/AccountShell.jsx)
  - [src/shells/ImmersiveShell.jsx](../src/shells/ImmersiveShell.jsx)
  - [src/shells/NoShell.jsx](../src/shells/NoShell.jsx)
- Shared overlays, Escape routing, and background inerting are centralized in [src/providers/OverlayProvider.jsx](../src/providers/OverlayProvider.jsx).

## Existing Interaction Patterns

- Admin navigation is tab-driven and URL-backed through the admin sidebar config and [src/features/admin/hooks/useAdminPageController.js](../src/features/admin/hooks/useAdminPageController.js).
- Admin user create/edit UX follows [user-management-state-contract.md](user-management-state-contract.md): create collects identity fields, while edit keeps identity read-only and exposes only role plus credit-limit controls.
- Purchase and billing have popup flows as well as embedded admin views.
- Storefront pages combine product browsing, notifications, and mobile-first interaction patterns in [src/features/catalog/products/hooks/useProductsController.js](../src/features/catalog/products/hooks/useProductsController.js).
- Mobile account/store pages now use the `account` shell variant instead of self-rendering header/footer wrappers.
- Desktop windows, mobile sheets, popup guards, the mobile menu, and account dropdowns all participate in the shared overlay stack rather than attaching their own global Escape or portal behavior.

## Change Rules

- Preserve responsive behavior. This app already diverges between mobile and desktop for key flows.
- Reuse the existing route-policy, overlay-stack, and shell-variant contracts instead of introducing parallel UI state systems.
- If a behavior depends on the current route and affects chrome or global runtime services, declare it in the route policy instead of inferring it from pathname checks inside shell/runtime files.
- After shell, overlay, or route-policy changes, run `npm run check:shell-runtime` and `npm run test:shell-runtime`.
- Keep new UI work inside the owning feature tree unless it is truly shared.
- In admin user flows, keep identity edits and pending-verification status messaging aligned to the backend contract instead of inventing inline overrides in the modal or list.

## Balance Card Consistency Contract

- `paymentBadgeSummary` and `balanceSummary` must carry identical meaning across UI and WhatsApp without reinterpretation.
