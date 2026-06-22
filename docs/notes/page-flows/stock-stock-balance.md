---
title: สต๊อกคงเหลือ Page Flow
tags:
  - page-flow
  - menu
status: accepted-baseline
updated: 2026-06-22
route: /stock/balance
---

# สต๊อกคงเหลือ Page Flow

## Scope

| Field | Value |
|---|---|
| Menu section | Stock |
| Route | `/stock/balance` |
| Page | สต๊อกคงเหลือ |
| Current Next | accepted code baseline |

## Canonical References

[[Stock Balance Page Flow]], [[Stock Ledger and Stock Balance]]

## Flow Baseline

derived balance จาก stock_ledger + `pending_out`

WTO created state is represented here as `pending_out / รอออก`. It is not a stock ledger sale until a Sales Bill consumes the `pending_out`.

## Page Responsibilities

- แสดง stock balance ตาม product/branch/warehouse/lot/ประเภทคลัง (`RM/WIP/FG`)
- แสดง `คงเหลือจริง`, `รอเข้า`, `รอออก`, `พร้อมใช้/พร้อมส่ง` ตาม target `pending_out` model
- หน้า UI ใช้คำว่า `สถานะสินค้า` สำหรับ business stock state: `on_hand = คงเหลือ`, `pending_in = รอเข้า`, `pending_out = รอออก`
- technical `status/output_category` ยังหมายถึง `RM/WIP/FG` และต้องแสดงแยกเป็น `ประเภทคลัง`
- `สาขา/คลัง` ยังหมายถึง branch + warehouse จัดเก็บจริง
- drilldown ไป stock ledger และ source documents
- รองรับ filter/search/sort/export ตาม report baseline

## Non-Responsibilities

- ไม่เป็น fact table ของ movement
- ไม่แก้ stock โดยตรง
- ไม่แสดง `pending_out` เป็น ledger row
- ไม่คำนวณยอดจาก PB/SB line โดยตรง

## Lifecycle / Operation Flow

| Step | User action | System result |
|---|---|---|
| 1 | เปิดหน้า | GET aggregated balance |
| 2 | filter/group | product search combobox, branch, ประเภทคลัง(RM/WIP/FG), lot, สถานะสินค้า(`คงเหลือ/รอเข้า/รอออก`); ไม่ใช้ warehouse เป็น filter หลัก เพราะ branch + ประเภทคลังครอบคลุม workflow หน้านี้แล้ว; `รอออก` ใช้ active `pending_out` หลังคำนวณ balance |
| 3 | switch view tab | มี tab แยกสำหรับ `Matrix` และ `รายสินค้า` เพราะเป็นคนละมุมมองงาน ไม่อยู่รวมกับ filter |
| 4 | drilldown | ไป ledger/source document |
| 5 | pagination | ตาราง `Matrix` และ `รายสินค้า` ต้องมีแถว pagination เหนือ table ตาม `docs/design.md`: ซ้าย `พบทั้งหมด X ...`, ขวา selector จำนวนต่อหน้าและปุ่มก่อนหน้า/ถัดไป; footer ตารางรายสินค้าเป็นยอดรวมเฉพาะหน้าปัจจุบัน ส่วน summary cards เป็นยอดรวมตาม filter ทั้งหมด |
| 6 | export | ส่งออกตาม filter ทั้งหมด ไม่จำกัดเฉพาะหน้าปัจจุบัน |

## API / Data Contract

### Current API

- `GET /api/stock/balance - aggregate จาก stock_ledger ผ่าน server stock helper`
- `GET /api/stock/balance?stockState=on_hand - แสดงเฉพาะ row ที่มีคงเหลือจริง`
- `GET /api/stock/balance?stockState=pending_in - แสดงเฉพาะ row ที่มียอดรอเข้า`
- `GET /api/stock/balance?stockState=pending_out - แสดงเฉพาะ row ที่มี active pending_out/รอออก`
- `GET /api/stock/balance?onHold=1 - compatibility alias ของ pending_out`

### Data Contract

