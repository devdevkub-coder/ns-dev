---
title: Allocation Ledger Page Flow
tags:
  - page-flow
  - menu
  - dual-costing
status: accepted-baseline
updated: 2026-06-11
route: /dual-costing/cost-allocation-ledger
---

# Allocation Ledger Page Flow

## Scope

| Field | Value |
|---|---|
| Menu section | Dual Costing |
| Route | `/dual-costing/cost-allocation-ledger` |
| Page | Allocation Ledger |
| Current Next | accepted read baseline |

## Canonical References

[[Dual Costing Flow]], [[Cost Pool]], [[Document History Table Design]]

## Legacy Baseline

Legacy view `view-costAllocationLedger` enriches `matchLogs` into allocation audit rows. It groups rows by `match_id`, supports drilldown to lot details, filters by target type/category/status/date, and exports CSV

Legacy action behavior:

- `Edit` = reverse all lots in that match, then navigate to Cost Allocator to match again
- `Delete` = reverse all lots, not physical delete
- reversed rows remain visible for audit

## Target Flow

Allocation Ledger is the audit/history surface of allocation decisions. It must show committed allocation facts, not simulations

Target write model when implemented:

- allocator confirm creates one or more allocation ledger rows under one `matchId`
- edit/rework creates reversal rows or marks old rows reversed, then creates a new match
- no hard delete of allocation history
- ledger is management/audit only and does not write stock/P&L

## Page Responsibilities

- Show allocation history grouped by match id
- Show sale target, product, category, allocated qty, total cost, average cost, allocated revenue, GP, status
- Drill into underlying lots/source cost rows
- Filter/search by match id, sale doc, source no, product, date, status, target type, category
- Export audit rows

## Non-Responsibilities

- ไม่สร้าง allocation เอง
- ไม่แก้ source documents
- ไม่เขียน stock ledger
- ไม่แก้ WAC/P&L
- ไม่ลบ history จริง

## Lifecycle / Read Flow

| Step | User action | System result |
|---|---|---|
| 1 | เปิดหน้า | โหลด ledger rows |
| 2 | filter/search/date | แสดง matches ที่ตรง |
| 3 | expand match | แสดง lot/source details |
| 4 | export | ส่งออก audit rows ตาม filter |
| 5 | future edit/reverse | ทำผ่าน reverse + recreate policy |

## API / Data Contract

### Current API

- `GET /api/dual-costing/cost-allocation-ledger`

Current query params:

- `q`
- `from`
- `to`
- `status`
- `category`
- `targetType`

Current source:

- shared `buildDualCostingManagement()`
- current row source is `trading_deals`

Required row fields:

- `matchId`
- `targetType`
- `saleDocNo`
- `sourceNo`
- `productId`
- `productName`
- `productCategory`
- `allocatedQty`
- `totalCost`
- `costPerKg`
- `allocatedRevenue`
- `grossProfit`
- `gpPct`
- `allocatedBy`
- `allocatedAt`
- `status`

## Validation / Status Rules

- `matchId` is group id, row id must still be unique per rendered lot row.
- `approved` rows count as active.
- `reversed` rows remain visible but do not reduce available pool or count in active margin.
- Edits must reverse a whole match group, not mutate partial lot rows silently.

## Side Effects

Current Next: read-only.

Target future: reverse/edit actions must create auditable reversal behavior and must not touch stock ledger or WAC.

## Current Code Baseline

- Current API/page is implemented and protected by `finance.cash.view`.
- Current route reads `trading_deals` as the available read source until durable allocation ledger exists.
- 2026-07-01 UI alignment: removed the explanatory hint banner from the page body, aligned filter control height/search width with the shared list-page baseline, added a page-size selector to the pagination row, changed pagination buttons to the `h-9` baseline, and converted the desktop ledger table to resizable columns with fixed column widths so `Type`, `หมวด`, `By`, and `Status` do not collapse into vertical text.

## Current Gap

- No normalized allocation ledger table yet.
- Current ledger is derived from `trading_deals`, so it cannot fully represent future allocator lot-level write behavior.
- Edit/delete reverse actions are legacy behavior, not yet active target write behavior.

## Implementation Checklist

- [x] Legacy ledger behavior inspected
- [x] Current API identified
- [ ] Design durable allocation ledger schema
- [ ] Add append/reversal policy
- [ ] Wire allocator confirm to ledger facts
- [ ] Verify export matches filtered ledger
