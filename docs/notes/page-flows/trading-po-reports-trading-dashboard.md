---
title: Trading Dashboard Page Flow
tags:
  - page-flow
  - menu
  - trading
status: target-requirement
updated: 2026-06-13
route: /trading/dashboard
---

# Trading Dashboard Page Flow

## Scope

| Field | Value |
|---|---|
| Menu section | Trading / PO Reports |
| Route | `/trading/dashboard` |
| Page | Trading Dashboard |
| Current Next | accepted code baseline |
| Canonical overview | [[Trading Flow]] |

## Canonical References

- [[Trading Flow]]
- [[Purchase Flow]]
- [[Sales Flow]]
- [[Payment Flow]]
- [[Document Aging Policy]]
- [[Menu Page Flow Catalog]]

## Legacy Baseline

Legacy `view-tradingDashboard`:

- แสดง Trading เป็น flow แยกจาก stock: “ซื้อมาขายไป” และ “ไม่กระทบ Stock On Hand / WAC”
- Filter หลักคือ `fromD` / `toD`
- Source หลักคือ `purchaseBills.transactionMode === 'TRADING'`, `salesBills.transactionMode === 'TRADING'`, และ `tradingDeals`
- ใช้ยอดก่อน VAT เป็นหลัก โดยเลือก `subtotal` ก่อน fallback `totalAmount`
- KPI หลัก: Trading Purchase, Trading Sales, matched COGS, Trading GP, GP%, Trading AR, Trading AP, sales รอจับคู่, purchase รอขาย, completed deals
- มี trend รายวัน, match status, top product GP, Trading Purchase table, Trading Sales table, Trading by Product table

## Target Requirement Update 2026-06-13

User clarified that Trading Dashboard is a trader/operator monitor for the Trading deal system, not an accounting dashboard. The target page should focus on margin, allocation, pending buy/sell, exposure/commitment, and stock/cost-source readiness.

Required source inputs:

- PO Buy
- PO Sell
- Cost Pool / Trading Cost Source
- Allocation / Trading deal facts
- Trading Sales
- Stock / availability read model

The dashboard must answer:

- deal/product/supplier/customer ไหนกำไร
- allocation ค้างไหม
- exposure/commitment เท่าไหร่
- stock หรือ cost source พอขายไหม
- pending sell/buy ค้างเท่าไหร่

Target navigation:

- Trading Matching
- Deal Margin
- Allocation / Cost Allocation Ledger
- source PB/SB/PO detail routes when available

## Page Responsibilities

- แสดงภาพรวม Trading deal ในช่วง filter ที่เลือกสำหรับ trader/operator
- แสดงยอดซื้อ/ขาย Trading ก่อน VAT, Matched COGS, GP, GP%, pending buy/sell และ allocation gap
- แสดง stock/cost-source readiness และ exposure/commitment ที่เกี่ยวกับงาน Trading
- แยกมุมมองหลักเป็น `Trading by Product`, `Trading Purchase`, และ `Trading Sales`
- Drilldown ไป Trading Matching, Deal Margin, Allocation/Cost Allocation Ledger และ source PB/SB/PO เมื่อ route/detail พร้อม

## Non-Responsibilities

- ไม่สร้างหรือแก้ Trading deal
- ไม่ reverse/cancel deal
- ไม่เขียน stock ledger, WAC, bank statement, payment, receipt, AP/AR settlement
- ไม่เปลี่ยนสถานะ PB/SB/PO
- ไม่เป็น source of truth แทน `purchase_bills`, `sales_bills`, `trading_deals`
- ไม่เป็น accounting dashboard, cash dashboard, financial statement dashboard หรือ payment collection dashboard
- ไม่ใช้ AR/AP settlement เป็น KPI หลักของหน้า
- ไม่ต้องมี trend chart, matching donut, duplicate cleanup, cloud pull, recalc cost, new match หรือ reverse controls ตาม target requirement รอบนี้

## Target UI Structure

### Header Filters

Global filters:

- date from
- date to
- supplier
- customer
- bill no

`Trading by Product` requires one additional filter:

- product

Every tab/table must use the same active filter set. Do not calculate a KPI from a wider or narrower dataset than the visible rows unless the UI labels it explicitly.

### Summary Cards

Keep the summary focused on operational Trading:

