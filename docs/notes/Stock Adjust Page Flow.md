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
updated: 2026-06-22
---

# Stock Adjust Page Flow / Flow หน้านับสต๊อกและปรับยอด

## Scope

- Route: `/stock/adjust`
- API: `GET /api/stock/adjust`, `POST /api/stock/adjust`
- Owner: Stock / Inventory
- Page type: stock movement write flow
- Ledger ref type: `ADJ`

หน้านี้ใช้บันทึกผลนับจริงเมื่อยอดในระบบไม่ตรงกับของจริง เป็น audit-sensitive flow และควรใช้เฉพาะกรณีปรับยอดจากการนับ ไม่ใช่ใช้แทน transfer, sale, purchase, return, หรือ production

Requirement update 2026-06-13:

- ใช้ตรวจนับ stock จริงและปรับยอดให้ตรงระบบ
- ใช้เมื่อ `stock หาย`, `stock เกิน`, `audit`, และ `cycle count`
- สิ่งที่ระบบสร้างคือ `adjustment ledger` และ `stock correction`
- สินค้าทุกประเภท/ทุก bucket ที่ระบบมี stock ต้องปรับได้
- แก้ไขรายการนับ stock ได้ไม่เกิน 7 วันนับจากวันที่เอกสาร/วันที่นับ
- การแก้ไขต้อง trace ได้ด้วย `updated_by` / `updated_at` หรือ correction trail
- การปรับยอดและมูลค่า correction อาจกระทบ WAC และ margin ได้ จึงต้องแยกจาก policy note-only เดิมให้ชัด

## Source Of Truth

- audit/header: `stock_adjustments`
- movement: `stock_ledger.ref_type = 'ADJ'`
- จำนวนคงเหลือหลังปรับต้อง derive จาก `stock_ledger`
- value/cost target: มูลค่า correction ต้อง derive จาก unit price/kg ของวันนับหรือ price policy ที่อนุมัติ ไม่ใช่ข้อความ note ลอยๆ

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
- ราคาต่อกก.
- มูลค่ารวม (บาท) เป็น signed amount: `LOSS` ต้องติดลบ, `GAIN` ต้องเป็นบวก
- เหตุผล
- แก้ไขล่าสุดโดย / เวลาแก้ไขล่าสุด
- สร้างโดย

Design checkpoint 2026-06-21: หน้า list ต้องไม่มีปุ่ม `โหลดใหม่` และไม่มีกล่องคำอธิบายยาวในหน้าหลัก; ใช้ KPI cards + filter card + pagination row + table ตาม `docs/design.md`, modal/card ใช้ `rounded-md`, table desktop breakpoint ใช้ `lg`, header ใช้ `bg-slate-100`, body cell ใช้ `text-xs font-semibold`, header table ต้อง sort ได้, คลิก row/card เพื่อเปิด detail modal, action ใช้ outline button และ wording หลักใช้ `วันที่เอกสาร`, `ยอดในระบบ`, `ส่วนต่าง`, `มูลค่ารวม (บาท)`

Design checkpoint 2026-06-22: create modal (`/stock/adjust?new=1`) ต้องใช้ shared `Dialog` แบบไม่มีกรอบนอก, dark header, ไม่มีปุ่ม X บนหัว modal, footer จัดปุ่มยกเลิกแบบ text-only และปุ่มบันทึกสี slate-900 ชิดขวา, control height target `h-9`, snapshot preview รวมเป็น panel เดียวพร้อม diff badge, เหตุผลเป็น fixed select, หมายเหตุเป็น textarea, และไม่แสดงกล่องคำอธิบายยาวใน modal

### Filters

ควรรองรับ:

- ค้นหาเลขที่ / สินค้า / เหตุผล / ผู้แก้ไข
- สาขา
- คลัง
- ประเภท `LOSS` / `GAIN`
- วันที่จาก-ถึง
- สินค้า
- สถานะไม่ใช่ filter หลักตาม requirement ล่าสุด เพราะรายการ posted ต้องแก้ไข/correct ได้ภายใน 7 วันโดยไม่ผูกกับ status display เดิม

## Create Modal Contract

ต้องมี field:

- วันที่เอกสาร
- สาขา
- คลัง
- สินค้า
- Lot
- ยอดในระบบ
- นับจริง
- Diff preview
- ราคาต่อกก.
- มูลค่ารวม preview
- เหตุผล
- หมายเหตุ

Target validation:

- สาขา/คลัง/สินค้า active และสัมพันธ์ถูกต้อง
- นับจริงต้องไม่ติดลบ
- เหตุผลต้องเลือกจาก fixed options ในหน้า ไม่ต้องมี master แยก:
  - `หาของไม่เจอ (Missing)`
  - `นับจริง 0 แต่ระบบมี (Lost/Damaged)`
  - `นับได้เกินระบบ (Found Excess)`
  - `สูญหาย (Lost)`
  - `เสียหาย (Damaged)`
  - `ผิดสาขา/คลัง (Wrong Branch)`
  - `อื่นๆ (Other)`
