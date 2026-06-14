---
title: Trading Flow
tags:
  - trading
  - po-reports
  - page-flow
status: draft
updated: 2026-06-13
---

# Trading Flow

เอกสารนี้เป็นภาพรวมหมวด `Trading / PO Reports` สำหรับ active Next menu เท่านั้น ครอบคลุม:

- `/trading/dashboard`
- `/trading/matching`
- `/po-reports/outstanding`

## Business Boundary

Trading คือการซื้อมา-ขายไปที่แยกจาก stock/WAC ปกติ:

- `Purchase Bill` ที่ `transaction_mode = TRADING` และ manual `trading_cost_sources` เป็น source ต้นทุน Trading
- `Sales Bill` ที่ `transaction_mode = TRADING` เป็น source รายได้ Trading
- `trading_allocation_facts` เป็น fact ปัจจุบันสำหรับ allocation ระหว่างต้นทุน Trading กับ Trading Sales Bill และคำนวณ GP; legacy `trading_deals` เป็น source/backfill history เท่านั้น
- ยอด Trading GP ใช้ยอดก่อน VAT เป็นหลัก: `matched_sales_amount - matched_purchase_amount`
- การเลือกต้นทุน/บิลซื้อที่จะจับกับยอดขาย Trading ต้องเกิดก่อนหรือระหว่างการเปิด Trading Sales Bill; `/trading/matching` เป็น read surface หลัง match ไม่ใช่หน้ากดจับคู่ใหม่
- Trading ไม่สร้าง stock-in, stock-out, WAC movement หรือ stock ledger เอง
- ถ้า Sales Bill มี line ที่เป็น stock source จริง ผลกระทบ stock ต้องอยู่ใน `Sales Flow` / `Sales Bills Page Flow` ไม่ใช่ Trading Matching

PO Reports เป็นรายงาน commitment ของ PO:

- `PO Buy Outstanding` = POB ที่ยังต้องรับของจริงและยังเหลือจำนวน
- `PO Sell Outstanding` = POS ที่ยังต้องส่งของจริงและยังเหลือจำนวน
- PO report ไม่สร้าง/แก้ PO, ไม่ close-short, ไม่ตัด stock และไม่สร้าง AP/AR

## Active Pages

| Page | Route | Purpose | Detailed doc |
|---|---|---|---|
| Trading Dashboard | `/trading/dashboard` | trader/operator monitor สำหรับ margin, allocation, pending buy/sell, stock/cost-source readiness และ exposure ของ Trading | [[page-flows/trading-po-reports-trading-dashboard|Trading Dashboard Page Flow]] |
| Trading Matching | `/trading/matching` | allocation rows ที่อ้าง Sales Bill, expected GP, buy-side remaining cost, export | [[page-flows/trading-po-reports-trading-matching|Trading Matching Page Flow]] |
| PO ซื้อ/ขาย คงเหลือ | `/po-reports/outstanding` | รายงาน POB/POS ค้างรับ/ค้างส่งตาม remaining qty/value | [[page-flows/trading-po-reports-po-reports-outstanding|PO Outstanding Page Flow]] |

## Current API Snapshot

| Route | API | Permission | Current behavior |
|---|---|---|---|
| `/trading/dashboard` | `GET /api/trading/dashboard` | `finance.cash.view` | อ่าน `purchase_bills`, `sales_bills`, `trading_deals`, `products`; filter `q/status/from/to`; คืน summary, purchases, sales, recentDeals, statusBreakdown, topProducts, productList, trend |
| `/trading/matching` | `GET /api/trading/matching` | `finance.cash.view` | อ่าน PB/SB Trading และ `trading_deals`; filter `q/from/to` ใน UI; export `format=xlsx`; แสดง allocation rows และ buy-side remaining cost |
| `/po-reports/outstanding` | `GET /api/po-reports/outstanding` | `reports.reports.view` | อ่าน `po_buys`, `po_sells`; exclude cancelled/received/closed/completed; `require_delivery != false`; คืน buyRows, sellRows, summary |

## Source Rules

### Trading Purchase

- Source table: `purchase_bills`
- Include only `transaction_mode = TRADING`
- Exclude cancelled/void/reversed rows from active totals
- Amount basis: `subtotal` first, fallback `total_amount`
- Remaining for matching = purchase ex-VAT amount - active matched purchase amount in `trading_deals`

### Trading Sale

- Source table: `sales_bills`
- Include only `transaction_mode = TRADING`
- Exclude cancelled/void/reversed rows from active totals
- Amount basis: `subtotal` first, fallback `total_amount`
- Remaining for matching = sales ex-VAT amount - active matched sales amount in `trading_deals`

### Trading Allocation / Deal Fact

- Source table: `trading_allocation_facts`
- Active deal excludes `Cancelled` / `cancelled`
- GP = `matched_sales_amount - matched_purchase_amount`
- GP% = `GP / matched_sales_amount`
- The visible business reference on `/trading/matching` is the Sales Bill, not `deal_no`.
- A fact must keep purchase bill/cost source reference, sales bill reference, supplier/customer/product snapshot, matched qty, matched amounts, and audit dates.
- Manual non-PB source is stored in `trading_cost_sources` and referenced by `trading_allocation_facts.trading_cost_source_id`; it must not create stock ledger, warehouse, WTO, PSALE, or WAC side effects.

## Trading Dashboard Target Requirement

