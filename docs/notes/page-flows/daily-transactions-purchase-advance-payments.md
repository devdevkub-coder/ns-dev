---
title: จ่ายเงินล่วงหน้า / มัดจำ Page Flow
tags:
  - page-flow
  - menu
status: accepted-baseline
updated: 2026-06-11
route: /purchase/advance-payments
---

# จ่ายเงินล่วงหน้า / มัดจำ Page Flow

## Scope

| Field | Value |
|---|---|
| Menu section | Daily Transactions |
| Route | `/purchase/advance-payments` |
| Page | จ่ายเงินล่วงหน้า / มัดจำ |
| Current Next | accepted code baseline |

## Canonical References

[[Supplier Advance Payment Flow]], [[Payment Flow]], [[Purchase Flow]]

## Flow Baseline

ADV เป็น source document ของเงินล่วงหน้า Supplier ก่อนนำไป allocate เข้า PB

## Page Responsibilities

- สร้าง `ADV` สำหรับยอดเงินล่วงหน้า Supplier
- เก็บ supplier/branch/date/amount/source reference/remark เป็น snapshot
- ส่ง ADV เข้า approval/payment flow เพื่อจ่ายจริงก่อนนำไปใช้
- แสดง paid amount, allocated amount, available amount, status และประวัติ PMA/PMT/PB allocation
- release ADV allocation เมื่อ PB cancel หรือ supplier swap

## Non-Responsibilities

- ไม่เขียน bank statement ตอนสร้าง ADV
- ไม่ตั้งเจ้าหนี้ PB และไม่เขียน stock ledger
- ไม่ approve/pay ในหน้าเดียวกัน
- ไม่นำ ADV ที่ยังไม่ได้จ่ายจริงไปหัก PB

## Lifecycle / Operation Flow

| Step | User action | System result |
|---|---|---|
| 1 | สร้าง ADV | POST source payable เข้าคิวอนุมัติ |
| 2 | อนุมัติ/จ่าย | PMA/PMT ใน Payment Flow ทำให้ ADV paid |
| 3 | นำไปใช้กับ PB | PB allocate ADV ที่ available |
| 4 | PB cancel/supplier swap | release allocation กลับมาเป็น available |
| 5 | ปิด ADV | available = 0 จาก allocation/refund ตาม target |

## API / Data Contract

### Current API

- `GET /api/purchase/advance-payments - list/filter ADV`
- `POST /api/purchase/advance-payments - create ADV`
- `GET /api/purchase/advance-payments/[id] - detail`
- `PUT /api/purchase/advance-payments/[id] - update before payment lock`
- `PATCH /api/purchase/advance-payments/[id] - status/cancel action`

### Data Contract

- UI ใช้ outward business document/code เป็นหลัก และให้ server resolve internal id
- list/detail/print/export ต้องอ่าน source contract เดียวกันเพื่อลด drift
- modal Supplier Advance ต้องบังคับเลือก `สาขา` ก่อน `ผู้ขาย`; Supplier selector ต้อง disabled จนกว่าจะเลือกสาขา
- supplier options ต้องกรองตามสาขาเอกสารจาก active `supplier_branches`; ถ้าเปลี่ยนสาขาแล้วผู้ขายที่เลือกอยู่ไม่ผูกกับสาขาใหม่ ต้อง clear supplier และให้ผู้ใช้เลือกใหม่
- transaction write ต้องทำใน server transaction และ append timeline/status/audit ตาม document policy
- ถ้า field เป็น money/qty/date/business code ให้ validate ตาม `docs/design.md` และ server-side ซ้ำ

## Validation / Status Rules

- supplier/branch/amount required
- amount > 0
- ห้ามแก้ financial fields หลังมี PMA/PMT active
- PB allocation ต้องไม่เกิน available amount
- ถ้า PMA void/PMT cancel ต้อง recalc paid/available/status

## Side Effects

- สร้าง source payable `ADV`
- เงินออกเกิดที่ PMT เท่านั้น
- PB allocation ลด available amount และต้องมี allocation fact/audit

## Current Code Baseline

- Current `apps/next` page/API code is accepted as the P0 implementation baseline as of 2026-06-11.
- This page belongs to the transaction/stock/payment risk group; accepted baseline means proofed against current code, not target-complete.
- Runtime changes must preserve documented status, allocation, ledger, payment, lock, and reversal boundaries, or update this page-flow and the canonical flow first.
- See [[P0 Transaction Stock Payment Current Code Baseline]] for API/permission/side-effect proof notes and open critical gaps.

## Current Gap

allocation fact/status log/refund policy ยังต้อง finalize

## Implementation Checklist

- [x] Verify current Next page/component against this page-flow
- [x] Verify API route handlers match Current API and status rules above
- [ ] Verify legacy behavior for any gap before implementing runtime change
- [ ] Add/adjust tests or browser QA checklist before changing runtime
- [ ] Update this file and canonical reference if contract changes
