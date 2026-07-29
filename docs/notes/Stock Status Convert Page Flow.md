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
updated: 2026-06-21
---

# Stock Status Convert Page Flow / Flow หน้าปรับสถานะสินค้า

## Scope

- Route: `/stock/status-convert`
- API: `GET /api/stock/status-convert`, `POST /api/stock/status-convert`
- Owner: Stock / Inventory
- Page type: stock movement write flow
- Ledger ref type: `SC`
- เลข SC ที่สร้างใหม่ใช้รูปแบบ `SC` + รหัสสาขา 2 หลัก + running 6 หลัก เช่น `SC01-000001`; เลข legacy เดิมไม่ถูกเปลี่ยน

หน้านี้ใช้ทำ `Stock Reclassification / แก้ classification ผิด` ระหว่าง status bucket `RM` และ `FG` ภายใน `product + branch + warehouse + lot` เดิม เช่น รับซื้อเข้ามาเป็น `RM` แต่ตรวจพบภายหลังว่าจริง ๆ ควรเป็น `FG` หรือย้อนกลับ `FG -> RM`

ขอบเขตล่าสุดจาก requirement 2026-06-13:

- ใช้สำหรับแก้สถานะ stock ที่ลงผิดตั้งแต่ต้นหรือจัดประเภทผิด ไม่ใช่การแปรรูปจริง เช่น รับของเข้าเป็น `RM` แต่จริง ๆ ควรอยู่ bucket `FG`
- ระบบต้องลด stock ฝั่งต้นทางและเพิ่ม stock ฝั่งปลายทางทันที
- ผลลัพธ์ต้องไปต่อที่ `Stock Ledger` และ stock balance ในฐานะ quantity reclassification; ไม่ใช่ event ที่ตั้งต้นทุนใหม่หรือ reprice WAC
- flow ปกติรองรับสองทิศทางเท่านั้น: `RM -> FG` และ `FG -> RM`
- `WIP` ไม่อยู่ใน flow ปกติของหน้านี้ เพราะ WIP เป็น fact ของ Production Input/Output; ถ้าต้องแก้ WIP ต้องเป็น admin correction หรือ production reversal ที่แยก policy
- หน้านี้ไม่เปลี่ยน product code/grade; ถ้าต้องเปลี่ยนจากสินค้า/grade หนึ่งไปอีกสินค้า/grade หนึ่ง ให้ใช้ `/stock/convert` หรือ production flow ตาม business case
- ถ้าเป็นการแปรรูปจริง มี yield/loss/process cost หรือเปลี่ยนวัตถุดิบเป็นสินค้าใหม่ ต้องใช้ Production flow ไม่ใช่ `SC`

## Source Of Truth

- อ่านรายการจาก `stock_ledger.ref_type = 'SC'`
- 1 เอกสาร `SC` ต้องมี paired rows:
  - out จากสถานะต้นทาง
  - in เข้าสถานะปลายทาง
- Balance ต้องเปลี่ยนเฉพาะ status/output category ไม่ใช่ product, branch, warehouse, หรือ lot
- `SC` ไม่ตั้งต้นทุนใหม่ ไม่คำนวณ WAC ใหม่เอง ไม่สร้าง margin และไม่รับ manual cost override ใน flow ปกติ
- ถ้าระบบต้องเขียน `unit_cost/value` ใน paired ledger เพื่อ audit ให้ carry ค่าเดิมตาม source เท่านั้น และต้องไม่ถือว่า `SC` เป็นจุดเปลี่ยนราคาทุน

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

Design baseline ล่าสุด 2026-06-21:

- Toolbar ของหน้า list ไม่แสดงปุ่ม `โหลดใหม่`; ให้ใช้ search/filter และ action `+ ปรับสถานะใหม่` เป็นหลัก
- Table header ใช้ `bg-slate-100` ตาม `docs/design.md`
- Table body ใช้ `text-xs font-semibold` ให้ทุกคอลัมน์อ่านเป็นชุดเดียวกัน
- Status cell ใช้ dot + text ไม่ใช้ badge background
- Row action `ย้อนกลับ` ใช้ destructive outline (`border-red-200 text-red-700 hover:bg-red-50`) ไม่ใช้ปุ่มแดงทึบ
- Wording วันที่ต้องแยก `วันที่เอกสาร` กับ `วันที่สร้างรายการ`

### Create Modal

- Modal ใช้ `rounded-md` และ dark header `bg-slate-900 text-white`
- Header ไม่แสดงปุ่ม X; ใช้ปุ่ม `ยกเลิก` ใน footer เป็นทางปิดหลัก
- ปุ่มบันทึกใช้ primary slate (`bg-slate-900 hover:bg-slate-800 text-white font-normal`) และข้อความ `บันทึก`

### Filters

ควรรองรับ:

