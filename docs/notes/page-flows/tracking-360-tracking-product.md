---
title: Product Tracking Page Flow
tags:
  - page-flow
  - menu
  - tracking
status: accepted-baseline
updated: 2026-06-14
route: /tracking/product
---

# Product Tracking Page Flow

## Scope

| Field | Value |
|---|---|
| Menu section | Tracking 360 |
| Route | `/tracking/product` |
| Page | Product Tracking |
| Current Next | accepted code baseline |
| Canonical overview | [[Tracking 360 Flow]] |

## Canonical References

- [[Tracking 360 Flow]]
- [[Stock Ledger and Stock Balance]]
- [[Purchase Flow]]
- [[Sales Flow]]
- [[Cost Pool]]
- [[Document Aging Policy]]
- [[Menu Page Flow Catalog]]

## Legacy Baseline

Legacy `view-productTracking`:

- วิเคราะห์สินค้าแยกหมวด/ปี/เดือน พร้อม selector product/metal group, tabs `รายการ`, `Top 10 ในหมวด`, `รายปี`
- Source หลักคือ `products`, `purchaseBills`, `salesBills`, `stockLedger`
- Aggregate ต่อ product: buy qty/amount/avg, sell qty/revenue/avg, COGS, GP, GP%, stock qty/value/WAC
- มี top sales, top GP, top GP%, top buy, slow movers
- มี drilldown detail ต่อสินค้า: purchase lines, sales lines, stock ledger movements, monthly breakdown
- Product Tracking legacy เรียง revenue-first เป็น baseline

## Requirement Update 2026-06-13

Latest user screenshot changes the main Product Tracking target into a profitability/product-mix optimization surface.

- Purpose: track lifecycle และ profitability ของสินค้าแต่ละชนิด/หมวด
- Required data groups: stock, sales, production, allocation, WAC
- Decision questions: สินค้าไหนกำไรดี, stock หมุนเร็วไหม, loss สูงไหม, yield ดีไหม
- Business importance: ใช้ optimize product mix ของโรงงาน
- Local vs legacy finding: legacy row click opens product detail with purchase lines, sales lines, stock ledger movements, and monthly breakdown. Current Next now supports row-click detail with purchase/sales/monthly source lines plus production/yield/loss and allocation/cost-source signals through `detailId`; stock remains support-only because latest screenshot removes Stock/WAC from the primary surface.
- Latest screenshot marks `Stock` and `WAC` with a red cross on the far-right table columns. Treat crossed-out parts as removed from the primary visible table and primary export, not merely deprioritized.
- Target main table columns: `Code`, `สินค้า`, `หมวด`, `ซื้อ`, `มูลค่าซื้อ`, `ซื้อเฉลี่ย`, `ขาย`, `ยอดขาย`, `ขายเฉลี่ย`, `COGS`, `GP`, `GP%`.
- Target filters: year, month, product category, product, Supplier ฝั่งซื้อ, Customer ฝั่งขาย, and export with the same filter.
- Target detail: product -> purchase lines, sales lines, monthly detail, allocation/cost source facts, production/yield/loss signals, and source document links. Stock/WAC may be reached through stock/balance or a clearly separated support drilldown if later approved, but not shown in the main profitability table from this screenshot.

## Page Responsibilities

- แสดงภาพรวมสินค้าจากยอดซื้อ ยอดขาย COGS และ GP โดยให้ profitability เป็น primary view
- ใช้ตรวจ product performance, margin, product mix, stock turnover, loss, yield, and production/allocation readiness
- แสดง top lists และ monthly trend ต่อปี
- Export product row set เป็น `.xlsx`
- Target drilldown: product -> PB/SB/stock ledger/source documents

## Non-Responsibilities

- ไม่สร้าง/แก้ stock movement
- ไม่คำนวณหรือ post WAC ใหม่
- ไม่แก้ product master/image/unit/type
- ไม่ allocate cost pool หรือ dual costing
- ไม่เปลี่ยนสถานะ PB/SB/stock documents

## Current API

### `GET /api/tracking/product`

Permission: `reports.reports.view`

Query:

| Query | Meaning |
|---|---|
| `year` | ปี ค.ศ.; default ปีปัจจุบัน |
| `month` | เดือน `1-12` หรือ `01-12`; optional |
| `productId` | product code หรือ internal id |
| `metalGroup` | filter product metal group |
| `branchId` | branch code หรือ internal id |
| `supplierId` | target filter: supplier code/internal id for buy-side source lines |
| `customerId` | target filter: customer code/internal id for sell-side source lines |
| `q` | ค้นหา product code/name/metalGroup/itemStatus |
| `format=xlsx` | export workbook |

