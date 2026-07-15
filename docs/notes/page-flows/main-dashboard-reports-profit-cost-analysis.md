---
title: Profit & Cost Analysis Page Flow
tags:
  - page-flow
  - menu
status: accepted-baseline
updated: 2026-06-11
route: /profit-cost-analysis
---

# Profit & Cost Analysis Page Flow

## Scope

| Field | Value |
|---|---|
| Menu section | Main Dashboard / Reports |
| Route | `/profit-cost-analysis` |
| Page | Profit & Cost Analysis |
| Current Next | accepted code baseline |

## Canonical References

[[Main Dashboard Reports Flow]], [[Stock Ledger and Stock Balance]], [[Sales Flow]], [[Purchase Flow]]

## Flow Baseline

Profit & Cost Analysis เป็น management margin/cost view จาก PB, SB และ stock ledger เพื่อดู GP, COGS, stock value, product margin, customer/supplier/channel summary

## Page Responsibilities

- วิเคราะห์ purchase amount/qty, sales revenue/qty, COGS, GP, GP%, profit/kg
- แสดง rows by product, supplier, customer, channel และ trend
- รองรับ filter date range, branch, supplier, customer, sales channel, metal group
- แสดง alert เช่น GP ติดลบ, GP ต่ำกว่าเป้า, ซื้อแล้วยังไม่ขาย

## Non-Responsibilities

- ไม่คำนวณ WAC/posting ใหม่
- ไม่เขียน cost allocation หรือ trading match
- ไม่แก้ PB/SB/stock ledger

## Lifecycle / Read Flow

| Step | User action | System result |
|---|---|---|
| 1 | เปิดหน้า | `GET /api/profit-cost-analysis` โหลด default month-to-date |
| 2 | กรองข้อมูล | server resolve branch/supplier/customer/channel และ metal group |
| 3 | ตรวจ margin | UI แสดง summary, top products, rows และ alerts |
| 4 | Follow-up | user ไปแก้ source ที่ PB/SB/stock/costing owner page |

## API / Data Contract

### Current API

- `GET /api/profit-cost-analysis`
- permission: `reports.reports.view`
- query: `from`, `to`, `branchId`, `supplierId`, `customerId`, `salesChannelId`, repeated/comma `metalGroup`

### Current Source Tables / Helpers

- `products`
- `purchase_bills` + `purchase_bill_items`
- `sales_bills`
- `stock_ledger`
- `branches`, `sales_channels`, `suppliers`, `customers`
- helpers resolve active branch/supplier/customer by business code

### Current Formula Notes

- active PB/SB excludes cancelled/void/reversed
- product row aggregates buy qty/amount, sell qty/revenue, COGS, GP, stock qty/value
- item cost uses item-level cost when present; otherwise proportional bill-level COGS fallback
- target margin currently defaults to `8%`

## Validation / Status Rules

- COGS/GP must reconcile with sales bill and final stock/WAC policy before changing formulas
- unit display must preserve product unit and avoid mixing `กก.` and `ลัง` as one quantity
- filter/export must apply the same server conditions
- page remains management report, not accounting posting

## Side Effects

- read-only; no stock ledger, cost allocation, PB/SB, bank or payment writes

## Current Gap

- final COGS/WAC source must be locked after stock ledger policy is finalized
- server-side export/drilldown not complete
- dedicated permission for cost/profit visibility is recommended before UAT exposure

## Implementation Checklist

- [x] Verify current API and source tables
- [x] Document current COGS fallback
- [ ] Add COGS/WAC reconciliation tests
- [ ] Define product/customer/supplier row drilldown
- [ ] Decide permission split from generic report permission

## 2026-07-12 Table consistency checkpoint

`/profit-cost-analysis` keeps its report surfaces and calculations unchanged while the product-detail table now aligns numeric headers with numeric cells and uses the canonical `p-2` header / `p-3` body density. What is what: the modal table is a read-only purchase/sales/stock breakdown for the selected product. Why it stays this way: detail values must scan vertically without introducing a page-local spacing or alignment variant; APIs, COGS/GP formulas, permissions, database schema, and DB state are unchanged.
