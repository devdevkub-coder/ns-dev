---
title: Supplier Tracking Page Flow
tags:
  - page-flow
  - menu
  - tracking
status: accepted-baseline
updated: 2026-06-15
route: /tracking/supplier
---

# Supplier Tracking Page Flow

## Scope

| Field | Value |
|---|---|
| Menu section | Tracking 360 |
| Route | `/tracking/supplier` |
| Page | Supplier Tracking |
| Current Next | accepted code baseline |
| Canonical overview | [[Tracking 360 Flow]] |

## Canonical References

- [[Tracking 360 Flow]]
- [[Purchase Flow]]
- [[Payment Flow]]
- [[Finance AP Page Flow]]
- [[Document Aging Policy]]
- [[Menu Page Flow Catalog]]

## Legacy Baseline

Legacy `view-supplierTracking`:

- วิเคราะห์ Supplier ตามปี/เดือน พร้อม selector supplier, tabs `รายการ`, `Top 10`, `รายปี`
- Source หลักคือ `purchaseBills`, `payments`, `suppliers`, `products`
- Aggregate ต่อ supplier: จำนวนบิล, น้ำหนักซื้อ, purchase amount, avg buy, paid, payable, paid%
- มี top purchase amount, top qty, ราคาซื้อถูกสุด/แพงสุด, top payable, payment status distribution
- มี drilldown detail ต่อ supplier: bills, payments, product breakdown, monthly breakdown
- Export CSV ใช้ filter/view ปัจจุบัน

## Requirement Update 2026-06-13

Latest user screenshot changes the target from purchase/payable summary into a supplier quality and reliability page.

- Purpose: ติดตาม supplier ด้านต้นทุน คุณภาพ และ reliability
- Required data groups: Purchase Bill, WT/WTI, Grade Adjust, Payment, Return
- Decision questions: supplier ไหนต้นทุนดี, ส่งครบไหม, quality ดีไหม, จ่ายดีไหม
- Business importance: ธุรกิจ scrap ต้องเห็น supplier quality เพราะ supplier แต่ละรายไม่เท่ากัน
- Local vs legacy finding: legacy row click opens supplier detail with PB list, payment list, product breakdown, and monthly breakdown. Current Next now has server-backed `supplierId`/`q` filters and row-click detail for PB/payment/product/monthly mix via `detailId`; WTI delivery, deduction, Grade Adjust, AP aging, and payment reliability signals are wired from current source facts.
- Target UI direction: each supplier row/card opens a detail modal with PB source links, PMT movement, WTI delivery facts, Grade Adjust signals, AP aging, product mix, monthly trend, and reliability/quality signals. Return is held until a purchase return source table/owner is confirmed.

## Page Responsibilities

- แสดงภาพรวมผู้ขายจากยอดรับซื้อ จ่ายเงิน เจ้าหนี้ และราคาเฉลี่ยซื้อ
- ใช้ตรวจ supplier performance, purchase concentration, payable exposure, avg buy risk
- ใช้ตรวจ supplier quality/reliability เพื่อช่วยเลือกซื้อจาก supplier ที่ต้นทุนดี ส่งครบ และคุณภาพสม่ำเสมอ
- แสดง product mix จาก purchase bill items
- Export supplier row set เป็น `.xlsx`
- Target drilldown: supplier -> PB/PMT/product breakdown/source document links

## Non-Responsibilities

- ไม่สร้าง/แก้ Purchase Bill, PMA, PMT, ADV
- ไม่อนุมัติจ่ายเงินหรือจ่ายเงิน
- ไม่เขียน bank statement หรือ AP settlement
- ไม่แก้ supplier master
- ไม่เปลี่ยนสถานะ PB/PMT/PMA

## Current API

### `GET /api/tracking/supplier`

Permission: `reports.reports.view`

Query:

| Query | Meaning |
|---|---|
| `year` | ปี ค.ศ.; default ปีปัจจุบัน |
| `month` | เดือน `1-12` หรือ `01-12`; optional |
| `supplierId` | supplier business code หรือ internal id |
| `q` | ค้นหา supplier code/name |
| `format=xlsx` | export workbook |

Server-side `supplierId` and `q` now apply to rows, byProduct, monthly, summary, and export.

Source tables:

- `suppliers` active only
- `purchase_bills` excluding `PURCHASE_BILL_CANCELLED_STATUSES`
- `payments` excluding `status = cancelled`
- `weight_tickets` WTI excluding cancelled tickets
- `grade_adjustments` excluding reversed/cancelled adjustments

