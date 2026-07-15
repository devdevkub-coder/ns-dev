---
title: Customer Tracking Page Flow
tags:
  - page-flow
  - menu
  - tracking
status: accepted-baseline
updated: 2026-06-29
route: /tracking/customer
---

# Customer Tracking Page Flow

## Scope

| Field | Value |
|---|---|
| Menu section | Tracking 360 |
| Route | `/tracking/customer` |
| Page | Customer Tracking |
| Current Next | accepted code baseline |
| Canonical overview | [[Tracking 360 Flow]] |

## Canonical References

- [[Tracking 360 Flow]]
- [[Sales Flow]]
- [[Payment Flow]]
- [[Finance AR Page Flow]]
- [[Document Aging Policy]]
- [[Menu Page Flow Catalog]]

## Legacy Baseline

Legacy `view-customerTracking`:

- วิเคราะห์ลูกค้าตามปี/เดือน พร้อม selector ลูกค้า, tabs `รายการ + สถิติ`, `Top 10 + วิเคราะห์`, `รายปี`
- Source หลักคือ `salesBills`, `receipts`, `customers`, `products`
- Aggregate ต่อ customer: จำนวนบิล, น้ำหนักขาย, revenue, COGS, GP, GP%, profit/kg, received, receivable
- มี top revenue, top GP, top GP%, margin ต่ำ/ติดลบ, top receivable
- มี drilldown detail ต่อ customer: sales list, receipts list, product breakdown, monthly breakdown
- Export CSV ใช้ filter/view ปัจจุบัน

## Requirement Update 2026-06-13

Latest user screenshot changes the target from a simple customer sales summary into a decision page for customer behavior, credit, and movement.

- Purpose: ติดตามพฤติกรรมลูกค้า ยอดซื้อ/ขาย กำไร เครดิต และ movement ทั้งหมดของ customer
- Required data groups: Sales Bill, Receipt, Margin, Pending AR. Customer return is intentionally not tracked as a separate source; corrections use Sales Bill void/cancel.
- Decision questions: ลูกค้าคนไหนซื้อเยอะ, margin ดีไหม, จ่ายช้าไหม, มี void/cancel เอกสารผิดปกติไหมใน source flow
- Business actions supported: เพิ่มเครดิต, ลดเครดิต, ต้นยอดขาย, blacklist
- Local vs legacy finding: legacy row click opens customer detail with sales list, receipt list, product breakdown, and monthly breakdown. Current Next now supports row-click detail for SB/RCP/product/monthly breakdown via `detailId`; pending AR, AR aging, credit utilization, and margin decision signals are wired from current source facts.
- Target UI direction: list remains high-density, but each customer row/card opens a detail modal with SB/RCP movement, SB source links, product breakdown, channel breakdown, monthly movement, pending AR/AR aging/receivable exposure, and credit/margin decision signals. Return count/value is removed by requirement; use void/cancel documents instead.

## Requirement Update 2026-06-29

- Remove the `ลูกค้า` select/search control that resolves customers from Master Customer.
- The page must not require users to pick a customer from Master Customer before viewing Customer Tracking.
- Use one combined free-text search field only. This search can match customer code/name or visible row text, but it is not a Master Customer combobox.
- Keep period filters (`year`, optional `month`) and export.
- Backend may keep accepting `customerId` only for backward compatibility or deep links, but the main UI must not render or send the Master Customer `customerId` selector.

## Page Responsibilities

- แสดงภาพรวมลูกค้าจากยอดขาย รับเงิน ลูกหนี้ และ GP
- ใช้สำหรับตรวจ customer performance, receivable exposure, margin risk
- ใช้สนับสนุนการตัดสินใจด้านเครดิต ยอดขาย และ blacklist โดยอ้างอิง behavior/movement จริง
- แสดง monthly trend ของยอดขาย/GP ต่อปี
- Export row set ปัจจุบันเป็น `.xlsx`
- Target drilldown: customer -> SB/RCP/product breakdown/source document links

## Non-Responsibilities

- ไม่สร้าง/แก้ Sales Bill หรือ Receipt
- ไม่ allocate customer advance
- ไม่เขียน bank statement หรือ AR settlement
- ไม่เปลี่ยน credit term/credit limit ของ customer master
- ไม่เปลี่ยนสถานะ SB/RCP

## Current API

### `GET /api/tracking/customer`

Permission: `reports.reports.view`

Query:

| Query | Meaning |
|---|---|
| `year` | ปี ค.ศ.; default ปีปัจจุบัน |
| `month` | เดือน `1-12` หรือ `01-12`; optional |
| `q` | ค้นหา customer code/name จากช่องค้นหารวม ไม่ใช่ช่องเลือกจาก Master Customer |
| `customerId` | Deprecated/backward compatibility only; main UI must not render the Master Customer customer selector |
| `format=xlsx` | export workbook |

