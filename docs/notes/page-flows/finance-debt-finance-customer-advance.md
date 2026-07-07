---
title: รับล่วงหน้าจาก Customer Page Flow
tags:
  - page-flow
  - menu
  - finance-debt
  - customer-advance
status: retired
updated: 2026-07-06
route: retired
---

# รับล่วงหน้าจาก Customer Page Flow

## Scope

Retired 2026-07-06: หน้า `/finance/customer-advance` ถูกลบออกจาก active app เพราะซ้ำกับ `/sales/receipts`. งานรับเงินลูกค้าและเงินรับล่วงหน้าฝั่ง Customer ให้ใช้ `/sales/receipts` เป็น canonical page; เอกสารนี้เก็บไว้เป็น historical/reference ของ legacy `CADV` read model เท่านั้น.

| Field | Value |
|---|---|
| Menu section | Finance & Debt |
| Route | retired; use `/sales/receipts` |
| Page | รับเงิน Customer |
| Current Next | retired duplicate page |

## Canonical References

[[Finance Debt Flow]], [[Customer Advance Page Flow]], [[Finance AR Page Flow]], [[Sales Flow]], [[Finance Bank Statement Page Flow]]

## Page Purpose

หน้านี้ใช้ดูเงินรับล่วงหน้าจากลูกค้าที่เป็น liability ของบริษัทและรอใช้หักกับบิลขาย. Current Next ยังเป็น read baseline จาก `bank_statement.ref_type = CADV`; target ระยะยาวควรมี dedicated `customer_advances` และ allocation facts.

## Legacy Baseline

Legacy `view-customerAdvance`:

- เปิด modal รับเงินล่วงหน้าใหม่.
- เอกสาร `CADV`, date, customer, currency, fxRate, amount, receivedToAccount.
- บันทึกแล้วเพิ่ม `customerAdvances` และสร้าง `bankStatement` เงินเข้า `refType = CADV`.
- cancel ได้ถ้ายังไม่ถูกใช้ และ legacy ลบ bank statement row ที่เกี่ยวข้อง.
- คำนวณ used/remaining จาก `advanceAllocations`.
- status computed: `Open`, `Partially Used`, `Fully Used`, `Cancelled`.

## Page Responsibilities

- แสดง `CADV` current read model.
- แสดง customer, account, amount, used, remaining, status.
- filter customer/status/date/search.
- export `.xlsx`.
- เปิดเผย schema state ว่ายังอ่านจาก `bank_statement`.

## Non-Responsibilities

- Current page ไม่สร้าง `CADV` ใหม่.
- ไม่ allocate เข้า `SB` จากหน้านี้.
- ไม่แก้/ลบ bank statement row.
- ไม่คำนวณ used จาก free-text description.

## Lifecycle / Read Flow

| Step | User action | System result |
|---|---|---|
| 1 | เปิดหน้า | GET `CADV` rows from bank statement |
| 2 | filter | customer/status/date/search |
| 3 | export | return `.xlsx` from same filtered row set |
| 4 | future allocation | Sales Bill/Receipt flow consumes advance through allocation facts |

## Current API

`GET /api/finance/customer-advance`

Query:

- `q`
- `customerId`
- `status`
- `from`
- `to`
- `page`
- `pageSize`
- `sortDirection`
- `format = xlsx`

Response:

- `rows`
- `filters.customers/statuses`
- `pagination`
- `summary`
- `schemaState`

Permission ปัจจุบัน: `finance.cash.view`.

## Data Contract

- Current source = `bank_statement` where `ref_type = CADV`.
- Current outward row id = `bank_statement.doc_no`.
- `docNo` uses `bank_statement.ref_no ?? doc_no`.
- Customer matching uses `bank_statement.ref_id` mapped to `customers.code`.
- API no longer falls back to fuzzy customer name matching for identity; description parsing is display-only when customer code is missing.
- `usedAmount` is currently `0` because allocation table is missing.
- `schemaState.missingTables` currently lists `customer_advances`, `advance_allocations`.

## Validation / Status Rules

- `Open` when remaining > 0 and used = 0.
- `Partially Used` when used > 0 and remaining > 0.
- `Fully Used` when remaining <= 0.
- `Cancelled` must be explicit source status in target dedicated table; current bank statement source cannot represent the full target state safely.
- Cancel/reverse must go through source money flow/admin policy, not row deletion from this report page.

## Side Effects

- Current page is read-only.
- Target future write flow for `CADV` would create a bank statement money-in row.
- Target future allocation would reduce remaining and reduce/offset SB receivable.

## Current Code Baseline

- Current `apps/next` page/API code is accepted as P1 baseline as of 2026-06-11.
- Current API supports filter, pagination, xlsx export, schemaState.
- Current API uses `bank_statement.ref_type = CADV` only.

## Current Gap

- Dedicated `customer_advances` table missing.
- Dedicated allocation facts missing.
- `usedAmount` and `remainingAmount` are not production-complete until allocation exists.
- Need create/cancel/refund flow decision before enabling writes from this page.
- Need source links to bank statement and future SB allocations.

## Implementation Checklist

- [x] Verify current Next page/component against this page-flow
- [x] Verify API route handlers match Current API and status rules above
- [x] Capture legacy customer advance baseline
- [ ] Design `customer_advances`
- [ ] Design `customer_advance_allocations`
- [ ] Wire Sales Bill/customer receipt allocation and release rules
