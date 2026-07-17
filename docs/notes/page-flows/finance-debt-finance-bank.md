---
title: Cash / Bank Statement Page Flow
tags:
  - page-flow
  - menu
  - finance-debt
  - bank-statement
status: accepted-baseline
updated: 2026-06-11
route: /finance/bank
---

# Cash / Bank Statement Page Flow

## Scope

| Field | Value |
|---|---|
| Menu section | Finance & Debt |
| Route | `/finance/bank` |
| Page | Cash / Bank Statement |
| Current Next | accepted code baseline |

## Canonical References

[[Finance Debt Flow]], [[Finance Bank Statement Page Flow]], [[Daily Cash Flow]], [[Payment Flow]]

## Page Purpose

หน้านี้เป็น read-only cash/bank ledger จาก `bank_statement` สำหรับดู movement, running balance, chart, export, และตรวจแหล่งที่มาของเงินเข้า/ออก.

## Legacy Baseline

Legacy `view-bank`:

- เลือกบัญชี
- date range
- statement rows: date, type, desc, refNo, in, out, balance
- chart ยอดคงเหลือสะสมและเงินเข้า/ออก
- export CSV
- มีปุ่มลบ duplicate สำหรับ PMT/RCP ซึ่ง target ต้องแยกเป็น admin-only ก่อนเปิดใช้

## Page Responsibilities

- แสดง `bank_statement` ตาม account/date/ref type/type/search.
- คำนวณ running balance จาก opening balance + movement หรือใช้ row balance ถ้ามี.
- สรุปเงินเข้า/ออก/net movement ต่อ filter.
- สรุปตามบัญชี.
- export `.xlsx`.
- ทำหน้าที่ตรวจ trace ของ `TRF`, `PMT`, `RCP`, `PRET`, `CADV` และ source money facts อื่น.

## Non-Responsibilities

- ไม่สร้าง bank statement manual.
- ไม่แก้/ลบ bank statement row จากหน้าปกติ.
- ไม่ทำจ่าย/รับเงิน/โอนเงิน.
- ไม่เป็นที่ reverse source transaction; reverse ต้องทำที่ source document หรือ admin reconciliation flow.

## Lifecycle / Read Flow

| Step | User action | System result |
|---|---|---|
| 1 | เปิดหน้า | GET statement rows and account filters |
| 2 | filter | account/date/refType/type/search |
| 3 | view charts | render running balance and flow from visible rows |
| 4 | export | return `.xlsx` from same filtered row set |
| 5 | drilldown target | link ไป source ref type/ref no |

## Current API

`GET /api/finance/bank`

Query:

- `accountId`
- `from`
- `to`
- `refType`
- `type`
- `q`
- `page`
- `pageSize`
- `sortDirection`
- `format = xlsx`

Response:

- `rows`
- `byAccount`
- `filters.accounts/refTypes/types`
- `pagination`
- `summary`

Permission ปัจจุบัน: `finance.cash.view`.

## Data Contract

- Outward statement id = `bank_statement.doc_no`.
- Account filter and row `accountId` use `accounts.code`.
- `refType/refNo` must be source document outward reference where available.
- Row date is document/movement date; target also needs `created_at` for audit display.
- Running balance sort baseline: account, date, created_at, id.

## Validation / Status Rules

- ทุก row ต้องมี account, date, direction amount, source type/ref no เท่าที่ source มี.
- `amount_in` และ `amount_out` ต้องไม่เป็นบวกพร้อมกันใน movement ปกติ.
- Transfer must be paired from source flow.
- Duplicate cleanup must remain disabled until admin flow has audit, backup, and rollback.

## Side Effects

- Read-only. No bank statement write/delete/update side effect.

## Current Code Baseline

- Current `apps/next` page/API code is accepted as P1 baseline as of 2026-06-11.
- Current cleanup button is disabled in UI with title requiring audit/backup/rollback.
- Current API supports filters, pagination, running balance, xlsx export.

## Current Gap

- Source document links are incomplete across ref types.
- Need created date in list/detail/export.
- Admin correction/duplicate cleanup flow remains not designed.
- Need reconcile row `balance` policy against derived opening + movement if source rows are edited/reversed.

## Drilldown Scope Hydration 2026-07-17

- What is what: `/finance/bank` hydrates only `from` and `to` from related-report URLs. Its current API has no `branchId` contract, so the page intentionally ignores that query instead of forwarding a filter the server cannot enforce.
- Why it has to be like this: a visible branch filter that does not constrain Bank data would be false assurance. Cash Flow Analysis therefore omits Bank links whenever its result is branch-constrained; branch navigation can be enabled only after the Bank API gains an authorized branch filter.

## Implementation Checklist

- [x] Verify current Next page/component against this page-flow
- [x] Verify API route handlers match Current API and status rules above
- [x] Capture legacy bank baseline
- [ ] Add source links per ref type
- [ ] Add created-date display/export
- [ ] Design admin-only reconciliation/correction flow
