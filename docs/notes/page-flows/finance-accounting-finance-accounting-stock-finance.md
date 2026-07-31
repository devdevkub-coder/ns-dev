---
title: Stock Finance Analysis Page Flow
tags:
  - page-flow
  - menu
status: accepted-baseline
updated: 2026-07-05
route: /finance-accounting/stock-finance
---

# Stock Finance Analysis Page Flow

## Scope

| Field | Value |
|---|---|
| Menu section | Finance Accounting |
| Route | `/finance-accounting/stock-finance` |
| Page | Stock Finance Analysis |
| Current Next | accepted code baseline |

## Canonical References

[[Finance Accounting Flow]], [[Menu Page Flow Catalog]]

## Flow Baseline

finance/accounting read model: Stock Finance Analysis

## Page Responsibilities

- ใช้เป็น accounting/finance report read model จาก operational facts
- แสดง report-specific cutoff/as-of/currency/period
- drilldown ไป source finance/stock/payment/sales/purchase data
- แสดง read model/report ตาม filter ของหน้า
- รองรับ search/filter/date range/sort/export ตาม design baseline
- drilldown ไป source document หรือ source report ที่เกี่ยวข้อง
- แสดง created/document/due/as-of date แยกกันตาม Document Aging Policy

## Non-Responsibilities

- ไม่สร้างหรือแก้ business transaction
- ไม่เขียน stock_ledger หรือ bank_statement
- ไม่เปลี่ยนสถานะเอกสารต้นทาง
- ไม่เป็น source of truth แทนเอกสาร/fact table ต้นทาง

## Lifecycle / Read Flow

| Step | User action | System result |
|---|---|---|
| 1 | เปิดหน้า | โหลด read model จาก Current API |
| 2 | กรองข้อมูล | apply filter/date/search/sort ฝั่ง API หรือ client ตาม contract |
| 3 | ตรวจรายละเอียด | drilldown ไป source document/report ที่เกี่ยวข้อง |
| 4 | Export/print | ส่งออกข้อมูลตาม filter ปัจจุบันโดยไม่แก้ source |

## API / Data Contract

### Current API

- `GET /api/finance-accounting/stock-finance`

### Data Contract

- API ต้องระบุ source facts ที่ใช้ประกอบตัวเลขของหน้า
- list/report/export ต้องใช้ filter definition เดียวกัน
- source links ต้องใช้ outward document/code ใน UI และ resolve internal id ฝั่ง server
- ถ้าใช้ legacy-derived calculation ต้องบันทึก formula ก่อนแก้ runtime

## Validation / Status Rules

- report ต้องระบุ actual vs forecast/accrual assumption
- ห้ามรวมสกุลเงินหรือหน่วยโดยไม่มี conversion policy
- ตัวเลขต้อง reconcile กับ source facts ที่ระบุ
- filter/export ต้องใช้ condition ชุดเดียวกับตาราง
- ต้องแยกหน่วย/สกุลเงิน/branch/date cutoff เมื่อเกี่ยวข้อง
- cancelled/reversed source ต้องแสดงหรือ exclude ตาม report definition ชัดเจน

## Side Effects

- read-only ไม่มี transaction side effect
- export/print/report generation ไม่ mutate source data

## Current Code Baseline

- Current `apps/next` page/API code is accepted as the P2 proof baseline as of 2026-06-11.
- This page is a read-model/report surface; current APIs are `GET`-oriented and protected by report/finance permissions.
- No transaction, stock ledger, bank statement, AP/AR settlement, or source document status side effect is expected from this page.
- Future changes should reconcile formula/source/cutoff details here before changing runtime behavior.

## UI Checkpoint 2026-07-05

- ปรับหน้า `/finance-accounting/stock-finance` แบบ presentation-only โดยไม่เปลี่ยน API, formula, cutoff, หรือ permission
- ลำดับการอ่านหน้าจอคือ ภาพรวมมูลค่าสต็อก -> สถานะสต็อกตามการผลิต -> อายุสต็อก/สินค้าอันดับสูงสุด -> insight การเงิน -> สินค้าหมุนช้า
- การ์ดภาพรวมต้องให้ `มูลค่าสต็อกรวม`, `จ่ายแล้ว`, `ยังไม่จ่าย`, `โอกาสกำไร`, และ `เงินจม 90+ วัน` อ่านได้ทันทีเพื่อใช้ตัดสินใจด้าน working capital
- `RM/WIP/FG/อื่นๆ` เป็นสถานะสต็อกตามการผลิต ไม่ใช่สถานะเอกสาร และยังใช้ค่าจาก read model เดิม
- `อายุสต็อก` ต้องเน้นช่วงเสี่ยง เช่น `90+ วัน` ให้เห็นชัด แต่ไม่เปลี่ยนเงื่อนไขการคำนวณฝั่ง server
- ตารางสินค้าหมุนช้ายังคงเป็น read-only Top 15 ที่ไม่ขายเกิน 60 วัน และใช้สำหรับตรวจรายการที่ควรเร่งระบายหรือทบทวนราคา

