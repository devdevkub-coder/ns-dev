---
title: Stock Status Convert Page Flow
aliases:
  - Status Convert Page
  - Flow หน้าปรับสถานะสินค้า
  - หน้า Stock Status Convert
tags:
  - ns-scrap-erp
  - stock
  - inventory
  - page-flow
  - stock-status-convert
status: draft
created: 2026-06-11
updated: 2026-06-13
---

# Stock Status Convert Page Flow / Flow หน้าปรับสถานะสินค้า

## Scope

- Route: `/stock/status-convert`
- API: `GET /api/stock/status-convert`, `POST /api/stock/status-convert`
- Owner: Stock / Inventory
- Page type: stock movement write flow
- Ledger ref type: `SC`

หน้านี้ใช้แปลง stock ระหว่าง status bucket `RM` และ `FG` ภายใน `product + branch + warehouse + lot` เดิม เช่น `ทองแดงเบอร์ 3 RM -> ทองแดงเบอร์ 3 FG` หรือย้อนกลับ `FG -> RM`

ขอบเขตล่าสุดจาก requirement 2026-06-13:

- ใช้สำหรับปรับวัตถุดิบเป็นสินค้าสำเร็จรูปในเชิง stock status เช่น `RM = ทองแดง scrap`, `FG = copper ingot`
- ระบบต้องลด stock ฝั่งต้นทางและเพิ่ม stock ฝั่งปลายทางทันที
- ผลลัพธ์ต้องไปต่อที่ `Stock Ledger`, `WAC`, และรายงาน/มุมมอง Production ที่อ่าน fact จาก ledger
- flow ปกติรองรับสองทิศทางเท่านั้น: `RM -> FG` และ `FG -> RM`
- `WIP` ไม่อยู่ใน flow ปกติของหน้านี้ เพราะ WIP เป็น fact ของ Production Input/Output; ถ้าต้องแก้ WIP ต้องเป็น admin correction หรือ production reversal ที่แยก policy
- หน้านี้ไม่เปลี่ยน product code/grade; ถ้าต้องเปลี่ยนจากสินค้า/grade หนึ่งไปอีกสินค้า/grade หนึ่ง ให้ใช้ `/stock/convert` หรือ production flow ตาม business case

## Source Of Truth

- อ่านรายการจาก `stock_ledger.ref_type = 'SC'`
- 1 เอกสาร `SC` ต้องมี paired rows:
  - out จากสถานะต้นทาง
  - in เข้าสถานะปลายทาง
- Balance ต้องเปลี่ยนเฉพาะ status/output category ไม่ใช่ product, branch, warehouse, หรือ lot
- WAC ต้องใช้ต้นทุนเฉลี่ยของ source status bucket ณ เวลาบันทึก และส่งต่อให้ target status bucket ด้วย value เดียวกัน

## Main UI Contract

### List

ควรแสดง:

- เลขที่เอกสาร
- วันที่เอกสาร
- วันที่สร้างรายการ
- สินค้า
- สาขา/คลัง
- Lot
- สถานะจาก
- สถานะเป็น
- จำนวน
- มูลค่า
- เหตุผล/หมายเหตุ
- สร้างโดย

### Filters

ควรรองรับ:

- ค้นหาเลขที่ / สินค้า / หมายเหตุ / เหตุผล
- สถานะจาก/เป็น
- สาขา
- คลัง
- วันที่เอกสาร และวันที่สร้างรายการ
- สินค้า

## Create Modal Contract

ต้องมี field:

- วันที่เอกสาร
- สาขา
- คลัง
- สินค้า
- Lot
- สถานะต้นทาง
- สถานะปลายทาง
- จำนวน
- เหตุผล
- หมายเหตุ

Target validation:

- สถานะต้นทางและปลายทางต้องไม่ซ้ำกัน
- สถานะที่อนุญาตใน normal flow คือ `RM -> FG` และ `FG -> RM` เท่านั้น
- จำนวนต้องมากกว่า 0
- source key ต้องมี `พร้อมใช้` เพียงพอ ไม่ใช่แค่ `คงเหลือจริง`
- สาขา/คลัง/สินค้า active และสัมพันธ์ถูกต้อง
- ถ้ามี Lot ต้อง validate กับ source balance key
- เหตุผลต้อง required เพื่อใช้ audit/reconciliation

