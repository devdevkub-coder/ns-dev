---
title: เจ้าหนี้ (AP) Page Flow
tags:
  - page-flow
  - menu
  - finance-debt
  - accounts-payable
status: accepted-baseline
updated: 2026-06-24
route: /finance/ap
---

# เจ้าหนี้ (AP) Page Flow

## Scope

| Field | Value |
|---|---|
| Menu section | Finance & Debt |
| Route | `/finance/ap` |
| Page | เจ้าหนี้ (AP) |
| Current Next | accepted code baseline |

## Canonical References

[[Finance Debt Flow]], [[Finance AP Page Flow]], [[Purchase Flow]], [[Payment Flow]], [[Document Aging Policy]]

## Page Purpose

หน้า AP เป็น read-model สำหรับดูยอดเจ้าหนี้จากบิลซื้อและการจ่ายเงิน. หน้านี้ไม่อนุมัติจ่าย, ไม่ทำจ่าย, และไม่แก้ยอดเจ้าหนี้โดยตรง.

## Legacy Baseline

Legacy `view-ap`:

- อ่าน `purchaseBills` ที่ไม่ cancelled.
- หักยอดจ่ายจาก `payments`.
- คำนวณ due date จาก `bill.date + supplier.creditTerm`.
- มี summary/detail mode.
- สรุปตาม supplier และ aging bucket.
- แสดง total AP, overdue, due in 7 days, top supplier, export CSV.

## Page Responsibilities

- แสดงยอดค้างจ่ายจาก `purchase_bills`.
- อ่าน `paidAmount` จาก `purchase_bills.paid_amount` เป็น source หลัก.
- อ่าน `payableBalance` จาก `purchase_bills.payable_balance` เป็น source หลัก.
- คำนวณ aging bucket.
- สรุป supplier/branch/bucket.
- export `.xlsx` ตาม filter ปัจจุบัน.
- ใช้เป็นหน้าอ่านสถานะเพื่อเตรียมต่อไปยัง Payment Approval / Payment.
- ไม่มี AP channel filter จนกว่า purchase flow จะมี purchase channel เป็น source จริง.

## Non-Responsibilities

- ไม่สร้าง `PMA`.
- ไม่สร้าง/ยกเลิก `PMT`.
- ไม่แก้ `PB`.
- ไม่เขียน `bank_statement`.
- ไม่ enforce payment locks โดยตรง; lock ต้องอยู่ใน source/payment write APIs.

## Lifecycle / Read Flow

| Step | User action | System result |
|---|---|---|
| 1 | เปิดหน้า | GET AP read model |
| 2 | filter | resolve branch/supplier by business code, filter bills |
| 3 | sort/page | sort in API and paginate |
| 4 | export | return `.xlsx` from same filtered row set |
| 5 | drilldown target | link ไป PB/PMA/PMT source documents |

## Current API

`GET /api/finance/ap`

Query:

- `q`
- `supplierId`
- `branchId`
- `status`
- `bucket`
- `from`
- `to`
- `page`
- `pageSize`
- `sortKey = date|docNo|dueDate|payableBalance|supplierName|aging`
- `sortDirection = asc|desc`
- `format = xlsx`

Response:

- `rows`
- `bySupplier`
- `byBucket`
- `filters.branches/suppliers/statuses`
- `pagination`
- `summary` including `total`, `overdue`, `dueIn7`

Permission ปัจจุบัน: `finance.cash.view`.

## Data Contract

- Outward bill id = `purchase_bills.doc_no`.
- Supplier/branch filter uses outward business code.
- Current row fields include `docNo`, `date`, `dueDate`, `supplierCode`, `supplierName`, `branchName`, `status`, `transactionMode`, `totalAmount`, `paidAmount`, `payableBalance`, `aging`, `bucket`.
- For Purchase Bill, `date` is the outward bill date and is sourced from `purchase_bills.created_at` by accepted business policy; the database timestamp remains UTC while API filtering and display use `Asia/Bangkok`.
- `totalAmount`, `paidAmount`, and `payableBalance` must come from `purchase_bills.total_amount`, `purchase_bills.paid_amount`, and `purchase_bills.payable_balance`.
- The page must not reinterpret an ISO timestamp with UTC calendar-day semantics. A selected date range maps to Bangkok `00:00` inclusive through the following Bangkok `00:00` exclusive, so records created from 00:00 through 06:59 ICT remain in their intended bill date.

