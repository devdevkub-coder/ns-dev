---
title: Stock Ledger Page Flow
tags:
  - page-flow
  - menu
status: accepted-baseline
updated: 2026-06-22
route: /stock/ledger
---

# Stock Ledger Page Flow

## Scope

| Field | Value |
|---|---|
| Menu section | Stock |
| Route | `/stock/ledger` |
| Page | Stock Ledger |
| Current Next | accepted code baseline |

## Canonical References

[[Stock Ledger Page Flow]], [[Stock Ledger and Stock Balance]]

## Flow Baseline

movement history ของ stock_ledger เท่านั้น

WTO `pending_out` is not a ledger row. Creating WTO writes `pending_out` only; the ledger row is created when Sales Bill consumes that `pending_out`.

## Page Responsibilities

- แสดงรายการ movement เข้า/ออกพร้อม source ref
- filter ตาม date/product/branch/warehouse/ref type/status
- drilldown ไป source doc เช่น PB/SB/ST/SC/GA/ADJ/Production
- ใช้ reconcile กับ stock balance และ audit

## Non-Responsibilities

- ไม่แสดง `pending_out` เป็น row
- ไม่แก้หรือสร้าง movement จากหน้า ledger
- ไม่เป็นหน้า stock balance summary หลัก

## Lifecycle / Operation Flow

| Step | User action | System result |
|---|---|---|
| 1 | เปิดหน้า | GET movement rows |
| 2 | filter/sort | ค้นหา source/product/warehouse/date |
| 3 | drilldown | เปิด source document |
| 4 | reconcile | เทียบกับ stock balance/export |

## API / Data Contract

### Current API

- `GET /api/stock/ledger - stock movement history`

### Data Contract

- UI ใช้ outward business document/code เป็นหลัก และให้ server resolve internal id
- list/detail/print/export ต้องอ่าน source contract เดียวกันเพื่อลด drift
- transaction write ต้องทำใน server transaction และ append timeline/status/audit ตาม document policy
- ถ้า field เป็น money/qty/date/business code ให้ validate ตาม `docs/design.md` และ server-side ซ้ำ

## Validation / Status Rules

- ทุก row ต้องมี source ref/movement type/product/warehouse/qty direction
- reversal ต้องแสดงเป็น movement/audit ไม่ลบประวัติแบบเงียบ
- `pending_out` ไม่ใช่ movement
- list/export `ต้นทุน/น.` แสดง running WAC หลังแต่ละ movement โดยคำนวณจากยอดสะสม `sum(value_in - value_out) / sum(qty_in - qty_out)` ตามมุมมองคงเหลือสะสมที่เลือก ส่วน `stock_ledger.unit_cost` ในฐานข้อมูลยังเป็นต้นทุน audit ของ movement จากเอกสารต้นทาง
- ตารางหลักและ export แสดง `ผู้ทำรายการ` จาก `stock_ledger.created_by` แทนคอลัมน์ `ผู้ขาย/ผู้ซื้อ`; รายละเอียด movement ยังคงแสดงทั้งผู้ทำรายการและคู่ค้าเมื่อมีข้อมูล
- ตารางหลักใช้ `stock_ledger.created_at` เป็น `วันเวลารายการ` แสดงวันที่บรรทัดแรกและเวลา `HH:mm:ss` บรรทัดที่สอง; `stock_ledger.date` ยังคงเป็นวันที่เอกสารสำหรับ filter/source contract
- ค่า `stock_ledger.created_by` เป็น audit actor เดิม แต่ UI แปลงอีเมลเป็นชื่อ-นามสกุลจาก `app_users` โดยไม่แสดงคำนำหน้า; ถ้าไม่พบผู้ใช้จะแสดงค่า actor เดิมเพื่อไม่ซ่อนประวัติ
- Sales Bill stock-out from WTO uses `movement_type = ขายออก`, `ref_type = SB`, `qty_out > 0`, and carries `output_category` as the technical stock bucket (`RM/WIP/FG`)
- Sales Bill cancellation for WTO-backed stock uses `movement_type = ยกเลิกขายคืนสต๊อก`, `ref_type = SB-CANCEL`, and `qty_in > 0`
- Newly designed WTO-to-SB transactions must not create any intermediate stock issue ledger movement before the Sales Bill

## Side Effects

- read-only ไม่มี side effect

## Current Code Baseline

- Current `apps/next` page/API code is accepted as the P0 implementation baseline as of 2026-06-11.
- This page belongs to the transaction/stock/payment risk group; accepted baseline means proofed against current code, not target-complete.
- Runtime changes must preserve documented status, allocation, ledger, payment, lock, and reversal boundaries, or update this page-flow and the canonical flow first.
- See [[P0 Transaction Stock Payment Current Code Baseline]] for API/permission/side-effect proof notes and open critical gaps.

## Current Gap

- source links สำหรับ ref type หลักเพิ่มแล้วใน detail modal
- API query/pagination/running balance ปรับเป็น server-side แล้ว
- UI design alignment 2026-06-21: list toolbar ของ `/stock/ledger` ไม่แสดงปุ่ม `Refresh`, filter/action shell ใช้ `rounded-md bg-white p-3 shadow`, export Excel เป็นปุ่มเขียวขนาด `h-9`, running-balance mode (`คงเหลือสะสมต่อสินค้า` / `คงเหลือสะสมต่อคลัง`) แยกเป็น tab เหนือ filter เพราะเป็นคนละมุมมอง ไม่ใช่เงื่อนไขค้นหา, filter `ประเภทคลัง` กรองจาก `warehouses.type` แยกจากประเภท movement, table header ใช้ `bg-slate-100`, column labels แยก `วันที่เอกสาร` / `เลขที่เอกสาร`, table หลักต้องแสดงคอลัมน์ `คลัง/สาขา` เพราะ movement แต่ละรายการผูกกับสินค้าในคลังและสาขา, detail modal ใช้ dark header `rounded-md` และไม่แสดงปุ่ม X ใน header โดยใช้ปุ่ม `ปิด` ที่ footer
- Detail modal layout alignment 2026-06-21: modal ขยายเป็น `max-w-5xl` และแยก section เป็น summary metrics ด้านบน (`เข้า`, `ออก`, `สุทธิ`, `คงเหลือสะสม`), `เอกสารและที่มา`, `สินค้าและคลัง`, `มูลค่าและต้นทุน`, และ `หมายเหตุ` เพื่อให้ trace movement ได้ชัดโดยไม่ต้องอ่านการ์ดกระจายหลายชุด
- WTO-to-SB target alignment 2026-06-22: stock ledger must show only actual movement. WTO `pending_out` stays in Stock Balance; `SB` writes stock-out and `SB-CANCEL` writes reversal.
- remaining: cleanup/admin tooling ยังเป็น policy แยก ไม่ใช่หน้าปกติของ ledger

## Implementation Checklist

- [x] Verify current Next page/component against this page-flow
- [x] Verify API route handlers match Current API and status rules above
- [ ] Verify legacy behavior for any gap before implementing runtime change
- [ ] Add/adjust tests or browser QA checklist before changing runtime
- [ ] Update this file and canonical reference if contract changes
