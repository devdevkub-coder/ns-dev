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

## Current Gap

P2 proof completed against current Next page/API code. Remaining work is formula/source/cutoff refinement only when the target report definition changes or a page-specific discrepancy is found.

## Implementation Checklist

- [x] Verify current API response shape and source tables
- [ ] Verify legacy formula if current implementation is incomplete
- [ ] Define drilldown route/source document links
- [ ] Confirm export/print and date cutoff behavior
- [ ] Update this file when report formula changes
