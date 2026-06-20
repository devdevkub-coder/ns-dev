---
title: Stock Convert Page Flow
aliases:
  - Grade Adjustment Page
  - Stock Grade Convert Page
  - Flow หน้าปรับเกรดสินค้า
  - หน้า Stock Convert
tags:
  - ns-scrap-erp
  - stock
  - inventory
  - page-flow
  - stock-convert
status: draft
created: 2026-06-11
updated: 2026-06-21
---

# Stock Convert Page Flow / Flow หน้าปรับเกรดสินค้า

## Scope

- Route: `/stock/convert`
- API: `GET /api/stock/convert`, `POST /api/stock/convert`, `PATCH /api/stock/convert`
- Owner: Stock / Inventory
- Page type: stock movement write flow
- Ledger ref type: `GA`

หน้านี้ใช้แปลงสินค้า/ปรับเกรดจากสินค้าต้นทางเป็นสินค้าปลายทางในคลังเดียวกัน เช่น แปลงเกรดหรือแยกสภาพสินค้า โดยจำนวนปลายทางอาจต่างจากต้นทางจาก loss/yield

## Latest Reference Update 2026-06-13

ภาพ reference ล่าสุดกำหนดให้ `/stock/convert` ไม่ใช่แค่ stock ledger pair แบบง่าย แต่ต้องเชื่อมกับ Cost Pool / Allocation Ledger ด้วย:

- สินค้าต้นทางต้องเลือกจาก Cost Pool ที่ยังมี available qty
- ระบบต้องเลือก lot/cost pool ตาม allocation method เช่น FIFO, LIFO, Highest Cost, Lowest Cost, หรือ Manual
- จำนวนปลายทางต้องน้อยกว่าหรือเท่ากับจำนวนต้นทาง; ถ้าน้อยกว่าต้องบันทึกเป็น loss/yield tracking
- เมื่อตัดสินค้าต้นทางสำเร็จ ต้องลด available qty ของ source cost pool และทำให้ cost pool row นั้นเป็น `Partially Used` หรือ consumed ตามยอดที่ match
- สินค้าปลายทางต้องถูกบันทึกกลับเข้า Cost Pool เป็น source type `Regrade` / `Conversion`
- ต้องบันทึกประวัติการ allocation แยกจาก stock ledger เพื่อ trace ได้ว่า source lot ใดถูกใช้สร้าง target lot ใด
- Reverse ต้องเป็น append-only reversal ที่คืน source cost pool, ตัด target cost pool, และ reverse allocation/match logs

## Source Of Truth

- audit/header: `grade_adjustments`
- movement: `stock_ledger.ref_type = 'GA'`
- costing source/target: Cost Pool rows ที่ source ถูก consume และ target ถูกเพิ่มกลับเป็น `Regrade`
- allocation audit: Allocation Ledger / Match Logs สำหรับผูก source cost pool lots กับ target regrade lot
- DB runtime tables: `stock_cost_pool_entries`, `stock_cost_pool_allocations`
- 1 เอกสาร `GA` ต้องมี paired rows:
  - out จากสินค้าต้นทาง
  - in เข้าสินค้าปลายทาง

## Main UI Contract

### List

ควรแสดง:

- เลขที่เอกสาร
- วันที่เอกสาร
- วันที่สร้างรายการ
- source type
- สาขา/คลัง
- สินค้าต้นทาง
- จำนวนต้นทาง
- สินค้าปลายทาง
- จำนวนปลายทาง
- loss/yield
- cost status
- unit cost
- มูลค่า
- สถานะ

Toolbar ของหน้า list ไม่แสดงปุ่ม `โหลดใหม่`; ให้ใช้ search/filter และ action `+ ปรับเกรดใหม่` เป็นหลัก ส่วน runtime reload หลัง save/reverse/detail ยังทำงานตาม flow เดิม

Design checkpoint 2026-06-21: หน้า list/table/form/detail modal ต้องยึด `docs/design.md` โดยใช้ modal `rounded-md`, breakpoint ตาราง desktop ที่ `lg`, table header สี `bg-slate-100`, header table ต้อง sort ได้, table body `text-xs font-semibold`, ปุ่ม action แบบ outline และ detail modal ปิดด้วย footer action แทนปุ่ม X บน header

### Filters

ควรรองรับ:

- ค้นหาเลขที่ / source / target / ref
- source type
- cost status
- สาขา/คลัง
- วันที่
- สินค้าต้นทาง/ปลายทาง

## Create Modal Contract

### Source Section

- วันที่เอกสาร
- สาขา
- คลัง
- สินค้าต้นทาง
- Lot ต้นทาง
- จำนวนต้นทาง
- วิธีตัดต้นทุน: FIFO, LIFO, Highest Cost, Lowest Cost, Manual
- preview lots ที่ระบบจะตัดจาก Cost Pool พร้อม qty, unit cost, value
- Manual lot selection เมื่อเลือก Manual ต้องระบุ cost pool lot และ qty ราย lot