- ถ้านับจริงเท่ากับยอดในระบบ ห้ามสร้างเอกสาร
- ยอดในระบบควรคำนวณจาก stock balance ปัจจุบัน ไม่ให้ user แก้เองโดยไม่มีเหตุผล
- ถ้ามี active hold ต้องแสดงให้เห็นก่อนบันทึก เพราะการปรับยอดอาจทำให้ `พร้อมใช้` ติดลบ
- แก้ไขรายการนับย้อนหลังได้เฉพาะรายการที่อายุไม่เกิน 7 วัน; หลังจากนั้นต้องใช้ approval/reconciliation policy แยก

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
- target value policy:
  - `unit_price_per_kg` ต้องแสดงบนหน้าและบันทึกกับเอกสาร
  - `LOSS`: `total_value = -1 * unit_price_per_kg * abs(diff_qty)`
  - `GAIN`: `total_value = unit_price_per_kg * diff_qty`
  - wording หน้าและ report ใช้ `มูลค่ารวม (บาท)` ไม่ใช้ `มูลค่า Note`
- ถ้า runtime ยังไม่พร้อมลง value ใน `stock_ledger.value_in/value_out` ต้องระบุเป็น compatibility gap; target ล่าสุดถือว่า correction value กระทบ WAC/margin ได้

## Accounting Policy

Target ล่าสุด:

- Stock adjust เป็น stock correction ที่มีมูลค่า ไม่ใช่ note-only เพียงอย่างเดียว
- การ correction อาจกระทบ WAC และ margin ได้
- ต้องนิยาม source unit price/kg ให้ชัดก่อน implement:
  - ใช้ราคาเฉลี่ยต่อกก. ของสินค้านั้น ณ วันที่นับ/วันที่เอกสาร
  - ถ้าจะใช้ WTI/latest purchase/weighing price เป็น source ต้อง query ตามวันที่เอกสาร ไม่ยึด stock ledger ที่ข้อมูลปัจจุบันยังผิด
  - ถ้าไม่มีราคาในวันนั้น ต้องมี fallback/approval rule แยก ห้าม silently ใช้ 0 โดยไม่แจ้ง
- GL/P&L posting ถ้ามี ต้องแยก approval policy แต่ stock value/WAC/margin impact ต้องไม่ถูกซ่อนด้วย wording `Note`

## Cancel / Reverse Policy

Target ที่ควรใช้:

- ไม่แก้ ledger row เก่าโดยตรง
- ถ้าบันทึกผิดภายใน 7 วัน ให้แก้ไข/correct ได้ โดยต้อง trace ว่าใครแก้ เมื่อไร และแก้จากค่าเดิมเป็นค่าใหม่
- วิธีที่ปลอดภัยคือ append-only correction: reverse/cancel effect เดิม แล้วสร้าง `ADJ` ใหม่หรือ `ADJ-REV` + replacement document แทนการ rewrite ledger เดิม
- หลัง 7 วันต้องใช้ approval/reconciliation policy แยก
- ต้อง audit ว่าใครสร้าง ใครแก้ ใครอนุมัติ และเหตุผลอะไร
- ควรจำกัด permission ให้ role ที่ได้รับอนุญาตเท่านั้น

## API Contract

`GET /api/stock/adjust` ควรส่ง:

- `rows`
- `pagination.page`, `pagination.pageSize`, `pagination.total`
- `reference.branches`
- `reference.warehouses`
- `reference.products`
- `reasonOptions`
- row ต้องมี `docNo`, `date`, `branchWarehouse`, `productCode`, `productName`, `lotNo`, `systemQty`, `countedQty`, `diffQty`, `unitPricePerKg`, `totalValue`, `adjustType`, `reason`, `createdBy`, `updatedBy`, `updatedAt`
- query params ที่รองรับ runtime:
  - `q`: ค้นหาเลขที่เอกสาร, lot, เหตุผล, ผู้สร้าง/ผู้แก้ไข, รหัสสินค้า, ชื่อสินค้า
  - `branchId`, `warehouseId`, `productId`
  - `adjustType = LOSS | GAIN`
  - `dateFrom`, `dateTo`
  - `page`, `pageSize` โดย default ยังคืน 500 rows เพื่อไม่เปลี่ยนพฤติกรรม UI เดิม

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
- `unitPricePerKg` ถ้า UI preview ใช้ราคาเดียวกับ server; server ต้อง recalculate/validate อีกครั้ง