- UI ใช้ outward business document/code เป็นหลัก และให้ server resolve internal id
- list/detail/print/export ต้องอ่าน source contract เดียวกันเพื่อลด drift
- transaction write ต้องทำใน server transaction และ append timeline/status/audit ตาม document policy
- ถ้า field เป็น money/qty/date/business code ให้ validate ตาม `docs/design.md` และ server-side ซ้ำ

## Validation / Status Rules

- balance ต้อง derive จาก ledger ไม่ใช้ cached stale header
- available = on_hand - active `pending_out`
- สถานะสินค้า user-facing ต้องใช้ `คงเหลือ`, `รอเข้า`, `รอออก` ไม่ใช้ `RM/WIP/FG`
- technical `status` หลักของ row ยังเป็น `RM/WIP/FG`; label ในหน้าใช้ `ประเภทคลัง`
- ตารางต้องแสดงคอลัมน์ `ประเภทคลัง` (`RM/WIP/FG`) แยกจากคอลัมน์ `สถานะสินค้า`
- คอลัมน์ `สถานะสินค้า` แสดง badge เดียวต่อ row ตามลำดับ: `รอออก` เมื่อ `onHoldQty > 0`, `รอเข้า` เมื่อมี `awaitingBillQty > 0` แต่ยังไม่มี stock จริง, ไม่เช่นนั้น `คงเหลือ` เมื่อ `qty > 0`
- `รอออก` ยังถือว่าอยู่ใน stock และอยู่ในยอดคงเหลือ แต่สื่อกับผู้ใช้ว่าคงเหลือนี้มีบางส่วนถูกจองออกไว้แล้ว; ยอดที่ใช้งานได้จริงต้องดู `พร้อมส่ง`
- `รอออก` จาก WTO ไม่มี ledger stock-out ในตัวเอง; เมื่อ Sales Bill ใช้ WTO แล้วจึงเกิด `stock_ledger.ref_type = SB` และ `pending_out` ถูก consume
- เมื่อยกเลิก Sales Bill ที่ใช้ WTO ต้อง reverse ledger ด้วย `SB-CANCEL` และคืน `pending_out` เพื่อให้ยอดกลับมาเป็น `รอออก`
- ไม่แสดงคอลัมน์หรือ metric `ไม่พร้อมขาย` ในหน้า stock balance แล้ว เพราะ target state ใช้ `pending_in/รอเข้า` และ `pending_out/รอออก` แทน
- KPI ด้านบนไม่แสดง `ราคา/กก. เฉลี่ย` รวมทั้งหน้า เพราะค่าเฉลี่ยข้ามสินค้าคนละชนิดสื่อสารยาก; ใช้ card `รอเข้า` แทนเพื่อเห็น pending in คู่กับ `รอออก`
- KPI `คงเหลือ`, `รอเข้า`, `รอออก` แสดงจำนวนรายการประกอบ โดยนับจาก stock balance rows หลัง filter ปัจจุบัน (`qty > 0`, `awaitingBillQty > 0`, `onHoldQty > 0`)
- หน้ารายการหลักแสดงเฉพาะ `สาขา`; warehouse/คลังจัดเก็บจริงยังอยู่ใน detail/drilldown และ data contract แต่ไม่เป็น filter หรือคอลัมน์หลักของหน้า stock balance
- tab มุมมอง (`Matrix` / `รายสินค้า`) อยู่เหนือ filter และเป็นหัวของกล่องเดียวกับ filter ตาม pattern หน้าอนุมัติ ไม่แยกเป็น card คนละใบ
- filter typography/sizing ต้องตาม `docs/design.md`: label `text-xs text-slate-500`, control height `h-9`, shape `rounded-md`, quick filter/segment `text-xs font-medium`
- ช่องค้นหาหลักของหน้านี้ใช้ product search combobox เพียงช่องเดียว (`ค้นหารหัสหรือชื่อสินค้า`); ไม่แสดง text search อีกช่องที่ซ้ำกับสินค้า/หมวด/สาขา/filter อื่น
- ตาราง/การ์ดรายการเปิด detail modal ด้วยการกดที่ row/card โดยตรง ไม่แสดงคอลัมน์ `Action` หรือปุ่ม `Detail` ซ้ำ
- detail modal ใช้ responsive width: mobile ใช้เกือบเต็ม viewport, desktop ค่อยใช้ `lg:min-w-[900px]` และ `max-w-5xl`; section `ข้อมูลสินค้า` และ `จำนวนและมูลค่าสต๊อก` ต้องเป็น compact grid ส่วน `Drilldown` แสดง pending_out/movement แบบสองคอลัมน์เมื่อพื้นที่พอ เพื่อลดความยาวแนวตั้งของ modal
- ตารางหลักต้องมี pagination ตาม design convention: ซ้าย `พบทั้งหมด X รายการ`, ขวา selector `X / หน้า`, ปุ่ม `ก่อนหน้า/ถัดไป`, และ state `หน้า X / Y`
- ตาราง `รายสินค้า` รวมแถวเพื่อการแสดงผลฝั่ง UI เท่านั้นเมื่อเป็นสินค้า + สาขา + ประเภทคลังเดียวกัน เพื่อให้ `คงเหลือ`, `รอออก`, และ `รอเข้า` อยู่ใน row เดียวกัน; ไม่เปลี่ยน `GET /api/stock/balance` snapshot contract เพราะ snapshot ยังถูกใช้โดย export/helper อื่น
- แยกหน่วยสินค้าและ warehouse เสมอ
- as-of/cutoff ต้องระบุถ้ามี report ย้อนหลัง