Source tables:

- `products` active only
- `purchase_bills` excluding `PURCHASE_BILL_CANCELLED_STATUSES`
- `sales_bills` excluding `status = cancelled`
- `production_orders`, `production_inputs`, `production_outputs` excluding cancelled/inactive source rows
- `trading_allocation_facts` active rows for allocation/cost-source refs
- `suppliers` and `customers` for buy-side/sell-side filter options
- `stock_ledger` is intentionally not part of the primary main-table/export payload after the crossed-out `Stock/WAC` requirement.

Response:

| Field | Meaning |
|---|---|
| `filters.products` | active product options using business code as id |
| `filters.metalGroups` | available metal groups from active products |
| `filters.suppliers` | active supplier options using business code as id |
| `filters.customers` | active customer options using business code as id |
| `rows` | aggregate product rows |
| `monthly` | 12-month buy/sell/GP series |
| `summary` | buy/sales/COGS/GP totals |
| `top` | byBuy, byGp, byRevenue |
| `topMovers` | compatibility revenue top list |
| `year` | selected year |

Row fields:

- `code`, `name`, `productName`, `metalGroup`, `type`, `unit`
- `buyQty`, `buyAmount`, `avgBuy`, `buyBillCount`
- `sellQty`, `revenue`, `avgSell`, `sellBillCount`
- `cogs`, `gp`, `gpPct`
- Removed from primary visible table/export by latest requirement: `stockQty`, `stockValue`, `stockWac`
- Optional future support-only signal, if approved separately: `turnoverPct`

Target main-list visible fields:

- `code`, `name`, `metalGroup`
- `buyQty`, `buyAmount`, `avgBuy`
- `sellQty`, `revenue`, `avgSell`
- `cogs`, `gp`, `gpPct`

Target detail payload fields:

- `purchaseLines`: PB doc no/date/supplier/product qty/unit/amount/avg buy/source link
- `salesLines`: SB doc no/date/customer/product qty/unit/revenue/COGS/GP/source link
- `monthly`: buy qty/amount, sell qty/revenue/GP, production input/output/loss/yield by month
- `allocationLines`: allocation/cost-source refs, source doc, sales doc, matched qty/COGS/method/status
- `productionLines`: production order doc/date/input/output/loss/yield/status
- `productionSignals`: input qty, output qty, loss qty, loss%, yield%, allocation qty/COGS/count
- `stockFacts`: not part of the primary table in this requirement; link users to `/stock/balance` or add a separated support-only drilldown only if approved later

## Calculation Rules

- Product rows are keyed by resolved product id when item JSON maps to active product; unresolved item names become fallback rows only when not filtering by product/metal group.
- Purchase source uses `purchaseBillItemRows`.
- Sales source reads JSON `sales_bills.items`.
- Purchase amount uses `netAmount`, `amount`, `totalAmount`, `total`; fallback qty x price.
- Sales revenue uses `netAmount`, `amount`, `totalAmount`, `total`; fallback qty x price.
- Sales COGS uses `totalCost`, `total_cost`, `cogs`; fallback qty x unitCost.
- Sales GP uses `profit`, `grossProfit`; fallback revenue - COGS.
- Production input comes from active `production_inputs.qty`.
- Production output comes from active `production_outputs.qty` excluding loss/waste outputs.
- Production loss comes from active `production_outputs.qty` whose type/status/category indicates loss/waste.
- Yield% = production output qty / production input qty when input qty exists.
- Allocation qty/COGS comes from active `trading_allocation_facts.qty` and `matched_cogs`.
- Stock qty/value/WAC calculations are not primary visible table/export columns under the crossed-out screenshot requirement.
- If stock-rotation signal is later approved, derive it from stock/balance or stock-ledger facts in a separated support section, not in the main profitability table.
- Sort default is revenue descending, then buy amount descending.

## Lifecycle / Read Flow

| Step | User action | System result |
|---|---|---|
| 1 | เปิดหน้า | โหลด product tracking ของปีปัจจุบัน |
| 2 | เลือก year/month/product/metalGroup/branch/supplier/customer/search | API recalculates rows, monthly, summary, top lists with the same filter |
| 3 | ดู profitability/product mix | User identifies margin, product mix, stock rotation, loss, and yield risk |
| 4 | Export | Download `tracking_product_<year>[_month].xlsx` |
| 5 | เปิด detail | Open product detail with PB/SB/allocation/production/stock support facts |

## Validation / Status Rules

