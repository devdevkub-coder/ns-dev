---
title: งบกำไรขาดทุน Page Flow
tags:
  - page-flow
  - menu
status: accepted-baseline
updated: 2026-06-11
route: /finance-accounting/pl-statement
---

# งบกำไรขาดทุน Page Flow

## Scope

| Field | Value |
|---|---|
| Menu section | Finance Accounting |
| Route | `/finance-accounting/pl-statement` |
| Page | งบกำไรขาดทุน |
| Current Next | accepted code baseline |

## Canonical References

[[Finance Accounting Flow]], [[Menu Page Flow Catalog]]

## Flow Baseline

finance/accounting read model: งบกำไรขาดทุน

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

- `GET /api/finance-accounting/pl-statement`

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

## Current Gap

P2 proof completed against current Next page/API code. Remaining work is formula/source/cutoff refinement only when the target report definition changes or a page-specific discrepancy is found.

## UI Checkpoint 2026-07-12

- เอา segmented controls ที่ไม่มี behavior ออกจาก filter card แล้วจัด filter จริงเป็นสองแถว: วันที่/สาขา/ประเภทข้อมูล/ล้างตัวกรองด้านบน และ quick range ที่กดใช้งานได้ด้านล่าง
- แปล KPI และคำอธิบายกำไรขาดทุนให้เป็น Thai-first พร้อมระบุ table surface เป็น `งบกำไรขาดทุน`
- เหตุผล: report filter ต้องแสดงเฉพาะ control ที่มีผลกับ query จริง และต้องคงจังหวะการอ่านเดียวกับ list baseline โดยไม่เปลี่ยนสูตรงบหรือ API

## Implementation Checklist

- [x] Verify current API response shape and source tables
- [ ] Verify legacy formula if current implementation is incomplete
- [ ] Define drilldown route/source document links
- [ ] Confirm export/print and date cutoff behavior
- [ ] Update this file when report formula changes
