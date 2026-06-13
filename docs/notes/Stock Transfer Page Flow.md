---
title: Stock Transfer Page Flow
aliases:
  - Stock Transfer Page
  - Flow หน้าโอนสินค้าระหว่างสาขา
  - หน้า Stock Transfer
tags:
  - ns-scrap-erp
  - stock
  - inventory
  - page-flow
  - stock-transfer
status: draft
created: 2026-06-11
updated: 2026-06-13
---

# Stock Transfer Page Flow / Flow หน้าโอนสินค้าระหว่างสาขา

## Scope

- Route: `/stock/transfer`
- API: `GET /api/stock/transfer`, `POST /api/stock/transfer`
- Owner: Stock / Inventory
- Page type: stock movement write flow
- Ledger ref type: `ST`

หน้านี้ใช้ย้ายสินค้าออกจากสาขา/คลังต้นทางไปสาขา/คลังปลายทาง โดยต้องสร้าง stock ledger แบบ paired movement ในเอกสารเดียวกัน

## Requirement Update 2026-06-13

Customer annotated screenshots clarified the target contract:

- หน้านี้ใช้สำหรับโอน stock ระหว่างคลังหรือสาขาเท่านั้น ไม่กระทบ revenue, AR, AP, หรือ sales income
- ผู้ใช้ต้องเห็น stock available ของต้นทางก่อนบันทึก เพื่อรู้ว่า stock มาจากไหนและมีพอหรือไม่
- เมื่อส่ง/บันทึกเข้าระบบแล้วต้องเกิด stock-out ที่ต้นทางและ stock-in ที่ปลายทาง และทั้งหมดต้อง trace ได้ใน Stock Ledger
- Workflow หลักคือ `โอนสินค้าออก -> ตัด Stock 1 -> เข้า Stock 2 -> Stock 2 มีสินค้าเพิ่ม`
- ตัวอย่าง warehouse scope ที่ต้องรองรับ: สมุทรสาครมีคลัง `RM/FG`, นครสวรรค์มีคลัง `RM`; ตัวอย่างการโอนคือ สมุทรสาคร `RM/FG` ไปนครสวรรค์ `RM`
- Filter เป้าหมายของหน้า list เหลือเฉพาะ `เลขที่`, `วันที่`, และ `น้ำหนักรวม`
- List ต้องเพิ่ม column `แก้ไขล่าสุดโดย/เวลา` และ `มูลค่ารวม`
- มูลค่ารวมคำนวณจาก `sum(source_unit_cost_per_kg * qty)` เช่น `120 * 100 = 12,000`
- Create/edit modal ไม่ต้องมี field `ผู้ส่ง`, `ผู้รับ`, และ `Lot`
- Create/edit modal ไม่ต้องแสดงช่อง `เลขที่เอกสาร` และไม่ต้องแสดง `วันที่`; ระบบออกเลขและใช้วันที่อัตโนมัติ
- คลังต้นทาง/ปลายทางต้องเลือกไม่ได้จนกว่าจะเลือกสาขาของฝั่งนั้นก่อน
- ช่องสินค้าในรายการต้องเป็น searchable combobox ค้นหาด้วยรหัสหรือชื่อสินค้าได้
- Item row ต้องแสดง source stock available และ source unit cost/kg จากต้นทางให้ผู้ใช้เห็นก่อนบันทึก
- แก้ไข/ยกเลิกได้เฉพาะเอกสารที่ยังไม่ส่งเข้าตัด stock; ถ้าส่งแล้วห้ามแก้ไข

## Source Of Truth

- รายการโอนที่บันทึกแล้วอ่านจาก `stock_ledger.ref_type = 'ST'`
- 1 เลขที่ `ST` ต้องมีอย่างน้อย 2 ledger rows ต่อสินค้า:
  - source row: `qty_out`
  - destination row: `qty_in`
- Balance หลังบันทึกต้องมาจาก `stock_ledger` ไม่ใช่ table summary แยก

## Main UI Contract

### List

ควรแสดง:

- เลขที่เอกสาร
- วันที่เอกสาร
- วันที่สร้างรายการ
- แก้ไขล่าสุดโดย
- เวลาแก้ไขล่าสุด
- ต้นทาง
- ปลายทาง
- จำนวนรายการสินค้า
- น้ำหนัก/จำนวนรวม
- มูลค่ารวมจากต้นทุนต้นทาง
- หมายเหตุ
- สถานะเอกสาร