## Side Effects

- read-only ไม่มี side effect
- export/print ไม่ mutate stock

## Performance / Aggregation Plan

- เป้าหมายถัดไปคือให้ summary/KPI ของหน้า `/stock/balance` มาจาก API/DB aggregation โดยตรง ไม่ให้ React reduce จาก rows ทุกครั้ง เพื่อช่วยลดโหลดและทำให้หน้าแสดงผลเร็วขึ้น
- API ควรส่ง `summary` ตาม filter ปัจจุบันจาก server/database พร้อม `rows` เช่น `SUM(qty)`, `SUM(value)`, `SUM(awaiting_bill_qty)`, `SUM(on_hold_qty)`, `SUM(ready_qty)`, และ `COUNT(*) FILTER (...)` สำหรับจำนวนรายการ `คงเหลือ`, `รอเข้า`, `รอออก`
- จำนวนรายการยังไม่ควรเก็บเป็น field คงที่แยกใน DB เพราะขึ้นกับ filter ปัจจุบัน เช่น สาขา, ประเภทคลัง, สินค้า, สถานะสินค้า, หมวดสินค้า; ให้ DB aggregate ตอน query ตาม filter แทน
- ถ้า query จาก `stock_ledger` หนักขึ้น ให้พิจารณา `stock_balance` view/materialized view หรือ summary table ต่อ key หลัก (`product + branch + warehouse + ประเภทคลัง + lot`) แล้วให้ API aggregate จากชั้นนั้น
- frontend ควรใช้ `payload.summary` เป็น source หลักของ KPI และ count bar; การ reduce ฝั่ง client เหลือเฉพาะกรณี display ย่อยในหน้าปัจจุบันหรือ fallback ชั่วคราวที่บันทึกไว้ชัดเจนเท่านั้น

## Current Code Baseline

- Current `apps/next` page/API code is accepted as the P0 implementation baseline as of 2026-06-11.
- This page belongs to the transaction/stock/payment risk group; accepted baseline means proofed against current code, not target-complete.
- Runtime changes must preserve documented status, allocation, ledger, payment, lock, and reversal boundaries, or update this page-flow and the canonical flow first.
- See [[P0 Transaction Stock Payment Current Code Baseline]] for API/permission/side-effect proof notes and open critical gaps.

## Current Gap

- pending_out-aware drilldown ทำแล้ว: detail modal แสดง active WTO pending_out และ movement ล่าสุดของ bucket ที่เลือก
- export รองรับ filter สถานะสินค้า `stockState=on_hand|pending_in|pending_out`
- remaining: logged-in browser QA กับข้อมูลจริงหลาย bucket/source link

## Implementation Checklist

- [x] Verify current Next page/component against this page-flow
- [x] Verify API route handlers match Current API and status rules above
- [ ] Verify legacy behavior for any gap before implementing runtime change
- [ ] Add/adjust tests or browser QA checklist before changing runtime
- [ ] Update this file and canonical reference if contract changes
