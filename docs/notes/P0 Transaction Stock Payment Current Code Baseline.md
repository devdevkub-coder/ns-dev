---
title: P0 Transaction Stock Payment Current Code Baseline
tags:
  - page-flow
  - transaction
  - stock
  - payment
  - verification
status: accepted-baseline
updated: 2026-06-12
---

# P0 Transaction Stock Payment Current Code Baseline

เอกสารนี้บันทึกผล proof P0 ตาม current `apps/next` code/API ณ 2026-06-11 สำหรับกลุ่ม transaction / stock / payment ที่มี side effect สูงสุด

## Decision

current Next code/API ของ P0 เป็น accepted implementation baseline สำหรับเอกสารรายหน้าแล้ว แต่ไม่เท่ากับ target-complete ทุกหน้า

ความหมาย:

- ใช้ current page/API เป็น baseline เพื่อคุย gap และวางงาน runtime ต่อ
- เอกสารรายหน้า P0 ถูก mark เป็น `accepted-baseline` เพื่อบอกว่า proof กับ current code แล้ว
- gap ที่ยังไม่ครบ target ต้องคงอยู่ใน page-flow และ canonical flow เฉพาะเรื่อง
- ห้ามเปลี่ยน runtime P0 โดยไม่อัปเดต flow/status/side-effect/reversal contract ก่อน

## API / Permission Families

| Area | Routes | API baseline | Permission |
|---|---|---|---|
| Purchase PO | `/purchase/po-buy` | `GET/POST/PUT/PATCH /api/purchase/po-buy` | `finance.cash.view` |
| Purchase Bill | `/purchase/bills` | `GET/POST/PATCH /api/purchase/bills`, `GET /api/purchase/bills/[id]`, `GET /api/daily/bill-swap-history` | `finance.cash.view` |
| Supplier Advance | `/purchase/advance-payments` | `GET/POST /api/purchase/advance-payments`, `GET/PUT/PATCH /api/purchase/advance-payments/[id]` | `finance.cash.view` |
| Payment Approval | `/daily/payment-approval` | `GET/POST /api/daily/payment-approval`; void approved PMA through `POST /api/purchase/payments/cancel-approved` | `finance.cash.view` |
| Supplier Payment | `/purchase/payments` | `GET/POST /api/purchase/payments`; payment history/cancel support APIs exist separately | `finance.cash.view` |
| Receipt Voucher | `/purchase/receipt-vouchers` | `GET /api/purchase/receipt-vouchers` | `finance.cash.view` |
| Expense | `/daily/expense` | `GET/POST /api/daily/expenses`, `PATCH /api/daily/expenses/[id]` | `finance.cash.view` |
| Daily Transfer | `/daily/transfer` | `GET/POST /api/daily/transfers` | `finance.cash.view` |
| Petty Advance | `/daily/petty-advance` | `GET/POST /api/daily/petty-advances`, `POST /api/daily/petty-advances/returns` | `finance.cash.view` |
| WTI/WTO | `/daily/weight-ticket-list` | `GET/POST /api/daily/weight-tickets`, `GET/PATCH /api/daily/weight-tickets/[id]`, page-scoped options/products APIs | `finance.cash.view` |
| Sales PO | `/sales/po-sell` | `GET/POST /api/sales/po-sell` | `finance.cash.view` |
| Sales Bill | `/sales/bills` | `GET/POST /api/sales/bills`, `GET/PATCH /api/sales/bills/[id]` | `finance.cash.view` |
| Sales Receipt | `/sales/receipts` | `GET/POST /api/sales/receipts` | `finance.cash.view` |
| Pending Sale / Stock Issue | `/sales/stock-issue` | removed target runtime; legacy PSALE reference only | `stock.ledger.view` |
| Stock Balance | `/stock/balance` | `GET /api/stock/balance`, supports `format=xlsx` | `stock.ledger.view` |
| Stock Ledger | `/stock/ledger` | `GET /api/stock/ledger`, supports `format=xlsx` | `stock.ledger.view` |
| Stock Transfer | `/stock/transfer` | `GET/POST /api/stock/transfer` | `stock.ledger.view` |
| Stock Status Convert | `/stock/status-convert` | `GET/POST /api/stock/status-convert` | `stock.ledger.view` |
| Stock Convert / Grade Adjustment | `/stock/convert` | `GET/POST /api/stock/convert` | `stock.ledger.view` |
| Stock Adjust | `/stock/adjust` | `GET/POST /api/stock/adjust` | `stock.ledger.view` |

## Current Side-Effect Baseline