Source tables:

- `customers` active only
- `sales_bills` excluding `status = cancelled`
- `receipts` excluding `status = cancelled`

Branch scope:

- For branch-scoped users, Sales Bill and Receipt facts are limited to documents whose `branch_id` is null legacy/global or included in the user's allowed branch set.
- `filters.customers`, rows, summary, monthly, detail, and export are derived from the scoped source facts. Active customer master rows without visible scoped facts must not appear as selectable filter options.
- Requesting `customerId/detailId` for a customer with no visible scoped source facts returns no row/detail instead of leaking cross-branch data.

Response:

| Field | Meaning |
|---|---|
| `filters.customers` | active customer options using business code as id |
| `rows` | aggregate customer rows |
| `monthly` | 12-month revenue/qty/GP series for selected year |
| `summary` | total cogs/customers/gp/qty/receivable/received/revenue |
| `year` | selected year |

Row fields:

- `code`, `customerName`
- `billCount`, `receiptCount`
- `qty`, `revenue`, `cogs`, `gp`, `gpPct`, `profitPerKg`, `avgSell`
- `receivedAmount`, `receivable`, `creditLimit`

Target detail payload fields:

- `sales`: SB doc no/date/channel/qty/revenue/COGS/GP/received/receivable/source link
- `receipts`: RCP doc no/date/account/amount/status/source link to `/sales/receipts?tab=history&q=<RCP>`
- `products`: product code/name/qty/revenue/COGS/GP/GP%
- `channels`: channel name, bill count, qty, revenue, COGS, GP, GP%
- `monthly`: bill count/qty/revenue/GP/received/receivable by month
- `signals`: margin quality, pending AR, AR aging buckets, overdue AR, oldest AR age, credit-limit utilization

## Calculation Rules

- Sales bill amount uses item JSON total first: `netAmount`, `amount`, `total`; fallback `subtotal`, then `total_amount`.
- Sales qty uses item JSON: `netWeight`, `weight`, `qty`.
- COGS uses `sales_bills.cogs_amount` fallback `total_cost`.
- GP uses `sales_bills.gross_profit`; if missing, `revenue - cogs`.
- Receipt amount counted toward received = `amount + withholding_tax + discount`.
- Receivable per bill = `max(0, total_amount - receivedByBill)`.
- Pending AR bill count = sales bills whose receivable balance is greater than zero.
- AR aging uses [[Document Aging Policy]] financial due aging buckets: `Current`, `1-30`, `31-60`, `61-90`, `>90`.
- AR aging reference date uses `sales_bills.due_date` first; if missing, use `sales_bills.date + sales_bills.credit_term`; if missing, use `sales_bills.date + customers.credit_term`; if still missing, use sales bill document date.
- AR aging amount uses active receivable per bill only when receivable is greater than zero.
- Credit utilization% = pending AR amount / customer credit limit when credit limit is configured.
- Low-margin bill count uses GP% below 5%; negative-margin bill count uses GP below zero.
- Customer return frequency is not calculated; cancelled/voided Sales Bill and Receipt rows are excluded from active totals and remain auditable in their owner flow.
- Rows with no bill/revenue/receivable are excluded.
- Sort default is revenue descending.

## Lifecycle / Read Flow

| Step | User action | System result |
|---|---|---|
| 1 | เปิดหน้า | โหลด customer tracking ของปีปัจจุบัน |
| 2 | เลือก year/month/search | API recalculates rows, monthly, summary with same filters |
| 3 | ดู top/summary | User identifies revenue, margin, receivable risk |
| 4 | Export | Download `tracking_customer_<year>[_month].xlsx` |
| 5 | เปิด detail | Open customer detail with SB/RCP/product/monthly movement and credit decision signals |

## Validation / Status Rules

- No Master Customer selector is shown in the main UI; customer-specific filtering from UI uses the combined text search only.
- Cancelled SB/RCP must be excluded.
- Receipt amount must not double count bill received amount and aggregate receipt list separately without stating purpose.
- Customer code is required for outward id; missing business code should fail loudly through `requireBusinessCode`.
- AR aging must keep due date/reference date/as-of date separate and follow [[Document Aging Policy]].

## Side Effects

- Current API is read-only/export only.
- No stock, bank, receipt, AR, credit, or source document mutation.

## Current Gap

