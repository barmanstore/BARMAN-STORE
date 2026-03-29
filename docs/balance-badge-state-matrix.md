# Balance + Badge State Matrix

Purpose: validate all balance + badge + role combinations so the balance card and WhatsApp copy never drift.

Legend:
- Balance: `Due` (>0), `Advance` (<0), `Settled` (=0)
- Badge: `Excellent`, `Very Good`, `Good`, `Needs Attention`, `Problem`, `New`, `Neutral`
- Role: `Admin`, `Customer`

Expected UI rules:
- Balance headline and direction follow `getBalanceSummary`.
- Badge label uses `paymentBadgeSummary`.
- If badge label is `New`, score is hidden.

## Admin

| Balance | Badge | Expected UI |
| --- | --- | --- |
| Settled | New | All settled + New badge (score hidden) |
| Settled | Neutral | All settled + Neutral badge |
| Settled | Excellent | All settled + Excellent badge |
| Settled | Very Good | All settled + Very Good badge |
| Settled | Good | All settled + Good badge |
| Settled | Needs Attention | All settled + Needs Attention badge |
| Settled | Problem | All settled + Problem badge |
| Due | New | Balance Due + New badge (score hidden) |
| Due | Neutral | Balance Due + Neutral badge |
| Due | Excellent | Balance Due + Excellent badge |
| Due | Very Good | Balance Due + Very Good badge |
| Due | Good | Balance Due + Good badge |
| Due | Needs Attention | Balance Due + Needs Attention badge |
| Due | Problem | Balance Due + Problem badge |
| Advance | New | Advance Balance + New badge (score hidden) |
| Advance | Neutral | Advance Balance + Neutral badge |
| Advance | Excellent | Advance Balance + Excellent badge |
| Advance | Very Good | Advance Balance + Very Good badge |
| Advance | Good | Advance Balance + Good badge |
| Advance | Needs Attention | Advance Balance + Needs Attention badge |
| Advance | Problem | Advance Balance + Problem badge |

## Customer

| Balance | Badge | Expected UI |
| --- | --- | --- |
| Settled | New | All settled + New badge (score hidden) |
| Settled | Neutral | All settled + Neutral badge |
| Settled | Excellent | All settled + Excellent badge |
| Settled | Very Good | All settled + Very Good badge |
| Settled | Good | All settled + Good badge |
| Settled | Needs Attention | All settled + Needs Attention badge |
| Settled | Problem | All settled + Problem badge |
| Due | New | Balance Due + New badge (score hidden) |
| Due | Neutral | Balance Due + Neutral badge |
| Due | Excellent | Balance Due + Excellent badge |
| Due | Very Good | Balance Due + Very Good badge |
| Due | Good | Balance Due + Good badge |
| Due | Needs Attention | Balance Due + Needs Attention badge |
| Due | Problem | Balance Due + Problem badge |
| Advance | New | Advance Balance + New badge (score hidden) |
| Advance | Neutral | Advance Balance + Neutral badge |
| Advance | Excellent | Advance Balance + Excellent badge |
| Advance | Very Good | Advance Balance + Very Good badge |
| Advance | Good | Advance Balance + Good badge |
| Advance | Needs Attention | Advance Balance + Needs Attention badge |
| Advance | Problem | Advance Balance + Problem badge |

## Guardrails

- Clamp `|balance| < 0.01` to settled.
- If badge label is `New`, hide score even if numeric score exists.
- Hide last transaction line if older than 30 days.