| Metric | Formula / Source |
|---|---|
| Trading Purchase | sum Trading buy amount ex-VAT in filter |
| Trading Sales | sum Trading sales amount ex-VAT in filter |
| Matched COGS | sum matched/allocated cost from Trading allocation facts or cost source |
| Trading GP | `Trading Sales - Matched COGS` |
| GP% | `Trading GP / Trading Sales` |
| Pending Buy / Purchase รอขาย | buy-side cost/source remaining after active allocation |
| Pending Sell / Sales รอจับคู่ | sell-side amount/qty that still needs cost allocation |

Do not make Trading AR/AP, completed deal count, matching donut, or daily trend the primary dashboard answer.

### Trading By Product

Required columns:

| Column | Meaning |
|---|---|
| Product | Product code/name |
| Qty | sum sales line qty for the filtered Trading Sales Bills |
| Sales | sum sales line amount ex-VAT |
| Matched COGS | matched cost allocated to those product lines |
| GP | `Sales - Matched COGS` |
| GP% | `GP / Sales` |

Rules:

- Include a total row.
- Product profit/top product = sum GP of that product.
- If a sale line is allocated from multiple cost sources, Matched COGS must sum all active allocation lines for that sale line/product.
- If an allocation fact is document-level only, the API/DB design must define a deterministic allocation basis; the runtime must not guess through fallback UI logic.

### Trading Purchase

Shows Trading PB / PO Buy / cost-source rows needed by the operator:

- bill no / PO reference
- supplier
- product summary
- buy amount ex-VAT
- matched cost
- remaining cost/qty
- allocation status
- link to source bill and matching/allocation detail

### Trading Sales

Shows Trading SB / PO Sell rows needed by the operator:

- bill no / PO Sell reference
- customer
- product summary
- sales amount ex-VAT
- matched COGS
- GP / GP%
- pending allocation or exposure
- link to source bill and matching/allocation detail

## Current API

### `GET /api/trading/dashboard`

Permission: `finance.cash.view`

Query:

| Query | Meaning |
|---|---|
| `from` | วันที่เริ่มต้น; default วันแรกของเดือนปัจจุบัน |
| `to` | วันที่สิ้นสุด; default วันนี้ |
| `supplierId` | filter Trading Purchase / cost source supplier and supplier-attributed product rows |
| `customerId` | filter Trading Sales customer |
| `billNo` | PB/SB/allocation source document search |
| `productId` | Trading by Product product filter; the UI sends this only while the Product tab is active |

Source tables:

- `purchase_bills` where `transaction_mode = 'TRADING'`
- `sales_bills` where `transaction_mode = 'TRADING'`
- `trading_allocation_facts` where `status = active`
- `trading_cost_sources` where `status = active`
- `products`

Response:

| Field | Meaning |
|---|---|
| `summary` | Trading Purchase/Sales, Matched COGS, Trading GP, GP%, pending buy/sell, unallocated sales, allocation fact count |
| `purchaseRows` | Trading PB/cost-source rows with total, matched cost, remaining cost, allocation status, source URL |
| `salesRows` | Trading SB rows with total, matched COGS, GP, GP%, pending allocation, source URL |
| `productRows` | Product-level Qty/Sales from Trading Sales Bill lines plus Matched COGS from active allocation facts |
| `readinessRows` | Product-level PO Buy remaining, PO Sell commitment, available Cost Source (stock Cost Pool + manual Trading Cost Source), net readiness, and short/ready/idle status |
| `aging` | Pending Buy/Sell buckets for `0-7`, `8-14`, `15-30`, and `31+` document-age groups |
| `options` | Supplier/customer/product filter options |

## Calculation Rules

- Purchase amount uses `purchase_bills.subtotal` first, fallback `total_amount`.
- Sales amount uses `sales_bills.subtotal` first, fallback `total_amount`.
- Active source bill excludes `cancelled`, `void`, `reversed`.
- Active allocation excludes `cancelled` / `reversed` facts.
- Target Dashboard GP = filtered Trading sales total - Matched COGS from active allocation/cost-source facts.
- Deal GP = `matched_sales_amount - matched_purchase_amount`.
- Product Qty and Sales come from Trading Sales Bill line facts.
- Product Matched COGS comes from matched allocation/cost-source facts attributed to the sales line/product.
- Product cost may be proportional by sales line amount only when the API/DB stores that proportional basis as the documented allocation method; do not use silent runtime fallback.
- GP = `Sales - Matched COGS`.
- GP% = `GP / Sales`.
- AR/AP exposure may exist for finance pages, but is not a primary Trading Dashboard metric.

