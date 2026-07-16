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
| รับเงินล่วงหน้า | Customer `CADV` source document จาก Packing List ก่อนออกใบเสร็จ | `CustomerAdvanceForm`, `GET/POST /api/sales/customer-advances` |

ADV เป็น source document ของเงินล่วงหน้า Supplier ก่อนนำไป allocate เข้า PB. CADV เป็น source document ฝั่ง Customer ก่อนรับเงินจริงผ่าน `/sales/receipts`; หน้า `/finance/customer-advance` ไม่ใช่หน้าทำงานหลักแล้ว.

ทั้ง ADV และ CADV ต้องมี VAT dropdown `ไม่มี VAT` / `มี VAT`. เมื่อเลือกมี VAT ผู้ใช้กรอกยอดก่อน VAT, server ใช้อัตราจาก VAT master ตามวันที่เอกสารและ snapshot ยอดก่อน VAT, VAT และยอดรวม. สำหรับ CADV ยอดรวมเป็นเงินสดเป้าหมายที่ RCP ต้องรับ ส่วนยอดฐานเป็นเครดิตที่จะใช้หักยอดก่อน VAT ของ Sales Bill หลังเชื่อม receipt/allocation flow.

แม้สอง tab อยู่หน้าเดียวกันเพื่อให้ผู้ใช้ค้นพบง่าย แต่ห้าม share business API, status, validation หรือ table เพราะ ADV เป็นเงินออก Supplier ขณะที่ CADV เป็นคำขอรับเงินจาก Customer. ดู canonical contract ที่ [[Customer Advance Receipt Flow]].

หน้า list เป็น working surface หลักของทั้งสอง tab. การสร้าง/แก้ไข `ADV` และการสร้าง `CADV` ต้องเปิดเป็น modal จากหน้ารายการ เพื่อไม่ให้ผู้ใช้เสีย context ของ filter, pagination, และรายการเอกสารที่กำลังตรวจอยู่. Modal เป็นเพียง editing surface ชั่วคราว; หลังบันทึกสำเร็จต้องปิด modal, reload list, และคง filter เดิม.

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

## ADV Statuses

สถานะที่หน้า list/filter และ API ใช้จริง:

| Status code | ชื่อที่แสดง | ความหมาย |
|---|---|---|
| `pending_approval` | ยังไม่อนุมัติ | สร้าง ADV แล้ว รออนุมัติจ่าย |
| `partially_approved` | อนุมัติแล้วบางส่วน | อนุมัติจ่ายบางส่วน |
| `approved` | อนุมัติแล้ว | อนุมัติครบ แต่ยังไม่จ่ายจริง |
| `partially_paid` | จ่ายแล้วบางส่วน | มี PMT จ่ายบางส่วนแล้ว |
| `paid` | จ่ายแล้ว | จ่ายครบ และพร้อมใช้หัก PB ตามยอดคงเหลือ |
| `partially_allocated` | ใช้หักบิลบางส่วน | นำไปหัก Purchase Bill แล้วบางส่วน |
| `allocated` | ใช้หักบิลแล้ว | นำไปหัก Purchase Bill ครบแล้ว |
| `cancelled` | ยกเลิก | ยกเลิกเอกสาร ADV |

`ทั้งหมด` เป็นตัวเลือก filter ของหน้าจอเท่านั้น ไม่ใช่สถานะที่บันทึกในเอกสาร.

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
- balance rule: `supplier_advance_payments.allocated_amount` และ `remaining_amount` เป็นเครดิตฐานก่อน VAT เสมอ และต้องรวมกันเท่ากับ `subtotal_amount`; ห้ามสลับกลับไปเก็บยอด gross หลัง allocation
- allocation rule: `supplier_advance_allocations.allocated_amount` เท่ากับ `allocated_subtotal_amount` (เครดิตฐานที่ใช้), `allocated_vat_amount` เป็น VAT ของ PB ที่ลดลง และ `allocated_total_amount` เป็นผลรวมที่ PB ลดลง
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
- กรณี `มี VAT` ช่องยอดเงินที่ผู้ใช้กรอกคือ `ยอดก่อน VAT`; ระบบคำนวณ VAT และ `ยอดรวมมัดจำ` เพื่อใช้เป็นยอด PMA/PMT ส่วน `remaining` เป็นเครดิตฐานก่อน VAT
- ห้ามแก้ financial fields หลังมี PMA/PMT active
- PB allocation ต้องไม่เกินเครดิตฐานที่ PMT จ่ายรองรับ: `min(subtotal, settledGross * subtotal / gross) - allocatedBase`
- PB ต้องหักส่วนลดก่อน หัก ADV จากฐานก่อน VAT แล้วจึงคำนวณ VAT ของ PB จากฐานที่เหลือ
- PMT ของ ADV ที่มี active PB allocation ห้ามยกเลิกจนกว่าจะ release/เปลี่ยน ADV ออกจาก PB ก่อน
- ถ้า PMA void/PMT cancel ต้อง recalc paid/base available/status

## Side Effects

- สร้าง source payable `ADV`
- เงินออกเกิดที่ PMT เท่านั้น
- PB allocation ลด available amount และต้องมี allocation fact/audit
- ADV ทั้งแบบมีและไม่มี VAT ใช้หัก PB ด้วยเครดิตฐานก่อน VATเท่านั้น
- VAT ที่จ่ายตอนสร้าง ADV ไม่ถูกนำมาหักซ้ำ; VAT ของ PB คำนวณใหม่จากฐาน PB ที่เหลือหลังส่วนลดและ ADV

## Current Code Baseline

- Current `apps/next` page/API code is accepted as the P0 implementation baseline as of 2026-06-11.
- This page belongs to the transaction/stock/payment risk group; accepted baseline means proofed against current code, not target-complete.
- Runtime changes must preserve documented status, allocation, ledger, payment, lock, and reversal boundaries, or update this page-flow and the canonical flow first.
- See [[P0 Transaction Stock Payment Current Code Baseline]] for API/permission/side-effect proof notes and open critical gaps.

## Current Gap

- immutable allocation logs รุ่นก่อน migration อาจบันทึก `allocated_amount` เป็น gross; ไม่ rewrite ประวัติย้อนหลัง และต้องอ่าน `meta.allocatedSubtotalAmount` เมื่อวิเคราะห์ event เก่า
- payment approval source ยังเป็น polymorphic `source_type/source_id` จึงไม่มี database FK ตรงถึง ADV; runtime ต้อง validate source ทุกครั้ง
- การคืนเงิน ADV หลังนำไปหัก PB ยังเป็น flow แยกที่ต้องออกแบบ ไม่ให้แก้ยอดย้อนหลังเงียบ ๆ

## Implementation Checklist

- [x] Verify current Next page/component against this page-flow
- [x] Verify API route handlers match Current API and status rules above
- [x] Add ADV type dropdown and switch form between current waiting-sort form and invoice-advance form
- [x] Add invoice no + VAT dropdown + tax breakdown validation for `มัดจำล่วงหน้ายังไม่ส่งของ`
- [x] Update list/detail/print/export to show ADV type, invoice no, VAT, and tax breakdown
- [x] Normalize PB allocation to consume pre-VAT base credit exactly once
- [x] Block PMT cancellation while an active PB allocation exists
- [x] Add calculation tests for full/partial VAT ADV and VAT/no-VAT PB
- [x] Add data reconciliation and database constraints migration
- [x] Update this file when the balance contract changes
