---
title: Deal Margin Report Page Flow
tags:
  - page-flow
  - menu
  - dual-costing
status: accepted-baseline
updated: 2026-08-02
route: /dual-costing/deal-margin
---

# Deal Margin Report Page Flow

## Scope

| Field | Value |
|---|---|
| Menu section | Dual Costing |
| Route | `/dual-costing/deal-margin` |
| Page | Deal Margin Report |
| Current Next | accepted read baseline |

## Canonical References

[[Dual Costing Flow]], [[page-flows/dual-costing-dual-costing-report|Dual Costing Report Page Flow]], [[page-flows/dual-costing-dual-costing-compare-margin|Compare Deal vs Stock Page Flow]]

## Legacy Baseline

Legacy view `view-dealMargin` is a visual management dashboard for deal profitability. It includes:

- total revenue, matched cost, gross margin, margin %
- top 5 deals by margin
- match status distribution chart
- filters by month/year/custom date/channel/product
- monthly performance breakdown
- table by PO Sell with sell qty, revenue, matched qty, avg cost, cost, margin, match status
- merged compare cards against stock/WAC totals
- CSV export

Legacy calculates deal side from PO Sell and match logs, while stock side comes from Sales Bills and WAC/total cost

## Target Flow

Deal Margin shows profitability of allocated deals using Deal Cost. It is a management lens and must not be confused with accounting GP

Target answers:

- which deals have high/low margin
- which deals are fully/partially/unmatched
- how matched cost compares by month/product/channel
- where Deal Cost differs from Stock/WAC margin

## Page Responsibilities

- Show deal revenue, matched cost, margin, margin %
- Show top deals and match status summary
- Support date/channel/product filters
- Show table with per-deal cost/margin details
- Export report rows
- Label data as Deal Cost

## Non-Responsibilities

- ไม่สร้าง match
- ไม่ reverse match
- ไม่แก้ PO Sell/Sales Bill
- ไม่แทน statutory P&L
- ไม่คำนวณ WAC ใหม่

## Lifecycle / Read Flow

| Step | User action | System result |
|---|---|---|
| 1 | เปิดหน้า | โหลด deal margin rows |
| 2 | filter date/channel | แสดง rows และ summary ใหม่ |
| 3 | sort/drill visually | user ตรวจดีลที่ margin สูง/ต่ำ |
| 4 | export | ส่งออก XLSX/CSV ตาม current API |

## API / Data Contract

### Current API

- `GET /api/dual-costing/deal-margin`

Current query params:

- `from`
- `to`
- `channel`
- `format=xlsx`

Current source:

- `trading_allocation_facts` where `status = active`, `sales_bill_id` is present,
  and `cost_pool_entry_id` is null — the same Trading Matching allocation scope
- relations to `customers`, `products`, `sales_bills`

Cost Pool allocations are excluded because they belong to Cost Allocator /
Allocation Ledger, not the Trading Matching deal surface. Top Deal labels include
the allocation number, Sales Bill, customer, and product so separate allocation
rows cannot appear as indistinguishable duplicate deals.

Required row fields:

- `allocationNo`
- `docNo`
- `date`
- `customer`
- `channel`
- `product`
- `sellQty`
- `unitPrice`
- `totalRevenue`
- `matchedQty`
- `avgCost`
- `matchedCost`
- `margin`
- `marginPct`
- `statusMatch`

## Validation / Status Rules

- Cancelled deals excluded.
- `statusMatch` must distinguish `Fully`, `Partial`, `None`.
- Margin formula: `totalRevenue - matchedCost`.
- Margin percent formula: `margin / totalRevenue * 100`.
- Date filter must use same cutoff for table, summary, top deals, and export.

## Side Effects

Read-only. No mutation.

## Current Code Baseline

- Current API/page is implemented and protected by `finance.cash.view`.
- Current route uses `trading_deals` as accepted read baseline and supports XLSX export.
- Desktop filter toolbar keeps date/channel/clear controls together and the real Excel action at the far right. It intentionally has no empty secondary action row because this page has no segmented/status filter.

## Current Gap

- Current `channel` is simplified as `Trading Deal`.
- Future allocation ledger may replace or enrich `trading_deals` as source.
- Legacy month/year quick filters and richer visual breakdown may need parity review if user requests UI parity.

## Implementation Checklist

- [x] Legacy deal margin inspected
- [x] Current API identified
- [ ] Reconcile to durable allocation ledger
- [ ] Confirm date/channel/product filter parity
- [ ] Add drilldown to Allocation Ledger/Match Log where useful
