---
title: Customer Tracking Page Flow
tags:
  - page-flow
  - menu
  - tracking
status: accepted-baseline
updated: 2026-06-14
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
- Local vs legacy finding: legacy row click opens customer detail with sales list, receipt list, product breakdown, and monthly breakdown. Current Next now supports row-click detail for SB/RCP/product/monthly breakdown via `detailId`; pending AR, credit utilization, and margin decision signals are wired from current source facts.
- Target UI direction: list remains high-density, but each customer row/card opens a detail modal with SB/RCP/source links, product breakdown, monthly movement, pending AR/receivable exposure, and credit/margin decision signals. Return count/value is removed by requirement; use void/cancel documents instead.

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
| `customerId` | customer code หรือ internal id ที่ resolve ผ่าน active customer reference |
| `q` | ค้นหา customer code/name |
| `format=xlsx` | export workbook |

Source tables:

- `customers` active only
- `sales_bills` excluding `status = cancelled`
- `receipts` excluding `status = cancelled`

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
- `receipts`: RCP doc no/date/account/amount/source link
- `products`: product code/name/qty/revenue/COGS/GP/GP%
- `monthly`: bill count/qty/revenue/GP/received/receivable by month
- `signals`: margin quality, pending AR, credit-limit utilization

## Calculation Rules

- Sales bill amount uses item JSON total first: `netAmount`, `amount`, `total`; fallback `subtotal`, then `total_amount`.
- Sales qty uses item JSON: `netWeight`, `weight`, `qty`.
- COGS uses `sales_bills.cogs_amount` fallback `total_cost`.
- GP uses `sales_bills.gross_profit`; if missing, `revenue - cogs`.
- Receipt amount counted toward received = `amount + withholding_tax + discount`.
- Receivable per bill = `max(0, total_amount - receivedByBill)`.
- Pending AR bill count = sales bills whose receivable balance is greater than zero.
- Credit utilization% = pending AR amount / customer credit limit when credit limit is configured.
- Low-margin bill count uses GP% below 5%; negative-margin bill count uses GP below zero.
- Customer return frequency is not calculated; cancelled/voided Sales Bill and Receipt rows are excluded from active totals and remain auditable in their owner flow.
- Rows with no bill/revenue/receivable are excluded.
- Sort default is revenue descending.

## Lifecycle / Read Flow

| Step | User action | System result |
|---|---|---|
| 1 | เปิดหน้า | โหลด customer tracking ของปีปัจจุบัน |
| 2 | เลือก year/month/customer/search | API recalculates rows, monthly, summary with same filters |
| 3 | ดู top/summary | User identifies revenue, margin, receivable risk |
| 4 | Export | Download `tracking_customer_<year>[_month].xlsx` |
| 5 | เปิด detail | Open customer detail with SB/RCP/product/monthly movement and credit decision signals |

## Validation / Status Rules

- Customer filter must resolve active customer only.
- Cancelled SB/RCP must be excluded.
- Receipt amount must not double count bill received amount and aggregate receipt list separately without stating purpose.
- Customer code is required for outward id; missing business code should fail loudly through `requireBusinessCode`.
- Aging/credit exposure must not be inferred from this page until due-date policy is added.

## Side Effects

- Current API is read-only/export only.
- No stock, bank, receipt, AR, credit, or source document mutation.

## Current Gap

- API now returns drilldown SB/RCP source rows per customer through `detailId`.
- API now returns product breakdown per customer; channel breakdown is still pending.
- API/UI now return monthly movement per customer for selected year.
- API/UI now expose pending AR amount/count, credit utilization, low-margin bill count, and negative-margin bill count as decision signals.
- Return signal/count is removed by requirement; customer corrections use Sales Bill void/cancel instead of a separate Customer Return source.
- AR aging buckets and due-date logic remain owned by [[Finance AR Page Flow]].
- Customer advance allocation is out of scope here and should come from Sales/Payment flow facts.

## Implementation Tasks

### API

- [x] Extend `GET /api/tracking/customer` with customer detail mode or detail payload keyed by customer business code.
- [x] Return SB source rows with doc no, date, qty, revenue, COGS, GP, received, receivable, and source link.
- [x] Return RCP source rows with doc no, date, method, amount, and status.
- [x] Return product breakdown per customer for selected period: product name, qty, revenue, COGS, GP, GP%.
- [x] Return monthly movement per customer for selected year: bill count, qty, revenue, GP, received, receivable.
- [x] Add structured decision signals: low margin, negative margin, pending AR, and credit utilization.
- [x] Remove return frequency from Customer Tracking; use void/cancel Sales documents.
- [ ] Keep `year/month/customerId/q` filter and `format=xlsx` export aligned with the JSON result.

### UI

- [ ] Keep `docs/design.md` ordering: KPI cards, filter shell, tabs, pagination/summary if row count grows, data area.
- [ ] Use compact filter shell with year, month, customer, search, and XLSX export button.
- [x] Make desktop rows and dense mobile cards clickable to open customer detail.
- [x] Add detail modal/view sections: SB list, RCP list, product breakdown.
- [x] Add dense mobile cards and keyboard-openable mobile card controls for the same customer detail.
- [x] Add monthly movement and decision signals.
- [ ] Add source document links as read-only navigation; no mutation actions.
- [ ] Preserve table density with `text-sm`, `p-2`, `bg-slate-100` header, and no nested cards.

## Implementation Checklist

- [x] Verify current API response shape and source tables
- [x] Record legacy customer tracking/detail baseline
- [x] Mark read-only/export side-effect boundary
- [x] Add customer detail/read endpoint or drilldown payload
- [x] Add source references to SB/RCP/customer documents
- [x] Add product breakdown after source contract is finalized
- [ ] Add channel breakdown after source contract is finalized
- [x] Add customer behavior signals for margin, pending AR, and credit utilization
- [x] Remove customer return frequency; correction flow is void/cancel document
- [ ] Add AR aging only when due-date rules are reconciled
