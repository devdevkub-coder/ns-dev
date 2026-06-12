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

- `GET /api/sales/stock-issue - current read/list baseline`

### Target API

- `POST /api/sales/stock-issue` สร้าง PSALE จาก WTO/ใบชั่ง OUT และตัด stock ทันที
- `PATCH /api/sales/stock-issue/{docNo}` แก้ไขเฉพาะรายการที่ยังไม่ converted ตาม policy
- `PATCH /api/sales/stock-issue/{docNo}` action `cancel` สำหรับยกเลิกก่อนเปิดบิลด้วย reversal
- `POST /api/sales/stock-issue/{docNo}/convert-to-sales-bill` แปลงเป็น SB

### Data Contract

- UI ใช้ outward business document/code เป็นหลัก และให้ server resolve internal id
- list/detail/print/export ต้องอ่าน source contract เดียวกันเพื่อลด drift
- transaction write ต้องทำใน server transaction และ append timeline/status/audit ตาม document policy
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
- This page belongs to the transaction/stock/payment risk group; accepted baseline means proofed against current code, not target-complete.
- Runtime changes must preserve documented status, allocation, ledger, payment, lock, and reversal boundaries, or update this page-flow and the canonical flow first.
- See [[P0 Transaction Stock Payment Current Code Baseline]] for API/permission/side-effect proof notes and open critical gaps.

## Current Gap

create/edit/cancel/convert และ ledger/hold reversal ยังไม่ได้ implement ครบ

Legacy proof details now live in [[Pending Sale Page Flow]]. Current Next remains `GET /api/sales/stock-issue` only; no POST/PATCH/cancel/convert route exists yet.

## Implementation Checklist

- [x] Verify current Next page/component against this page-flow
- [x] Verify API route handlers match Current API and status rules above
- [ ] Verify legacy behavior for any gap before implementing runtime change
- [ ] Implement WTO-to-PSALE issue target contract
- [ ] Add/adjust tests or browser QA checklist before changing runtime
- [ ] Update this file and canonical reference if contract changes