Server ต้องคำนวณ/ยืนยัน `systemQty` จาก source of truth อีกครั้ง ไม่เชื่อ payload ฝั่ง client เพียงอย่างเดียว
Server ต้อง snapshot `onHoldQty`, `readyQty`, และ `accountingImpactPolicy = STOCK_CORRECTION` ตอน post
Server ต้องคำนวณ `unitPricePerKg` เองจาก stock/WAC ตามวันที่เอกสาร และต้อง reject non-zero correction ถ้าราคาเป็นศูนย์หรือหาไม่ได้ เพื่อไม่ให้เกิด correction value ที่ทำให้ WAC/margin ผิด

Target API เพิ่มเติม:

- `GET /api/stock/adjust?snapshot=1&branchId&warehouseId&productId&lotNo&status&date&countedQty`
  - คืน `systemQty`, `onHoldQty`, `readyQty`, `unitPricePerKg`, `priceSource`, `diffQty`, `totalValue`
  - ใช้สำหรับ modal preview ให้ตรงกับ server
  - runtime ใช้ `stockBalanceSnapshot()` ครั้งเดียวเพื่อรวม `systemQty`, `readyQty`, และ WAC/value แทนการ query aggregate ซ้ำหลายรอบ
- `PATCH /api/stock/adjust`
  - ใช้แก้/correct เอกสารภายใน 7 วัน
  - รับ `docNo`, `countedQty`, `reason`, `remark`
  - server ต้อง validate อายุเอกสาร, recalculate diff/value, และสร้าง correction/reversal trail

## Current Implementation / Gap

- มี write baseline ที่สร้าง `stock_adjustments` และ `ADJ` ledger row แล้ว
- Runtime ใหม่ใช้ `accounting_impact_policy = STOCK_CORRECTION`: `stock_adjustments.value_note` เก็บ signed total value, `stock_ledger.value_in/value_out` เก็บมูลค่า correction ตามทิศทาง GAIN/LOSS, และ UI แสดงเป็น `มูลค่ารวม (บาท)` แทน `มูลค่า Note`
- Runtime ปัจจุบันบันทึก `output_category`, `on_hold_qty`, `ready_qty_snapshot`, `unit_cost_used`, `updated_by`, `updated_at`, และ `accounting_impact_policy`
- Runtime ปัจจุบัน block direct posted adjustment เมื่อ `countedQty < active hold` เพื่อไม่ให้ available stock ติดลบ; เคสนี้ต้องปลด hold หรือใช้ reconciliation/approval policy แยกก่อน
- Stock reconciliation ตรวจ header/ledger mismatch, `ADJ`/`ADJ-REV` net integrity, และ value policy ตาม `NOTE_ONLY` vs `STOCK_CORRECTION`
- `PATCH /api/stock/adjust` เปิด correction ได้ภายใน 7 วัน โดยสร้าง append-only `ADJ-REV` เพื่อ reverse diff เดิม แล้วสร้าง replacement `ADJ` สำหรับ diff ใหม่
- Modal preview ใช้ server snapshot: system qty auto, on-hold, ready, counted qty, diff, unit price/kg, total value
- List/detail แสดง `ราคาต่อกก.`, `มูลค่ารวม (บาท)`, `updated_by`, `updated_at`; CSV/export ยังเป็น delivery follow-up
- API/DB optimization checkpoint 2026-06-13:
  - `GET /api/stock/adjust` รองรับ server-side filter/pagination และคืน `pagination.total`
  - list query เลือกเฉพาะ field ที่ใช้จริงจาก `stock_adjustments` แล้ว batch-load branch/warehouse/product เฉพาะ id ที่ปรากฏในหน้านั้น
  - snapshot และ POST ใช้ stock balance aggregate ครั้งเดียวต่อ bucket เพื่อคำนวณ `systemQty`, `readyQty`, `unitPricePerKg`
  - `ADJ-` doc no generation ย้ายเข้า transaction และใช้ `pg_advisory_xact_lock('stock_adjustments.doc_no')`; user-supplied `docNo` ถูก reject เมื่อซ้ำ
  - migration `20260613213000_optimize_stock_adjust_queries.sql` เพิ่ม unique/pattern index ของ `doc_no`, composite list/filter indexes บน `stock_adjustments`, และ `ADJ/ADJ-REV` lookup index บน `stock_ledger`
  - dev-target verification: duplicate `doc_no` = 0; EXPLAIN with `enable_seqscan = off` ใช้ `idx_stock_adjustments_list_date_created`, `idx_stock_adjustments_branch_date_created`, `idx_stock_adjustments_type_date_created`, `idx_stock_adjustments_doc_no_pattern`, และ `idx_stock_ledger_adj_ref_lookup`

## Related Notes

- [[Stock Ledger and Stock Balance]]
- [[Stock Balance Page Flow]]
- [[Stock Ledger Page Flow]]
