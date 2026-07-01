---
title: PO Sell Page Flow
tags:
  - page-flow
  - menu
status: accepted-baseline
updated: 2026-06-24
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
- customer options ต้องส่ง `marketScope` จาก `customers.market_scope`; เมื่อผู้ใช้เลือกลูกค้า ระบบต้อง auto ตั้ง `ช่องทางขาย` เป็น `ในประเทศ` หรือ `ต่างประเทศ` ตามค่า master ลูกค้า และใน modal PO Sell ให้แสดงเป็น read-only เพื่อกันผู้ใช้เลือกช่องทางที่ไม่ตรงกับลูกค้า
- modal PO Sell ต้องบังคับเลือก `สาขา/คลัง` ก่อน `Customer`; Customer selector ต้อง disabled จนกว่าจะเลือกสาขา
- customer options ต้องกรองตามสาขาเอกสารจาก active `customer_branches`; ถ้าเปลี่ยนสาขาแล้วลูกค้าที่เลือกอยู่ไม่ผูกกับสาขาใหม่ ต้อง clear customer/channel และให้ผู้ใช้เลือกใหม่
- `สถานะเอกสาร` ใน table/card/detail ใช้ status display ตาม `docs/design.md`: dot + ข้อความสี ไม่ใช้ badge background
- `สถานะ Match` แสดงเป็นข้อความสีอย่างเดียว ไม่มี dot
- `สถานะ Match` ใน filter/table/card/detail/export ต้องใช้ label ภาษาไทยชุดเดียวกัน: `ยังไม่จับคู่`, `จับคู่บางส่วน`, `จับคู่ครบ`, `จับคู่เกิน`, `ยกเลิก`
- segmented filter ของสถานะใช้ active/idle สีมาตรฐานกลาง ไม่แยกสีตามสถานะ
- transaction write ต้องทำใน server transaction และ append timeline/status/audit ตาม document policy
- ถ้า field เป็น money/qty/date/business code ให้ validate ตาม `docs/design.md` และ server-side ซ้ำ
- ปุ่ม `แก้ไข` และ `ยกเลิก` ให้แสดงเฉพาะเมื่อรายการเข้าเงื่อนไขใช้งานได้; ถ้า POS ถูกล็อก/ปิด/ยกเลิก ให้ซ่อน action ตาม table action baseline ใน `docs/design.md`

## Validation / Status Rules

- customer/branch/product/qty/price required
- customer ต้อง active และมี active `customer_branches` กับ branch ของ POS; API ต้อง reject ถ้าไม่ตรง mapping และห้าม fallback เป็นทุกสาขา
- qty > 0 แยกตามหน่วย
- SB allocation ต้องไม่เกิน POS remaining
- แก้ไข/ยกเลิกได้เฉพาะ POS ที่ยังเป็น `Open` และยังไม่มี downstream active Sales Bill / PO Sell allocation
- lock เมื่อมี downstream active SB allocation หรือ direct Sales Bill reference
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
- [x] Filter/validate Customer selector by `customer_branches` for PO Sell create/edit
- [x] Update this file and canonical reference if contract changes