## UI Checkpoint 2026-07-06

- เพิ่มตาราง `Stock ทั้งหมด` เป็น read-only list หลักท้ายหน้า โดยเริ่มต้นเรียงตามมูลค่าสูงสุดตามภาพอ้างอิง
- ต้องแสดงตาราง `สินค้าหมุนช้า / ควรเร่งระบาย` Top 15 จาก `slowMoving` ควบคู่กับตาราง `Stock ทั้งหมด`; ตารางนี้ใช้ตรวจสินค้าที่ควรเร่งขายหรือทบทวนราคาและไม่ควรถูกแทนที่ด้วยตาราง full stock
- ตาราง `Stock ทั้งหมด` และ `สินค้าหมุนช้า / ควรเร่งระบาย` ต้องอยู่หลัง line tabs เดียวกันและแสดงทีละตาราง เพื่อลดการเลื่อนลงยาว; ค่าเริ่มต้นเปิด `Stock ทั้งหมด`
- เพิ่มตัวกรองในตารางเดียวกัน: ณ วันที่, สาขา, ค้นหารหัส/ชื่อ/หมวด, หมวดสินค้า, และอายุ stock; ไม่ต้องมี filter สถานะเพราะสถานะถูกสรุปในกราฟด้านบนแล้ว
- ตาราง `สินค้าหมุนช้า / ควรเร่งระบาย` ต้องมี filter ของตัวเองเช่นกัน: ณ วันที่, สาขา, ค้นหารหัส/ชื่อ/หมวด และหมวดสินค้า โดยไม่ต้องมีสถานะหรืออายุซ้ำเพราะชุดข้อมูลนี้เป็น Top 15 จากเงื่อนไขไม่ขายเกิน 60 วันอยู่แล้ว
- จัด toolbar ของตารางให้เหลือจำนวนรายการ, pagination, และปุ่มคืนค่าตาราง; ไม่ต้องแสดง chip `Qty` หรือ `มูลค่า` ซ้ำเพราะตัวเลขมีอยู่ใน summary card และคอลัมน์ตารางแล้ว
- ตารางทั้งสอง tab ต้องมี pagination และห้ามแสดงเกิน 25 รายการต่อหน้า; ตัวเลือกต่อหน้าคือ `10 / หน้า` และ `25 / หน้า`
- บนมือถือใช้ search bar + ปุ่ม `ตัวกรอง` ที่เปิด `MobileFilterSheet` แทนการเรียง filter ทั้งหมดในหน้า
- ตาราง `Stock ทั้งหมด` ไม่ต้องแสดงคอลัมน์สถานะเป็น badge และไม่ต้องมี filter สถานะ เพราะซ้ำกับกราฟสถานะด้านบน; ให้ใช้กราฟสถานะเป็นภาพรวมหลัก
- ไม่ต้องแสดงการ์ด `พร้อมขาย`, `วัตถุดิบรอผลิต`, และ `สต็อกจมเงิน 90+ วัน` แยกอีกชั้น เพราะซ้ำกับกราฟสถานะและแผงอายุสต็อกแล้ว
- การ์ด `สินค้า 10 อันดับมูลค่าสูงสุด` ต้องแสดง 5 อันดับแรกเป็นค่าเริ่มต้น และให้ผู้ใช้กดขยายเพื่อดูครบ 10 อันดับ เพื่อลดความสูงของการ์ดก่อนใช้งาน
- API เดิมยังเป็น `GET /api/finance-accounting/stock-finance` และเพิ่ม `products` สำหรับรายการเต็มชุด โดยไม่เปลี่ยนสูตร, cutoff, permission, หรือ write behavior

## Formula / Scope Checkpoint 2026-07-31

