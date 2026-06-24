---
title: Cash & Others Summary Page Flow
tags:
  - page-flow
  - menu
status: accepted-baseline
updated: 2026-06-11
route: /cash-others-summary
---

# Cash & Others Summary Page Flow

## Scope

| Field | Value |
|---|---|
| Menu section | Main Dashboard / Reports |
| Route | `/cash-others-summary` |
| Page | Cash & Others Summary |
| Current Next | accepted code baseline |

## Canonical References

[[Main Dashboard Reports Flow]], [[Finance Debt Flow]], [[Stock Ledger and Stock Balance]], [[Trading Flow]]

## Flow Baseline

Cash & Others Summary เป็น owner/management view ของ cash, AR, AP, stock, pending sale, trading pending และ asset/debt composition ณ as-of date

## Page Responsibilities

- สรุป cash accounts และ THB-equivalent baseline
- สรุป AR/AP aging, stock qty/value, pending stock issue, trading pending
- แสดง asset/debt composition และ cash needed today
- รองรับ query `asOf=YYYY-MM-DD`

## Non-Responsibilities

- ไม่เป็น balance sheet ทางการ
- ไม่สร้าง customer/supplier advance allocation
- ไม่แก้ stock, bank, trading หรือ AR/AP source facts

## Lifecycle / Read Flow

| Step | User action | System result |
|---|---|---|
| 1 | เปิดหน้า | `GET /api/cash-others-summary` โหลด as-of วันนี้ |
| 2 | เปลี่ยน as-of | API อ่าน facts <= end-of-day ของ as-of |
| 3 | ตรวจ exposure | UI แสดง summary/charts/rows และ link ไป owner page |

## API / Data Contract

### Current API

- `GET /api/cash-others-summary?asOf=YYYY-MM-DD`
- permission: `reports.reports.view`

### Current Source Tables

- `accounts`, `bank_statement`
- `sales_bills`, `customers`
- `purchase_bills`, `purchase_bill_items`, `suppliers`
- `stock_ledger`, `products`
- `expenses`
- `trading_deals`

### Current Response

- `summary`
- `charts`
- `rows`
- `tradingPending`
- `sourceState`

## Validation / Status Rules

- invalid/missing as-of falls back to current date
- AR/AP use open receivable/payable balances from active bills
- supplier/customer advance currently returns 0 because target dedicated allocation tables are not finalized
- stock value is ledger-derived as-of date

## Side Effects

- read-only; no reclass, allocation, ledger, bank or source status writes

## Current Gap

- customer/supplier advance source tables and allocation rules still need target implementation
- reconciliation with Balance Sheet/Cash Position required before statutory use
- drilldown/export not final

## Implementation Checklist

- [x] Verify current API and source tables
- [x] Document advance limitation
- [ ] Define dedicated advance/allocation source facts
- [ ] Reconcile with finance-accounting balance sheet
- [ ] Add drilldown/export contract
