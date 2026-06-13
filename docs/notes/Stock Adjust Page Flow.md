---
title: Stock Adjust Page Flow
aliases:
  - Stock Count Adjust Page
  - Flow หน้านับสต๊อก
  - Flow หน้าปรับยอดสต๊อก
  - หน้า Stock Adjust
tags:
  - ns-scrap-erp
  - stock
  - inventory
  - page-flow
  - stock-adjust
status: draft
created: 2026-06-11
updated: 2026-06-11
---

# Stock Adjust Page Flow / Flow หน้านับสต๊อกและปรับยอด

## Scope

- Route: `/stock/adjust`
- API: `GET /api/stock/adjust`, `POST /api/stock/adjust`
- Owner: Stock / Inventory
- Page type: stock movement write flow
- Ledger ref type: `ADJ`

หน้านี้ใช้บันทึกผลนับจริงเมื่อยอดในระบบไม่ตรงกับของจริง เป็น audit-sensitive flow และควรใช้เฉพาะกรณีปรับยอดจากการนับ ไม่ใช่ใช้แทน transfer, sale, purchase, return, หรือ production

## Source Of Truth

- audit/header: `stock_adjustments`
- movement: `stock_ledger.ref_type = 'ADJ'`
- จำนวนคงเหลือหลังปรับต้อง derive จาก `stock_ledger`

## Main UI Contract

### List

ควรแสดง:

- เลขที่เอกสาร
- วันที่เอกสาร
- วันที่สร้างรายการ
- สาขา/คลัง
- สินค้า
- Lot
- ยอดในระบบ
- นับจริง
- ส่วนต่าง
- ประเภท: `LOSS` / `GAIN`
- มูลค่าประกอบการพิจารณา
- เหตุผล
- สถานะ
- สร้างโดย

### Filters

ควรรองรับ:

- ค้นหาเลขที่ / สินค้า / เหตุผล
- สาขา
- คลัง
- ประเภท `LOSS` / `GAIN`
- วันที่จาก-ถึง
- สินค้า

## Create Modal Contract

ต้องมี field:

- วันที่เอกสาร
- สาขา
- คลัง
- สินค้า
- Lot
- ยอดในระบบ
- นับจริง
- เหตุผล
- หมายเหตุ

Target validation:

- สาขา/คลัง/สินค้า active และสัมพันธ์ถูกต้อง
- นับจริงต้องไม่ติดลบ
- ต้องมีเหตุผลอย่างน้อยตาม rule validation
- ถ้านับจริงเท่ากับยอดในระบบ ห้ามสร้างเอกสาร
- ยอดในระบบควรคำนวณจาก stock balance ปัจจุบัน ไม่ให้ user แก้เองโดยไม่มีเหตุผล
- ถ้ามี active hold ต้องแสดงให้เห็นก่อนบันทึก เพราะการปรับยอดอาจทำให้ `พร้อมใช้` ติดลบ

## Ledger Side Effect

เมื่อบันทึกสำเร็จ:

- สร้าง `stock_adjustments`
- ถ้านับจริงมากกว่ายอดในระบบ:
  - `adjust_type = GAIN`
  - `stock_ledger.qty_in = diff`
  - `movement_type = STOCK_COUNT_GAIN`
- ถ้านับจริงน้อยกว่ายอดในระบบ:
  - `adjust_type = LOSS`
  - `stock_ledger.qty_out = abs(diff)`
  - `movement_type = STOCK_COUNT_LOSS`
- `value_in` / `value_out` ควรเป็น 0 ตาม note-only accounting policy จนกว่าจะมี accounting policy
- `value_note` เก็บมูลค่าประกอบการตรวจสอบได้ แต่ไม่ใช่ P&L posting

## Accounting Policy

Target ปัจจุบัน:

- Stock adjust เป็น note-only ต่อบัญชี
- ไม่ลง P&L อัตโนมัติ
- ถ้าจะลงบัญชีภายหลัง ต้องมี accounting approval และ GL posting policy แยก

## Cancel / Reverse Policy

Target ที่ควรใช้:

- ไม่แก้ ledger row เก่าโดยตรง
- ถ้าบันทึกผิด ให้สร้าง adjustment กลับหรือ reversal document ตาม policy
- ต้อง audit ว่าใครสร้าง ใครอนุมัติ และเหตุผลอะไร
- ควรจำกัด permission ให้ role ที่ได้รับอนุญาตเท่านั้น

## API Contract

`GET /api/stock/adjust` ควรส่ง:

- `rows`
- `reference.branches`
- `reference.warehouses`
- `reference.products`

`POST /api/stock/adjust` รับ:

- `date`
- `branchId`
- `warehouseId`
- `productId`
- `lotNo`
- `status` / `outputCategory`
- `systemQty`
- `countedQty`
- `reason`
- `remark`

Server ต้องคำนวณ/ยืนยัน `systemQty` จาก source of truth อีกครั้ง ไม่เชื่อ payload ฝั่ง client เพียงอย่างเดียว
Server ต้อง snapshot `onHoldQty`, `readyQty`, และ `accountingImpactPolicy = NOTE_ONLY` ตอน post

## Current Implementation / Gap

- มี write baseline ที่สร้าง `stock_adjustments` และ `ADJ` ledger row แล้ว
- current policy เป็น note-only value impact: `stock_ledger.value_in/value_out = 0`, ส่วน `value_note` อยู่ที่ header เพื่อ analysis เท่านั้น
- Runtime ปัจจุบันบันทึก `output_category`, `on_hold_qty`, `ready_qty_snapshot`, และ `accounting_impact_policy`
- Runtime ปัจจุบัน block direct posted adjustment เมื่อ `countedQty < active hold` เพื่อไม่ให้ available stock ติดลบ; เคสนี้ต้องปลด hold หรือใช้ reconciliation/approval policy แยกก่อน
- Stock reconciliation ตรวจ header/ledger mismatch และ ADJ ledger value ที่ไม่เป็นศูนย์แล้ว
- Reverse policy ปัจจุบันยังไม่เปิดปุ่มแก้ ledger เดิม; หากผิดให้ทำ adjustment กลับพร้อมเหตุผลจนกว่าจะมี approval/reversal document แยก
- ต้องยืนยัน list/detail/export แสดง `วันที่สร้างรายการ`

## Related Notes

- [[Stock Ledger and Stock Balance]]
- [[Stock Balance Page Flow]]
- [[Stock Ledger Page Flow]]
