---
title: CF Forecast Calendar Page Flow
tags:
  - page-flow
  - menu
status: accepted-baseline
updated: 2026-07-17
route: /finance-accounting/cf-forecast-calendar
---

# CF Forecast Calendar Page Flow

## Scope

| Field | Value |
|---|---|
| Menu section | Finance Accounting |
| Route | `/finance-accounting/cf-forecast-calendar` |
| Page | CF Forecast Calendar |
| Current Next | accepted code baseline |

## Canonical References

[[Finance Accounting Flow]], [[Menu Page Flow Catalog]]

## Flow Baseline

finance/accounting read model: CF Forecast Calendar

## Page Responsibilities

- ใช้เป็น accounting/finance report read model จาก operational facts
- แสดง report-specific cutoff/as-of/currency/period
- drilldown ไป source finance/stock/payment/sales/purchase data
- แสดง read model/report ตาม filter ของหน้า
- รองรับ start date / 7-30-90 day horizon / branch filter และ sort เฉพาะตาราง insight/detail ตาม design baseline
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
| 4 | ตรวจ assumption | แสดง projection basis และ source limitations จาก API; หน้านี้ยังไม่มี export/print contract |

## API / Data Contract

### Current API

- `GET /api/finance-accounting/cf-forecast-calendar`

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

## Verified Formula / Scope Contract 2026-07-17

- Start date is strict `YYYY-MM-DD`; invalid calendar dates return `400` and never fall back to the current instant. Horizon accepts only `7`, `30`, or `90`; other values return `400`.
- AR uses Sales Bill due date, then bill/customer credit-term fallback. AP uses Purchase Bill document date under the current conservative policy because PB/supplier due-date and credit-term contracts are not confirmed.
- Unpaid expenses use due date/document date. Tax uses the Tax/VAT/WHT calendar as an estimate, not filing state.
- Loan schedules are included only for unrestricted all-branch scope. They are excluded and disclosed for branch-constrained results because loans/schedules have no branch dimension.
- THB cash uses the same account-scoped opening balance plus `bank_statement` movement source as Cash Flow Analysis. FCD remains separated by currency and outside THB projection totals.
- `branchId=ALL` uses the effective authorized scope; any other public `branchId` is an outward branch code, not an internal bigint ID. Roles marked `all` may see all branches; `own/custom` roles use explicit branch mappings and fail closed when none exists. A forbidden requested branch returns `403`.
- The server page hydrates `startDate`, `horizon`, and `branchId` from the incoming URL before the first API request, so drilldown navigation retains the source scope.
- Missing/non-finite summary values render as unavailable and a neutral `ยังสรุปวันที่เงินสดติดลบไม่ได้` state, never as a healthy/short status. Non-finite daily balances are excluded from SVG geometry, while a finite ending balance uses its actual sign for the ending-card tone.
- The UI renders `projectionBasis` and `sourceState` from the API. This page is read-only and has no XLSX/export contract today.

## Current Gap

- Purchase Bill contractual due-date forecasting remains unavailable until a confirmed PB/supplier credit-term source and migration policy exist.
- There is no approved write workflow for forecast overrides, payment scheduling, receipt scheduling, or treasury scenarios.
- Export/print and outward source-document links remain unimplemented; day-event modal and Top AR/AP tables are the current drilldown surfaces.

## Implementation Checklist

- [x] Verify current API response shape and source tables
- [x] Document current forecast formula and limitations
- [x] Enforce strict start-date/horizon and branch authorization scope
- [x] Preserve incoming URL scope on first render
- [x] Render projection basis/source limitations and guard non-finite UI values
- [ ] Define outward source-document links
- [ ] Confirm a customer-approved export/print contract before enabling export
