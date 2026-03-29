# User Management State Contract

See also: [business-logic.md](business-logic.md), [validation.md](validation.md), [ui-ux.md](ui-ux.md), [../ROUTES.md](../ROUTES.md)

## Owning Routes And UI

- Admin user list and create/delete live on [server/features/auth/routes/userCrud/userAdminList.js](../server/features/auth/routes/userCrud/userAdminList.js) and [server/features/auth/routes/userCrud/userRoleActions.js](../server/features/auth/routes/userCrud/userRoleActions.js).
- Admin edit rules are enforced in [server/features/auth/routes/userCrud/profile/profileValidation.js](../server/features/auth/routes/userCrud/profile/profileValidation.js) and applied in [server/features/auth/routes/userCrud/profile/profileUpdateFlow.js](../server/features/auth/routes/userCrud/profile/profileUpdateFlow.js).
- The admin user modal lives in [src/shared/components/UserEditModal.jsx](../src/shared/components/UserEditModal.jsx).
- Pending phone review uses the dedicated admin queue at [server/features/auth/routes/phoneChangeAdmin/listRoutes.js](../server/features/auth/routes/phoneChangeAdmin/listRoutes.js), not the general `/api/users` list payload.

## Admin Create Contract

- Admin create is a customer-onboarding flow in the current UI. The modal creates customers and allows `name`, `email`, `phone`, `address`, and optional `credit_limit`.
- Email uniqueness is checked on normalized email (`lowercase + trim`) before insert.
- Phone uniqueness is checked on normalized Indian phone format from `parsePhoneInput`; all comparisons must use the normalized stored form.
- `credit_limit` is optional. Blank input persists as `0`, and `0` means unrestricted credit.
- If email or phone is supplied without verification, the backend triggers the matching verification challenge after create.

## Admin Edit Contract

- Admin-managed edit of an existing non-admin user is intentionally narrow: role and `credit_limit` only.
- Name, email, phone, and address are read-only in the admin edit modal and must not be mutated through this flow.
- Existing admin users are read-only in this flow and must not be modified or deleted here.
- Role changes are allowed only when both `email_verified` and `phone_verified` are already true.

## Verification And Pending State Rules

- Self-service phone changes do not overwrite the stored phone immediately. They queue a `phone_change_request` and return that pending request in the profile-update response.
- Pending phone visibility is mandatory in admin operations, but the current source of truth is the dedicated phone-change review queue, not `/api/users`.
- UI must describe unverified contact state as pending verification, not as an editable inline identity field.
- Do not silently merge pending phone requests into generic user list state without approval from the phone-change workflow.

## Deletion Rules

- Customer records can be deleted through [server/features/auth/routes/userCrud/userRoleActions.js](../server/features/auth/routes/userCrud/userRoleActions.js).
- Admin records must not be deleted through that route.

## Search And Scalability

- The current `/api/users` search is a backend-owned SQL `LIKE` filter across `id`, `name`, `email`, `phone`, and `role`.
- Frontend user-management search should keep that single endpoint and query contract stable instead of adding client-side shadow search behavior.
- If the directory grows beyond the current scale, extend the backend with normalized/indexed search fields or a dedicated search service behind the same endpoint contract instead of changing the admin UI query model first.

## Identity Integrity Checklist

- Normalize email with lowercase + trim before uniqueness checks and before writes that depend on identity matching.
- Reject duplicate normalized email on admin create and on self-service/admin profile updates.
- Normalize phone to the stored `91XXXXXXXXXX` form before any equality or uniqueness comparison.
- Treat blank `credit_limit` in admin UI as unrestricted credit, which persists as `0`.
- Keep pending-phone visibility connected to the review queue until `/api/users` explicitly exposes pending request state.
- Do not add alternate user-edit paths that bypass the verified-contact requirement for role changes.
