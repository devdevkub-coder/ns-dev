---
title: เบิกออกรอบิล Page Flow
tags:
  - page-flow
  - menu
status: removed-target-flow
updated: 2026-06-22
route: /sales/stock-issue
---

# เบิกออกรอบิล Page Flow

## Scope

| Field | Value |
|---|---|
| Menu section | Daily Transactions |
| Route | `/sales/stock-issue` |
| Page | เบิกออกรอบิล |
| Current Next | legacy compatibility only; remove from target menu/flow |

## Canonical References

[[Sales Flow]], [[Stock Ledger and Stock Balance]], [[WTI-WTO Flow]]

## Flow Baseline

Target flow uses WTO as the `pending_out` document: creating WTO creates `pending_out`, Stock Balance shows `รอออก`, and Sales Bill consumes that `pending_out` and writes the stock ledger stock-out with `ref_type = SB`.

Legacy baseline kept for historical reference only: old legacy stock issue wrote `PSALE` rows before Sales Bill. This behavior is removed from the target flow and must not be used for new design decisions.

## Page Responsibilities

- No target runtime responsibility.
- Existing code/routes may remain temporarily only as legacy compatibility until removed from navigation and APIs.
- New flows must use `WTO -> pending_out -> Sales Bill -> stock_ledger SB`.

## Non-Responsibilities

- ไม่สร้างเอกสารคั่นกลางระหว่าง WTO กับ Sales Bill
- ไม่เขียน `stock_ledger.ref_type = PSALE` ใน target flow
- ไม่เป็น source ของ AR/revenue/COGS

## Lifecycle / Operation Flow

| Step | User action | System result |
|---|---|---|
| 1 | สร้าง WTO | สร้าง `pending_out` และ Stock Balance แสดง `รอออก` |
| 2 | เปิด Sales Bill จาก WTO | consume WTO `pending_out` และเขียน `stock_ledger.ref_type = SB` |
| 3 | ยกเลิก Sales Bill | เขียน `SB-CANCEL`, คืน WTO `pending_out`, คืน WTO เป็นรอเปิดบิล |

## API / Data Contract

### Current API

- Existing `/api/sales/stock-issue` is deleted from active app routing and has no runtime write/read usage.
- New target work must route through `POST /api/daily/weight-tickets` for WTO `pending_out` creation and `POST/PATCH /api/sales/bills` for SB consume/reversal.

### Target API

- No target API for Pending Sale / PSALE.
- Runtime cleanup is implemented for new writes: Sales Bill rejects `pendingStockIssueId/fromPsale...`, and no target API creates `PSALE` or `PSALE-CANCEL`.

### Data Contract

- UI ใช้ outward business document/code เป็นหลัก และให้ server resolve internal id
- list/detail/print/export ต้องอ่าน source contract เดียวกันเพื่อลด drift
- transaction write ต้องทำใน server transaction และ append timeline/status/audit ตาม document policy
- WTO/SB status changes must be written through weight-ticket usage/status logs and sales-bill status logs; no new PSALE status lifecycle
- ถ้า field เป็น money/qty/date/business code ให้ validate ตาม `docs/design.md` และ server-side ซ้ำ

## Validation / Status Rules

- WTO must validate available stock before creating `pending_out`.
- Sales Bill must validate WTO active/same branch/customer/not billed and allocate all selected WTO quantity in one SB.
- Cancel Sales Bill must be append-only and restore the WTO `pending_out`.

## Side Effects

- This page has no target side effects.
- WTO creates `pending_out` only; Sales Bill creates `SB` ledger stock-out; Sales Bill cancel creates `SB-CANCEL`.

## Current Code Baseline

- Current `apps/next` page/API code is accepted as the P0 implementation baseline as of 2026-06-11.
- Historical Pending Sale implementation exists in code but is deprecated by the target flow.
- This page belongs to the transaction/stock/payment risk group; accepted baseline means proofed against current code, not target-complete.
- Runtime changes must preserve documented status, allocation, ledger, payment, lock, and reversal boundaries, or update this page-flow and the canonical flow first.
- See [[P0 Transaction Stock Payment Current Code Baseline]] for API/permission/side-effect proof notes and open critical gaps.

## Current Gap

Route/menu/API runtime usage has been removed for target flow, and the active route/API files were deleted. Keep this file only as historical context for why `/sales/stock-issue` must not be reintroduced.

## Implementation Checklist

- [x] Mark Pending Sale / PSALE as removed from target flow
- [x] Remove `/sales/stock-issue` runtime entry/API usage for new flow
- [x] Remove menu/API/runtime usage in a scoped cleanup batch
- [ ] Remove or replace legacy PSALE verification scripts after test suite contract is split from historical proof