- ค้นหาเลขที่ / สินค้า / หมายเหตุ / เหตุผล
- สถานะจาก/เป็น
- สาขา
- คลัง
- วันที่เอกสาร และวันที่สร้างรายการ
- สินค้า

## Create Modal Data Contract

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
- cost/value ของ `SC` ใช้เพื่อ preserve audit เท่านั้น; ไม่สร้างต้นทุนใหม่และไม่ reprice WAC จาก action นี้
- `ref_no` และ `ref_id` ต้องผูก rows ทั้งคู่เข้าชุดเดียวกัน
- เหตุผลต้องอยู่ใน ledger notes หรือ audit table
- actor และ created date ต้องถูกเก็บและแสดงใน history

## WAC / Production Reporting Contract

- `SC` เป็น stock status conversion fact ไม่ใช่ production order และไม่ควรเพิ่มจำนวนใบสั่งผลิต
- Production Dashboard/Report ที่ต้องเห็นรายการนี้ต้องแสดงเป็น source แยก เช่น `Status Convert to FG` หรืออ่านผ่าน Stock Ledger/WAC section แยกจาก `PO2` output
- ห้ามนำ `SC` ไปรวมเป็น production output จากใบสั่งผลิตโดยไม่ติด label source เพราะจะทำให้ yield/loss ของ production order เพี้ยน
- `SC` ต้องไม่เป็นจุดเปลี่ยนราคาทุน/ต้นทุนเฉลี่ย; เป็นการแก้ classification และจำนวนใน bucket เท่านั้น
- `RM -> FG`: RM qty ลด, FG qty เพิ่ม; ต้นทุนเฉลี่ยไม่เปลี่ยนจาก action นี้
- `FG -> RM`: FG qty ลด, RM qty เพิ่ม; ต้นทุนเฉลี่ยไม่เปลี่ยนจาก action นี้
- มูลค่ารวมของ stock ทั้งบริษัท/สินค้า/คลังไม่ควรเปลี่ยนจาก `SC` ถ้าไม่มี loss/gain; ถ้ามี loss/gain แปลว่าไม่ใช่ normal `SC` และต้องใช้ policy อื่น
- ถ้ารู้เอกสารต้นทางที่ลง classification ผิด เช่น PB/WTI/ADJ ควรเก็บเป็น reference/audit note แต่ห้ามให้ `SC` override หรือสร้าง cost ใหม่

ตัวอย่าง:

```text
รับซื้อผิดเป็น RM:
RM +100 กก. @ 40 = 4,000

แก้เป็น FG ด้วย SC:
RM qty ลด 100
FG qty เพิ่ม 100

ต้นทุนเฉลี่ยไม่ถูกคำนวณใหม่จาก action SC นี้
```

## Cancel / Reverse Policy

Target ที่ควรใช้:

- ไม่แก้ ledger row เก่าโดยตรง
- ถ้าต้อง reverse ให้สร้าง paired reversal rows ด้วย `ref_type = SC-REV`
- `SC-REV.ref_id` ชี้กลับ `SC.ref_no` ต้นทาง และ original `SC` ต้องไม่ถูกแก้หรือลบ
- ต้อง block reverse ถ้า stock ที่ status ปลายทางถูกใช้ต่อแล้วและทำให้ยอดพร้อมใช้ไม่พอ

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

`PATCH /api/stock/status-convert` รับ:

- `action = reverse`
- `refNo`
- `note`

## Current Implementation / Gap

- มี write baseline ที่สร้าง paired `SC` ledger rows แล้ว
- Runtime ปัจจุบันจำกัด normal flow เป็น `RM <-> FG` แล้ว และถอด `WIP` ออกจาก form/API write path เว้นแต่มี admin correction policy
- Runtime ปัจจุบันใช้ hold-aware `readyQty` สำหรับ source availability check แล้ว
- Runtime ปัจจุบันให้ `SC` ทำงานบน source status bucket และไม่เปิด cost override; target wording ล่าสุดถือว่า `SC` เป็น quantity reclassification ไม่ใช่ WAC-changing event
- Runtime ปัจจุบันบังคับ required reason แล้ว
- Runtime ปัจจุบันรองรับ append-only reverse เป็น paired `SC-REV` ledger rows แล้ว และ block reverse เมื่อ target bucket ready stock ไม่พอ
- Stock reconciliation ตรวจ `SC`/`SC-REV` pair integrity, net zero, และ missing source แล้ว
- ต้องยืนยัน list/detail/export แสดง `วันที่สร้างรายการ`
- Server-side filter/pagination/index สำหรับรายการ `SC` เพิ่มแล้วสำหรับ `q/dateFrom/dateTo/branchId/warehouseId/productId/fromStatus/toStatus/page/pageSize`; UI ยังใช้ client-side paging เป็นหลักและควรต่อ server params เมื่อข้อมูลโตจริง

## Related Notes

- [[Stock Ledger and Stock Balance]]
- [[Stock Balance Page Flow]]
- [[Stock Ledger Page Flow]]
