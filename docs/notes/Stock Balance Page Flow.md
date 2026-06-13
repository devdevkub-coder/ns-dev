---
title: Stock Balance Page Flow
aliases:
  - Stock Balance Page
  - Flow หน้าสต๊อกคงเหลือ
  - หน้า Stock Balance
tags:
  - ns-scrap-erp
  - stock
  - inventory
  - page-flow
  - stock-balance
status: draft
created: 2026-06-11
updated: 2026-06-11
---

# Stock Balance Page Flow / Flow หน้าสต๊อกคงเหลือ

## Scope

- Route: `/stock/balance`
- API: `GET /api/stock/balance`
- Owner: Stock / Inventory
- Page type: read-only stock availability and valuation view
- Canonical stock semantics: [[Stock Ledger and Stock Balance]]

หน้านี้ใช้ตอบคำถามว่า "ตอนนี้ของเหลือเท่าไร พร้อมใช้เท่าไร และอยู่ที่ไหน" ไม่ใช่หน้าสร้าง movement และไม่ใช่แหล่งแก้ไข stock โดยตรง

## Source Of Truth

หน้า Stock Balance ต้องเป็น read model ที่คำนวณจาก source เหล่านี้เท่านั้น:

| Field | Source | Rule |
|---|---|---|
| `คงเหลือจริง` / `on_hand_qty` | `stock_ledger` | `sum(qty_in - qty_out)` ตาม product/branch/warehouse/lot/status/not-available |
| `จองไว้` / `on_hold_qty` | active stock hold/reservation | sum active WTO holds ที่ยังไม่ consumed/released/cancelled |
| `พร้อมใช้` / `available_qty` | derived | `on_hand_qty - on_hold_qty` |
| มูลค่าสต๊อก | `stock_ledger` | คำนวณจาก ledger value/cost policy เท่านั้น ไม่รวม hold |

ถ้ามี summary/cache/materialized view ในอนาคต ต้อง rebuild ได้จาก `stock_ledger` และ stock hold facts เสมอ

## Page Meaning

ใช้สำหรับ:

- ดู stock คงเหลือแยกสินค้า สาขา คลัง Lot สถานะ และ not-available flag
- ดู stock ที่ถูกจองไว้โดยใบส่งของ `WTO`
- ดู stock ที่พร้อมใช้/พร้อมส่งก่อนสร้าง outbound flow ใหม่
- ตรวจ negative balance หรือ stock ที่ผิดปกติ
- drilldown ไปดู movement ที่ `/stock/ledger`

ไม่ใช้สำหรับ:

- แก้จำนวน stock โดยตรง
- ยกเลิก stock movement
- สร้างรายการโอน/ปรับสถานะ/ปรับเกรด/นับสต๊อก
- แสดง stock hold เป็น ledger row

## Main UI Contract

### Summary Cards

ควรมีสรุปอย่างน้อย:

- จำนวนกลุ่ม stock ทั้งหมด
- `คงเหลือจริง`
- `จองไว้`
- `พร้อมใช้`
- มูลค่าสต๊อก
- จำนวน row ที่ติดลบหรือพร้อมใช้ติดลบ

### Filters

ควรรองรับ:

- ค้นหาด้วยรหัสสินค้า / ชื่อสินค้า / Lot
- สาขา
- คลัง
- สินค้า
- สถานะสินค้า: `RM`, `WIP`, `FG`
- กลุ่มสินค้า/metal group
- not-available / saleable
- negative only
- as-of date ถ้า API รองรับย้อนหลัง

### Table Columns

คอลัมน์เป้าหมาย:

- รหัสสินค้า
- ชื่อสินค้า
- กลุ่มสินค้า
- สาขา
- คลัง
- Lot
- สถานะ
- ขายได้/ห้ามขาย
- `คงเหลือจริง`
- `จองไว้`
- `พร้อมใช้`
- ต้นทุนเฉลี่ย
- มูลค่า

สำหรับ aggregated balance row ไม่มี `created_at` เดียวของ row นั้น แต่ detail/drilldown ต้องแสดง `วันที่สร้างรายการ` ของ movement/hold source ที่เกี่ยวข้อง

## Row Detail And Drilldown

เมื่อกด row ควรเปิด detail panel/modal ที่แสดง:

- balance key ที่ใช้ aggregate
- movement rows ล่าสุดจาก `/stock/ledger`
- hold rows ที่ active แยกตาม `WTO` document
- link ไปหน้า `/stock/ledger` พร้อม filter เดียวกัน
- link ไปเอกสาร source เช่น `PB`, `SB`, `ST`, `SC`, `GA`, `ADJ`, `WTO` hold

ส่วน `จองไว้` ต้อง drilldown เป็นรายการ hold เช่น:

- เลขที่ `WTO`
- ลูกค้า
- วันที่เอกสาร
- `วันที่สร้างรายการ`
- จำนวนที่จอง
- สถานะ hold: active/consumed/released/cancelled
- อายุเอกสาร/อายุ hold ถ้ามี report aging

## API Contract

`GET /api/stock/balance` ควรรับ query:

- `q`
- `productId`
- `branchId`
- `warehouseId`
- `status`
- `lotNo`
- `asOf`
- `page`
- `pageSize`
- `format=json|xlsx`

Response ควรรวม:

- `rows`
- `summary`
- `reference` หรือ option lists ที่จำเป็นต่อ filter
- ค่า hold-aware: `onHandQty`, `onHoldQty`, `availableQty`

Export `.xlsx` ต้องใช้ filter เดียวกับหน้าจอ

## Business Rules

- Balance เป็นข้อมูล derived ห้ามให้ผู้ใช้แก้ row จากหน้านี้
- New outbound flow เช่น `WTO`/`SB` ต้อง validate จาก `พร้อมใช้`, ไม่ใช่ `คงเหลือจริง`
- Negative stock ต้องแสดงเพื่อ reconciliation แต่ไม่ควร silently hide
- Hold จาก `WTO` ลด `พร้อมใช้` แต่ไม่สร้าง stock movement ใน ledger
- `PB` เป็น stock-in owner และ `SB` เป็น stock-out owner ตาม [[Stock Ledger and Stock Balance]]

## Current Implementation / Gap

- มี read baseline จาก `stock_ledger` แล้ว และ active hold overlay ใช้ bucket เต็ม `product + branch + warehouse + status/output_category + lot + not_available_for_sale`
- `/stock/balance` แสดง `จองไว้` และ `พร้อมใช้` แบบ hold-aware แล้ว โดย hold ไม่ถูกแสดงเป็น ledger row
- row detail เรียก `GET /api/stock/balance?detail=1` เพื่อแสดง movement ล่าสุดและ active `WTO` hold ของ bucket นั้น พร้อม link ไป `/stock/ledger` ด้วย filter เดียวกัน
- export มี hold-aware columns แล้ว
- follow-up ที่เหลือ: browser QA แบบ logged-in สำหรับ drilldown/source link กับข้อมูลจริงหลาย bucket

## Related Notes

- [[Stock Ledger and Stock Balance]]
- [[Stock Ledger Page Flow]]
- [[WTI-WTO Flow]]
- [[Sales Bills Page Flow]]