### Filters

Target filter ที่ต้องรองรับ:

- เลขที่เอกสาร
- วันที่จาก-ถึง
- น้ำหนักรวม จาก-ถึง

ไม่ต้องใช้ broad search ที่รวมผู้ส่ง/ผู้รับ/หมายเหตุ และไม่ต้องใช้ branch filter เป็น default filter surface ตาม requirement ล่าสุด

## Create Modal Contract

### Header Section

- สาขาต้นทาง
- คลังต้นทาง
- สาขาปลายทาง
- คลังปลายทาง
- หมายเหตุ

เลขที่เอกสารและวันที่เป็นระบบจัดการอัตโนมัติ ไม่ต้องแสดงเป็น field ใน create/edit modal

### Item Section

รองรับหลายรายการ:

- สินค้า เป็น searchable combobox ค้นหาด้วยรหัส/ชื่อสินค้า
- จำนวน/น้ำหนัก
- คงเหลือต้นทาง / source available preview
- มูลค่า/kg ของ stock ต้นทาง
- มูลค่ารวมของบรรทัด = `source_unit_cost_per_kg * qty`

ไม่ต้องรับ Lot จากผู้ใช้ใน modal เป้าหมายของหน้านี้ ถ้าระบบต้อง preserve lot/cost จาก source stock ให้ resolve จาก stock layer/server-side policy แทนการเปิดช่อง Lot manual

Target validation:

- ต้องมีอย่างน้อย 1 รายการ
- สาขา/คลังต้นทางต้อง active และสัมพันธ์กัน
- สาขา/คลังปลายทางต้อง active และสัมพันธ์กัน
- ต้องเลือกสาขาก่อนจึงเลือกคลังได้
- ต้นทางและปลายทางต้องไม่เป็นคลังเดียวกัน
- สินค้าต้อง active
- จำนวนต้องมากกว่า 0
- source ต้องมี `พร้อมใช้` เพียงพอ โดยคิดจาก `on_hand - active_holds`
- source unit cost/kg ต้อง resolve ได้จาก stock ต้นทาง ห้าม fallback เป็น 0 แบบเงียบ ๆ

### Document Status / Edit Policy

Target page ต้องแยกสถานะอย่างน้อย:

- `draft` หรือ equivalent: ยังไม่ส่งเข้าตัด stock, แก้ไข/ยกเลิกได้
- `posted` หรือ equivalent: ส่งแล้วและเขียน stock ledger แล้ว, ห้ามแก้ไขข้อมูลเดิม

Posted transfer ห้ามยกเลิกและห้ามแก้ไขข้อมูลเดิมหลังตัด stock แล้ว ถ้าผู้ใช้ต้องการแก้ผลสต๊อก ให้สร้าง stock transfer ใหม่กลับทิศทางแทน เพื่อให้เอกสารเดิมและ ledger เดิมยัง audit ได้ครบ

## Ledger Side Effect

เมื่อส่ง/บันทึก posted สำเร็จ:

- สร้าง ref type `ST`
- สร้าง `movement_type = โอนระหว่างสาขา-ออก` หรือ equivalent สำหรับต้นทาง
- สร้าง `movement_type = โอนระหว่างสาขา-เข้า` หรือ equivalent สำหรับปลายทาง
- `ref_no` ต้องเหมือนกันทั้งคู่
- `ref_id` ต้องผูกทั้งคู่เข้าชุดเดียวกัน
- lot/status/not-available/cost policy ต้องไม่หายจาก source movement
- `unit_cost` และ `value` ของ destination ต้องมาจาก source stock cost policy เดียวกันกับ source movement
- ไม่สร้าง revenue, AR, AP, หรือ sales document side effect

## Cancel / Reverse Policy

Target ที่ควรใช้:

- draft: แก้ไข/ยกเลิกได้เพราะยังไม่เขียน stock ledger
- posted: ห้ามแก้ไขและห้ามยกเลิกเอกสารเดิม
- posted correction: ให้สร้าง transfer ใหม่กลับทิศ เช่น โอนจากปลายทางกลับต้นทาง ด้วยเลขที่เอกสารใหม่
- ไม่ต้องมี `ST-REV` หรือ posted cancel flow สำหรับหน้านี้ เพราะ operation นี้เป็น internal stock movement และ correction ควรเป็นเอกสารโอนใหม่ที่ audit แยกได้