`/trading/dashboard` is a trader/operator monitor, not an accounting dashboard. It must show enough operational facts to decide which deals are profitable, which allocations are still pending, how much buy/sell commitment is exposed, and whether stock or cost source is ready for sale.

### Required Sources

- `PO Buy`: pending buy commitments and source purchase intent.
- `PO Sell`: pending sell commitments and remaining customer obligation.
- `Cost Pool / Trading Cost Source`: available Trading cost source and matched/remaining cost from `stock_cost_pool_entries` and `trading_cost_sources`.
- `Allocation / Trading deal fact`: matched COGS, matched sales amount, GP, GP%, allocation status.
- `Sales`: Trading Sales Bill lines and ex-VAT sales amount.
- `Stock / availability read model`: stock/cost readiness signal for products where Trading needs availability visibility.

### Required Dashboard Views

| View | Purpose | Required filters |
|---|---|---|
| Trading by Product | รวม Qty, Sales, Matched COGS, GP, GP% ตามสินค้า พร้อม total row | date from/to, supplier, customer, bill no, product |
| Trading Purchase | ดู Trading PB/PO Buy/cost source ที่ซื้อแล้ว, match แล้ว, ค้างรอขาย หรือค้าง allocation | date from/to, supplier, customer, bill no |
| Trading Sales | ดู Trading SB/PO Sell ที่ขายแล้ว, matched cost แล้ว, ค้าง allocation หรือยังมี exposure | date from/to, supplier, customer, bill no |

### Dashboard Calculation Rules

- Purchase amount and Sales amount are ex-VAT.
- `Matched COGS` is the cost matched/allocated from Trading cost source or allocation fact, not AP/AR settlement.
- `Trading GP = Sales - Matched COGS`.
- `GP% = GP / Sales`; if Sales is zero, display zero/blank according to UI convention, never divide silently into invalid values.
- Product Qty and Sales come from Trading Sales Bill line facts.
- Product Matched COGS comes from the matched cost allocated to those sales lines/products; if one allocation spans multiple products, allocate deterministically by the recorded allocation line or by documented proportional basis, not by UI fallback.
- Top product profit = sum GP for that product in the filtered result.

### Non-Goals

- Do not show the dashboard as cash/bank/payment/AP/AR settlement.
- Do not use accounting AR/AP exposure cards as the main dashboard answer.
- Do not write Trading match, stock ledger, payment, receipt, or status mutation from this page.
- Trend charts, matching donuts, duplicate cleanup, cloud pull, recalc, and reverse controls are not target dashboard requirements unless later re-approved.

## Target Allocation Lifecycle

Current Next API is read/report/export only. Target write behavior belongs to the source Trading Sales Bill / Purchase Bill correction flow:

| Step | Target action | System rule |
|---|---|---|
| 1 | User creates or edits Trading Sales Bill | Sales flow must require a Trading purchase/cost source allocation before the bill becomes visible as matched |
| 2 | System records allocation fact | Amounts must be > 0 and not exceed remaining ex-VAT amount of the cost source and sales amount |
| 3 | User opens `/trading/matching` | Page reads completed allocation facts, expected GP, GP%, and buy-side remaining cost |
| 4 | User needs correction/reverse | Correct through the source Purchase Bill / Sales Bill flow and audit ledger, not by inline reverse on `/trading/matching` |
| 5 | User audits downstream | Allocation Ledger, Deal Margin, and Waiting Allocation consume the same allocation facts |

## Status Display

`/trading/matching` must not show status cards, a status donut, a status filter, or a status column. Rows that reach this page are treated as completed allocation facts for display. Cancelled/reversed facts remain excluded from active totals.

## Relationship With Other Flows

- `Purchase Flow`: owns Trading PB creation, payable behavior, and source-side corrections.
- `Sales Flow`: owns Trading SB creation, optional PO Sell commitment reduction, Trading allocation handoff, and customer receivable. Trading SB does not own stock movement.
- `PO Buy Page Flow`: owns POB lifecycle, close-short, and allocation into PB.
- `PO Sell Flow`: owns POS lifecycle, downstream allocation, and close-short policy.
- `Dual Costing Flow`: downstream allocation ledger, waiting allocation, and margin analysis surfaces consume/reconcile allocation facts where applicable.
- `Stock Ledger and Stock Balance`: Trading Matching must not write stock movement.

## Open Gaps

- Trading SB create/cancel now records PB-backed and manual Trading Cost Source-backed allocation facts. Full Sales Bill document edit remains disabled; allocation-only Trading SB correction uses audited `correct_trading_allocations` to reverse old active facts and append corrected active facts without stock movement.
- Trading Dashboard now has the trader/operator tab layout, explicit filters, source PB/SB links, allocation-backed Matched COGS, manual Cost Source create/list modal, read-only PO Buy/PO Sell/Cost Source readiness, and Pending Buy/Sell aging buckets.
- Source document drilldown still needs to be completed for downstream allocation/deal margin rows beyond the dashboard PB/SB links.
- Duplicate deal cleanup must be an admin/audited operation, not silent runtime cleanup.
- Manual non-PB Trading Cost Source is now a first-class current source via `trading_cost_sources` and can be created/listed from `/trading/dashboard`; future work is to decide whether it remains a standalone source table or merges into a broader normalized Trading cost-source ledger.
- PO Outstanding current API has no server-side filters/export even though legacy UI had tab/filter/export behavior.
- Future deal-margin aging should use created/document/expected delivery dates according to [[Document Aging Policy]].
