---
title: งบกำไรขาดทุน Page Flow
tags:
  - page-flow
  - menu
status: accepted-baseline
updated: 2026-07-17
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
- รองรับ date/branch filter และ export ตาม design baseline; ลำดับงบคงที่ ส่วนตาราง drilldown เท่านั้นที่ sort ได้
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

## Verified Formula / Source Contract 2026-07-17

| Component | Current source and rule |
|---|---|
| Revenue | `sales_bills.total_amount - sales_bills.vat_amount`; this is the post-header-discount, pre-VAT base for both VAT EXCLUDE and VAT INCLUDE bills |
| COGS | `sales_bills.cogs_amount`, with the existing `total_cost` legacy fallback; WAC remains the P&L cost basis |
| Operating expense | `expenses.amount` only for `approved` / `paid`; `net_amount` is a cash-settlement amount that includes VAT/WHT effects and is not the P&L expense base |
| Depreciation | `depreciations.amount` only for `posted` rows with `reversed_at IS NULL` |
| Interest | `loan_payments.interest_amount` in the selected period; branch scope follows the linked account |
| FX | `fx_gain_loss.gain_loss` only for an unrestricted all-branch report; it is excluded and disclosed whenever branch scope is applied because the table has no branch dimension |
| Asset disposal | `asset_disposals.gain_loss` only for `approved` rows with `reversed_at IS NULL`, scoped through `assets.branch_id` and dated by `disposal_date` |
| Profit before tax | Revenue - COGS - operating expense - depreciation - interest + realized FX gain/loss + asset-disposal gain/loss |

- The public page/API no longer offers Stock/Trading as a PBT filter. The returned split is supporting revenue/COGS information from the full report only; shared expenses cannot be assigned to a segment until an allocation policy exists.
- `branchId=ALL` means the effective authorized scope; any other public `branchId` is an outward branch code, not an internal bigint ID. Roles marked `all` remain unrestricted; `own/custom` roles use their explicit branch mappings and fail closed when no mapping exists. JSON and XLSX use the same scope; a requested branch outside scope returns `403`.
- Date input is strict `YYYY-MM-DD`, `from` must not exceed `to`, and unsupported `transactionMode` / invalid known filter values return `400` instead of silently falling back. Unrecognized extra query keys are ignored.
- XLSX contains the same statement and source-detail rows as the current filter. Source numbers link to Sales Bill, Expense, Depreciation, Loan, FX, and Asset Disposal owner pages.

## UI Contract 2026-07-17

- Desktop filters stay content-width; mobile filters are draft state until `ใช้ตัวกรอง` is pressed and are discarded when the sheet closes.
- A new request immediately hides the old scope and shows a loading skeleton; failed requests do not relabel stale figures.
- The statement order is fixed and not sortable. Drilldown details remain sortable and expose accessible source-document links.
- Missing/non-finite values render `ไม่มีข้อมูล`; negative zero is normalized; the page states `หน่วย: บาท` and the management/statutory limitation.

## Current Gap

- This remains a management statement, not a statutory/closed-period P&L, until GL/COA/closing and retained-earnings policy are implemented.
- Detail/export rows are currently loaded for the full requested period with no silent row cap. If production volume becomes too large, add database totals plus an explicitly disclosed paginated/streaming detail export rather than truncating totals.

## UI Checkpoint 2026-07-12

- เอา segmented controls ที่ไม่มี behavior ออกจาก filter card แล้วจัด filter จริงเป็นสองแถว: วันที่/สาขา/ประเภทข้อมูล/ล้างตัวกรองด้านบน และ quick range ที่กดใช้งานได้ด้านล่าง
- แปล KPI และคำอธิบายกำไรขาดทุนให้เป็น Thai-first พร้อมระบุ table surface เป็น `งบกำไรขาดทุน`
- เหตุผล: report filter ต้องแสดงเฉพาะ control ที่มีผลกับ query จริง และต้องคงจังหวะการอ่านเดียวกับ list baseline โดยไม่เปลี่ยนสูตรงบหรือ API

## Implementation Checklist

- [x] Verify current API response shape and source tables
- [x] Reconcile revenue, expense, depreciation, interest, FX and asset-disposal formula sources
- [x] Define drilldown route/source document links
- [x] Confirm XLSX and strict date/branch cutoff behavior
- [x] Update this file for the 2026-07-17 formula and UI correction
