# Shared Modal Window Review

Date: 2026-03-25

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
     Implemented by consolidating shared frame overflow ownership into the shared window shell, stripping stale frame scroll rules from feature modal themes, and splitting inline category layout styling from the desktop dialog class in `src/features/catalog/categories/CategoryManagement.css`.
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
- [x] 11. Convert the shared desktop window shell from `WindowModal.css` to inline Tailwind utilities.
      Implemented in `src/shared/components/window/WindowManagerProvider.jsx`, `src/shared/components/window/WindowModal.jsx`, and `src/features/credits/khata/CreditKhata.jsx` by moving the shared backdrop, dock, frame, header, control, body, and resize-handle styling into inline utility classes while keeping the existing structural class hooks for feature overrides and print rules.

## Post-Fix Review

- I re-reviewed the shared window stack on 2026-03-25 after the earlier cleanup pass.
- The current code still retains the intended drag and resize optimization path in `useWindowDragResize`, and the open-time `initialSize` snapshot protection is still present.
- This follow-up pass fixed the remaining desktop registration and focus-management issues that were still open at the start of the day, and it moved the shared window shell styling out of `src/shared/components/window/WindowModal.css`.
- The stale app-shell Escape selector dependency, the last no-op `dialogClassName="modal-content"` caller, the mobile sheet isolation gap, and the shared motion-selector drift remain removed.
- A fresh local browser regression pass completed on 2026-03-25 against `http://127.0.0.1:3000` with the Vite dev proxy and backend on `http://127.0.0.1:5000`.
- That pass still runs through `scripts/manual-modal-regression.ps1` and `npm run test:modal-regression`, but the harness now re-syncs the admin session after navigation, waits on real app-shell readiness instead of a brittle icon-button count, uses an isolated Chrome profile per run, and exercises desktop drag through in-page pointer events.

## Current Findings

- The 2026-03-25 follow-up fixes are implemented in the inspected code: `WindowModal` now registers through stable manager callbacks, accessible dialog state is derived from the registered top window, and `useFocusTrap` no longer restores background focus during active-window handoffs.
- The shared desktop window shell no longer depends on `src/shared/components/window/WindowModal.css`; the base backdrop, dock, frame, header, control, body, and resize-handle styling now lives in inline Tailwind utility classes while the existing semantic class hooks remain available for feature-specific overrides.
- The previously reported inline-`initialSize` reset and per-mousemove React drag-loop issues still were not reproduced in this pass. The current hook continues to protect against rerender recentering and continues to use a ref plus `requestAnimationFrame` path for pointer-driven geometry updates.
- `npm run build` and `npm run test:modal-regression` both passed on 2026-03-25 after these changes. The browser pass covered stacked desktop windows, top-window ARIA exposure, focus containment, drag movement, inert background behavior, and reduced-motion output on both desktop and mobile paths.

## Design Summary

- The shared modal system now behaves like one platform layer across desktop and mobile instead of two different isolation models.
- The strongest design win from the final pass is consistency: the shared primitives now own not just frame chrome and window behavior, but also focus, portal placement, and shared entrance motion.
- Feature CSS is back to styling local content and accents instead of redefining shared modal primitives.

## Remaining Follow-Ups

- Keep the browser regression pass in the release checklist when modal shell code changes again, especially for stacked-window focus order and motion overrides.

## Bottom Line

The shared modal system is back to a solid platform layer in code. The registration churn, top-window accessibility drift, focus-restoration handoff issue, and shared shell stylesheet dependency are addressed, and the refreshed browser regression harness now completes successfully against the current desktop and mobile modal flows.