## Lifecycle / Read Flow

| Step | User action | System result |
|---|---|---|
| 1 | เปิดหน้า | โหลด dashboard ด้วย default `from/to` ของเดือนปัจจุบัน |
| 2 | เลือก tab/filter | API คืนข้อมูลตาม date, supplier, customer, bill no และ product filter เมื่ออยู่ Trading by Product |
| 3 | ดู Trading by Product | ผู้ใช้เห็น Qty, Sales, Matched COGS, GP, GP% เพื่อหาสินค้าที่กำไร/ขาดทุน |
| 4 | ดู Trading Purchase / Trading Sales | ผู้ใช้เห็น pending buy/sell, remaining cost/source, allocation gap และ exposure |
| 5 | Drilldown | เปิด Trading Matching, Deal Margin, Allocation Ledger หรือ source PB/SB/PO detail โดยไม่ mutate data |

## Validation / Status Rules

- ยอดทุก panel ต้องใช้ filter ชุดเดียวกัน
- Cancelled deals ต้องไม่ถูกนับเป็น matched COGS/GP active total
- Status filter ใช้กับ deal rows; purchase/sales remaining ยังต้องคำนวณจาก active deals ทั้งหมดเพื่อไม่ให้ remaining ผิด
- ถ้าสถานะ blank/legacy `Open` ต้องแสดงได้ แต่ควร normalize ใน write API อนาคต
- ต้องแยก `date`, `created_at`, และ due/expected date เมื่อทำ aging ตาม [[Document Aging Policy]]
- No fallback rule: if allocation/cost-source facts are missing for Matched COGS, show pending/unallocated state and expose the source gap; do not invent cost from stock WAC or UI subtotal fallback.

## Side Effects

- Read-only
- Export/print ในอนาคตต้องไม่ mutate source data

## Current Gap

- Implemented UI now uses trader/operator tabs and metrics instead of legacy accounting/trend/matching-donut emphasis.
- Implemented UI/API now expose explicit date, supplier, customer, bill no, and product filters; supplier/customer/product are searchable combobox filters.
- Implemented Matched COGS now reads durable `trading_allocation_facts`; Trading SB create/cancel now writes/cancels PB-backed and manual Cost Source-backed facts directly, while direct edit remains intentionally disabled under the Sales Bill correction policy.
- Implemented Trading by Product now reads Qty/Sales from Trading Sales Bill lines and overlays Matched COGS from active allocation facts; it does not invent missing cost from WAC/subtotal.
- Stock/cost-source readiness and PO Buy/PO Sell exposure are now modeled as read-only dashboard sections from `po_buys`, `po_sells`, `stock_cost_pool_entries`, and manual `trading_cost_sources`.
- Manual Trading Cost Source can now be created from the dashboard through `POST /api/trading/cost-sources`, and active manual sources appear in both Trading Purchase rows and readiness.
- Pending Buy/Sell aging buckets are now exposed by document age from the same filtered read model.
- Dashboard API now returns source PB/SB route links in row payload.
- Deal lifecycle/write/reverse ยังไม่อยู่ใน dashboard; ต้องไปอยู่ใน source PB/SB correction or audited allocation write API ในอนาคต
- Duplicate deal cleanup ต้องเป็น admin/audited operation ไม่ควรทำเงียบใน dashboard
- PB/SB/PO commitment aging is now exposed for Pending Buy/Sell; future deal aging still belongs with the audited allocation/deal-margin ledger.

## Implementation Checklist

- [x] Verify current API response shape and source tables
- [x] Record legacy ex-VAT Trading dashboard formula
- [x] Mark dashboard as read-only and no stock side effect
- [x] Add read-only PO Buy / PO Sell / Cost Source readiness and exposure section
- [x] Add Pending Buy/Sell aging buckets
- [x] Record 2026-06-13 target requirement: trader/operator monitor, not accounting dashboard
- [x] Replace legacy accounting/trend/donut emphasis with target tabs
- [x] Add explicit supplier/customer/bill/product filters
- [x] Add PO Buy / PO Sell / Cost Pool / manual Trading Cost Source / Stock readiness source sections
- [x] Add in-page manual Trading Cost Source create/list modal
- [x] Make Matched COGS attribution explicit in API/DB contract
- [x] Add drilldown source links for PB/SB rows
- [x] Add aging buckets for pending Trading buy/sell commitments
- [ ] Reconcile status names when durable Trading write API is implemented
