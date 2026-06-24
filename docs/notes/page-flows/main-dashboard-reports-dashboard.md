---
title: Financial Dashboard Page Flow
tags:
  - page-flow
  - menu
status: accepted-baseline
updated: 2026-06-11
route: /dashboard
---

# Financial Dashboard Page Flow

## Scope

| Field | Value |
|---|---|
| Menu section | Main Dashboard / Reports |
| Route | `/dashboard` |
| Page | Financial Dashboard |
| Current Next | accepted code baseline |

## Canonical References

[[Main Dashboard Reports Flow]], [[P2 Report Current Code Baseline]], [[Document Aging Policy]]

## Flow Baseline

Dashboard เป็น management KPI view จาก operational facts. ใช้สำหรับดูภาพรวมซื้อ/ขาย/เงินสด/หนี้/stock/production ไม่ใช่หน้า posting หรือแก้ source document

## Page Responsibilities

- แสดง KPI รายได้, COGS, GP, expenses, net profit, AR/AP, cash และ stock
- แสดง trend รายเดือน, stock by branch/group, aging bucket และ filter option
- รองรับ filter `date`, `from`, `to`, `branchId`, `supplierId`, `customerId`, `productId`, `group`
- แสดงตัวเลขเป็น management report พร้อมข้อจำกัดใน `sourceState`

## Non-Responsibilities

- ไม่สร้าง/แก้ PB, SB, EXP, PMT, RCP, stock ledger หรือ production facts
- ไม่เป็นงบการเงินทางการ
- ไม่ auto-fix anomaly หรือ reconcile source facts

## Lifecycle / Read Flow

| Step | User action | System result |
|---|---|---|
| 1 | เปิดหน้า | `GET /api/dashboard` โหลด payload จาก `buildMainDashboards()` |
| 2 | เปลี่ยน filter | API resolve branch/supplier/customer จาก business code แล้วคำนวณใหม่ |
| 3 | ดู KPI/section | UI อ่าน `dashboard`, `dailyReport`, `ownerDaily`, `production` จาก payload เดียวกัน |
| 4 | Drilldown | ไป source report/document ที่เกี่ยวข้อง โดยไม่แก้ข้อมูลต้นทาง |

## API / Data Contract

### Current API

- `GET /api/dashboard`
- permission: `reports.reports.view`
- query: `date`, `from`, `to`, `branchId`, `supplierId`, `customerId`, `productId`, `group`

### Current Source Tables / Helpers

- `purchase_bills` + `purchase_bill_items`
- `sales_bills`
- `expenses`
- `payments`
- `receipts`
- `stock_ledger`
- `trading_deals`
- `bank_statement`, `accounts`
- `loan_schedules`, `loans`
- `products`, `salespersons`, `branches`, `suppliers`, `customers`
- `historical_monthly`
- helpers: `buildFinancialDashboard()`, `loadProductionMetrics()`

### Response Sections

- `dashboard.kpi`, `dashboard.sections`, `dashboard.trend`, `dashboard.monthlyTrend`
- `dashboard.agingBuckets`, `dashboard.cashComposition`
- `dashboard.stockByBranch`, `dashboard.stockByGroup`
- shared `filterOptions`, `filters`, `sourceState`

## Validation / Status Rules

- cancelled/void/reversed PB/SB/EXP rows are excluded by active-status logic
- date range defaults to month start through selected date
- stock balance is currently derived from `stock_ledger` qty/value net
- historical monthly rows are added into revenue/COGS/expense management totals
- created date, document date, due date and as-of date must remain separate in UI and exports

## Side Effects

- read-only
- no transaction, ledger, bank, payment, receipt, production, master-data, status or timeline writes

## Current Gap

- KPI formulas need report-definition tests before runtime math changes
- source-document drilldown is not complete for every card/row
- dashboard totals must be reconciled with Finance Accounting pages before claiming statutory accuracy

## Implementation Checklist

- [x] Verify current API response shape and source tables
- [x] Document no-side-effect boundary
- [ ] Add report formula tests for cutoff/cancelled rows
- [ ] Define drilldown route per KPI card
- [ ] Reconcile with finance-accounting dashboard before changing formulas
