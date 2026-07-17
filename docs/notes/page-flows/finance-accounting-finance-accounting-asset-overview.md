---
title: Net Worth / Track Asset Page Flow
tags:
  - page-flow
  - menu
status: accepted-baseline
updated: 2026-06-11
route: /finance-accounting/asset-overview
---

# Net Worth / Track Asset Page Flow

## Scope

| Field | Value |
|---|---|
| Menu section | Finance Accounting |
| Route | `/finance-accounting/asset-overview` |
| Page | Net Worth / Track Asset |
| Current Next | accepted code baseline |

## Canonical References

[[Finance Accounting Flow]], [[Menu Page Flow Catalog]]

## Flow Baseline

finance/accounting read model: Net Worth / Track Asset

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

- `GET /api/finance-accounting/asset-overview`

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

- เพิ่มปุ่ม `ล้างตัวกรอง` ใน filter card และทำปุ่มนำทางไปหน้าจับคู่การซื้อขายเป็น action สี/น้ำหนักตาม baseline
- เปลี่ยนหัวข้อและ legend ที่เป็น copy ประกอบหน้าจอเป็น Thai-first เช่น `เงินสดและรายการอื่น`, `สินค้าคงคลัง`, และ `เงินสดและธนาคาร`
- แก้ loading state ของยอด `ภาระหนี้`: ก่อน API ตอบ component จะคำนวณยอดจาก `undefined + undefined` จนเห็น `NaN`; ตอนนี้ใช้ค่า 0 ระหว่างโหลด โดยไม่แตะสูตรจริงหลังข้อมูลตอบกลับ
- เหตุผล: ผู้ใช้ต้องไม่เห็นค่าการเงินที่ไม่ใช่จำนวนเงินแม้เพียงช่วงโหลด และ filter/table ต้องอ่านเป็น design เดียวกันโดยไม่เปลี่ยน source หรือการคำนวณ business data

## Branch Scope / URL Hydration Checkpoint 2026-07-17

- What is what: หน้า server รับ outward `asOf` และ branch-code `branchId` จาก URL แล้วส่งเป็น initial filters ก่อน request แรก. API ใช้ effective finance branch intersection เดียวกันกับทั้ง Financial Dashboard source และ Cash & Others source รวมถึง account, bill, stock, expense และ trading rows.
- Authorization: `own/custom` ที่ไม่มี mapping ได้ผลว่างแบบ fail-closed; branch ที่มีอยู่แต่นอก scope ได้ `403`; unknown/inactive branch ได้ client error และไม่ fallback เป็นทุกสาขา. `branch_scope=all` เท่านั้นที่อ่าน unrestricted aggregate ได้.
- Why it has to be like this: Asset Overview รวมหลาย read models; ถ้าขอบเขตถูกบังคับเพียงครึ่งหนึ่ง cash/debt/net-worth จะผสมข้อมูลคนละสิทธิ์และไม่ reconcile กับ Dashboard ต้นทาง.

## Implementation Checklist

- [x] Verify current API response shape and source tables
- [ ] Verify legacy formula if current implementation is incomplete
- [ ] Define drilldown route/source document links
- [ ] Confirm export/print and date cutoff behavior
- [ ] Update this file when report formula changes