Branch scope:

- For branch-scoped users, Purchase Bill, Payment, WTI, and Grade Adjust facts are limited to documents with allowed branch evidence. PB/PMT/Grade Adjust allow null legacy/global branch ids; WTI requires allowed `branch_id`.
- `filters.suppliers`, rows, byProduct, monthly, summary, detail, and export are derived from the scoped source facts. Active supplier master rows without visible scoped facts must not appear as selectable filter options.
- Requesting `supplierId/detailId` for a supplier with no visible scoped source facts returns no row/detail instead of leaking cross-branch data.

Response:

| Field | Meaning |
|---|---|
| `filters.suppliers` | active supplier options using business code as id |
| `rows` | aggregate supplier rows |
| `byProduct` | product-level purchase summary across selected period |
| `monthly` | 12-month purchase amount/qty series for selected year |
| `summary` | paidAmount, payable, purchaseAmount, qty, suppliers |
| `year` | selected year |

Row fields:

- `code`, `supplierName`
- `billCount`, `paymentCount`
- `qty`, `purchaseAmount`, `avgBuy`
- `paidAmount`, `payable`, `paidPct`
- `wtiCount`, `deliveryCompletionPct`, `deductionPct`, `gradeAdjustmentCount`

Target detail payload fields:

- `bills`: PB doc no/date/product qty/amount/avg buy/paid/payable/status/source link
- `payments`: PMT/PMA doc no/date/account/amount/status/source link to `/purchase/payments?tab=history&q=<PMT>`
- `products`: product code/name/qty/purchase amount/avg buy/bill count
- `monthly`: bill count/payment count/qty/purchase amount/paid/payable by month
- `qualitySignals`: WTI delivery completeness, WTI deduction rate, Grade Adjust count, AP aging buckets, overdue AP, oldest AP age, payment reliability, Return source status
- `weightTickets`: WTI doc/date/net/billed/remaining/deduction/status/source link rows
- `gradeAdjustments`: adjustment doc/date/qty diff/value diff/reason/status/source link rows; owner link targets `/stock/convert?q=<GA>` until a separate Grade Adjust detail route exists.

## Calculation Rules

- Purchase amount uses structured `purchase_bill_items` via `purchaseBillItemRows`.
- Item amount uses `netAmount`, `amount`, `totalAmount`, `total`; fallback `subtotal`, then `total_amount`.
- Item qty uses `netWeight` or `qty`.
- Payable uses `purchase_bills.payable_balance`.
- AP aging uses [[Document Aging Policy]] financial due aging buckets: `Current`, `1-30`, `31-60`, `61-90`, `>90`.
- Current purchase bill schema has no confirmed supplier due-date or supplier credit-term field, so Tracking Supplier uses Purchase Bill document date as the AP aging reference date and labels that source as `documentDate`.
- AP aging amount uses active payable per bill only when payable is greater than zero.
- Paid amount sums settlement value from non-cancelled `payments` by supplier/date period: `amount + withholding_tax + discount`.
- Paid% = `paidAmount / (paidAmount + payable) * 100` when denominator > 0.
- Product mix groups purchase items by product name/code and counts distinct PB doc numbers and suppliers.
- WTI delivery completeness = billed WTI summary weight / net WTI summary weight.
- Deduction% = WTI deduct weight / WTI gross weight.
- Grade Adjust signal counts adjustments whose product/source/target product appears in the supplier's WTI product summaries for the selected period.
- Sort default is purchase amount descending.

## Lifecycle / Read Flow

| Step | User action | System result |
|---|---|---|
| 1 | เปิดหน้า | โหลด supplier tracking ของปีปัจจุบัน |
| 2 | เลือก year/month/supplier/search | API recalculates rows, byProduct, monthly, summary |
| 3 | ดู top/payable | User identifies purchase concentration and payable exposure |
| 4 | Export | Download `tracking_supplier_<year>[_month].xlsx` |
| 5 | เปิด detail | Open supplier detail with PB/PMT/product/monthly trend and quality/reliability signals |

## Validation / Status Rules

- Cancelled PB/PMT must be excluded.
- Supplier business code is required for outward id through `requireBusinessCode`.
- Payment amount must be counted from payment facts, not inferred only from PB paid snapshots.
- AP aging is read-only in this page; Finance AP remains the owner flow for settlement/payment-cycle mutation and future due-date/credit-term source upgrades.
- If supplier filtering/search is added, JSON response and export must share the same filter.

