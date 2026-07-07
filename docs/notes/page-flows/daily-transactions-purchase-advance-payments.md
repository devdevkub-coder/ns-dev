---
title: เงินล่วงหน้า / มัดจำ Page Flow
tags:
  - page-flow
  - menu
status: accepted-baseline
updated: 2026-07-06
route: /purchase/advance-payments
---

# เงินล่วงหน้า / มัดจำ Page Flow

## Scope

| Field | Value |
|---|---|
| Menu section | Daily Transactions |
| Route | `/purchase/advance-payments` |
| Page | เงินล่วงหน้า / มัดจำ |
| Current Next | accepted code baseline |

## Canonical References

[[Supplier Advance Payment Flow]], [[Payment Flow]], [[Purchase Flow]]

## Flow Baseline

หน้า `/purchase/advance-payments` เป็นหน้ารวมเงินล่วงหน้า 2 tab:

| Tab | เจ้าของ flow | Component/API |
|---|---|---|
| จ่ายเงินล่วงหน้า | Supplier ADV ก่อนนำไป allocate เข้า PB | `AdvancePaymentsPageClient`, `GET/POST /api/purchase/advance-payments` |
| รับเงินล่วงหน้า | รับเงิน Customer / customer receipt/advance | `MoneyMovementPageClient mode="receipt"`, `GET/POST /api/sales/receipts` |

ADV เป็น source document ของเงินล่วงหน้า Supplier ก่อนนำไป allocate เข้า PB. ฝั่งรับเงินล่วงหน้าไม่ใช้หน้า `/finance/customer-advance` แล้ว เพราะเป็นหน้าซ้ำ; canonical page/runtime คือ `/sales/receipts`.

## Target ADV Types

หน้า ADV ต้องมี dropdown เลือกประเภทก่อนกรอกข้อมูล:

| Type | ใช้เมื่อ | Field ที่ต้องแสดง |
|---|---|---|
| `มัดจำส่งของรอคัดแยก` | ยังไม่มี invoice และใช้ form ปัจจุบันระหว่างรถเข้า/รอคัดแยก/รอออก PB | สาขา, ผู้ขาย, ใบชั่งใหญ่/ทะเบียน/สินค้า/น้ำหนัก, ยอดมัดจำ, หมายเหตุ |
| `มัดจำล่วงหน้ายังไม่ส่งของ` | มี invoice จาก Supplier แล้ว แต่ยังไม่ออก PB จริง | สาขา, ผู้ขาย, เลข invoice required, ยอดมัดจำ, VAT dropdown, หมายเหตุ |

`มัดจำส่งของรอคัดแยก` เป็น default behavior ของ form ปัจจุบัน และไม่ต้องกรอก invoice no

## Page Responsibilities

- สร้าง `ADV` สำหรับยอดเงินล่วงหน้า Supplier
- เก็บ supplier/branch/date/amount/source reference/remark เป็น snapshot
- แยก ADV type ระหว่าง `มัดจำส่งของรอคัดแยก` และ `มัดจำล่วงหน้ายังไม่ส่งของ`
- ทุกประเภท ADV ต้องมี VAT dropdown; สำหรับ `มัดจำล่วงหน้ายังไม่ส่งของ` ต้องเก็บ `invoice no` เพิ่ม และทุกประเภทต้องเก็บยอดก่อน VAT, VAT, และยอดรวมเมื่อเลือกมี VAT
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

