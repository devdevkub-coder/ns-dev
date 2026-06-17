---
title: รายการใบรับ-ส่งของ Page Flow
tags:
  - page-flow
  - menu
status: accepted-baseline
updated: 2026-06-17
route: /daily/weight-ticket-list
---

# รายการใบรับ-ส่งของ Page Flow

## Scope

| Field | Value |
|---|---|
| Menu section | Daily Transactions |
| Route | `/daily/weight-ticket-list` |
| Page | รายการใบรับ-ส่งของ |
| Current Next | accepted code baseline |

## Canonical References

[[WTI-WTO Flow]], [[Purchase Flow]], [[Sales Flow]], [[Stock Ledger and Stock Balance]]

## Flow Baseline

list/detail/create link สำหรับ WTI/WTO; WTI/WTO เป็น evidence/usage control ไม่ใช่ movement owner

## Page Responsibilities

- แสดง list WTI/WTO พร้อม filter type/status/customer/supplier/date
- เปิด detail/timeline/print/share และ link ไปหน้า create/edit `/daily/weight-tickets`
- ปุ่มสร้างจาก tab `WTO` ต้องส่ง `?type=WTO` ไปหน้า create เพื่อเปิดฟอร์มใบส่งของ ไม่ default กลับเป็น `WTI`
- เมื่อเข้าหน้า create จาก tab `WTI` หรือ `WTO` ต้องล็อกประเภทเอกสารและซ่อน tab ของอีกประเภท; edit เอกสารเดิมก็ต้องล็อกประเภทเช่นกัน
- WTI ใช้เป็น source PB: 1 WTI ต่อ 1 PB และต้องถูกใช้ครบใน PB เดียว
- WTO ใช้เป็น source SB: 1 WTO ต่อ 1 SB และต้องถูกใช้ครบใน SB เดียว
- แสดง product thumbnail, lot/summary, vehicle/image evidence และ downstream usage lock

## Non-Responsibilities

- WTI ไม่เขียน stock-in เอง; PB เป็น owner ของ stock-in
- WTO ไม่เขียน stock-out เอง; target WTO สร้าง hold และ SB เป็น owner ของ stock-out
- ไม่ตั้ง AP/AR และไม่รับ/จ่ายเงิน

## Lifecycle / Operation Flow

| Step | User action | System result |
|---|---|---|
| 1 | เปิด list | GET weight tickets list |
| 2 | สร้าง/แก้ | ไป `/daily/weight-tickets?type=WTI|WTO` หรือ edit พร้อม type context และใช้ options/products APIs |
| 3 | detail | GET by id/doc no แสดง summary/timeline/images |
| 4 | PB/SB ใช้งาน | update usage/status/lock |
| 5 | cancel/edit | ถ้าถูก bill ใช้แล้วต้อง lock; ถ้ายังไม่ใช้ให้ release/rebuild hold สำหรับ WTO |

## API / Data Contract

### Current API

- `GET /api/daily/weight-tickets - list`
- `POST /api/daily/weight-tickets - create WTI/WTO`
- `GET /api/daily/weight-tickets/[id] - detail`
- `PUT /api/daily/weight-tickets/[id] - edit`
- `PATCH /api/daily/weight-tickets/[id] - cancel/status action`
- `GET /api/daily/weight-tickets/options - current branches/suppliers/customers/impurities only`
- `GET /api/daily/weight-tickets/products - product options with thumbnails`
- `GET /api/daily/weight-tickets/stock-options?branchId={branchCode}&productId={productCode}`
  - returns active warehouses in the selected branch where `type in (RM, FG)`
  - returns `onHandQty`, `onHoldQty`, and `availableQty` per warehouse
  - derives `onHandQty` from `stock_ledger`
  - derives `onHoldQty` from active stock holds
- `POST /api/daily/weight-tickets`
  - for `WTO`, must require `warehouseId` per line
  - must validate requested qty/net weight against server-side `availableQty`
  - must create active hold rows in the same transaction as the WTO document
- `PUT /api/daily/weight-tickets/[id]`
  - for editable unused `WTO`, must rebuild hold rows to match latest lines
- `PATCH /api/daily/weight-tickets/[id]`
  - for cancel `WTO`, must release active hold rows

