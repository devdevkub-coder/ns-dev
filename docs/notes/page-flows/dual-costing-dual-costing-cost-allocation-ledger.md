---
title: Allocation Ledger Page Flow
tags:
  - page-flow
  - menu
  - dual-costing
status: accepted-baseline
updated: 2026-08-05
route: /dual-costing/cost-allocation-ledger
---

# Allocation Ledger Page Flow

## Scope

| Field | Value |
|---|---|
| Menu section | Dual Costing |
| Route | `/dual-costing/cost-allocation-ledger` |
| Page | Allocation Ledger |
| Current Next | implemented audit/read baseline |

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
- Paginate and sort at the server by Match group so one Match never splits across pages
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
| 3 | ดูรายละเอียด | แสดง Cost Pool และ lot ต้นทุนของ Match เดียวกัน |
| 4 | export | ส่งออก audit rows ตาม filter |
| 5 | แก้ไข | ย้อนกลับทั้ง Match แล้วเปิด Cost Allocator ด้วยเป้าหมายเดิม |
| 6 | ยกเลิก | คืนจำนวนให้ Cost Pool ทุก lot ใน transaction เดียว โดยเก็บประวัติเดิม |

## API / Data Contract

### Current API

- `GET /api/dual-costing/cost-allocation-ledger`
- `POST /api/dual-costing/cost-allocation-ledger/reverse`

Current query params:

- `q`
- `from`
- `to`
- `status`
- `category`
- `targetType`
- `page` (positive integer, defaults to `1`)
- `pageSize` (`10` or `25`, defaults to `25`)
- `sortBy` (supported ledger column)
- `sortDir` (`asc` or `desc`)

JSON responses include `pagination` metadata (`page`, `pageSize`, `totalGroups`, `totalPages`, `totalRows`). Excel export intentionally ignores page/sort pagination and exports every row matching the active filters.

Current source:

- shared `buildDualCostingManagement()`
- `trading_deals` is the Match anchor; `trading_allocation_facts` is the lot-level evidence
- new facts reference the exact `stock_cost_pool_entries` row through `cost_pool_entry_id`

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
- `costPoolNo`
- `costPoolLotNo`
- `canReverse`
- `canReallocate`
- `targetRefId` (exact PO Sell line reference when available)
- `status`

## Validation / Status Rules

- `matchId` is group id, row id must still be unique per rendered lot row.
- `approved` rows count as active.
- `reversed` rows remain visible but do not reduce available pool or count in active margin.
- Edits must reverse a whole match group, not mutate partial lot rows silently.
- Reverse is atomic: all active facts in the Match must have an exact Cost Pool lot; otherwise the operation is blocked and no qty is returned.
- Production targets stay view-only in this ledger until their dedicated production reversal flow exists.
- `แก้ไข` is shown only when the exact original target can be proven: Spot Sell keeps its bill line number and PO Sell keeps its persisted `targetRefId`. Historic PO facts without this reference may still be cancelled, but the UI must not guess a line.

## Side Effects

Current Next: reverse/edit actions use the auditable reversal behavior and do not write Stock Ledger or WAC.

- reverse restores `allocated_qty` only on the exact Cost Pool lot, marks the facts `reversed`, and marks the original deals `Cancelled` without changing the original qty/cost/revenue.
- historic facts without a proven `cost_pool_entry_id` remain visible but are deliberately not reversible; the system never guesses a lot.
- Allocation Ledger is L5 business-fact data. Its API responses use `private, no-store`; no browser or shared cache is used.
- Allocation and reverse use the same transaction advisory lock. The lock serializes Lot availability, fact reads, reversal, and Match ID creation; it does not write Stock Ledger or WAC.

## Current Code Baseline

