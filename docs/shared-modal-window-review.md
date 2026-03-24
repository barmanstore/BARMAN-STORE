# Shared Modal Window Review

Date: 2026-03-24

## Scope

This review covers the shared modal stack used by the React app:

- Desktop windowing: `src/shared/components/window/WindowManagerProvider.jsx`, `src/shared/components/window/WindowModal.jsx`, `src/shared/hooks/useWindowDragResize.js`, `src/shared/hooks/useFocusTrap.js`, `src/shared/hooks/useInertBackground.js`
- Shared wrapper: `src/shared/components/AppModal.jsx`
- Mobile modal path: `src/shared/components/mobile/MobileBottomSheet.jsx`
- Representative feature themes and overrides:
  - `src/features/commerce/purchase/pages/PurchaseManagementPage.css`
  - `src/features/distributors/DistributorManagement.css`
  - `src/features/catalog/products/components/form/ProductForm.css`
  - `src/features/catalog/categories/CategoryManagement.css`
  - `src/features/credits/history/CreditHistory.css`
  - `src/shared/components/UserEditModal.css`

## Architecture Snapshot

- Desktop modals are managed by `WindowManagerProvider`, which owns window registration, z-order, backdrop rendering, minimized window dock, and Escape handling.
- `WindowModal` is the shared desktop primitive. It portals to `document.body`, renders the header and controls, integrates the focus trap, and owns drag/resize behavior through `useWindowDragResize`.
- `AppModal` is only a wrapper. On desktop it delegates to `WindowModal`; on mobile it switches to `MobileBottomSheet`.
- Feature modals mostly restyle the shared frame by passing `themeClassName`, `dialogClassName`, `headerClassName`, `contentClassName`, and `closeButtonClassName`.

## What Is Working Well

- Modal behavior is centralized instead of each feature shipping its own overlay, focus, and Escape handling.
- The mobile path is intentionally different, which is the right direction for this codebase because desktop window controls do not fit small screens.
- The shared primitive is flexible enough to support purchase, category, product, distributor, credit, and admin flows without adding separate modal frameworks.

## Fix Progress

- [x] 1. Stop modal size and position reset on normal rerenders.
  Implemented in `src/shared/hooks/useWindowDragResize.js` and `src/shared/components/window/WindowModal.jsx` by treating `initialSize` as an open-time snapshot and resetting only when a window opens or its `windowId` changes.
- [x] 2. Remove extra manager churn by stabilizing registration and activation paths.
  Implemented in `src/shared/components/window/WindowModal.jsx` and `src/shared/components/window/WindowManagerProvider.jsx` by keeping window registration lifecycle stable, avoiding redundant provider updates for unchanged payloads, and skipping re-activation work for already-top windows.
- [x] 3. Move drag and resize updates off the full React render path.
  Implemented in `src/shared/hooks/useWindowDragResize.js` by moving pointer-driven geometry updates onto a ref plus `requestAnimationFrame` path and only committing React state at stable points such as open, resize clamp, maximize/restore, and interaction end.
- [x] 4. Clean up the CSS contract so feature styles stop redefining core frame behavior.
  Implemented by moving frame overflow ownership fully into `src/shared/components/window/WindowModal.css`, stripping stale frame scroll rules from feature modal themes, and splitting inline category layout styling from the desktop dialog class in `src/features/catalog/categories/CategoryManagement.css`.
- [x] 5. Scope remaining generic `.close-btn` styles.
  Implemented by replacing the remaining generic close-button selectors with feature-scoped classes across purchase, distributor, category, credit, product, and user modal themes.
- [x] 6. Make accessibility reflect the topmost-window model.
  Implemented in `src/shared/components/window/WindowModal.jsx` by exposing `role="dialog"` and `aria-modal="true"` only on the active top window, hiding inactive stacked windows from assistive technology, and limiting the focus trap to the accessible dialog.
- [x] 7. Delete dead overlay CSS after each feature is confirmed on the shared runtime.
  Implemented by removing legacy overlay selectors from `src/shared/components/AppModal.css`, purchase, distributor, category, credit-history, product-form, and user-edit modal styles after confirming those flows now render through `WindowModal` or `MobileBottomSheet`.
- [x] 8. Add `prefers-reduced-motion` handling and review blur usage.
  Implemented in the shared modal and mobile sheet CSS, plus the remaining modal-specific animation files, by disabling modal motion under `prefers-reduced-motion` and dropping backdrop blur on the heaviest modal-adjacent surfaces in reduced-motion mode.
- [x] 9. Bring `MobileBottomSheet` to the same portal, focus, and background-isolation standard as `WindowModal`.
  Implemented in `src/shared/components/mobile/MobileBottomSheet.jsx` and `src/shared/hooks/useInertBackground.js` by portaling the sheet to `document.body`, trapping focus inside the dialog, and making background inertness safe for stacked shared surfaces.
- [x] 10. Consolidate the duplicated `.fade-in-up` animation contract.
  Implemented by keeping the shared utility in `src/App.css`, removing modal-specific redefinitions from category, credit-history, and user-edit styles, and renaming the user-menu-specific dropdown animation so it no longer competes on the same selector.

## Post-Fix Review

- I re-reviewed the modal stack after the original eight fixes and the final two follow-up fixes were applied.
- The initial high-severity runtime problems are still resolved in the inspected code.
- I did not find another geometry-reset, drag-loop, manager-churn, or CSS-contract regression in the reviewed desktop paths.
- The stale app-shell Escape selector dependency, the last no-op `dialogClassName="modal-content"` caller, the mobile sheet isolation gap, and the shared motion-selector drift were removed during final cleanup.

## Current Findings

- No open issues were found in the shared modal stack paths reviewed for this pass.
- Desktop windows and mobile sheets now both use the shared portal-plus-isolation model, and the remaining motion utility ownership is explicit instead of duplicated.

## Design Summary

- The shared modal system now behaves like one platform layer across desktop and mobile instead of two different isolation models.
- The strongest design win from the final pass is consistency: the shared primitives now own not just frame chrome and window behavior, but also focus, portal placement, and shared entrance motion.
- Feature CSS is back to styling local content and accents instead of redefining shared modal primitives.

## Remaining Follow-Ups

- Run manual regression checks on desktop and mobile layouts, especially stacked modals, sheet focus order, and reduced-motion behavior.

## Bottom Line

The shared modal system is now in good shape as a real shared platform layer. The original blocking issues are closed, the mobile sheet path now matches the desktop isolation model, and the remaining work is ordinary regression testing rather than another architectural cleanup pass.