หลังสร้างหรือแก้ไข ADV สำเร็จ หน้า list ต้องปิด form และ reload ข้อมูลด้วย filter เดิมของผู้ใช้เท่านั้น ไม่ auto เปิด detail ของเอกสารที่เพิ่งบันทึก และไม่ auto เปลี่ยน search/status/date filter ให้เหลือรายการใหม่

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
- `advanceType` ต้องเป็น required และ server ต้อง validate field ตาม type
- `advanceType = มัดจำส่งของรอคัดแยก`: invoice no ไม่ required แต่ VAT dropdown required และ default เป็น `ไม่มี VAT`
- `advanceType = มัดจำล่วงหน้ายังไม่ส่งของ`: invoice no required และ VAT dropdown required
- VAT dropdown phase แรกมีอย่างน้อย `ไม่มี VAT` และ `มี VAT`; ถ้าขยายเป็น `VAT รวมใน` / `VAT แยกนอก` ต้อง snapshot สูตรคำนวณลงเอกสาร
- ถ้า ADV มี VAT ต้องเก็บ tax breakdown เป็น snapshot: `subtotalAmount`, `vatAmount`, `totalAmount/amount`, `vatRate`
- DB compatibility rule: `supplier_advance_payments.amount` เป็น legacy gross/total amount เพื่อให้ check constraint และ PMA/PMT/AP compatibility ยังถูกต้อง; ยอดก่อน VAT ต้องอ่านจาก `subtotal_amount`
- modal Supplier Advance ต้องบังคับเลือก `สาขา` ก่อน `ผู้ขาย`; Supplier selector ต้อง disabled จนกว่าจะเลือกสาขา
- supplier options ต้องกรองตามสาขาเอกสารจาก active `supplier_branches`; ถ้าเปลี่ยนสาขาแล้วผู้ขายที่เลือกอยู่ไม่ผูกกับสาขาใหม่ ต้อง clear supplier และให้ผู้ใช้เลือกใหม่
- transaction write ต้องทำใน server transaction และ append timeline/status/audit ตาม document policy
- ถ้า field เป็น money/qty/date/business code ให้ validate ตาม `docs/design.md` และ server-side ซ้ำ

## Validation / Status Rules

- supplier/branch/amount required
- amount > 0
- `advanceType` required
- `invoice no` required เฉพาะ `มัดจำล่วงหน้ายังไม่ส่งของ`
- ถ้า VAT = `มี VAT` ต้องคำนวณยอดก่อน VAT/VAT/ยอดรวมให้ตรงกับ VAT rate snapshot
- กรณี `มี VAT` ช่องยอดเงินที่ผู้ใช้กรอกคือ `ยอดก่อน VAT`; ระบบต้องคำนวณ VAT และ `ยอดรวมมัดจำ` เพื่อใช้เป็นยอด PMA/PMT/remaining
- ห้ามแก้ financial fields หลังมี PMA/PMT active
- PB allocation ต้องไม่เกิน available amount
- ถ้า PMA void/PMT cancel ต้อง recalc paid/available/status

## Side Effects

- สร้าง source payable `ADV`
- เงินออกเกิดที่ PMT เท่านั้น
- PB allocation ลด available amount และต้องมี allocation fact/audit
- ADV ที่ไม่มี VAT สามารถลด PB total amount แบบยอดรวมได้
- ADV ที่มี VAT ต้องลด PB แบบแยกฐานก่อน VAT และ VAT ไม่ใช่หัก `PB.total_amount` ตรง ๆ

## Current Code Baseline

- Current `apps/next` page/API code is accepted as the P0 implementation baseline as of 2026-06-11.
- This page belongs to the transaction/stock/payment risk group; accepted baseline means proofed against current code, not target-complete.
- Runtime changes must preserve documented status, allocation, ledger, payment, lock, and reversal boundaries, or update this page-flow and the canonical flow first.
- See [[P0 Transaction Stock Payment Current Code Baseline]] for API/permission/side-effect proof notes and open critical gaps.

## Current Gap

- allocation fact/status log/refund policy ยังต้อง finalize
- ยังต้องเพิ่ม ADV type dropdown และ special invoice-only form
- ยังต้องเพิ่ม VAT-aware ADV schema/API/UI และ VAT-aware allocation เข้า PB
- `มี VAT` phase แรกตกลงแล้วว่ายอดที่ผู้ใช้กรอกเป็นยอดก่อน VAT ไม่ใช่ยอดรวม VAT

## Implementation Checklist

- [x] Verify current Next page/component against this page-flow
- [x] Verify API route handlers match Current API and status rules above
- [ ] Add ADV type dropdown and switch form between current waiting-sort form and invoice-advance form
- [ ] Add invoice no + VAT dropdown + tax breakdown validation for `มัดจำล่วงหน้ายังไม่ส่งของ`
- [ ] Update list/detail/print/export to show ADV type, invoice no, VAT, and tax breakdown
- [ ] Update PB allocation contract to consume VAT-aware ADV amounts
- [ ] Verify legacy behavior for any gap before implementing runtime change
- [ ] Add/adjust tests or browser QA checklist before changing runtime
- [ ] Update this file and canonical reference if contract changes
