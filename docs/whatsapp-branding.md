# WhatsApp Branding & Message Contract (Launcher Mode)

## 1. Source of Truth

`storeDisplayName` is the single source of truth for branding.

Used in:

- UI (headers, cards, receipts)
- WhatsApp messages (top + footer)

Rules:

- Must not be transformed inside templates.
- No localization or formatting applied unless explicitly configured upstream.
- In this repo, `storeDisplayName` maps to `info.TITLE` until a dedicated config field exists.

## 2. Message Structure (Strict Order)

All WhatsApp messages must follow this structure:

1. Header (branding)
2. Message title
3. Core data (customer, period, etc.)
4. Score / payment profile
5. Summary totals
6. Recent transactions (bounded)
7. Footer (CTA + signature)

## 3. Header Format (Preview Critical)

The first 3 lines MUST contain:

1. Store name
2. Message type
3. Score (if available)

Example:

```
{STORE_NAME}
{TITLE}
Score: {score}/100 | {label}
```

Reason: These lines are visible in WhatsApp preview.
The text must stand on its own even if emoji rendering fails; emoji are decorative only and must never carry the structure of the message.

## 4. Footer Format (Brand Reinforcement)

Footer must include:

1. Store link (if available)
2. Thank you line
3. Store name signature

Example:

```
Online store: {STORE_URL}

🙏 Thank you
— {STORE_NAME}
```

## 5. Store Link Rules

- Only render if a valid URL is present.
- Must be placed in footer (never in header).
- The link line must stay readable without emoji; text-first labels are allowed and preferred for preview reliability.

## 6. Payment Profile Contract

Templates MUST consume `paymentProfile` only.

Templates MUST NOT:

- Compute score
- Derive badge label
- Infer status
- Repeat the score inside the body when the header already carries it

All scoring logic lives outside templates.

For credit reminders:

- Any “pay by” nudge must use the canonical `paymentProfile.maintain_score_by_date`, which represents the active oldest-unpaid FIFO cycle deadline.
- Only render that nudge when both a real due date and an outstanding balance exist.
- Never fabricate, estimate, or approximate a deadline; if the canonical date is absent, show no reminder line.
- Copy should match customer state: established scored customers should reuse the shared English status label in the reminder line (for example `Excellent`, `Good`, or `Average`), while `New` / insufficient-history customers should use softer “build your score” language until the first judged cycle is complete.
- Reminder copy must branch by date state:
  - before due date: future-looking reminder copy is allowed
  - after due date but before grace expiry: mention the grace-period ending date, not the already-missed due date, and use stronger overdue wording; the current shared grace window is `3` days
  - after grace expiry: use urgent overdue-after-grace wording instead of future-looking “pay before” copy
- When the due date is still in the future and the customer is not currently `Excellent`, prefer motivational improvement wording over “maintain your score” wording, and use `paymentProfile.next_status_label` when available so the upgrade target is explicit.
- Omit the nudge entirely when that data is absent.

## 7. Message Size Constraints

- Launcher fit must be measured against the full shared WhatsApp URL contract: `buildWhatsAppUrl({ phone, text }).length <= MAX_URL_LENGTH`, not raw `text.length`.
- Transactions must be trimmed dynamically to fit that launcher URL limit at whole-line boundaries.
- Absolute max lines: ~20–22
- Any stored or logged preview must use grapheme-safe truncation so Assamese text and emoji are not split into replacement characters.
- Credit WhatsApp footer copy must remain readable without a trailing decorative emoji.
- When credit-history shares are too long, trim low-priority lines such as the reference line and store link before relying on the clipboard fallback.

Fallback:

- Clipboard copy + open WhatsApp

## 8. Launcher Mode Definition

Current mode: `client`

- Opens WhatsApp URL
- No delivery guarantee
- No retries
- No provider dependency

## 9. Audit Logging Requirement

Every launch attempt must log:

- `customerId`
- `type` (`report` | `entry` | `transaction`)
- `timestamp`
- `phone`
- `messagePreview`
- `status`
- `contextType` / `contextId`
- `triggerSource`

Status naming (launcher mode):

- `opened_whatsapp`
- `opened_with_copy`
- `opened_without_copy`
- `blocked_no_phone`

## 10. Non-Goals (Explicit)

- No image/logo support
- No rich media formatting
- No delivery tracking (in client mode)
- No score or badge derivation inside templates
- No raw internal ledger labels in customer-facing copy without a deliberate presentation mapping

## 11. Consistency Guarantee

UI and WhatsApp MUST display:

- Same store name
- Same score
- Same badge label
- `paymentBadgeSummary` and `balanceSummary` must carry identical meaning across UI and WhatsApp without reinterpretation.

Any mismatch is considered a bug.
