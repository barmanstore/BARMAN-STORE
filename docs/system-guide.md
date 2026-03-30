# System Guide (Simple Language)

This guide explains the whole system in plain language.
It is written for non‑technical readers and should stay up to date.

## Index

1. [What This System Is](#what-this-system-is)
2. [Who Uses It](#who-uses-it)
3. [What Problems It Solves](#what-problems-it-solves)
4. [A to Z Overview (Easy Map)](#a-to-z-overview-easy-map)
5. [How the System Is Built (Simple Architecture)](#how-the-system-is-built-simple-architecture)
6. [Daily Flow (Simple Summary)](#daily-flow-simple-summary)
7. [Customer Side (How It Feels)](#customer-side-how-it-feels)
8. [Shop Owner Side (Daily Work)](#shop-owner-side-daily-work)
9. [Billing and Money](#billing-and-money)
10. [Credit / Udhar (Simple Explanation)](#credit--udhar-simple-explanation)
11. [Payment Badges (Simple Meaning)](#payment-badges-simple-meaning)
12. [Supplier Side (Purchasing)](#supplier-side-purchasing)
13. [Stock and Restock](#stock-and-restock)
14. [Orders and Fulfillment](#orders-and-fulfillment)
15. [Notifications and Reminders](#notifications-and-reminders)
16. [Reports and Admin Views](#reports-and-admin-views)
17. [Planned Improvements](#planned-improvements)
18. [What This System Is Not](#what-this-system-is-not)
19. [Who Should Use This System](#who-should-use-this-system)
20. [Common Questions](#common-questions)
21. [Glossary (Simple Words)](#glossary-simple-words)
22. [Update Rules](#update-rules)
23. [Change Notes](#change-notes)

---

## What This System Is

This system helps run a small grocery shop.

It does four main things:
- Helps customers place orders.
- Helps the shop owner bill and track money.
- Helps manage suppliers and stock.
- Helps track credit and payments clearly.

In simple words:
It is a full shop operating system, not just a record book.

---

## Who Uses It

There are three types of users:

1. **Customer**
   - Browses items
   - Places order
   - Picks up from shop
   - Sees what they owe

2. **Shop Owner / Staff**
   - Makes bills
   - Records cash or credit
   - Tracks payments
   - Sees who owes money

3. **Supplier / Distributor**
   - Gets purchase orders
   - Delivers stock
   - Gets paid

---

## What Problems It Solves

Most small shops struggle with:
- Forgetting who owes money
- Losing track of stock
- Missing supplier follow‑ups
- Slow billing during busy hours

This system solves those by:
- Keeping one clear record of every sale and payment
- Showing who owes money and how much
- Making billing faster and more accurate
- Keeping stock and supplier work organized

---

## A to Z Overview (Easy Map)

Here is everything the system does, from A to Z:

**A. Accounts**
- Tracks every customer’s balance.
- Shows paid and unpaid amounts.

**B. Billing**
- Makes bills quickly.
- Supports cash or credit.

**C. Credit (Udhar)**
- Records every credit entry.
- Records every payment against that credit.

**D. Distributor / Supplier**
- Creates purchase orders.
- Tracks received stock and due payments.

**E. Expenses**
- Not a full accounting tool.
- Only store‑related credit and payment records.

**F. Follow‑ups**
- Reminders for unpaid credit.
- Flags customers who need attention.

**G. Goods / Products**
- Product catalog
- Prices, units, categories

**H. History**
- Full history of orders, bills, and payments.

**I. Inventory**
- Stock level view
- Low stock and out‑of‑stock visibility

**J. Jobs (Daily Work)**
- Today’s tasks: billing, receiving, payments

**K. Khata Book**
- Digital version of udhar tracking

**L. Ledger**
- System keeps a clean, consistent money trail

**M. Messaging**
- WhatsApp‑ready payment reminders (if enabled)

**N. Notifications**
- Order updates, credit reminders, stock alerts

**O. Orders**
- Customer orders and shop‑owner orders

**P. Payments**
- Multiple payments supported
- Partial payments supported

**Q. Quick Actions**
- Fast buttons for common daily actions

**R. Reports**
- Credit aging report
- Outstanding balance summary

**S. Suppliers**
- Who supplies which items
- What is pending

**T. Tracking**
- Track due dates and delays

**U. Users**
- Customers, staff, admins

**V. Verification**
- Contact verification for customer accounts

**W. WhatsApp**
- Send reminders and summaries easily

**X. eXtra Notes**
- Attach notes to payments and orders

**Y. You (Shop Owner)**
- All key data in one place

**Z. Zero Confusion**
- One system for all shop tasks

---

## How the System Is Built (Simple Architecture)

Think of the system as a small shop with three rooms:

1. **Front Room (The App Screen)**
   - This is what customers and staff see.
   - It is the website/app interface.

2. **Back Room (The Server)**
   - This is where rules live.
   - It decides what is allowed and what is not.

3. **Ledger Room (The Database)**
   - This is the store’s memory.
   - It stores products, orders, bills, payments, and balances.

Why this matters:
- The front room shows information.
- The back room controls actions.
- The ledger room keeps permanent records.

This makes the system safe and reliable.

---

## Daily Flow (Simple Summary)

A normal day looks like this:

1. Customer orders or visits the shop.
2. Shop owner creates a bill.
3. Payment is recorded (cash or credit).
4. Stock updates after billing.
5. If credit was used, it is tracked until payment.

---

## Customer Side (How It Feels)

The customer experience should feel simple:

1. See products
2. Choose items
3. Place order
4. Pick up in shop
5. Pay now or pay later

They should also be able to:
- See how much they owe
- View their past orders

---

## Shop Owner Side (Daily Work)

The shop owner uses the system for daily operations:

- Make bills quickly
- Mark payments as cash or credit
- Record payments later
- See who owes money
- See low stock items

This should feel like a faster, smarter billing counter.

---

## Billing and Money

Billing is the core daily action:

- The shop owner selects items.
- The system calculates totals.
- Payment is marked as cash or credit.

If payment is credit:
- The system records who owes money.
- The balance stays until paid later.

Bills are the official record of a sale.

---

## Credit / Udhar (Simple Explanation)

Udhar means a customer pays later.

The system:
- Records every credit entry
- Records every payment
- Keeps a running balance
- Shows who still owes money

This is like a digital “khata book.”

---

## Payment Badges (Simple Meaning)

The system uses simple labels to show how a customer pays over time.

Examples:
- **Excellent / Very Good**: usually pays on time
- **Good**: normal, no major problems
- **Needs Attention**: often late
- **Problem**: very late or not paying
- **New**: not enough history yet

Why this helps:
- You can quickly see who needs follow‑up.
- It saves time when checking many customers.

These badges do not replace trust.
They are just a quick signal to help you decide who to call first.

---

## Supplier Side (Purchasing)

Suppliers bring stock to the shop.

The system should help:
- Track what is ordered
- Track what was received
- Track what is still unpaid

This helps the shop avoid missed stock and late payments.

---

## Stock and Restock

Stock means how many items are left.

The system should:
- Show low stock
- Show out‑of‑stock items
- Suggest what to reorder

This avoids missed sales due to empty shelves.

---

## Orders and Fulfillment

Customers can place orders.

The shop owner can:
- Confirm the order
- Prepare items
- Mark items as received or delivered
- Bill directly from the order

This keeps orders and billing in one clean flow.

---

## Notifications and Reminders

Notifications are short messages in the system.

They can be:
- Payment reminders
- Order updates
- Stock alerts

These should be clear and action‑oriented.

---

## Reports and Admin Views

The system includes admin views for:
- Outstanding credit totals
- Aging reports (who is late, and how long)
- Customer payment behavior summaries
- Supplier and purchase order summaries

Reports help you make business decisions without guessing.

---

## Planned Improvements

This section lists what we want to build next.
These items may not be fully active today.

### 1. Trusted and Responsive User Interface

Goal: Build trust at first glance.

- A simple home page with:
  - Store name clearly shown
  - "Cash Only" and "In‑Store Pickup" message
  - "Open / Closed" status badge
  - A WhatsApp button for direct contact

Mobile experience:
- One‑handed use
- Vertical product list
- Large "Add" buttons
- Floating "View Bill / Order" button

Desktop experience:
- Owner dashboard layout
- Side‑by‑side view of:
  - Catalog
  - Short items
  - Active orders

### 2. "Informative Only" Inventory Logic

Goal: Allow real‑world stock mismatch without blocking sales.

- Owner can bill even if stock shows 0 or negative.
- "Quick Add Custom Item" for items not in catalog.
- If customer orders more than shown stock:
  - Show a polite "Stock may vary" note.
  - Allow the order to continue.

### 3. Digital Khata and Payment Collection

Goal: Replace the manual register.

- Simple customer status:
  - Green = no dues
  - Red = owes money
- One‑tap WhatsApp payment request.
  Message example:
  "Hi [Name], your balance at [Store Name] is ₹[Amount]. Please settle at your next visit. Thank you!"
- Every credit entry should store:
  - date
  - optional note (example: "forgot wallet")

### 4. Advanced Distributor and Analytics

Smart scheduling:
- Calendar view
- Highlights "Today’s Distributors" based on their weekly day

Shortage bridge:
- Short items can be tagged to a distributor
- Distributor profile shows "Items you need from them"

Simple business analytics:
- Top selling vs slow moving items
- Cash collected today vs udhar given
- Total vendor dues

### 5. Internal Implementation Notes

These are for developers, not customers:

- Database should allow negative stock (soft constraint).
- UI should support mobile and desktop layouts easily.
- Heavy analytics should run on backend, not mobile.

---

## What This System Is Not

This is not:
- A full accounting or tax tool
- A replacement for government billing systems
- A marketplace for multiple shops

It is focused on one shop’s daily operations.

---

## Who Should Use This System

This system is best for:
- Grocery shops
- Kirana stores
- Small to medium retail outlets
- Shops that give credit to regular customers
- Shops that manage local suppliers

It may be too much for:
- Very small shops with no credit or suppliers
- Shops that only sell pre‑packed goods with no tracking needs

---

## Common Questions

**Q: Can I see who owes money?**  
Yes, the system tracks credit and balances.

**Q: Can I record partial payments?**  
Yes, multiple payments are supported.

**Q: Can customers see their dues?**  
Yes, customer view shows balance.

**Q: Can I track suppliers?**  
Yes, purchasing and supplier tracking is part of the system.

---

## Glossary (Simple Words)

- **Bill**: The final record of what the customer bought.
- **Credit / Udhar**: Money the customer will pay later.
- **Balance**: How much is still unpaid.
- **Stock**: How many items are left.
- **Supplier**: Person or company that delivers items to the shop.
- **Payment Badge**: A simple label that shows how reliably someone pays.

---

## Update Rules

This guide must be updated whenever:
- A new workflow is added
- A screen changes meaning
- A role’s behavior changes

If the system changes, update this guide the same day.

---

## Change Notes

Add short notes here when the system changes:

- YYYY‑MM‑DD: short summary of what changed in simple language.