### Data Contract

- UI ใช้ outward business document/code เป็นหลัก และให้ server resolve internal id
- list/detail/print/export ต้องอ่าน source contract เดียวกันเพื่อลด drift
- transaction write ต้องทำใน server transaction และ append timeline/status/audit ตาม document policy
- ถ้า field เป็น money/qty/date/business code ให้ validate ตาม `docs/design.md` และ server-side ซ้ำ
- น้ำหนักสุทธิต้องคำนวณจาก `gross_weight - container_deduction_weight - deduct_weight`; `container_deduction_weight` คือหักภาชนะ ส่วน `deduct_weight` คือหักสิ่งเจือปนเดิม และต้องเก็บแยกทั้ง header/line/product summary
- สำหรับ `WTO`, `warehouseId` เป็น line-level stock location ไม่ใช่ header field เพราะแต่ละสินค้าอาจออกจากคลังต่างกัน
- `warehouseId` ที่ส่งออก client ควรเป็น business code ของ warehouse; server resolve เป็น internal bigint id ก่อนเขียน DB

## Validation / Status Rules

- WTI supplier/branch/product/weight required ตาม receipt mode
- WTO customer/branch/product/warehouse/qty required และ target validate available qty จาก branch+product+warehouse
- WTO warehouse ต้อง active, อยู่ใน branch ที่เลือก, และเป็นคลัง `RM` หรือ `FG`
- WTI/WTO ไม่มีสถานะ partial ใน target filter/status: `WTI = รับของแล้ว/เสร็จสิ้น/ยกเลิก`, `WTO = ส่งของแล้ว/ออกบิลแล้ว/ยกเลิก`
- ประเภทเอกสาร (`WTI`/`WTO`) เปลี่ยนไม่ได้หลังเปิดจาก create context เฉพาะประเภทหรือหลังสร้างเอกสารแล้ว; API ต้อง reject payload ที่พยายามเปลี่ยน `type`
- edit/cancel lock เมื่อ PB/SB active ใช้งานแล้ว
- product image ต้องมาจาก storage thumbnail key/url ตาม target ไม่ใช้ fallback runtime

## Side Effects

- WTI save สร้าง evidence/summary แต่ไม่ stock ledger
- WTO target save สร้าง active stock hold/reservation แต่ไม่ stock ledger
- PB/SB เป็นผู้ consume source และเขียน ledger

## Current Code Baseline

- Current `apps/next` page/API code is accepted as the P0 implementation baseline as of 2026-06-11.
- This page belongs to the transaction/stock/payment risk group; accepted baseline means proofed against current code, not target-complete.
- Runtime changes must preserve documented status, allocation, ledger, payment, lock, and reversal boundaries, or update this page-flow and the canonical flow first.
- See [[P0 Transaction Stock Payment Current Code Baseline]] for API/permission/side-effect proof notes and open critical gaps.

## Current Gap

- SB edit/cancel ยังไม่มี write path ที่ release/reopen/reverse stock hold และ stock ledger หลัง `WTO` ถูกใช้แล้ว
- stock balance ยังไม่มี drilldown UI ให้เห็นว่า `on hold` มาจาก `WTO` ใบไหน/line ไหน
- ต้องทำ browser QA เต็ม flow create/edit/cancel/detail/print/share และ handoff ไป `PB/SB`
- ต้องทำ report/reconciliation สำหรับ `WTI/WTO ค้างออกบิล`, aging bucket, legacy partial-billed debt, และ `status ไม่ตรง usage`

## Implementation Checklist

- [x] Verify current Next page/component against this page-flow
- [x] Verify API route handlers match Current API and status rules above
- [x] Add `warehouse_id` to WTO lines and expose it in form/detail/read models
- [x] Add hold-aware stock-options API for branch+product warehouse availability
- [x] Add stock hold table/service and integrate WTO save/edit/cancel + SB create consume
- [x] Lock WTI/WTO document type in create context and edit API
- [ ] Verify legacy behavior for remaining SB edit/cancel/reversal gap before implementing runtime change
- [ ] Add/adjust tests or browser QA checklist before changing runtime
- [ ] Update this file and canonical reference if contract changes
