---
title: Cash Flow Analysis Page Flow
tags:
  - page-flow
  - menu
status: accepted-baseline
updated: 2026-07-17
route: /finance-accounting/cash-flow-analysis
---

# Cash Flow Analysis Page Flow

## Scope

| Field | Value |
|---|---|
| Menu section | Finance Accounting |
| Route | `/finance-accounting/cash-flow-analysis` |
| Page | Cash Flow Analysis |
| Current Next | accepted code baseline |

## Canonical References

[[Finance Accounting Flow]], [[Menu Page Flow Catalog]]

## Flow Baseline

finance/accounting read model: Cash Flow Analysis

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

- `GET /api/finance-accounting/cash-flow-analysis`

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

## Verified Formula / Source Contract 2026-07-17

| Component | Current source and rule |
|---|---|
| Profit comparison | Uses `buildPlStatement().summary.netProfitBeforeTax`; the page must call this `กำไรก่อนภาษี`, not net profit |
| Operating cash flow | Active Customer Receipt `net_cash_in` and PMT `net_amount` use their transaction dates; PMT rows are classified by `payment_approvals.source_type` and counted once, so Expense PMT and duplicated fee fields are not subtracted twice; paid loan interest is scoped through the linked account |
| THB cash | Active THB cash/bank balances use opening balance plus database `bank_statement.groupBy(account_id)` movement through the selected as-of date |
| OD | Limit and used balance are measured per OD account before aggregation, so a positive account cannot cancel another account's OD use |
| FCD | Kept by currency and outside THB cash/projections; current movement source is opening balance only because `bank_statement` has no foreign-amount field |
| Projection inflow | Open AR uses Sales Bill due date, then bill/customer credit-term fallback |
| Projection outflow | Open Purchase Bills use the bill date under the current conservative policy; unpaid expenses use due date/document date; tax uses the Tax/VAT/WHT calendar; loan schedules are included only for unrestricted all-branch scope |

- The projection is a `conservative current-policy scenario`, not a contractual due-date forecast for Purchase Bills. PB has no confirmed due-date/supplier-credit-term source contract today.
- Purchase Bill is a timestamped source, so period queries use Bangkok business-day bounds (`00:00:00.000` through `23:59:59.999 +07:00`) and the conservative PB bill-date fallback is normalized to its Bangkok calendar date before entering AP forecast events.
- Loan schedules are excluded and disclosed for any branch-scoped result because `loan_schedules` / `loans` have no branch/account dimension; actual loan-payment interest remains account-scoped.
- `branchId=ALL` means the effective authorized scope. Public `branchId` URL values are outward branch codes, not internal bigint IDs. Roles marked `all` remain unrestricted; `own/custom` roles use their explicit branch mappings and an empty mapping returns an empty result instead of all database branches. Source queries, PBT, tax, cash, branch options, JSON and XLSX use the same scope; a forbidden requested branch returns `403`.
- Date input is strict `YYYY-MM-DD`; the Cash Flow Analysis XLSX reuses the exact validated filters and separates summary, THB projection and FCD sheets.

## UI Contract 2026-07-17

- Loading/error transitions hide prior-scope figures. Mobile date/branch changes stay in draft state until applied.
- การเปรียบเทียบกำไรก่อนภาษีกับกระแสเงินสดใช้แถวแนวนอนสองแถวบนสเกลค่าสัมบูรณ์เดียวกัน พร้อม badge บอกทิศทางและข้อความสรุปสถานการณ์ก่อนกราฟ ห้ามใช้แกนกลางแบบ diverging ที่บีบค่าขนาดเล็กเหลือครึ่งพื้นที่หรือวางตัวเลขไกลจากแท่งของตัวเอง; ช่องว่างแสดงเป็นค่าสัมบูรณ์และคำสรุปเป็นผู้บอกว่าค่าใดอยู่ฝั่งบวก/ลบ โดยไม่เปลี่ยนสูตร PBT หรือ OCF.
- ลำดับการอ่านของ Cash Flow Analysis คือ `ตัวกรอง -> KPI -> เกณฑ์/ข้อจำกัดแบบพับ -> กราฟและความเสี่ยง -> ประเด็นติดตาม -> รายละเอียดตัวชี้วัด`; disclosure เริ่มแบบปิดและใช้ภาษาธุรกิจ โดยห้ามแสดงชื่อ table/field ภายในระบบใน working surface.
- Mobile ใช้คำ action `ส่งออก Excel` เหมือน Desktop และ shared filter sheet ต้องมี dialog semantics, ใช้ footer action เป็นทางออกที่มองเห็นได้, รองรับ `Escape`, focus trap และ focus restoration โดยไม่เพิ่มปุ่มปิดซ้ำใน header.
- The page separates THB liquidity from FCD, states the projection basis, and removes duplicate AR/stock value cards. `buildPlStatement()` is the calculation owner for PBT; OCF is calculated in Cash Analysis from RCP/PMT/loan-interest facts, while detail links are related navigation and do not transfer formula ownership to the destination page.
- The current/7-day/30-day cash forecast uses one responsive stock-style line chart with a thin directional line, subtle grid, compact points, proportional 0/7/30-day spacing, and a locally scaled Y axis disclosed beneath the graph. Red/green reflects whether the final projected cash is below/above the current balance; no gradient or decorative area fill is used. Exact projected cash, forecast inflow, forecast outflow, and net movement (`expectedIn - expectedOut`) remain visible for every horizon below the graph, and non-finite values must never create invalid SVG geometry.
- Forecast summary typography must remain readable at the three-column desktop width: horizon labels use 14px, projected cash uses 15px, inflow/outflow rows use 13px with 20px line height, and net movement uses 13.5px. Do not compress these decision values back to the former 11px helper-text scale.
- Desktop analysis panels use one three-column shell with independent content-height stacks: the primary 2/3 column contains profit-to-cash comparison followed by cash forecast, and the supporting 1/3 column contains capital structure followed by OD risk. Mobile collapses the primary stack before the supporting stack with the same gap rhythm. Do not restore separate row-aligned pairs or force unequal panels to equal height, because either approach recreates visible holes or empty card interiors.
- Cash Flow Statement, AR and AP hydrate `from`, `to` and an explicit `branchId` from drilldown URLs before their first API request. Their APIs apply the same effective finance branch intersection, return `403` for an existing branch outside scope, reject an unknown/inactive explicit branch instead of dropping the filter, and restrict branch/party options to the same scope. Bank currently hydrates only `from/to` because its API has no branch-filter contract. To prevent a scoped metric from opening broader data, Bank links are omitted for branch-constrained results, and Cash Flow Statement/AR/AP links are omitted when an effective multi-branch scope cannot be represented by one outward branch code.
- Missing/non-finite money, percentage, OD and projection values render `ไม่มีข้อมูล` and do not create invalid chart geometry or a healthy status.

## Current Gap

- This is planning/management cash analysis, not the statutory Cash Flow Statement or a locked treasury forecast.
- Supplier contractual due-date forecasting remains unavailable until the confirmed PB/supplier credit-term source and migration policy exist.

## Implementation Checklist

- [x] Verify current API response shape and source tables
- [x] Reconcile PBT, actual cash dates, THB/FCD and OD sources
- [x] Define drilldown route/source report links
- [x] Confirm XLSX, authorization and date-cutoff behavior
- [x] Update this file for the 2026-07-17 formula and UI correction