## Ledger Side Effect

เมื่อบันทึกสำเร็จ:

- source row: `ref_type = 'SC'`, `qty_out`, `output_category = fromStatus`
- target row: `ref_type = 'SC'`, `qty_in`, `output_category = toStatus`
- `RM -> FG`: stock RM ลด, stock FG เพิ่ม
- `FG -> RM`: stock FG ลด, stock RM เพิ่ม
- cost/value ใช้ average cost ของ source key ณ วันที่บันทึก; `value = qty * source unit cost`
- `ref_no` และ `ref_id` ต้องผูก rows ทั้งคู่เข้าชุดเดียวกัน
- เหตุผลต้องอยู่ใน ledger notes หรือ audit table
- actor และ created date ต้องถูกเก็บและแสดงใน history

## WAC / Production Reporting Contract

- `SC` เป็น stock status conversion fact ไม่ใช่ production order และไม่ควรเพิ่มจำนวนใบสั่งผลิต
- Production Dashboard/Report ที่ต้องเห็นรายการนี้ต้องแสดงเป็น source แยก เช่น `Status Convert to FG` หรืออ่านผ่าน Stock Ledger/WAC section แยกจาก `PO2` output
- ห้ามนำ `SC` ไปรวมเป็น production output จากใบสั่งผลิตโดยไม่ติด label source เพราะจะทำให้ yield/loss ของ production order เพี้ยน
- Target WAC ของ status ปลายทางต้องรับ value จาก source WAC ของ status ต้นทางเพื่อให้ stock value รวมไม่เปลี่ยนจากการเปลี่ยน bucket

## Cancel / Reverse Policy

Target ที่ควรใช้:

- ไม่แก้ ledger row เก่าโดยตรง
- ถ้าต้อง reverse ให้สร้าง reversal document หรือ paired reversal rows
- ต้อง block reverse ถ้า stock ที่ status ปลายทางถูกใช้ต่อแล้วและทำให้ยอดติดลบ

## API Contract

`GET /api/stock/status-convert` ควรส่ง:

- `rows`
- `reference.branches`
- `reference.warehouses`
- `reference.products`
- filter params: `q`, `dateFrom`, `dateTo`, `branchId`, `warehouseId`, `productId`, `fromStatus`, `toStatus`, `page`, `pageSize`, `sort`

`POST /api/stock/status-convert` รับ:

- `date`
- `branchId`
- `warehouseId`
- `productId`
- `lotNo`
- `fromStatus`
- `toStatus`
- `qty`
- `reason`
- `notes`

## Current Implementation / Gap

- มี write baseline ที่สร้าง paired `SC` ledger rows แล้ว
- Runtime ปัจจุบันจำกัด normal flow เป็น `RM <-> FG` แล้ว และถอด `WIP` ออกจาก form/API write path เว้นแต่มี admin correction policy
- Runtime ปัจจุบันใช้ hold-aware `readyQty` สำหรับ source availability check แล้ว
- Runtime ปัจจุบันให้ WAC คำนวณแยกตาม source status bucket แล้ว
- Runtime ปัจจุบันบังคับ required reason แล้ว
- ต้องออกแบบ reverse/cancel และ reconciliation query
- ต้องยืนยัน list/detail/export แสดง `วันที่สร้างรายการ`
- Server-side filter/pagination/index สำหรับรายการ `SC` เพิ่มแล้วสำหรับ `q/dateFrom/dateTo/branchId/warehouseId/productId/fromStatus/toStatus/page/pageSize`; UI ยังใช้ client-side paging เป็นหลักและควรต่อ server params เมื่อข้อมูลโตจริง

## Related Notes

- [[Stock Ledger and Stock Balance]]
- [[Stock Balance Page Flow]]
- [[Stock Ledger Page Flow]]
