---
title: PO Buy Page Flow
tags:
  - page-flow
  - menu
status: accepted-baseline
updated: 2026-06-24
route: /purchase/po-buy
---

# PO Buy Page Flow

## Scope

| Field | Value |
|---|---|
| Menu section | Daily Transactions |
| Route | `/purchase/po-buy` |
| Page | PO Buy |
| Current Next | accepted code baseline |

## Canonical References

[[PO Buy Page Flow]], [[Purchase Flow]]

## Flow Baseline

POB เป็น commitment/reservation ฝั่งซื้อ ไม่สร้าง stock/AP เอง

## Page Responsibilities

- สร้าง/แก้/ยกเลิก `POB` เพื่อจองซื้อจาก Supplier
- เก็บ branch, supplier, delivery date, products, qty/unit, price, checkbox `มี VAT`, subtotal/VAT/total, remark และ print snapshot
- แสดงยอดสั่งซื้อ, ยอดรับ/ออกบิลแล้ว, ยอดคงเหลือ, close-short/aging
- เป็น source ให้ WTI/PB allocate ตัดยอดรายสินค้า โดยใช้ internal `products.id` เป็น matching key
- รองรับ print/Save as PDF โดยไม่สร้าง transaction side effect

## Non-Responsibilities

- ไม่รับของเข้า stock
- ไม่ตั้งเจ้าหนี้/AP และไม่ส่งเข้า Payment Flow โดยตรง
- ไม่เขียน `stock_ledger`, `bank_statement`, `PMA`, `PMT`
- ไม่รวมหน่วย `กก.` กับ `ลัง` เป็นยอดเดียวใน detail/print/export

## Lifecycle / Operation Flow

| Step | User action | System result |
|---|---|---|
| 1 | เปิดหน้า | GET list + filter POB |
| 2 | สร้าง POB | POST สร้างเลข `POB{branch}{YYMM}-NNNN`, line snapshot และ VAT snapshot ถ้าเลือก `มี VAT` |
| 3 | แก้ POB | PUT/PATCH เฉพาะก่อน downstream active allocation |
| 4 | WTI/PB ใช้ POB | ระบบตัด remaining ต่อ line และแสดง `ออกบิลบางส่วน/ออกบิลแล้ว` |
| 5 | ปิดรับไม่ครบ/ยกเลิก | release remaining โดยมี timeline/audit |

## API / Data Contract

### Current API

- `GET /api/purchase/po-buy - list/filter/detail payload สำหรับ PO Buy`
- `POST /api/purchase/po-buy - create POB`
- `PUT /api/purchase/po-buy - update POB`
- `PATCH /api/purchase/po-buy - cancel/close-short/status action`

### Data Contract

- UI ใช้ outward business document/code เป็นหลัก และให้ server resolve internal id
- list/detail/print/export ต้องอ่าน source contract เดียวกันเพื่อลด drift
- supplier options ต้องกรองตามสาขาเอกสารจาก active `supplier_branches`; ถ้าเปลี่ยนสาขาแล้วผู้ขายที่เลือกอยู่ไม่ผูกกับสาขาใหม่ ต้อง clear supplier และให้ผู้ใช้เลือกใหม่
- VAT payload ใช้ `hasVat`, `vatType`, `vatRatePercent`, `vatAmount`, `subtotal`, `totalAmount`; `PB` ยังเป็น source สำหรับ AP/VAT จริง
- transaction write ต้องทำใน server transaction และ append timeline/status/audit ตาม document policy
- ถ้า field เป็น money/qty/date/business code ให้ validate ตาม `docs/design.md` และ server-side ซ้ำ

## Validation / Status Rules

- server ออกเลขเอกสารเอง ไม่รับเลขจาก form
- supplier/branch/product/unit/qty/price required ตาม mode
- supplier ต้อง active และมี active `supplier_branches` กับ branch ของ POB; API ต้อง reject ถ้าไม่ตรง mapping และห้าม fallback เป็นทุกสาขา
- qty ต้องมากกว่า 0 และแยกหน่วยจริงต่อ line
- checkbox `มี VAT` คิด VAT แบบ `EXCLUDE` จาก active VAT setting และต้อง snapshot rate ลงเอกสาร
- ห้ามแก้ field การเงิน/สินค้าเมื่อมี WTI/PB allocation active
- close-short ต้องเหลือประวัติว่า PO ถูกปิดก่อนครบยอด

## Side Effects

- เขียน `po_buy`/line/allocation log/status log ตาม target schema
- ไม่เขียน stock/AP/payment
- downstream PB/WTI เป็นผู้ตัดยอดและ update read model ของ remaining

## Current Code Baseline

- Current `apps/next` page/API code is accepted as the P0 implementation baseline as of 2026-06-11.
- This page belongs to the transaction/stock/payment risk group; accepted baseline means proofed against current code, not target-complete.
- Runtime changes must preserve documented status, allocation, ledger, payment, lock, and reversal boundaries, or update this page-flow and the canonical flow first.
- See [[P0 Transaction Stock Payment Current Code Baseline]] for API/permission/side-effect proof notes and open critical gaps.

## Current Gap

close-short, allocation log, timeline/detail/print parity และ PO aging ยังต้องพิสูจน์กับ runtime เพิ่ม

VAT runtime as of 2026-06-12 is implemented for create/edit/list/detail/export/reconcile; print template still needs explicit visual parity review if the printed POB layout is changed later.

## Implementation Checklist

- [x] Verify current Next page/component against this page-flow
- [x] Verify API route handlers match Current API and status rules above
- [ ] Verify legacy behavior for any gap before implementing runtime change
- [ ] Add/adjust tests or browser QA checklist before changing runtime
- [ ] Filter/validate Supplier selector by `supplier_branches` for PO Buy create/edit
- [ ] Update this file and canonical reference if contract changes
