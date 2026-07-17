---
title: ลูกหนี้ (AR) Page Flow
tags:
  - page-flow
  - menu
  - finance-debt
  - accounts-receivable
status: accepted-baseline
updated: 2026-06-24
route: /finance/ar
---

# ลูกหนี้ (AR) Page Flow

## Scope

| Field | Value |
|---|---|
| Menu section | Finance & Debt |
| Route | `/finance/ar` |
| Page | ลูกหนี้ (AR) |
| Current Next | accepted code baseline |

## Canonical References

[[Finance Debt Flow]], [[Finance AR Page Flow]], [[Sales Flow]], [[Sales Bills Page Flow]], [[Document Aging Policy]]

## Page Purpose

หน้า AR เป็น read-model สำหรับดูยอดลูกหนี้จากบิลขายและการรับเงิน. หน้านี้ไม่รับเงินเองและไม่แก้ยอดลูกหนี้โดยตรง.

## Legacy Baseline

Legacy `view-ar`:

- อ่าน `salesBills` ที่ไม่ cancelled.
- หักยอดรับจาก `receipts`.
- คำนวณ due date จาก `bill.date + creditTerm`.
- สร้าง aging bucket `Current`, `1-30`, `31-60`, `61-90`, `>90`.
- ไม่มี pending sale / stock issue banner ใน target runtime; ของออกจาก WTO จะเป็น AR ก็ต่อเมื่อเปิด `SB` แล้วเท่านั้น.
- แสดง total AR, overdue, bucket chart, top 5 customers, filter customer/channel/aging, export CSV.

## Page Responsibilities

- แสดงยอดค้างรับจาก `sales_bills`.
- อ่าน `receivedAmount` จาก `sales_bills.received_amount` เป็น source หลัก.
- อ่าน `receivableBalance` จาก `sales_bills.receivable_balance` เป็น source หลัก.
- คำนวณ aging/due date ตาม `due_date` หรือ credit term.
- สรุปตาม customer, branch, channel, bucket.
- แสดงเฉพาะ AR จาก `sales_bills`; `receipts`, `customer_receipt_allocations`, และ Customer Advance allocation ใช้เป็น drilldown/audit เท่านั้น.
- WTO pending_out ที่ยังไม่เปิดบิลไม่เป็น AR และไม่ถูกสรุปเป็น pending sale.
- export `.xlsx` ตาม filter ปัจจุบัน.

## Non-Responsibilities

- ไม่สร้าง/แก้ `SB`.
- ไม่สร้าง/ยกเลิก `RCP`.
- ไม่ allocate customer advance จากหน้านี้.
- ไม่เขียน `bank_statement`.
- ไม่เป็น source of truth แทน sales/receipt facts.

## Lifecycle / Read Flow

| Step | User action | System result |
|---|---|---|
| 1 | เปิดหน้า | GET AR read model |
| 2 | filter | resolve branch/customer/channel by business code, filter bills |
| 3 | sort/page | sort in API and paginate |
| 4 | export | return `.xlsx` from same filtered row set |
| 5 | drilldown target | link ไป SB/RCP source documents |

## Current API

`GET /api/finance/ar`

Query:

- `q`
- `customerId`
- `branchId`
- `channelId`
- `status`
- `bucket`
- `from`
- `to`
- `page`
- `pageSize`
- `sortKey = date|docNo|dueDate|receivableBalance|customerName|aging`
- `sortDirection = asc|desc`
- `format = xlsx`

Response:

- `rows`
- `byCustomer`
- `byBucket`
- `filters.branches/customers/channels/statuses`
- `pagination`
- `summary` including `total`, `overdue`, `dueIn7`

Permission ปัจจุบัน: `finance.cash.view`.

## Data Contract

- Outward bill id = `sales_bills.doc_no`.
- Customer/branch/channel filter uses outward business code.
- Current row fields include `docNo`, `date`, `dueDate`, `customerCode`, `customerName`, `branchName`, `channelName`, `status`, `transactionMode`, `totalAmount`, `receivedAmount`, `receivableBalance`, `aging`, `bucket`.
- `totalAmount`, `receivedAmount`, and `receivableBalance` must come from `sales_bills.total_amount`, `sales_bills.received_amount`, and `sales_bills.receivable_balance`.
- Current API does not include `created_at`; target table/export should add created date.

## Validation / Status Rules

- Exclude `sales_bills.status = cancelled` unless explicit status filter requests otherwise.
- Exclude cancelled receipt/allocation facts from drilldown totals and audit summaries.
- Only show rows with balance > 0.01.
- Aging uses `due_date` first; fallback is bill date + bill/customer credit term.
- Aging stops naturally when balance reaches zero because row disappears from active AR.
- Customer advance allocation must reduce receivable through allocation facts, not text parsing.
- The AR page must not derive visible balance from legacy `receipts` before the Sales Bill snapshot.

## Side Effects

- Read-only. No document, bank statement, stock ledger, payment, or receipt side effect.

## Current Code Baseline

- Current `apps/next` page/API code is accepted as P1 baseline as of 2026-06-11.
- Current API already supports filters, sort, pagination, and xlsx export.
- Current drilldown/source links and `created_at` display remain incomplete.

## Current Gap

- API visible balance now reads the `sales_bills` balance snapshot first; receipt/customer-advance facts are drilldown only.
- Source links to SB/RCP/customer advance allocation are available in row detail; export/source-link depth can still be expanded later.
- Need created date in list/detail/export.

## Drilldown Scope Hydration 2026-07-17

- What is what: `/finance/ar` accepts outward `from`, `to`, and branch-code `branchId` from a related-report URL and initializes the AR client with them before its first request.
- Why it has to be like this: period-based navigation preserves its source range, while the Financial Dashboard's as-of outstanding KPI intentionally sends an empty `from` plus `to=asOf`; the client must preserve that empty lower bound so older open bills are not dropped by a current-month default.
- Authorization: bills, branch options, customer options and returned customer-branch mappings use the same effective finance branch intersection. Unknown/inactive explicit branches return `404`; existing branches outside scope return `403`; an empty mapped scope returns no branch data.
- Aging cutoff: `today` is normalized to the Bangkok business date before comparison with due dates, preventing the 00:00–06:59 Bangkok window from reporting one day behind.

## Implementation Checklist

- [x] Verify current Next page/component against this page-flow
- [x] Verify API route handlers match Current API and status rules above
- [x] Capture legacy AR baseline
- [x] Switch API visible balance to `sales_bills.receivable_balance` / `received_amount`
- [x] Add source document links
- [ ] Add created-date display/export
- [x] Add Customer Advance allocation drilldown
