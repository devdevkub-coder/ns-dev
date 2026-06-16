---
title: PO Sell Page Flow
tags:
  - page-flow
  - menu
status: accepted-baseline
updated: 2026-06-16
route: /sales/po-sell
---

# PO Sell Page Flow

## Scope

| Field | Value |
|---|---|
| Menu section | Daily Transactions |
| Route | `/sales/po-sell` |
| Page | PO Sell |
| Current Next | accepted code baseline |

## Canonical References

[[PO Sell Flow]], [[Sales Flow]]

## Flow Baseline

POS เป็น customer commitment/reservation ฝั่งขาย ก่อน WTO/SB allocate

## Page Responsibilities

- สร้าง `POS` เพื่อจองขายให้ Customer
- เก็บ branch/customer/channel/วันที่ส่งมอบ/product/unit/qty/price snapshot
- หน้า list/detail ต้องแสดงวันที่เพียง 2 ความหมาย: `วันที่สร้างรายการ` จาก `created_at` และ `วันที่ส่งมอบ` จาก `expected_delivery`
- ไม่แสดง `วันที่เอกสาร` เป็น field แยกใน PO Sell; legacy `date` ใน DB ให้ถือเป็น compatibility/internal value เท่านั้น
- เป็น source ให้ WTO/SB allocate ตัดยอดขายราย line
- แสดง ordered/billed/remaining/close-short/aging
- เชื่อม Cost Allocator/Dual Costing เมื่อมี deal costing

## Non-Responsibilities

- ไม่ตัด stock เอง
- ไม่ตั้ง AR หรือรับเงิน
- ไม่เขียน stock ledger/bank statement
- ไม่รวมหน่วยต่างกันใน summary โดยไม่มี conversion rule

## Lifecycle / Operation Flow

| Step | User action | System result |
|---|---|---|
| 1 | สร้าง POS | POST commitment |
| 2 | WTO ส่งของ | WTO อาจอ้าง customer/สินค้าที่จะไป SB |
| 3 | SB allocate | SB ตัด POS remaining ต่อ line; ส่วนเกินเป็น Spot Sale |
| 4 | close-short/cancel | release remaining พร้อม audit |
| 5 | report | outstanding PO แสดง aging/remaining |

## API / Data Contract

### Current API

- `GET /api/sales/po-sell - list/filter`
- `POST /api/sales/po-sell - create POS`
- `PATCH /api/sales/po-sell - edit/cancel POS`

### Data Contract

- UI ใช้ outward business document/code เป็นหลัก และให้ server resolve internal id
- list/detail/print/export ต้องอ่าน source contract เดียวกันเพื่อลด drift
- list table ต้องมีคอลัมน์ `วันที่สร้างรายการ`, `วันที่ส่งมอบ`, และ `อัพเดตล่าสุด`
- คอลัมน์ `อัพเดตล่าสุด` ต้องอยู่ถัดจาก `สถานะ Match` และแสดง `updated_by` พร้อม timestamp จาก `updated_at`
- date filter ของหน้า PO Sell ใช้ `created_at` / `วันที่สร้างรายการ`
- `สถานะเอกสาร` ใน table/card/detail ใช้ status display ตาม `docs/design.md`: dot + ข้อความสี ไม่ใช้ badge background
- `สถานะ Match` แสดงเป็นข้อความสีอย่างเดียว ไม่มี dot
- segmented filter ของสถานะใช้ active/idle สีมาตรฐานกลาง ไม่แยกสีตามสถานะ
- transaction write ต้องทำใน server transaction และ append timeline/status/audit ตาม document policy
- ถ้า field เป็น money/qty/date/business code ให้ validate ตาม `docs/design.md` และ server-side ซ้ำ
- ปุ่ม `แก้ไข` และ `ยกเลิก` แสดงในตารางเสมอ แต่ disabled เมื่อรายการไม่เข้าเงื่อนไขแก้ไข

## Validation / Status Rules

- customer/branch/product/qty/price required
- qty > 0 แยกตามหน่วย
- SB allocation ต้องไม่เกิน POS remaining
- แก้ไข/ยกเลิกได้เฉพาะ POS ที่ยังเป็น `Open` และยังไม่มี downstream active allocation / Sales Bill / Dual Costing fact
- lock เมื่อมี downstream active SB allocation, direct Sales Bill reference, หรือ active Dual Costing allocation fact
- ยกเลิกต้องกรอกหมายเหตุ และระบบเปลี่ยนสถานะเป็น `Cancelled` โดยไม่ลบเอกสาร
- ถ้า POS ถูกตัดไปบางส่วนแล้ว (`remaining_qty < qty` หรือ `cut_amount > 0` แต่ยังเหลือ quantity) list ต้องแสดงสถานะ `ออกบิลบางส่วน` แทน `เปิดอยู่`

## Side Effects

- เขียน POS current-state + line snapshot
- SB เป็นผู้ตัดยอด POS และตั้ง AR/stock effect
- ไม่เขียน stock/bank

## Current Code Baseline

- Current `apps/next` page/API code is accepted as the P0 implementation baseline as of 2026-06-11.
- This page belongs to the transaction/stock/payment risk group; accepted baseline means proofed against current code, not target-complete.
- Runtime changes must preserve documented status, allocation, ledger, payment, lock, and reversal boundaries, or update this page-flow and the canonical flow first.
- See [[P0 Transaction Stock Payment Current Code Baseline]] for API/permission/side-effect proof notes and open critical gaps.

## Current Gap

line-level allocation, close-short และ branch-aware numbering ยังต้องพิสูจน์

Branch-scope enforcement now exists for `/api/sales/po-sell`: list/export/options are limited to allowed branches and create into another branch is rejected for non-admin users. This is covered by `npm run qa:sales-bill-mixed-trading-browser --workspace @ns-scrap-erp/next` through a branch-scoped non-admin user fixture.

## Implementation Checklist

- [x] Verify current Next page/component against this page-flow
- [x] Verify API route handlers match Current API and status rules above
- [ ] Verify legacy behavior for any gap before implementing runtime change
- [ ] Add/adjust tests or browser QA checklist before changing runtime
- [x] Enforce branch scope for PO Sell list/export/options/create
- [x] Update this file and canonical reference if contract changes
