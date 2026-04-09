# Architecture And Performance Rules

See also: [../AGENTS.md](../AGENTS.md), [../ROUTES.md](../ROUTES.md), [../ARCHITECTURE.md](../ARCHITECTURE.md), [backend.md](backend.md), [frontend.md](frontend.md), [database.md](database.md), [business-logic.md](business-logic.md), [api-contract.md](api-contract.md), [ui-architecture-reference.md](ui-architecture-reference.md), [patterns.md](patterns.md), [anti-patterns.md](anti-patterns.md), [../ERROR_HANDLING.md](../ERROR_HANDLING.md)

Use this document before changing system structure, cross-feature state flow, or scale-sensitive behavior. It consolidates the current engineering rules from the reference docs into one implementation guide. It does not replace those docs. If this page conflicts with [../AGENTS.md](../AGENTS.md) or [../ROUTES.md](../ROUTES.md), those files win.

## Source Of Truth Order

1. [../AGENTS.md](../AGENTS.md)
2. [../ROUTES.md](../ROUTES.md) for backend paths, methods, aliases, and deprecations
3. [../ARCHITECTURE.md](../ARCHITECTURE.md) for system boundaries
4. Area docs such as [frontend.md](frontend.md), [backend.md](backend.md), [database.md](database.md), [business-logic.md](business-logic.md), [api-contract.md](api-contract.md), [ui-architecture-reference.md](ui-architecture-reference.md), [patterns.md](patterns.md), and [anti-patterns.md](anti-patterns.md)

## Architecture Invariants

### 1. Keep ownership where it already lives

- Add behavior inside an existing feature subtree before creating a new top-level module.
- Keep feature state inside the owning feature tree. Do not create dashboard-owned copies, popup-only copies, or parallel workflow stores for an existing feature.
- Keep cross-route state inside the existing providers in [../src/App.jsx](../src/App.jsx): session, cart, notifications, route policy, and overlay ownership.
- Keep global chrome ownership in [../src/RootShell.jsx](../src/RootShell.jsx). Pages and layouts must not decide shell chrome on their own.
- Keep page orchestration in controller hooks, not in large page components with scattered side effects.
- Keep backend HTTP ownership in `server/features/**/routes/**` plus same-feature helpers or services. Do not introduce a fake backend `controllers/` tree.
- Keep schema ownership in [../supabase/migrations](../supabase/migrations). Do not hide schema changes inside route code or ad hoc SQL scripts.

### 2. Keep contracts aligned across layers

- Treat [../ROUTES.md](../ROUTES.md) as the backend API source of truth.
- Keep `src/shared/services/api/*.js` aligned to [../ROUTES.md](../ROUTES.md) and the JSON rules in [../ERROR_HANDLING.md](../ERROR_HANDLING.md) and [api-contract.md](api-contract.md).
- Do not add frontend API wrappers for endpoints that do not exist in [../ROUTES.md](../ROUTES.md).
- Preserve documented compatibility endpoints and aliases unless the task includes an explicit migration plan.
- Keep mutation responses explicit about status and JSON shape instead of relying on implicit transport behavior.

### 3. Preserve authoritative business logic

- Cart remains a frontend draft until checkout. Do not invent a live backend cart resource without a deliberate architecture change.
- Offer pricing and eligibility stay server-authoritative in [../server/features/offers/offerEngine.js](../server/features/offers/offerEngine.js). Frontend previews are presentation only.
- Purchase lifecycle rules must stay aligned between [../server/features/purchase/purchaseConstants.js](../server/features/purchase/purchaseConstants.js) and [../src/features/commerce/purchase/utils/orders.js](../src/features/commerce/purchase/utils/orders.js).
- Purchase planning board state stays summary-driven from the backend purchase-operations surface. Do not move that workflow state into dashboard-local browser logic.
- Credit scoring, aging, and badge output stay on the shared payment-intelligence path. Do not fork credit health logic into frontend heuristics or a second backend path.
- WhatsApp delivery remains a manual prepared-message boundary until a real provider-backed sender exists. Do not imply automatic delivery where the provider does not support it yet.