Current active app มี `stock_transfers` / `stock_transfer_items` source document แล้ว: draft แก้ไข/ยกเลิกได้, posted เขียน ledger แล้ว immutable, และ cancel posted ถูก block ตาม policy

## API Contract

`GET /api/stock/transfer` ควรส่ง:

- `rows`
- `summary`
- pagination metadata
- branch options
- warehouse options
- product options

`GET /api/stock/transfer?mode=source-stock` ใช้ดึง source available และ source unit cost/kg สำหรับ modal preview โดยรับ `sourceBranchId`, `sourceWarehouseId`, และ optional `sourceProductId`

`POST /api/stock/transfer` รับ:

- `date`
- `fromBranchId`
- `fromWarehouseId`
- `toBranchId`
- `toWarehouseId`
- `notes`
- `submitMode`: `draft` หรือ `post`
- `items[]`

Target item payload:

- `productId`
- `qty`

Server ต้อง resolve source available, source unit cost/kg, and ledger value จาก stock source of truth; client-sent cost/value ใช้ได้เพื่อ preview เท่านั้นและต้อง validate ซ้ำ server-side

`PATCH /api/stock/transfer` รองรับ:

- `action = edit`: แก้ไข draft เท่านั้น
- `action = cancel`: ยกเลิก draft เท่านั้น และยังไม่เขียน ledger
- `action = post`: ส่ง draft เข้าสต๊อกและเขียน paired `ST` ledger

Target API ที่ทำแล้ว:

- list API ต้องรองรับ filter `docNo`, `dateFrom`, `dateTo`, `totalQtyFrom`, `totalQtyTo`
- list API ต้องส่ง `updatedByName`, `updatedAt`, `totalQty`, `totalValue`

## Current Implementation / Gap

- ทำแล้ว: source document tables `stock_transfers` และ `stock_transfer_items`
- ทำแล้ว: draft/post/cancel-draft policy; posted immutable
- ทำแล้ว: server-side list filters/pagination/summary จาก source document
- ทำแล้ว: hold-aware available check ด้วย `readyQty`
- ทำแล้ว: source stock available preview และ source unit cost/kg ใน modal
- ทำแล้ว: list columns `แก้ไขล่าสุดโดย/เวลา` และ `มูลค่ารวม`
- ทำแล้ว: ตัด field `ผู้ส่ง`, `ผู้รับ`, และ `Lot` ออกจาก target modal
- ทำแล้ว: posted ledger เขียน source unit cost และ value ทั้ง out/in
- ทำแล้ว: posted ledger allocate จาก source stock buckets ฝั่ง server และ preserve `lot_no`, stock status/output category, source unit cost, และ value ต่อ bucket โดยไม่เปิด Lot manual ใน UI
- ทำแล้ว: API/DB optimize สำหรับ list/source lookup ด้วย source document indexes, ST ledger lookup indexes, และ `doc_no text_pattern_ops` สำหรับ prefix search
- ทำแล้ว: logged-in browser QA สำหรับ source preview, draft create/edit/cancel, posted create, `ST` ledger 4-row paired movement, posted edit/cancel block, และ QA cleanup แบบ append-only
- ทำแล้ว: posted cancel/reversal ไม่เปิดตาม business policy; correction ใช้เอกสาร transfer ใหม่กลับทิศเท่านั้น

## QA Evidence 2026-06-13

- Authenticated local browser QA passed on `http://localhost:3000/stock/transfer` with a temporary Supabase Auth admin user against dev-target only
- Draft flow: created `ST2606-0013`, edited qty, cancelled draft, and verified no `ST` ledger rows were created for the draft
- Posted flow: posted `ST2606-0014` with 60 kg; ledger had 4 paired rows because source allocation consumed two buckets/lots
- Ledger totals: `qty_in = qty_out = 60`, `value_in = value_out = 7000`, two distinct lots preserved, and unit cost remained positive
- Negative checks: posted edit and posted cancel returned `400`, matching the immutable posted policy
- DB hygiene: QA setup and posted test movement were offset with append-only `QA-STOCK-CLEANUP`; post-check found no remaining stock-balance residue for the QA refs
- Runtime bug fixed during QA: advisory lock for ST doc number generation now uses Prisma `$executeRaw` instead of `$queryRaw` to avoid deserializing PostgreSQL `void`

## Related Notes

- [[Stock Ledger and Stock Balance]]
- [[Stock Ledger Page Flow]]
- [[Stock Balance Page Flow]]