- API now returns drilldown SB/RCP source rows per customer through `detailId`.
- API now returns product and channel breakdown per customer.
- API/UI now return monthly movement per customer for selected year.
- API/UI now expose pending AR amount/count, credit utilization, low-margin bill count, and negative-margin bill count as decision signals.
- API/UI now expose read-only AR aging buckets, overdue AR amount/count, and oldest AR age from current Sales Bill/customer credit-term facts.
- Return signal/count is removed by requirement; customer corrections use Sales Bill void/cancel instead of a separate Customer Return source.
- Authenticated browser QA now covers desktop row detail, dense mobile card detail, SB source navigation, RCP source navigation, RCP/detail/product/monthly breakdown rendering, XLSX export, and no page-level mobile horizontal overflow.
- UI now follows the `docs/design.md` list-page order more closely: compact KPI cards first, then filter shell, then tabs/data area. The old pre-filter hero/chart blocks are removed from the default top flow.
- UI duplicate-data cleanup 2026-07-07: the top `customers` count card is removed because it duplicated the pagination/result summary (`พบทั้งหมด X รายการ`). Row count belongs with the table controls; KPI cards remain for decision metrics only. The first tab label is simplified to `รายการ`. The top KPI set uses overdue customer count instead of an overdue money amount, and the table shows `ลูกหนี้` as the money amount while `อายุหนี้` shows overdue status/days, so receivable and overdue values do not repeat as adjacent money columns.
- UI wording follow-up 2026-07-08: table/filter/detail wording uses Thai for active customer/product labels (`รหัส`, `ลูกค้า`, `ค้นหาลูกค้า`, `สินค้า`, `เลือกสินค้า`) while keeping the route/module name `Customer Tracking 360°`.
- Finance AR remains the owner flow for settlement/payment-cycle mutation; Tracking Customer only consumes the read-only due-aging signal.
- Customer advance allocation is out of scope here and should come from Sales/Payment flow facts.

## Implementation Tasks

### API

- [x] Extend `GET /api/tracking/customer` with customer detail mode or detail payload keyed by customer business code.
- [x] Return SB source rows with doc no, date, qty, revenue, COGS, GP, received, receivable, and source link.
- [x] Return RCP source rows with doc no, date, method, amount, and status.
- [x] Return product breakdown per customer for selected period: product name, qty, revenue, COGS, GP, GP%.
- [x] Return channel breakdown per customer for selected period: channel name, bill count, qty, revenue, COGS, GP, GP%.
- [x] Return monthly movement per customer for selected year: bill count, qty, revenue, GP, received, receivable.
- [x] Add structured decision signals: low margin, negative margin, pending AR, and credit utilization.
- [x] Add read-only AR aging buckets, overdue AR amount/count, and oldest AR age from [[Document Aging Policy]].
- [x] Remove return frequency from Customer Tracking; use void/cancel Sales documents.
- [x] Keep `year/month/q` filter and `format=xlsx` export aligned with the JSON result; `customerId` is backend/deep-link compatibility only and must not be exposed as a Master Customer selector.
- [x] Render SB source links in the detail table; `/sales/bills/[id]` is available as a read-only owner page.
- [x] Add RCP source links after `/sales/receipts` detail/deep-link contract is confirmed.

### UI

- [x] Keep `docs/design.md` ordering: KPI cards, filter shell, tabs, pagination/summary if row count grows, data area.
- [x] Use compact filter shell with year, month, combined text search, and XLSX export button. Do not show the Master Customer customer selector.
- [x] Make desktop rows and dense mobile cards clickable to open customer detail.
- [x] Add detail modal/view sections: SB list, RCP list, product breakdown.
- [x] Add dense mobile cards and keyboard-openable mobile card controls for the same customer detail.
- [x] Add monthly movement and decision signals.
- [x] Add AR aging bucket section and overdue/oldest-age columns in row/detail views.
- [x] Add channel breakdown section in customer detail.
- [x] Add source document links as read-only navigation for SB and RCP owner routes; no mutation actions.
- [x] Preserve table density with `text-sm`, `p-2`, `bg-slate-100` header, and no nested cards.

## Implementation Checklist

- [x] Verify current API response shape and source tables
- [x] Record legacy customer tracking/detail baseline
- [x] Mark read-only/export side-effect boundary
- [x] Add customer detail/read endpoint or drilldown payload
- [x] Add source references to SB/RCP/customer documents
- [x] Add product breakdown after source contract is finalized
- [x] Add channel breakdown after source contract is finalized
- [x] Add customer behavior signals for margin, pending AR, and credit utilization
- [x] Remove customer return frequency; correction flow is void/cancel document
- [x] Add AR aging from reconciled due-date rules in [[Document Aging Policy]]

## 2026-07-12 Table consistency checkpoint

`/tracking/customer` detail tables now derive numeric-column alignment from the rendered row values so numeric headers and bodies stay right-aligned, with canonical `p-2` headers and `p-3` body cells. What is what: these are read-only customer drilldown facts under the existing Tracking views. Why it stays this way: mixed text/numeric tables must keep a stable scan line without changing tracking filters, formulas, exports, API behavior, permissions, database schema, or DB state.