- Current API/page is implemented and protected by `finance.cash.view`.
- Branch scope is checked before Ledger read, allocation confirmation, and reverse.
- 2026-07-27 NSERP-159: one confirmation stores one shared Match ID across every selected lot; facts store their exact Cost Pool FK. Reverse locks and processes the whole Match in one transaction.
- 2026-07-27 NSERP-159 compatibility: generated display IDs for legacy rows reserve every persisted Match ID sequence in that month first, so unrelated matches cannot be grouped under the same ID.
- 2026-07-27 NSERP-159 hardening: new PO Sell facts persist the exact target line reference; reallocate returns only to that reference. Production allocations are visible in the audit ledger but remain view-only, while Cost Pool availability subtracts both allocated and released quantity.
- 2026-07-27 UI/Design hardening: the desktop filter uses the canonical two-row list layout; mobile/tablet keeps search, `ตัวกรอง`, and `ส่งออก Excel` in one compact toolbar; filter, sheet, table, and cards all switch at `lg`; pagination starts at 25 rows and keeps a symmetric narrow-screen navigation row. The desktop ledger condenses 17 columns into 12 by keeping related context on a second line, without dropping sale quantity, target type, category, GP%, or allocator audit data. Desktop identifiers, dates, labels, status, and actions are centered; quantities and money remain right-aligned. Mobile cards put Match ID and date in the header, move type/status into metadata, and label total cost separately from cost per kilogram. Detail and reverse dialogs use the shared borderless shell; the 3-card KPI grid uses 2 columns on mobile with the last card full width. Unavailable `แก้ไข`/`ยกเลิก` actions are hidden rather than shown disabled.
- 2026-07-27 design correction: the Ledger uses one shared desktop data surface: its flat pagination toolbar and table sit inside one outer boundary with only a subtle divider between them. It supports only the baseline `10 / 25` page sizes, while the responsive shell applies at `lg` so mobile pagination and cards remain flat outside the desktop table shell. Shared filter cards now declare the filter scope so editable search/date/select controls stay yellow; the mobile filter-sheet header uses the neutral table-header palette. Every interactive Ledger control, including status selectors, page-size trigger, export/reset actions, table sort/resize handles, and mobile filter actions, uses the shared blue focus family; slate, neutral, emerald, and red focus overrides are not allowed.
- 2026-08-05 audit alignment: server-side sorting and pagination operate on grouped `matchId` summaries and flatten only the selected Match groups for the current page. The table and mobile cards label measurable fields with `กก.`/`บาท`, use the shared `ns-table` density/alignment, and expose the human-facing page name `สมุดรายวันจัดสรรต้นทุน`. Reversed rows remain fully readable with a neutral background/border treatment; mixed aggregate statuses are presented as a Thai label rather than the raw internal `mixed` value.
- 2026-07-27 user-facing terminology: Allocation Ledger dialogs do not expose the internal Lot concept. Details show the Cost Pool group, allocated quantity, cost, and allocator only; reverse warnings refer to the verified cost source. Exact Cost Pool entry identity remains persisted internally because audit and safe whole-Match reversal still depend on it.
- 2026-07-27 search integrity: text search first identifies matching Match IDs and then returns every eligible Lot under those Matches for both JSON and Excel. This prevents a source-document search from opening a detail dialog that silently omits the other Lots in the same Match.
- The audit table shows the record timestamp (`วันที่บันทึก`) alongside the Match and its lot-level source data.
- 2026-07-01 UI alignment: removed the explanatory hint banner from the page body, aligned filter control height/search width with the shared list-page baseline, added a page-size selector to the pagination row, changed pagination buttons to the `h-9` baseline, and converted the desktop ledger table to resizable columns with fixed column widths so `Type`, `หมวด`, `By`, and `Status` do not collapse into vertical text.
- 2026-08-05 local UI grouping: the main desktop and mobile ledger surfaces now show one summary row/card per `matchId`; each summary exposes a dropdown for its cost-pool/source rows, while the existing detail dialog and row-level reverse/reallocate actions remain available.
- 2026-08-01 SIT schema parity: promoted the existing `20260727110000` migration after verifying the target and migration history. `cost_pool_entry_id` is the exact Cost Pool source used for safe whole-Match reversal, while `target_ref_id` is the exact allocator destination used for reallocation; both remain nullable so unprovable historical identity is never guessed. SIT had no allocation-fact rows, so the migration changed schema only and performed no backfill. Authenticated Allocation Ledger and shared Trading read-model smoke returned HTTP 200 after the migration.

What is what: the list is an audit/read surface over committed allocation facts; a summary row/card represents one Match and its expandable rows are the verified Cost Pool/source details. Why it has to be like this: pagination must keep a Match and its evidence together, while export must remain complete for reconciliation and audit even when the screen is showing one page.

## Current Gap

- No normalized allocation ledger table yet.
- Historical facts that predate `cost_pool_entry_id` remain read-only until a separately verified backfill can identify their source lot uniquely.
- Production-target allocations require a dedicated production reversal flow and are intentionally not reversible here.

## Implementation Checklist

- [x] Legacy ledger behavior inspected
- [x] Current API identified
- [x] Add exact Cost Pool FK to allocation facts
- [x] Add append/reversal policy
- [x] Wire allocator confirm to lot-level facts
- [x] Make reverse/reallocate actions follow the shared Design components
- [x] Add server-side Match-group pagination/sorting without changing the reversal contract
- [x] Align page naming, units, table density and reversed/mixed display states with the design baseline
- [ ] Verify exported workbook with an authenticated runtime record