### 4. Prefer extension over parallel architecture

- Extract small helpers inside the owning feature before adding new cross-cutting abstractions.
- Reuse shared UI primitives under `src/shared/components/*` when the interaction is already generic.
- Extend existing shared filters and controlled inputs with bounded variants instead of creating feature-only forks for the same job.
- If a shared surface family already has a canonical shell, reuse that shell on every page and adjust only the outer page wrapper for fit, spacing, and width. Do not create a second page-specific layout for the same search, filter, table, or row-board family.
- Once a shared surface is aligned and visually approved, treat that structure as the default for future pages. New work should use the same component family and the same density contract, not re-justify the same shape on each page.
- Shared filter primitives such as `SearchFilter`, `DropdownFilter`, and `DateRangeFilter` must keep one canonical structure and density across pages. Page code may pass labels, scope options, tone, width, or visibility toggles, but it must not fork the internal layout, spacing, icon placement, or surface grammar for a page-specific look.
- The canonical date-range popover should read as one clear component: compact preset chips in a single horizontal row first, a hidden-by-default custom section, and an optional calendar that expands only when requested. If the strip cannot fit, it may scroll horizontally, but it must not wrap into a column or split into equal-weight blocks.
- When a page uses scoped search, it must reuse the same search-bar grammar as the orders page: scope select first, text input second, submit action when needed, and the same compact surface rhythm. Page code may change the searchable field set and placeholder text, but not the bar structure or icon placement.
- When a page uses grouped filters or advanced filters, it must reuse the same orders-page filter grammar: compact filter bar, adjacent filter toggle or clear action when needed, and stacked advanced rows with the same label/control rhythm. Page code may change which filters appear, but not the visual structure that groups them.
- Stock-ledger history is a reference implementation of this rule: its scoped search, filter toggle, clear action, and advanced filter rows must stay aligned with the orders-page grammar so later pages can reuse the same shape without restyling it.
- Apply the same rule to other shared UI families such as tables, row cards, list toolbars, and compact control bars. Page-specific overrides may tune content, state, and width, but the base structure, spacing rhythm, and density must stay identical across pages when the same shared component is reused.
- Remove stale wrappers or dead assumptions when [../ROUTES.md](../ROUTES.md) has no matching backend resource.
- Treat [anti-patterns.md](anti-patterns.md) as a stop-list when a change proposal starts drifting into a second architecture.

## Performance Rules

### 1. Optimize inside the current architecture first

- Fix ownership, data flow, and surface choice before adding cache layers or new abstractions.
- Keep routine actions inside the current surface when the job fits there. Avoid navigation or full refreshes for normal operational work.
- After a successful mutation, update the current surface in place and preserve filter, sort, group, selection, and scroll position when possible.

### 2. Frontend rendering and interaction

- Keep large pages controller-led so side effects, fetches, and derived state stay centralized and rerender scope stays bounded.
- Follow [ui-architecture-reference.md](ui-architecture-reference.md): rows for operational work, modals or sheets for focused actions, workspaces for complex flows, tables for audit-heavy reads.
- Keep layouts compact and scan-first. Avoid stacked card towers, oversized dialogs, or helper copy that expands routine editing surfaces.
- When a shared primitive is used for search, select, grouped filter, or date range control, keep the same visual structure everywhere it appears. Do not restyle the same control differently per page just to match local decoration.
- Date range controls may use a compact icon-only trigger on dense surfaces, but the open state must still use the shared preset-first calendar grammar with the same month/year selectors, range header, and confirm/cancel actions.
- When the same shared data surface appears on multiple pages, keep its chrome and spacing consistent. Do not create page-specific table skins or control-bar silhouettes for the same shared component family unless the page is intentionally using a different surface type.
- Solve UI scale with visible filters, sorting, grouping, progressive load, and lazy load before expanding the surface into a denser or more complex layout.
- Virtualize long lists when DOM growth threatens scroll performance.
- Keep feedback primarily color-led and detail second so live warnings do not constantly change row height while the operator is typing.
- Keep desktop context panels read-only. Escalate complex write flows to a workspace instead of pushing more inputs into a side panel or oversized modal.