### Target Section

- สินค้าปลายทาง
- Lot ปลายทาง
- จำนวนปลายทาง
- วิธีคิดต้นทุน target lot:
  - Source WAC / source matched unit cost เป็น default
  - Target nearest WAC สำหรับเปรียบเทียบ/override ตาม policy
  - Custom unit cost เฉพาะเมื่อมีสิทธิ์และบันทึกเหตุผล

### Reason / Cost Section

- เหตุผล
- หมายเหตุ
- loss/yield summary
- cost flow preview
- cost adjustment note เฉพาะกรณี policy อนุญาตให้เกิดส่วนต่างต้นทุน

Target validation:

- source product และ target product ต้อง active
- source/target ต้องไม่เป็น key เดียวกันทั้งหมด
- source qty และ target qty ต้องมากกว่า 0
- target qty ต้องน้อยกว่าหรือเท่ากับ source qty; ถ้าน้อยกว่าต้องมี loss/yield tracking และเหตุผลตาม policy
- source key ต้องมี `พร้อมใช้` เพียงพอ
- source Cost Pool ต้องมี available qty เพียงพอสำหรับ allocation mode ที่เลือก
- Manual allocation ต้องรวม qty ได้ตรงกับ source qty หรือเข้ากฎ partial/pending ที่ออกแบบไว้
- สาขา/คลังต้อง active และสัมพันธ์กัน

## Ledger Side Effect

เมื่อบันทึกสำเร็จ:

- สร้าง `grade_adjustments` audit row
- source row: `ref_type = 'GA'`, `movement_type = GRADE_ADJUST_OUT`, `qty_out`
- target row: `ref_type = 'GA'`, `movement_type = GRADE_ADJUST_IN`, `qty_in`
- source value ใช้ต้นทุนจาก matched Cost Pool lots ไม่ใช่ค่า hard-code
- target value ใช้ cost policy จาก source matched cost เป็น default และต้อง trace ได้
- เพิ่ม target Cost Pool row สำหรับสินค้าเป้าหมาย โดย source type เป็น `Regrade` / `Conversion`
- update source Cost Pool availability จาก allocation/match logs; ถ้าใช้บางส่วนให้สถานะเป็น `Partially Used`
- บันทึก Allocation Ledger / Match Logs เพื่อย้อนดู source lots ที่ถูกใช้ได้
- `ref_no` ต้องตรงกับ `grade_adjustments.doc_no`

## Cost Policy

Target policy:

- ใช้ source matched unit cost / source WAC เป็น default cost basis
- loss/yield เป็น quantity difference ที่ต้อง audit ได้
- P&L หรือ variance accounting ยังไม่ลงบัญชีจนกว่าจะมี accounting policy
- `allocated` หมายถึง source Cost Pool ถูก allocate ครบ source qty และไม่ได้เหลือ selected source pool เป็น partially used
- `partial` หมายถึงเอกสาร fully costed แล้ว แต่ source Cost Pool lot อย่างน้อย 1 row ถูกใช้บางส่วนและยังเหลือ available ให้ match ต่อ
- `pending_cost` สงวนไว้สำหรับ legacy/import/read-model ที่ไม่มี cost allocation ครบ; runtime POST ใหม่ต้อง reject เมื่อ Cost Pool ไม่พอ ไม่สร้าง pending cost document
- ห้าม fallback ไปค่า 0 หรือ hard-code cost เมื่อ Cost Pool ไม่พอ; ต้อง reject, pending, หรือ partial ตาม policy ที่ user เลือกและ audit ได้
- target cost default คือ `SOURCE_MATCHED`; `CUSTOM_UNIT_COST` เปิดเฉพาะ admin/owner, ต้องระบุ custom unit cost > 0 และเหตุผล override อย่างน้อย 3 ตัวอักษร
- custom target cost ไม่แก้ source allocation cost; ระบบบันทึก `source_unit_cost`, `target_unit_cost`, `cost_variance`, และ `cost_override_reason` ใน `grade_adjustments`

## Cancel / Reverse Policy

Target ที่ควรใช้:

- ไม่แก้ ledger row เก่าโดยตรง
- ถ้าผิดให้ reverse ด้วย `GA` reversal หรือสร้าง adjustment กลับตาม policy
- reverse ต้องคืน source Cost Pool availability จาก match logs
- reverse ต้องตัด/ยกเลิก target Regrade Cost Pool row
- reverse ต้อง mark allocation/match logs เป็น reversed ไม่ลบทิ้ง
- ต้อง block reverse ถ้า target stock ถูกใช้ต่อแล้วและ reverse ทำให้ติดลบ

## API Contract

`GET /api/stock/convert` ควรส่ง:

- `rows`
- `reference.branches`
- `reference.warehouses`
- `reference.products`
- `reference.costPoolEntries` เฉพาะ rows ที่ยัง available/partially used สำหรับ preview

