# Project Instruction System

This file is the main working memory for AI contributors in this repository.

Top-level authority:

1. `AGENTS.md`
2. `ROUTES.md`

Supporting docs explain the current implementation and must stay aligned with the code.

## Doc Index

Root docs:

- [AGENTS.md](AGENTS.md): workflow, priorities, maintenance rules
- [ROUTES.md](ROUTES.md): live backend API inventory and route ownership
- [ARCHITECTURE.md](ARCHITECTURE.md): system map across frontend, backend, and database
- [ERROR_HANDLING.md](ERROR_HANDLING.md): response and error rules
- [CHANGELOG.md](CHANGELOG.md): structured change log template
- [TASKS.md](TASKS.md): structured task tracker template

Focused docs:

- [docs/backend.md](docs/backend.md)
- [docs/frontend.md](docs/frontend.md)
- [docs/business-logic.md](docs/business-logic.md)
- [docs/user-management-state-contract.md](docs/user-management-state-contract.md)
- [docs/routing.md](docs/routing.md)
- [docs/controllers.md](docs/controllers.md)
- [docs/services.md](docs/services.md)
- [docs/database.md](docs/database.md)
- [docs/validation.md](docs/validation.md)
- [docs/api-contract.md](docs/api-contract.md)
- [docs/ui-ux.md](docs/ui-ux.md)
- [docs/patterns.md](docs/patterns.md)
- [docs/anti-patterns.md](docs/anti-patterns.md)
- [docs/naming-conventions.md](docs/naming-conventions.md)

## Read Order

Read only the docs needed for the task, then inspect code:

- Backend or routing work:
  - [ROUTES.md](ROUTES.md)
  - [docs/routing.md](docs/routing.md)
  - [docs/backend.md](docs/backend.md)
  - [docs/controllers.md](docs/controllers.md)
  - [docs/api-contract.md](docs/api-contract.md)
- Frontend work:
  - [docs/frontend.md](docs/frontend.md)
  - [docs/ui-ux.md](docs/ui-ux.md)
  - [docs/user-management-state-contract.md](docs/user-management-state-contract.md)
  - [docs/services.md](docs/services.md)
- Domain changes:
  - [docs/business-logic.md](docs/business-logic.md)
  - [docs/user-management-state-contract.md](docs/user-management-state-contract.md)
  - [docs/validation.md](docs/validation.md)
  - [ERROR_HANDLING.md](ERROR_HANDLING.md)
- Data changes:
  - [ARCHITECTURE.md](ARCHITECTURE.md)
  - [docs/database.md](docs/database.md)

## Required Workflow

1. Read the relevant docs before editing.
2. Explain the affected architecture and business rules in concrete terms.
3. Implement inside the existing feature boundaries.
4. Verify behavior, route alignment, and syntax or tests as appropriate.
5. Update docs in the same change whenever behavior, routes, contracts, or patterns changed.

For any backend change, re-read [ROUTES.md](ROUTES.md) first and align the implementation to it before editing code.

## Non-Negotiable Rules

- Never violate rules documented in [docs/business-logic.md](docs/business-logic.md) without an explicit task.
- Treat [ROUTES.md](ROUTES.md) as the backend API source of truth.
- Always update [ROUTES.md](ROUTES.md) when backend routes, methods, paths, aliases, or deprecations change.
- Follow the current architecture instead of introducing a parallel one.
- Do not invent a fake backend `controllers/` layer. This repo uses feature route modules plus same-feature helpers and services.
- Keep frontend API wrappers in `src/shared/services/api/*.js` aligned to the live backend routes in [ROUTES.md](ROUTES.md).
- Preserve compatibility endpoints unless the task explicitly includes a migration plan.
- Prefer modifying existing patterns over creating new abstractions.

## Task-Specific Expectations

- If you touch `server/features/**/routes/**`, also review [docs/routing.md](docs/routing.md) and [ERROR_HANDLING.md](ERROR_HANDLING.md).
- If you touch `src/shared/services/api/*.js`, also review [docs/api-contract.md](docs/api-contract.md) and [ROUTES.md](ROUTES.md).
- If you touch purchase-order logic, keep server constants in [server/features/purchase/purchaseConstants.js](server/features/purchase/purchaseConstants.js) aligned with frontend normalization in [src/features/commerce/purchase/utils/orders.js](src/features/commerce/purchase/utils/orders.js).
- If you touch order placement, preserve the validated order flow in [server/features/sales/routes/orderCreateRoutes.js](server/features/sales/routes/orderCreateRoutes.js) and [server/features/sales/orderPlacement.js](server/features/sales/orderPlacement.js).
- If you touch offers, preserve server-side pricing authority in [server/features/offers/offerEngine.js](server/features/offers/offerEngine.js).

## Maintenance Rules

- Always update docs when code changes make them stale.
- Keep docs minimal, specific, and tied to real files.
- Remove invalid statements instead of letting historical guesses accumulate.
- Prefer editing an existing pattern or doc page over adding a new parallel rule.
- If code and docs disagree, fix the doc or the code in the same task. Do not leave drift behind.