## Validation / Status Rules

- Exclude purchase bill cancelled statuses by default.
- Exclude cancelled/reversed payments and allocations from drilldown totals and audit summaries.
- Only show rows with balance > 0.01.
- AP status must eventually reflect workflow states clearly: `ยังไม่อนุมัติ`, `รอจ่าย`, `ชำระบางส่วน`, `เสร็จสิ้น`, `ยกเลิก`.
- If a source has PMA approved or payment cycle active, edit/cancel locks belong to source write API and must be visible from AP drilldown.
- Current AP aging base uses `purchase_bills.date`; this is the accepted current policy because there is no confirmed supplier credit term / PB due-date source in this implementation batch.
- The AP page must not derive visible balance from `payments` before the Purchase Bill snapshot.

## Side Effects

- Read-only. No PMA/PMT/bank statement side effect.

## Current Code Baseline

- Current `apps/next` page/API code is accepted as P1 baseline as of 2026-06-11.
- Current API supports filters, sort, pagination, xlsx export, and supplier/bucket summary.
- Current AP aging base date is intentionally `purchase_bills.date` under the no-credit-term policy.

## Bangkok Timestamp Contract 2026-07-27

- What is what: `purchase_bills.date` is the existing Prisma alias for physical `purchase_bills.created_at`; it is the accepted source of the visible bill date and AP aging base for this flow.
- Why it has to be like this: business users group Purchase Bills by the time the ERP creates the bill. PostgreSQL `timestamptz` stays in UTC for storage and audit consistency, while all user-selected date ranges are converted from `Asia/Bangkok` to an inclusive/exclusive UTC range at the API boundary.
- Boundary: selecting `2026-06-26` means `2026-06-25T17:00:00.000Z <= created_at < 2026-06-26T17:00:00.000Z`. Displayed bill/log timestamps use `Asia/Bangkok`; true business-date columns elsewhere retain their date-only contract.

## Current Gap

- API visible balance now reads the `purchase_bills` balance snapshot first; payment/supplier-advance facts are drilldown only.
- AP channel filter is removed/hidden until purchase channel exists as a real document source.
- PMA/PMT state separation and locks need end-to-end runtime proof.
- Source links to PB/PMA/PMT/Supplier Advance are available in detail; export/source-link depth can still be expanded later.

## Filter Surface Convention 2026-08-04

- What is what: desktop row one owns search, supplier/aging/branch/date controls and `ล้างตัวกรอง`; row two owns status and Excel export. `พบทั้งหมด ... รายการ` belongs only to the table/pagination surface. Mobile keeps search/actions compact and puts `ล้างตัวกรอง` in the filter sheet footer.
- Why it has to be like this: filter controls stay together, status/actions remain easy to scan, and the result count is shown once next to the data it describes instead of being duplicated in the filter toolbar.
- Validation: local `/finance/ap` was checked at desktop and emulated mobile widths; filter sheet, clear action, and single table/pagination count were present.

## Drilldown Scope Hydration 2026-07-17

- What is what: `/finance/ap` accepts outward `from`, `to`, and branch-code `branchId` from a related-report URL and initializes the AP client with them before its first request.
- Why it has to be like this: period-based navigation preserves its source range, while the Financial Dashboard's as-of outstanding KPI intentionally sends an empty `from` plus `to=asOf`; the client must preserve that empty lower bound so older open bills are not dropped by a current-month default.
- Authorization: bills, branch options, supplier options and returned supplier-branch mappings use the same effective finance branch intersection. Unknown/inactive explicit branches return `404`; existing branches outside scope return `403`; an empty mapped scope returns no branch data.
- Aging cutoff: `today` is normalized to the Bangkok business date before comparison with the accepted Purchase Bill base date, preventing the 00:00–06:59 Bangkok window from reporting one day behind.

## Implementation Checklist

- [x] Verify current Next page/component against this page-flow
- [x] Verify API route handlers match Current API and status rules above
- [x] Capture legacy AP baseline
- [x] Switch API visible balance to `purchase_bills.payable_balance` / `paid_amount`
- [x] Remove AP channel filter until purchase channel exists
- [x] Add source document links and workflow state columns
- [ ] Add created-date display/export