`GET /api/stock/convert?detail=<docNo>` ส่ง detail drilldown ต่อเอกสาร:

- header: doc no, date, status, branch/warehouse, source/target qty, loss, reason, notes
- allocation lines: source pool, source ref, source product/lot, target pool, target product/lot, qty, unit cost, total cost, allocation status

`GET /api/stock/convert?detail=<docNo>&format=csv` ส่ง CSV export จาก contract เดียวกับ detail drilldown

`POST /api/stock/convert` รับ:

- `allocationMethod`: `FIFO`, `LIFO`, `HIGHEST_COST`, `LOWEST_COST`, หรือ `MANUAL`
- `date`
- `branchId`
- `warehouseId`
- `sourceProductId`
- `sourceQty`
- `lotNo`
- `targetProductId`
- `targetQty`
- `targetCostPolicy`: `SOURCE_MATCHED` หรือ `CUSTOM_UNIT_COST`
- `targetUnitCost`: required เมื่อ `targetCostPolicy = CUSTOM_UNIT_COST`
- `targetUnitCostReason`: required เมื่อ `targetCostPolicy = CUSTOM_UNIT_COST`
- `targetLotNo`
- `manualAllocations[]` เมื่อ `allocationMethod = MANUAL`
- `reason`
- `notes`

`PATCH /api/stock/convert` รับ:

- `action = reverse`
- `refNo`

## Current Implementation / Gap

- Runtime 2026-06-13 เพิ่ม Cost Pool-backed Grade Adjustment แล้ว
- Migration `20260613170000_add_stock_convert_cost_pool_allocation.sql` เพิ่ม fields บน `grade_adjustments`, ตาราง `stock_cost_pool_entries`, ตาราง `stock_cost_pool_allocations`, indexes สำหรับ available pool และ allocation lookup, และ backfill current stock balance เข้า pool เริ่มต้น
- `GET /api/stock/convert` โหลด list จาก `grade_adjustments`/`stock_ledger` และส่ง `reference.costPoolEntries` สำหรับ preview
- `GET /api/stock/convert?detail=<docNo>` โหลด allocation drilldown จาก `grade_adjustments`, `stock_cost_pool_allocations`, `stock_cost_pool_entries`, และ products/branch/warehouse refs
- `GET /api/stock/convert?detail=<docNo>&format=csv` export allocation lines จาก detail contract เดียวกัน ไม่มี fallback หรือ client-side recompose
- `POST /api/stock/convert` lock source pool rows ใน transaction, ตัดด้วย FIFO/LIFO/Highest/Lowest/Manual, reject เมื่อ Cost Pool ไม่พอ, สร้าง paired `GA` ledger rows, consume source pool, create target `Regrade` pool row, และเขียน allocation rows
- `POST /api/stock/convert` รองรับ `SOURCE_MATCHED` และ admin/owner-only `CUSTOM_UNIT_COST`; custom บันทึก unit cost, variance, และ reason แยกจาก source allocation history
- `cost_status = partial` ถูก set เมื่อ selected source pool ยังเหลือ partially used หลัง allocation; `pending_cost` ไม่ถูกสร้างโดย runtime POST ใหม่
- `PATCH action=reverse` เป็น append-only reversal: คืน source pool allocation, ตัด target regrade stock/pool, mark allocation reversed, และ block ถ้า target pool ถูกใช้ต่อหรือ target stock พร้อมใช้ไม่พอ
- Authenticated QA 2026-06-13 ผ่าน: local page/API/modal smoke และ API create+reverse `GA-000002` ยืนยัน source pool คืน `Available`, target pool `Released`, allocation `reversed`, และ ledger มี `GA`/`GA-REV` ครบฝั่งละ 2 rows
- Detail/export QA 2026-06-13 ผ่าน: `/stock/convert` แสดงปุ่ม Detail, modal เปิด `Cost Allocation Detail · GA-000002`, `GET ?detail=GA-000002` คืน 200 พร้อม 1 allocation line, และ `format=csv` คืน `text/csv` พร้อม doc no
- UI list มีปุ่ม Detail สำหรับเปิด allocation drilldown modal และดาวน์โหลด CSV ต่อเอกสาร
- Custom cost QA 2026-06-13 ผ่าน: authenticated admin/owner POST `CUSTOM_UNIT_COST`, detail แสดง `targetCostPolicy`, `sourceUnitCost`, `targetUnitCost`, `targetCostVariance`, `targetCostReason`, แล้ว reverse สำเร็จ
- `Confirm Cost` ใน UI ยัง disabled เพราะ allocation/cost confirmation เกิดตอน Post แล้ว ไม่มี pending runtime state สำหรับเอกสารใหม่

## Related Notes

- [[Stock Ledger and Stock Balance]]
- [[Stock Balance Page Flow]]
- [[Stock Ledger Page Flow]]
