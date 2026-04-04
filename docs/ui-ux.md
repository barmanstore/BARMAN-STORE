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
- Purchase-order create now treats workflow order as UI structure, not just helper text:
  - Desktop and popup purchase entry show `Supplier -> Items -> Review -> Final Submit` inside [src/features/commerce/purchase/components/PurchaseEntryModals.jsx](../src/features/commerce/purchase/components/PurchaseEntryModals.jsx).
  - Purchase create should behave like a dedicated fixed full-screen workspace, not a floating popup or desktop-style window. The first state may still stay supplier-first, but the screen should take over the viewport, hide the background app context, and avoid drag, resize, or reposition behavior while the operator is working.
  - The item screen should stay step-by-step but simple: supplier selection should immediately load the supplier's registered products onto the board, while the extra-products picker window handles only non-supplier catalog additions; selected PO rows should render as one clear full-width inline grid with image, qty, unit, rate, GST, discount, and total, and the first submit should switch into a compact review screen instead of saving immediately.
  - Supplier-default rows should stay visibly distinct even when not ordered: qty `0` default rows remain loaded in draft, stay out of review and final submit, and load by default without a `Show All` toggle gate.
  - Qty should stay the primary input. New rows may start at `0`, zero-qty rows should be ignored by review and final submit, and keyboard movement should favor row-to-row quantity entry over scrolling the popup.
  - New-item picking should behave like a products-page card picker: tap cards to select multiple products, keep that selection visually tracked on the cards themselves, show only extra non-supplier products that are not already on the board, and return to the same pending PO without hiding the current PO rows.
  - Keep the picker actions literal: one `Add Product` entry point to open it, `Done` to commit selected cards into the PO rows, and `Cancel` to back out without changing the draft.
  - The picker should also offer a `New Product` action that opens the quick-add product form in-place so minimum required fields can be captured without leaving the PO workflow.
  - Keep the extra-product search self-explanatory inside the picker window: filter by name or SKU, and show a short match/availability pill so operators know whether the picker is filtering or simply has no extra products left.
  - The picker window should lazy-load extra-product cards as the operator scrolls to keep the initial load fast and the grid compact.
  - The picker should hide any product that is already on the PO board, hide products already registered to the selected supplier, and supplier change should clear the draft rows so the board stays supplier-clean.
  - Review should read like a printed bill: short lines, supplier/date metadata, visible totals, and a direct `Modify` path before final submit.
  - Saved PO review in [src/features/commerce/purchase/components/modals/OrderDetailModal.jsx](../src/features/commerce/purchase/components/modals/OrderDetailModal.jsx) should reuse the same printed-bill review sheet so draft and saved reviews match.
  - PO item rows should open with the best known buying values already filled in: use the same supplier's latest PO rate/GST for that product when available, otherwise the latest PO for that product from any supplier, so restock-opened drafts and manual picks behave the same.
  - Saved PO drafts should stay visible and easy to reopen from the purchase workspace, with lightweight cards instead of hidden restore flows.
  - Keep the workflow compact: use terse step pills, minimal helper copy, short warning chips, and icon-led helper actions instead of large step cards or repeated explanatory text.
  - Keep the PO item rows compact: active state should come from a light inline-row highlight, while each row prefers one concise meta line, one total cell, and only the one fix or remove action that matters inside the total area instead of a dedicated status column.
  - The discount column should read as one operator decision per draft. Let the header toggle `Disc %` and `Disc ₹`, keep the row inputs visually stable, and reset entered discount values when the mode changes so the grid never silently changes meaning.
  - The purchase create shell should feel like one working screen. Remove floating-window styling, keep the header and footer anchored, and prefer one main in-workspace scroll area over layered page, modal, and table scrolling.
  - Optional note and delivery fields should move to the review stage instead of occupying the supplier or item-entry surfaces. Review is the last chance to update those extras before final submit.
  - Keep the first pass simple: supplier choice should be the only required action in step one, supplier-registered items should auto-load onto the board instead of living in a second picker strip, item entry should stay focused on product rows only, the active row should surface only the next issue to fix, the footer should carry the main order total instead of repeating it in multiple panels, and the PO screen should not branch into catalog-creation actions.
  - Do not hide editable row controls behind per-row edit states. GST, UOM, discount, and similar secondary row settings should stay inline in the same operator grid so qty-first entry still works with keyboard tab flow and low visual friction.
