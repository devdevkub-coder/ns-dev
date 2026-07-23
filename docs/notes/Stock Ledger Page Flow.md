---
title: Stock Ledger Page Flow
aliases:
  - Stock Ledger Page
  - Flow หน้า Stock Ledger
  - หน้า Stock Ledger
tags:
  - ns-scrap-erp
  - stock
  - inventory
  - page-flow
  - stock-ledger
status: draft
created: 2026-06-11
updated: 2026-06-11
---

# Stock Ledger Page Flow / Flow หน้า Stock Ledger

## Scope

- Route: `/stock/ledger`
- API: `GET /api/stock/ledger`
- Owner: Stock / Inventory
- Page type: read-only movement history and audit trail
- Canonical stock semantics: [[Stock Ledger and Stock Balance]]

หน้านี้ใช้ตอบคำถามว่า "stock เคลื่อนไหวจากเอกสารไหน เมื่อไร และด้วยจำนวน/มูลค่าเท่าไร" ไม่ใช่หน้าคงเหลือสำหรับตัดสินใจขายโดยตรง และไม่ใช่หน้าสร้าง/แก้ movement

## Source Of Truth

- อ่านจาก `stock_ledger`
- row identity ฝั่ง UI/API ต้องใช้ `ledger_key` หรือ outward stable key ที่ไม่เปิดเผย internal id
- `stock balance` ต้อง aggregate จาก ledger rows นี้
- `pending_out` จาก `WTO` ห้ามแสดงเป็น ledger row เพราะยังไม่ใช่ stock-in/out movement

## What Appears In Ledger

| Ref Type | Meaning | Direction |
|---|---|---|
| `PB` | บิลรับซื้อ Stock | stock in |
| `SB` | บิลขาย Stock | stock out |
| `PSALE` | legacy only: เบิกออกรอบิลที่เคยตัด stock ก่อนเปิดบิล; target runtime ห้ามสร้างใหม่ | stock out legacy |
| `ST` | โอนสินค้าระหว่างสาขา/คลัง | paired out/in |
| `SC` | ปรับสถานะสินค้า | paired out/in |
| `GA` | ปรับเกรด/แปลงสินค้า | paired out/in |
| `ADJ` | นับสต๊อก/ปรับยอด | one-sided gain/loss |
| `PI`, `PI-RETURN` | เบิกวัตถุดิบเข้า WIP / คืนวัตถุดิบกลับคลังต้นทาง | paired out/in; return uses original PI cost/category |
| `PO2`, `PO2-REV` | รับผลผลิต / reverse output | WIP out + destination in หรือ reverse |

## What Must Not Appear

- `WTI` save เพราะใบรับของเป็น source evidence ก่อนสร้าง `PB`
- `WTO` confirm เพราะเป็นจุดสร้าง pending_out ก่อนนำเอกสารที่ยืนยันแล้วไปสร้าง `SB`; draft ยังไม่จอง stock
- PO Buy / PO Sell reservation
- PMA / PMT / RCP / bank statement money movement
- hold/reservation row จาก `stock_holds`
- note-only row ที่ไม่กระทบ qty/value ควรไปอยู่ audit/detail table แทน ledger เมื่อ refactor รอบถัดไป

## Main UI Contract

### Filters

ควรรองรับ:

- ค้นหาด้วยเลขเอกสาร / รหัสสินค้า / ชื่อสินค้า / ผู้ขาย / ผู้ซื้อ / หมายเหตุ
- สินค้า
- สาขา
- คลัง
- movement type
- ref type
- date range
- negative only หรือ balance warning ถ้ามี
- mode สำหรับ movement list / running balance ถ้ารองรับ

### Table Columns

คอลัมน์เป้าหมาย:

- วันที่เอกสาร
- วันที่สร้างรายการ
- Ledger key
- Ref type
- เลขที่เอกสาร
- ประเภท movement
- ผู้ขาย/ผู้ซื้อ/source party
- รหัสสินค้า
- ชื่อสินค้า
- สาขา
- คลัง
- Lot
- สถานะสินค้า
- ขายได้/ห้ามขาย
- เข้า
- ออก
- ต้นทุน/หน่วย
- มูลค่าเข้า
- มูลค่าออก
- หมายเหตุ
- สร้างโดย

ต้องแยก `วันที่เอกสาร` ออกจาก `วันที่สร้างรายการ` เสมอ เพราะบาง flow อาจ backdate business date ได้

## Row Detail

กด row แล้วเปิด read-only detail ที่แสดง:

- ข้อมูล ledger row
- source document link เช่น `PB`, `SB`, `ST`, `SC`, `GA`, `ADJ`
- product/location/lot/status key
- qty/value/cost
- created by / `วันที่สร้างรายการ`
- notes และ audit context

ไม่ควรมีปุ่มแก้ไข/ลบ stock movement จาก detail นี้ ถ้าต้อง reverse ให้ทำผ่าน source document หรือ dedicated reversal flow

## API Contract

`GET /api/stock/ledger` ควรรับ query:

- `q`
- `productId`
- `branchId`
- `warehouseId`
- `status`
- `lotNo`
- `refType`
- `movementType`
- `from`
- `to`
- `page`
- `pageSize`
- `sort`
- `format=json|xlsx`

Response ควรรวม:

- `rows`
- `summary`
- `reference` สำหรับ filter
- `movementTypes`
- pagination metadata

Export `.xlsx` ต้องใช้ filter เดียวกับหน้าจอ

## Reconciliation Rules

- Balance page ต้อง reconcile จาก ledger rows ได้
- Paired ref types (`ST`, `SC`, `GA`) ต้องมี out/in ที่ balance กันตาม ref
- `PB/SB` edit/cancel ต้อง reverse/rebuild ledger จาก source flow ไม่ใช่แก้ row โดยตรงใน ledger page
- duplicate/orphan cleanup ถ้ามี ต้องเป็น admin-only flow ที่มี backup, audit, rollback และ permission แยก

## Current Implementation / Gap

- มี read/export baseline และ row detail modal แล้ว
- API ใช้ server-side `q` search, pagination count, aggregate summary, distinct movement types, และ SQL window running balance ต่อ page แทนการโหลดทุก row เข้า Node
- row detail มี source document links สำหรับ ref type หลักที่ active app มี route: `PB/SB/ST/SC/SC-REV/GA/ADJ/PI/PI-RETURN/PO2/PO2-REV`; `PI-REV` และ `PSALE` เป็น legacy ref type เท่านั้น
- list/detail/export แสดง business date และ detail แสดง created context ของ row
- ต้องคง rule ว่า pending_out ไม่แสดงเป็น ledger row หลังเพิ่ม reservation layer
- cleanup tools ยังเป็น follow-up/design-dependent และต้องเป็น admin-only flow แยก

## Related Notes

- [[Stock Ledger and Stock Balance]]
- [[Stock Balance Page Flow]]
- [[Pending Sale Page Flow]]
- [[Production Flow]]
- [[Purchase Bills Page Flow]]
- [[Sales Bills Page Flow]]