- Product and branch filters must resolve active references by code or internal id.
- Cancelled PB/SB must be excluded.
- Product business code is required for outward option ids through `requireBusinessCode`.
- Product Tracking stock must stay derived from `stock_ledger`; it must not create or correct movement rows.
- Hold/available stock is owned by [[Stock Ledger and Stock Balance]] and `/stock/balance`, not this page; Product Tracking may link to it but should not duplicate its primary table.
- Main Product Tracking table/export must remove the crossed-out `Stock` and `WAC` columns under the latest requirement.
- COGS/WAC formula must be reconciled if Sales Bill or Stock Ledger implementation changes.

## Side Effects

- Current API is read-only/export only.
- No stock ledger, WAC, product master, PB/SB, bank, AP/AR, or allocation mutation.

## Current Gap

- API now returns purchase/sales source movement detail rows for product drilldown through `detailId`.
- API/UI now return product monthly detail, production/yield/loss signals, production lines, and allocation/cost-source lines through `detailId`.
- API/UI now supports `supplierId` and `customerId` filters for buy-side/sell-side context in the aggregate Product Tracking view/export.
- Crossed-out `Stock` and `WAC` have been removed from the primary Product Tracking table/export.
- Stock availability/hold-aware `พร้อมใช้` is not represented here.
- Item JSON normalization/source links still need reconciliation before relying on per-line product matching for all legacy rows.
- Product Tracking remains revenue-first sorted by design; other sort modes should be explicit UI/API options if added.

## Implementation Tasks

### API

- [x] Add `supplierId` filter for buy-side source lines and resolve by supplier business code/internal id.
- [x] Add `customerId` filter for sell-side source lines and resolve by customer business code/internal id.
- [x] Apply `year/month/productId/metalGroup/branchId/supplierId/customerId/q` consistently to aggregate rows, monthly, top lists, and `format=xlsx` export.
- [x] Remove crossed-out `Stock`, `StockValue`, and `WAC` columns from primary XLSX export.
- [x] Keep primary row contract focused on product code/name/category, buy qty/amount/avg, sell qty/revenue/avg, COGS, GP, and GP%.
- [x] Add detail payload for purchase lines: PB doc no, date, supplier, qty, amount, avg buy, and source link.
- [x] Add detail payload for sales lines: SB doc no, date, customer, qty, revenue, COGS, GP, and source link.
- [x] Add allocation/cost-source refs and production/yield/loss signals from `trading_allocation_facts`, `production_inputs`, and `production_outputs`.
- [ ] Keep stock/WAC out of the primary response/export unless later approved as a separated support-only section.

### UI

- [x] Update `ProductTrackingPageClient.tsx` primary table columns to exactly: `Code`, `สินค้า`, `หมวด`, `ซื้อ`, `มูลค่าซื้อ`, `ซื้อเฉลี่ย`, `ขาย`, `ยอดขาย`, `ขายเฉลี่ย`, `COGS`, `GP`, `GP%`.
- [x] Remove crossed-out `Stock` and `WAC` from the main visible table.
- [x] Add Supplier ฝั่งซื้อ and Customer ฝั่งขาย controls to the `docs/design.md` filter shell.
- [x] Keep export button aligned with the same filters.
- [x] Make desktop rows and dense mobile cards clickable to open product detail.
- [x] Add detail modal/view sections: purchase lines and sales lines.
- [x] Add dense mobile cards that open product detail.
- [x] Add detail modal/view sections: monthly detail, allocation/cost-source, production/yield/loss, source links.
- [ ] If stock/balance access is needed, use a separate link to `/stock/balance`; do not add `Stock/WAC` back to the main Product Tracking table.
- [ ] Follow `docs/design.md`: KPI cards before filters, compact controls, desktop table, dense mobile cards, no nested cards, no text overflow.

## Implementation Checklist

- [x] Verify current API response shape and source tables
- [x] Record legacy product tracking/detail baseline
- [x] Mark read-only/export side-effect boundary
- [x] Add product detail/read endpoint or drilldown payload
- [x] Add source references to PB/SB rows
- [ ] Add source links to stock ledger rows if a separated support-only stock detail is approved
- [x] Add Supplier ฝั่งซื้อ and Customer ฝั่งขาย filters and apply them consistently to JSON/export
- [x] Remove crossed-out `Stock` and `WAC` from the primary visible product profitability table and primary export
- [x] Add allocation, production, loss, and yield signals
- [ ] Reconcile COGS/WAC with final stock and sales-bill policy
- [ ] Decide whether hold/available should be shown here or only linked to stock balance
