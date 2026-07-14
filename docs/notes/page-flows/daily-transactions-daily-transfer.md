---
title: โอนเงินระหว่างบัญชี Page Flow
tags:
  - page-flow
  - menu
status: accepted-baseline
updated: 2026-06-11
route: /daily/transfer
---

# โอนเงินระหว่างบัญชี Page Flow

## Scope

| Field | Value |
|---|---|
| Menu section | Daily Transactions |
| Route | `/daily/transfer` |
| Page | โอนเงินระหว่างบัญชี |
| Current Next | accepted code baseline |

## Canonical References

[[Daily Cash Flow]]

## Flow Baseline

TRF เป็น internal cash/bank transfer ที่สร้าง bank statement สองฝั่ง

## Page Responsibilities

- สร้าง `TRF` สำหรับโอนเงินระหว่างบัญชีบริษัท
- เลือกบัญชีต้นทาง/ปลายทาง active และยอดโอน/ค่าธรรมเนียม
- เขียน `bank_statement` เงินออกและเงินเข้าใน transaction เดียว
- แสดง list/filter/detail และยอดรวมรายการโอน
- ใช้ account master เป็น source ของบัญชีเท่านั้น

## Non-Responsibilities

- ไม่ใช่การจ่าย Supplier หรือรับเงิน Customer
- ไม่สร้าง PMA/PMT/RCP/EXP
- ไม่กระทบ stock หรือคู่ค้า
- ไม่ลง P&L ยกเว้น fee policy ที่ต้องแยกชัด

## Lifecycle / Operation Flow

| Step | User action | System result |
|---|---|---|
| 1 | เปิดหน้า | GET transfer list + account options |
| 2 | สร้าง TRF | เลือก from/to account และ amount |
| 3 | บันทึก | POST TRF + paired bank statement |
| 4 | แก้ | rebuild paired statement ถ้ายังอนุญาต |
| 5 | cancel/reverse | target ต้องใช้ reversal/audit ไม่ลบเงียบ |

## API / Data Contract

### Current API

- `GET /api/daily/transfers - list/options`
- `POST /api/daily/transfers - create transfer`

### Data Contract

- UI ใช้ outward business document/code เป็นหลัก และให้ server resolve internal id
- list/detail/print/export ต้องอ่าน source contract เดียวกันเพื่อลด drift
- transaction write ต้องทำใน server transaction และ append timeline/status/audit ตาม document policy
- ถ้า field เป็น money/qty/date/business code ให้ validate ตาม `docs/design.md` และ server-side ซ้ำ

## Validation / Status Rules

- from/to account required, active และห้ามซ้ำกัน
- amount > 0
- fee >= 0
- paired bank statement ต้องครบทั้งสองฝั่งหรือ rollback
- server ออกเลข TRF/BST และ actor เอง

## Side Effects

- สร้าง TRF current row
- สร้าง bank_statement เงินออกจากบัญชีต้นทางและเงินเข้าบัญชีปลายทาง
- ไม่เขียน payment/receipt/stock

## Current Code Baseline

- Current `apps/next` page/API code is accepted as the P0 implementation baseline as of 2026-06-11.
- This page belongs to the transaction/stock/payment risk group; accepted baseline means proofed against current code, not target-complete.
- Runtime changes must preserve documented status, allocation, ledger, payment, lock, and reversal boundaries, or update this page-flow and the canonical flow first.
- See [[P0 Transaction Stock Payment Current Code Baseline]] for API/permission/side-effect proof notes and open critical gaps.

## Current Gap

reversal/audit และ fee accounting policy ยังต้อง finalize

## Implementation Checklist

- [x] Verify current Next page/component against this page-flow
- [x] Verify API route handlers match Current API and status rules above
- [ ] Verify legacy behavior for any gap before implementing runtime change
- [ ] Add/adjust tests or browser QA checklist before changing runtime
- [ ] Update this file and canonical reference if contract changes

## 2026-07-12 Table consistency checkpoint

`/daily/transfer` now reserves sufficient default/minimum width for amount, fee, operator, and note columns while retaining the auto-stretch action column and canonical header/body density. What is what: the table remains the same transfer history and the existing modal remains the transfer editor. Why it stays this way: long headers and values must not collide, while search, sorting, pagination, transfer writes, API behavior, permissions, database schema, and DB state remain unchanged.
