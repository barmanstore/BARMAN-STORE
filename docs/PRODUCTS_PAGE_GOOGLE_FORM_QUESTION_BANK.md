# Products Page Audit - Google Form Question Bank

## Recommended Google Form Setup
- Form title: `Products Page A-Z Audit (Performance + Design + Loading)`
- Response collection: enabled
- Required for all MCQ questions: enabled
- Scoring scale for all questions:
  - `Yes (2)`
  - `Partial (1)`
  - `No (0)`
- Add one optional paragraph field after each section: `Evidence links / screenshots`

## Section 1: Performance and Loading
1. A - Above-the-fold speed: Does first visible product content render fast and are first-row images eager/high priority?
2. D - Data fetching efficiency: Are stale API calls canceled on filter/search changes and duplicate sorting avoided?
3. G - Grid scalability: Is true windowed virtualization used for large product lists?
4. I - Image optimization: Are responsive image sizes and fixed dimensions used to avoid layout shift?
5. J - Interaction latency: Are typing/tapping/add-to-cart interactions consistently responsive on low-end mobile?
6. L - Loading states: Are skeleton loaders used for card/list loading states?
7. P - Infinite loading: Does auto-load happen early enough and include a stable fallback button/end state?
8. R - Rerender containment: Are expensive sections memoized and rerenders minimized?
9. W - Weight budgets: Are route-level JS/CSS budgets defined and monitored?

## Section 2: Look and UX
10. B - Browsing flow: Can user reach first add-to-cart in three taps or fewer?
11. C - Card clarity: Do cards clearly prioritize name, variant, price, and CTA?
12. F - Filter/sort usability: Are controls easy to discover and quick to use?
13. H - Header overhead: Is above-the-fold chrome compact enough to show products quickly?
14. M - Mobile readability: Is text legible with strong hierarchy and no tiny critical labels?
15. N - Sticky behavior: Do sticky controls avoid overlap and viewport conflicts?
16. O - Offer communication: Are MRP, discount %, and savings communicated clearly?
17. T - Touch ergonomics: Are tap targets at least 44px and gesture actions reliable?
18. V - Visual consistency: Are typography, spacing, and CTA styles consistent across all modules?
19. Y - Intent alignment: Do quick reorder/restock/combo modules help without blocking core browsing?

## Section 3: Reliability and Quality
20. E - Error resilience: Do API errors show actionable recovery (retry/continue) paths?
21. K - Accessibility: Are core actions keyboard and screen-reader friendly?
22. Q - Search quality: Does search handle common typos, aliases, and relevant ranking?
23. S - State consistency: Are cart/filter/selection states reliable across refresh and navigation?
24. U - URL shareability: Do URL params preserve browse state for share/back-forward?
25. X - Cross-device QA: Is behavior validated across target mobile/desktop/network matrix?
26. Z - Zero/edge states: Are no-results and out-of-stock states clear and actionable?

## Optional Form Fields
- Environment tested (device, OS, browser, network)
- Build/version
- Reviewer name
- Release train/sprint

## Scoring Guide
- Total max score: `52` (26 questions x 2)
- Suggested interpretation:
  - `47-52`: Excellent
  - `42-46`: Strong
  - `34-41`: Needs Work
  - `<34`: Critical