- Purchase popup discoverability must be explicit:
  - Admin purchase views expose a visible browser-workspace action instead of relying only on keyboard shortcuts.
  - The popup/browser workspace keeps recent POs visible after save through [src/features/commerce/purchase/components/sections/PurchasePopupWorkspacePanel.jsx](../src/features/commerce/purchase/components/sections/PurchasePopupWorkspacePanel.jsx).
  - Saving a PO should land in a visible completion handoff, not a forced table jump. The shared saved-PO card in [src/features/commerce/purchase/components/sections/PurchaseSavedOrderPanel.jsx](../src/features/commerce/purchase/components/sections/PurchaseSavedOrderPanel.jsx) should stay concise, show the latest saved PO summary, and expose `View PO`, `New PO`, and manual `Prepare WhatsApp` actions in both inline and popup purchase workspaces.
  - The admin dashboard may surface one compact supplier-visit prep card in [src/features/admin/sections/DashboardSection.jsx](../src/features/admin/sections/DashboardSection.jsx), but it should stay a handoff surface only: reuse the shared purchase summary, open the shared purchase feature for PO draft/payment/review actions, and keep the dashboard copy concise instead of rebuilding the purchase workflow there.
  - On mobile, that same dashboard may compress the purchase summary further into one owner quick-view with four short task cards for supplier visits, due payments, draft POs, and pending deliveries, plus compact tab shortcuts; it should still open the same shared purchase workflow instead of inventing mobile-only purchase state.
  - Supplier novelty should show up as compact warning copy inside purchase planning and distributor insight cards, not as a separate page. The planning/reminders UI may call out items that are missing from catalog or outside recent purchase habit, but it should keep the presentation terse and keep the comparison logic server-owned in the shared purchase summary.
  - PO review should expose `Prepare WhatsApp (Manual)` directly in [src/features/commerce/purchase/components/modals/OrderDetailModal.jsx](../src/features/commerce/purchase/components/modals/OrderDetailModal.jsx) so operators can review and open the launcher from the same detail surface once a draft already exists.
- Restock-to-PO handoff now uses a review step instead of a direct jump:
  - Search, filters, selection count, sync actions, and the PO review entry stay together in the same top workspace inside [src/features/admin/sections/RestockDashboardSection.jsx](../src/features/admin/sections/RestockDashboardSection.jsx).
  - Selected products move into an editable review surface for PO quantity, supplier selection, and optional order details before the purchase workspace opens.
  - Restock-opened PO drafts should not linger empty. If that linked draft is cancelled or all selected rows are removed, the PO should close and the admin workspace should fall back to restock automatically.
- Restock-to-PO should open the inline purchase workspace even if a purchase popup is already open, so operators stay in one full-screen flow.
- Restock may open the PO draft without a supplier selected; the PO workflow must still start at the supplier step and apply restock-selected quantities only after the supplier board is loaded.
  - Both surfaces should stay compact: prefer small icon-led action buttons with short labels or tooltips, plus terse status pills, over large text-heavy button rows and helper paragraphs.
- Use `Supplier` as the operator-facing label across purchase and restock surfaces where the business meaning is supplier, even if internal route/state field names still use `distributor`.
- Billing should also keep the workflow light instead of explanatory:
  - [src/features/sales/billing/components/BillingTabView.jsx](../src/features/sales/billing/components/BillingTabView.jsx) and the billing subpanels should keep the same item-entry, bill-review, and checkout order, but use shorter helper lines, smaller text, and less visual padding.
  - [src/features/sales/billing/components/BillingBillList.jsx](../src/features/sales/billing/components/BillingBillList.jsx) should keep bill rows compact, with only the most useful state chips and terse secondary text.
- Admin daily-sales should keep billed cash and manual cash separate:
  - [src/features/admin/sections/DailySalesSection.jsx](../src/features/admin/sections/DailySalesSection.jsx) should show bill-derived totals first, then a compact counted-cash panel where admins can save a daily tally and see the delta against billed cash.
  - [src/features/admin/sections/DashboardSection.jsx](../src/features/admin/sections/DashboardSection.jsx) should present a concise current-day cash picture summary that stays honest about whether it is bill-derived only or backed by a saved manual tally.
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