### 3. Data fetching, caching, and freshness

- Cache only inside an owning boundary and only when the freshness contract is still clear.
- Keep offer caching short-lived and invalidate it on admin offer create, update, and delete flows.
- Do not add response caching that can serve stale customer credit badges, maintain-score deadlines, or other payment-intelligence output after a credit mutation.
- Treat admin aging snapshots as versioned operational data. Missing or stale snapshot rows must rebuild or report initialization instead of pretending the empty data is final.
- Keep admin user search backend-owned. If search scalability changes, improve the backend implementation before changing the frontend query model.
- Reuse shared summary payloads that already own a workflow view before adding new parallel fetch surfaces for the same state.

### 4. Backend and database performance

- Keep route growth inside feature-local helpers or services instead of moving shared complexity into a new controller layer.
- Keep error and response fidelity while optimizing. Performance changes must not flatten explicit `404`, `409`, or other known statuses into generic failures.
- Keep database access Postgres-native and async-only. The query adapter is migration glue for legacy SQL shape compatibility, not a reason to maintain a fake multi-database abstraction.
- Treat the in-memory limiter in [../server/core/rateLimiter.js](../server/core/rateLimiter.js) as process-local only. Do not assume cross-instance protection without a shared backing store.
- Add schema or query-shape changes through migrations and the existing database layer, not ad hoc SQL embedded around feature code.

### 5. Performance must not break canonical data rules

- Do not recompute or overwrite canonical business anchors such as PO `planned_order_date` or required credit `due_date` just to simplify reads.
- Keep derived operational state versioned and rebuildable where the current docs already define that pattern.
- Do not move server-authoritative novelty, pricing, credit, or lifecycle decisions into opportunistic frontend calculation just because it feels faster.

## Change Workflow

1. Read the relevant source docs for the affected area before touching code.
2. State the exact ownership boundary you are changing: feature, provider, route module, service, migration, or shared contract.
3. Implement inside the existing architecture first. If you think a new boundary is required, prove why the current one cannot own the change cleanly.
4. Update related docs in the same change:
   - [../ROUTES.md](../ROUTES.md) for backend route changes
   - [api-contract.md](api-contract.md) for transport or payload changes
   - [business-logic.md](business-logic.md) or [database.md](database.md) for rule or schema changes
   - this document when the architecture or performance guidance itself changes
5. Verify the right guardrails for the area:
   - shell or runtime ownership changes: `npm run check:shell-runtime` and `npm run test:shell-runtime`
   - purchase lifecycle changes: `npm run test:po-lifecycle`
   - route or wrapper changes: re-check [../ROUTES.md](../ROUTES.md) and the matching frontend API wrapper
   - UI scale changes: verify filter, load, selection, and post-action update behavior without a forced page refresh
   - data changes: confirm a new migration exists and the data docs stay aligned

## Stop Signs

- New top-level global state for a concern that already belongs to a feature hook or existing provider
- A new backend `controllers/` layer
- A new mutating `GET` endpoint
- A frontend wrapper for an undocumented backend route
- A second workflow store for purchase, restock, dashboard, or credit state that already has an owner
- Caching financial or scoring output without clear invalidation or version rules
- Bigger tables or bigger modals used as a shortcut instead of choosing the right surface

## Review Checklist

- The change stays inside an existing ownership boundary.
- No parallel architecture was introduced.
- Backend paths, frontend wrappers, and docs still agree.
- Server-authoritative business rules remain server-authoritative.
- Performance work improves scale without weakening correctness or freshness.
- The chosen UI surface still matches the job.
- The relevant docs were updated in the same change.