- หน้า `/finance-accounting/stock-finance` ต้องรองรับทั้งมุมมองรวมและมุมมองแยกสาขา:
  - `ทุกสาขา` = รวมเฉพาะสาขาที่อยู่ใน effective finance branch scope ของผู้ใช้
  - เลือกสาขาเดี่ยว = แสดงเฉพาะสาขานั้น และ API ต้องตอบ 403 ถ้าสาขาไม่อยู่ในสิทธิ์ผู้ใช้
  - ผู้ใช้ที่มีสิทธิ์ 2 สาขาจะเห็น dropdown เฉพาะ 2 สาขานั้น และมุมมองรวมจะรวมแค่ 2 สาขานั้น
- Source of truth ของตัวเลข stock/WAC คือ `stock_ledger` ตาม cutoff `asOf`; API เป็น L5 business fact และต้องส่ง `Cache-Control: private, no-store`
- ก่อนสรุปเป็น product/status rows ต้อง aggregate จาก `stock_ledger` ด้วย stock balance dimensions: `product_id`, `branch_id`, `warehouse_id`, `lot_no`, `output_category`, และ `not_available_for_sale`
- สูตร WAC ของหน้า: `stock value as of date / stock quantity as of date` โดยใช้ cutoff เดียวกันจาก `stock_ledger`
- `pending_out` จาก `stock_holds` ไม่รวมใน WAC ของหน้านี้ เพราะเป็น hold/reservation fact แยกจาก stock valuation
- ไม่แสดง `จ่ายแล้ว`, `ยังไม่จ่าย`, `ราคามาตรฐาน`, หรือ `โอกาสกำไร` ในหน้านี้จนกว่าจะมี approved source-of-truth linkage และ price policy สำหรับรายงานนี้
- API ต้อง reject `asOf` ที่ไม่ใช่รูปแบบ `YYYY-MM-DD`; ห้าม fallback ไปวันที่ปัจจุบันเมื่อ input ผิด

## Daily Snapshot History Checkpoint 2026-07-31

- เพิ่ม daily snapshot read model สำหรับกราฟประวัติ WAC/มูลค่าสต็อก:
  - `public.report_stock_finance_daily_snapshots` เก็บ snapshot ระดับ `snapshot_date + branch + warehouse + product + lot + output_category + not_available_for_sale`
  - `public.report_stock_finance_snapshot_invalidations` เก็บ invalidation จาก `stock_ledger`
  - trigger `trg_stock_ledger_mark_stock_finance_snapshot_invalidated` mark วันที่กระทบเมื่อ `stock_ledger` insert/update/delete
  - function `public.rebuild_stock_finance_daily_snapshots(p_from, p_to, p_branch_ids)` rebuild snapshot จาก `stock_ledger` เท่านั้น
- Migration `20260731062542_create_stock_finance_daily_snapshots.sql` ถูก apply/record บน SIT `vbjlkxbytccklhqvxjuu` เท่านั้นตามคำสั่ง; ไม่ apply dev-target
- `GET /api/finance-accounting/stock-finance/history` refresh snapshot ช่วงวันที่ที่ขอแล้วอ่านกราฟจาก snapshot table; ไม่อ่าน current-state ย้อนแทนอดีต
- history API ใช้ permission/scope เดียวกับหน้าหลัก:
  - `ทุกสาขา` รวมเฉพาะ effective branch scope
  - เลือกสาขาเดี่ยวต้องอยู่ใน scope
  - response เป็น L5 business fact และใช้ `Cache-Control: private, no-store`
- หาก `stock_ledger` มี row ที่ขาด `branch_id` หรือ `product_id` ในช่วงที่ต้อง rebuild ให้ fail closed เพราะ snapshot grain ต้องมีสอง dimension นี้; ห้ามสร้าง bucket UNKNOWN เพื่อกลบข้อมูลผิด
- กราฟบนหน้าแสดง 90 วันย้อนหลังจาก `asOf` ปัจจุบัน และเปลี่ยนตามตัวกรองสาขาเดียวกับ summary/table

## Current Gap

Remaining work: promote/apply migration and code to any non-SIT environment only when explicitly requested. Product/warehouse drilldown route and export/print remain separate future work.

## Implementation Checklist

- [x] Verify current API response shape and source tables
- [ ] Verify legacy formula if current implementation is incomplete
- [ ] Define drilldown route/source document links
- [ ] Confirm export/print behavior
- [x] Update this file when report formula changes
