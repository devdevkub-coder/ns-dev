---
title: เบิกออกรอบิล Page Flow
tags:
  - page-flow
  - menu
status: accepted-baseline
updated: 2026-06-12
route: /sales/stock-issue
---

# เบิกออกรอบิล Page Flow

## Scope

| Field | Value |
|---|---|
| Menu section | Daily Transactions |
| Route | `/sales/stock-issue` |
| Page | เบิกออกรอบิล |
| Current Next | accepted code baseline |

## Canonical References

[[Pending Sale Page Flow]], [[Sales Flow]], [[Stock Ledger and Stock Balance]]

## Flow Baseline

PSALE คือการเบิก stock หลังมีใบชั่งขาออกและก่อนออก SB; เมื่อสร้าง PSALE ต้องตัด stock ทันทีและตั้งสถานะ `pending`. SB จาก PSALE ต้องไม่ตัด stock ซ้ำ

Legacy baseline confirmed from `old-apps/legacy/index.html` component `view-stockIssue`: legacy create/edit writes `stockLedger.refType = PSALE`, cancel/delete removes PSALE ledger, and convert-to-SB removes PSALE ledger then creates SB ledger. Target keeps the useful physical-stock-out timing, but must not delete/rewrite the original PSALE movement when converting to SB.

## Page Responsibilities

- แสดง/จัดการ Pending Sale หรือ PSALE ที่ของออกก่อนเปิดบิล
- ต้องมาจาก WTO/ใบชั่ง OUT ก่อนสร้าง PSALE
- target create PSALE ต้องเลือก customer/branch/warehouse/product/qty/price estimate/note
- PSALE บันทึก stock-out ทันทีเพราะของออกจริง
- แปลง PSALE เป็น SB โดยไม่ตัด stock ซ้ำ
- แสดง status pending/converted/cancelled
- target must support pre-fill from WTO/ใบชั่ง OUT and still require warehouse + stock validation before save
- show line-level stock on hand, reserved, available, issue qty, and stock after action
- current edit policy is cancel-and-recreate before billing; direct PSALE edit remains disabled because stock is already posted

## Non-Responsibilities

- ไม่ใช่ reservation ลอย ๆ; การกัน stock ก่อนหน้าอยู่ที่ WTO/ใบชั่ง OUT
- ไม่รับเงินและไม่ตั้ง AR จนกว่าจะเปิด SB
- ไม่ให้ PSALE เดียวออก SB ซ้ำ

## Lifecycle / Operation Flow

| Step | User action | System result |
|---|---|---|
| 1 | เปิดหน้า | GET PSALE list/read model |
| 2 | เลือก/ผูก WTO source | โหลดใบชั่ง OUT และรายการสินค้า |
| 3 | สร้าง PSALE | validate available stock, consume/release WTO hold ตาม policy, และเขียน `PSALE` stock-out |
| 4 | แปลงเป็น SB | link PSALE โดยไม่เขียน ledger ซ้ำ |
| 5 | cancel ก่อน SB | append reversal |
| 6 | cancel หลัง SB | ต้อง follow SB cancel/reversal policy |

## API / Data Contract

### Current API

- `GET /api/sales/stock-issue` reads PSALE list and returns WTO options with active stock holds
- `GET /api/sales/stock-issue` keeps relation payload narrow and fetches list/count/aggregate/options concurrently
- `POST /api/sales/stock-issue` creates PSALE from WTO, consumes the active WTO hold, and writes `stock_ledger.ref_type = PSALE`
- `PATCH /api/sales/stock-issue` action `cancel` cancels pending PSALE with `PSALE-CANCEL` reversal ledger rows
- `POST /api/sales/bills` accepts `pendingStockIssueId` when opening SB from PSALE and must not write duplicate stock-out
- `stock_issue_status_logs` records PSALE create, convert, and cancel events
- list row action `ประวัติ` shows PSALE item snapshot and status timeline
- DB index contract is covered by `20260612123936_optimize_pending_sale_api_indexes.sql` for PSALE list/doc lookup, consumed hold reversal lookup, PSALE/PSALE-CANCEL stock ledger lookup, and Sales Bill usage-log lookup

### Target API

- Direct `PATCH /api/sales/stock-issue/{docNo}` edit is intentionally not exposed in the current target policy; pending PSALE correction uses cancel-and-recreate
- dedicated `POST /api/sales/stock-issue/{docNo}/convert-to-sales-bill` ยังไม่จำเป็นตอนนี้ เพราะ conversion ใช้ Sales Bill create flow พร้อม `pendingStockIssueId`

### Data Contract

- UI ใช้ outward business document/code เป็นหลัก และให้ server resolve internal id
- list/detail/print/export ต้องอ่าน source contract เดียวกันเพื่อลด drift
- transaction write ต้องทำใน server transaction และ append timeline/status/audit ตาม document policy
- PSALE status changes are written to append-only `stock_issue_status_logs`; list UI detail timeline is still a follow-up
- ถ้า field เป็น money/qty/date/business code ให้ validate ตาม `docs/design.md` และ server-side ซ้ำ

## Validation / Status Rules

- warehouse/product/qty ต้อง active และ available พอ
- available = on hand - active reserved ของ branch/warehouse/product เดียวกัน
- ต้องมี WTO/ใบชั่ง OUT ก่อนสร้าง PSALE
- ถ้า PSALE converted แล้ว lock edit/cancel
- SB from PSALE ต้องใช้ quantity/source เดิมหรือมี audit difference
- legacy allowed confirm override when qty exceeded stock; target should reject by default or require explicit permission + reason + audit event

## Side Effects

- create write จะเขียน `stock_ledger.ref_type = PSALE` stock-out
- PSALE source ที่มาจาก WTO ต้องปิด/consume/release hold เพื่อไม่ให้นับ reserved ซ้ำหลังตัด stock จริง
- SB consumes PSALE source โดยไม่ตัด stock ซ้ำ
- cancel reverse ledger ตาม policy

## Current Code Baseline

- Current `apps/next` page/API code is accepted as the P0 implementation baseline as of 2026-06-11.
- Runtime API/DB optimization for Pending Sale was applied on 2026-06-12; remaining gap is logged-in browser QA, not query/index wiring.
- This page belongs to the transaction/stock/payment risk group; accepted baseline means proofed against current code, not target-complete.
- Runtime changes must preserve documented status, allocation, ledger, payment, lock, and reversal boundaries, or update this page-flow and the canonical flow first.
- See [[P0 Transaction Stock Payment Current Code Baseline]] for API/permission/side-effect proof notes and open critical gaps.

## Current Gap

direct edit ยังไม่เปิดตาม cancel-and-recreate policy; cancel หลังมี SB ต้อง follow SB cancel/reversal policy

Legacy proof details now live in [[Pending Sale Page Flow]]. Current Next supports `GET/POST/PATCH cancel /api/sales/stock-issue` and Sales Bill create from PSALE.

## Implementation Checklist

- [x] Verify current Next page/component against this page-flow
- [x] Verify API route handlers match Current API and status rules above
- [ ] Verify legacy behavior for any gap before implementing runtime change
- [x] Implement WTO-to-PSALE issue target contract
- [x] Add server-side PSALE status logs and reconciliation checks
- [x] Add PSALE detail/timeline UI
- [x] Add PSALE API/DB lookup indexes and reduce list/reversal query payload
- [ ] Add/adjust tests or browser QA checklist before changing runtime
- [x] Update this file and canonical reference if contract changes
