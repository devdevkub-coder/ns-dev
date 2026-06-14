---
title: Supplier Tracking Page Flow
tags:
  - page-flow
  - menu
  - tracking
status: accepted-baseline
updated: 2026-06-14
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
- Local vs legacy finding: legacy row click opens supplier detail with PB list, payment list, product breakdown, and monthly breakdown. Current Next now has server-backed `supplierId`/`q` filters and row-click detail for PB/payment/product/monthly mix via `detailId`; WTI delivery, deduction, Grade Adjust, and payment reliability signals are wired from current source facts.
- Target UI direction: each supplier row/card opens a detail modal with PB source links, PMT movement, WTI delivery facts, Grade Adjust signals, product mix, monthly trend, and reliability/quality signals. Return is held until a purchase return source table/owner is confirmed.

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
- `payments`: PMT/PMA doc no/date/account/amount/status; source link waits for payment owner route contract
- `products`: product code/name/qty/purchase amount/avg buy/bill count
- `monthly`: bill count/payment count/qty/purchase amount/paid/payable by month
- `qualitySignals`: WTI delivery completeness, WTI deduction rate, Grade Adjust count, payment reliability, Return source status
- `weightTickets`: WTI doc/date/net/billed/remaining/deduction/status rows
- `gradeAdjustments`: adjustment doc/date/qty diff/value diff/reason/status rows

## Calculation Rules

- Purchase amount uses structured `purchase_bill_items` via `purchaseBillItemRows`.
- Item amount uses `netAmount`, `amount`, `totalAmount`, `total`; fallback `subtotal`, then `total_amount`.
- Item qty uses `netWeight` or `qty`.
- Payable uses `purchase_bills.payable_balance`.
- Paid amount sums `payments.amount` by supplier/date period.
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
- AP aging remains owned by [[Finance AP Page Flow]]; this page currently shows payable exposure only.
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
- Return frequency is intentionally held because the current schema has no confirmed purchase return source table/owner contract.
- AP aging/payment-cycle locks remain outside this page.

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
- [ ] Keep AP aging out until [[Finance AP Page Flow]] due-date rules are reconciled.

### UI

- [ ] Use `docs/design.md` list pattern: KPI cards, compact filter shell, tabs, desktop table, dense mobile cards.
- [x] Make supplier filter and search server-backed, not only client-side after aggregate load.
- [x] Make desktop rows and mobile cards clickable to open supplier detail.
- [x] Add detail modal/view sections: PB list, payment list, product mix.
- [x] Add detail sections for WTI, Grade Adjust, payment reliability, and quality signals.
- [x] Add monthly trend.
- [ ] Keep product breakdown visible but scoped to the active supplier/filter.
- [x] Keep PB source document links read-only and navigate to the purchase bill owner page.
- [ ] Add PMT/WTI/Grade Adjust source links after owner route contracts are confirmed.

## Implementation Checklist

- [x] Verify current API response shape and source tables
- [x] Record legacy supplier tracking/detail baseline
- [x] Mark read-only/export side-effect boundary
- [x] Add supplier/search filter if UI needs server-side filter
- [x] Add supplier detail/read endpoint or drilldown payload
- [x] Add source references to PB/PMT documents
- [x] Add WTI delivery completeness, deduction rate, Grade Adjust quality count, and supplier payment reliability signals
- [ ] Add Return frequency after source ownership/schema is confirmed
- [ ] Reconcile paid/payable formulas with final payment allocation facts