## Side Effects

- Current API is read-only/export only.
- No purchase, payment, bank, AP, stock, supplier-master, or source status mutation.

## Current Gap

- Supplier/search server-side filter is now implemented for aggregate rows, product mix, monthly, summary, and export.
- API now returns supplier detail rows for PB/payment drilldown through `detailId`.
- Product mix follows the active supplier/filter and is also available inside supplier detail.
- Supplier detail monthly purchase/payment trend is available for the selected year.
- WTI delivery completeness, WTI deduction rate, Grade Adjust count, and payment reliability are wired into the API/UI.
- API/UI now expose read-only AP aging buckets, overdue AP amount/count, and oldest AP age from current Purchase Bill payable facts.
- API now reconciles Supplier Tracking paid/reliability/monthly paid formulas with the current payment settlement rule: non-cancelled PMT `amount + withholding_tax + discount`.
- Return frequency is intentionally held because the current schema has no confirmed purchase return source table/owner contract.
- Authenticated browser QA now covers desktop row detail, dense mobile card detail, PB/PMT/WTI/Grade Adjust source navigation, WTI/payment/Grade Adjust signals, scoped product mix, held Supplier Return messaging, XLSX export, and no page-level mobile horizontal overflow.
- UI now follows the `docs/design.md` list-page order more closely: compact KPI cards first, then filter shell, then tabs/data area. The old pre-filter monthly/top blocks are removed from the default top flow.
- Payment-cycle locks remain outside this page. AP aging is report-only here and currently uses PB document date until PB due-date/supplier credit-term schema is confirmed.

## Implementation Tasks

### API

- [x] Add `supplierId` and `q` server-side filters to `GET /api/tracking/supplier`.
- [x] Keep aggregate JSON rows, product mix, monthly trend, and `format=xlsx` export on the same filter contract.
- [x] Return PB source rows with doc no, date, qty, purchase amount, avg buy, paid, payable, status, and source link.
- [x] Return PMT/Payment rows with doc no, date, method, amount, status, and source facts.
- [x] Return product mix scoped by selected supplier when supplier filter/detail is active.
- [x] Add monthly purchase/payment trend scoped to supplier detail.
- [x] Add quality/reliability signal fields from confirmed source facts: WTI delivery completeness, WTI deduction, Grade Adjust count, and payment reliability.
- [ ] HOLD: Add Return frequency once source ownership/schema exists.
- [x] Add read-only AP aging buckets, overdue AP amount/count, and oldest AP age using PB document date until due-date/credit-term source fields exist.

### UI

- [x] Use `docs/design.md` list pattern: KPI cards, compact filter shell, tabs, desktop table, dense mobile cards.
- [x] Make supplier filter and search server-backed, not only client-side after aggregate load.
- [x] Make desktop rows and mobile cards clickable to open supplier detail.
- [x] Add detail modal/view sections: PB list, payment list, product mix.
- [x] Add detail sections for WTI, Grade Adjust, payment reliability, and quality signals.
- [x] Add AP aging bucket section and overdue/oldest-age columns in row/detail views.
- [x] Add monthly trend.
- [x] Keep product breakdown visible but scoped to the active supplier/filter.
- [x] Keep PB source document links read-only and navigate to the purchase bill owner page.
- [x] Add PMT/WTI/Grade Adjust source links after owner route contracts are confirmed; Grade Adjust currently deep-links to the owner list filter, not a separate detail route.

## Implementation Checklist

- [x] Verify current API response shape and source tables
- [x] Record legacy supplier tracking/detail baseline
- [x] Mark read-only/export side-effect boundary
- [x] Add supplier/search filter if UI needs server-side filter
- [x] Add supplier detail/read endpoint or drilldown payload
- [x] Add source references to PB/PMT documents
- [x] Add WTI delivery completeness, deduction rate, Grade Adjust quality count, and supplier payment reliability signals
- [x] Add read-only AP aging buckets from current PB payable facts
- [ ] Add Return frequency after source ownership/schema is confirmed
- [x] Reconcile paid/payable formulas with current payment settlement facts

## 2026-07-12 Table consistency checkpoint

`/tracking/supplier` detail tables now align numeric headers and bodies from the actual column values and use canonical `p-2` header / `p-3` body density. What is what: these remain read-only supplier performance, product, payment, and yearly facts. Why it stays this way: the detail surfaces must share one table rhythm while tracking formulas, exports, API behavior, permissions, database schema, and DB state remain unchanged.