| Flow | Current observed side effect |
|---|---|
| PO Buy | creates/updates/cancels POB commitment, status/allocation logs, no direct stock/AP/cash movement. |
| Purchase Bill | creates PB, purchase items, WTI receipt allocations, PO buy allocations, supplier advance allocation, PB status logs, and `stock_ledger.ref_type = PB` for stock-mode PB. Edit/cancel paths rebuild/delete current PB ledger/allocation rows in transaction and append related logs. |
| Supplier Advance | creates/updates/cancels `supplier_advance_payments` with status logs. Current create sets `pending_approval`; payment settlement flows through PMA/PMT. |
| Payment Approval | reads pending PB/ADV/EXP sources and creates `payment_approvals`; split approval is represented by multiple PMA rows. Void approved PMA is handled by payment cancel-approved route when no active payment exists. |
| Supplier Payment | creates `payments`, writes `bank_statement`, links to approved PMA, and refreshes source settlement status for PB/ADV/EXP. It does not auto-generate RV. |
| Receipt Voucher | manual printable source list from `receipt_vouchers`; active create/edit uses Supplier selector to pre-fill receiver snapshot and optional PB selector to pre-fill item/amount snapshot, while legacy proof confirms RV is cash-only Supplier evidence, must stay non-posting, and must not write bank statement/payment/stock facts. Current print preview uses Company Profile and legacy RV template blocks. |
| Expense | creates EXP either `pending_approval` or direct `paid`; direct pay writes `payments` and `bank_statement`. Cancel is blocked when locked by approved PMA and deletes related direct-pay bank statement rows for cancellable expenses. |
| Daily Transfer | creates paired `bank_statement` rows for account transfer. |
| Petty Advance | creates/updates PADV without BST on advance create; return creates PRET and writes `bank_statement`. |
| WTI/WTO | creates/updates weight ticket header, lines, product summaries, status logs, and timeline/usage data; downstream usage is updated by PB/SB flow. |
| PO Sell | creates POS commitment and computes current usage from sales bills/trading deals. |
| Sales Bill | creates SB, updates POS allocation/remaining, validates WTO source for stock mode, consumes active WTO pending_out, writes `stock_ledger.ref_type = SB`, appends `WTO -> SB` usage/status logs, and applies customer advance. `PATCH /api/sales/bills/[id]` action `cancel` blocks active RCP, reopens consumed WTO pending_out, writes `stock_ledger.ref_type = SB-CANCEL`, appends release/status logs, reverses PO Sell usage, marks SB cancelled, and writes `sales_bill_status_logs`. |
| Sales Receipt | creates/updates RCP and writes `bank_statement.ref_type = RCP`. |
| Sales Stock Issue | removed target runtime; `/sales/stock-issue` and `/api/sales/stock-issue` are legacy PSALE reference only and new writes must use `WTO -> pending_out -> SB`. |
| Stock Balance | read-only derived snapshot from stock helpers and stock ledger, with XLSX export. |
| Stock Ledger | read-only stock movement list from `stock_ledger`, with PB/SB source lookup and XLSX export. |
| Stock Transfer | writes paired `stock_ledger.ref_type = ST` out/in rows. |
| Stock Status Convert | validates available stock and writes paired `stock_ledger.ref_type = SC` out/in rows. |
| Stock Convert | creates `grade_adjustments` and paired `stock_ledger.ref_type = GA` out/in rows. |
| Stock Adjust | creates `stock_adjustments` and one `stock_ledger.ref_type = ADJ` row for gain/loss. |

## Critical Gaps Kept Open

These gaps are not blockers for baseline acceptance, but they are blockers before claiming target flow complete:

- `/sales/bills`: create-path stock-out and cancel-path stock reversal are implemented for WTO-backed Stock SB. Remaining gaps are UI enablement/browser QA, edit flow, customer-advance durable allocation release, and end-to-end receipt-lock proof.
- `/sales/stock-issue`: removed from target runtime. Active API/page should not create, convert, or reverse PSALE for new writes.
- `/purchase/receipt-vouchers`: current page now supports manual create/edit with Supplier pre-fill, optional PB item pre-fill, and print preview using Company Profile + legacy RV template blocks. PMT no longer auto-generates RV. Remaining target gaps are cancel/status/timeline, cancelled watermark, and strict separation from customer receipt `RCP`.
- `/daily/weight-ticket-list`: WTI/WTO target hold and all-or-nothing downstream billing rules must be reconciled with actual PB/SB usage behavior before changing stock/billing logic.
- `/stock/balance`: target hold-aware `on_hand / hold / available` model still depends on a durable hold/reservation source.
- `/purchase/bills`: current code uses delete/recreate for PB stock ledger/allocation rebuild in some paths; target append/reversal policy should be reviewed before production hardening.
- `/daily/petty-advance`: current PADV create does not write BST; PRET return writes BST. This matches the latest business decision but must stay explicit in docs.
- payment cancellation/reversal scope still needs end-to-end proof for PMA/PMT/EXP/ADV/PB lock behavior before expanding UI actions.

## Next Runtime Batch Recommendation

Start P0 runtime hardening in this order:

1. `/sales/bills` UI enablement + browser QA for cancel/reversal and receipt-lock behavior
2. replace legacy `/sales/stock-issue` PSALE QA/report references with WTO-backed SB coverage
3. `/purchase/bills` append/reversal hardening review
4. Production `PI/PO2` ledger write/reversal contract
5. `/daily/payment-approval` + `/purchase/payments` cancellation/payment-cycle lock review

## Related Page Flow Files

All 20 P0 page-flow files are marked `accepted-baseline` after this proof pass. Their `Current Gap` sections remain active and should not be deleted until the runtime behavior is implemented and verified.
