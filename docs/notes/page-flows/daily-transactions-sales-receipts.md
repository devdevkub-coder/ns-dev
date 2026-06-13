---
title: รับเงิน Customer Page Flow
tags:
  - page-flow
  - menu
status: accepted-baseline
updated: 2026-06-12
route: /sales/receipts
---

# รับเงิน Customer Page Flow

## Scope

| Field | Value |
|---|---|
| Menu section | Daily Transactions |
| Route | `/sales/receipts` |
| Page | รับเงิน Customer |
| Current Next | accepted code baseline |

## Canonical References

[[Sales Flow]], [[Payment Flow]]

## Flow Baseline

Customer Receipt ใช้บันทึกรับชำระเงินจากลูกค้า (`Customer`) สำหรับบิลขาย (`Sales Bill` / `SB`) ที่ยังมียอดค้างรับ และสร้างเอกสาร `Receipt Voucher` / `RCP` เพื่อบันทึกประวัติการรับเงินเข้าสู่ระบบ

RCP รับเงินจาก SB/customer advance และเขียน bank statement เงินเข้า

## Purpose

ใช้บันทึกรับชำระเงินจากลูกค้าสำหรับบิลขายที่ยังมียอดค้างรับ โดย `RCP` เป็นเอกสารหลักของเหตุการณ์รับเงิน ส่วน `bank_statement` เป็นผลกระทบเงินเข้า และ AR/SB balance ต้องถูกคำนวณใหม่จาก receipt facts ที่ active

## Features

- รับชำระเงินจากลูกค้า
- รองรับการรับเงินหลายบิลใน 1 Receipt Voucher
- รองรับการรับเงินบางส่วน (Partial Receipt)
- คำนวณยอดคงเหลืออัตโนมัติ
- รองรับส่วนลด (Discount)
- รองรับค่าธรรมเนียมธนาคาร (Bank Fee)
- รองรับภาษีหัก ณ ที่จ่าย (WHT)
- แสดงยอดรับสุทธิ (Net Cash In)
- บันทึกประวัติ Receipt Voucher
- ค้นหาและติดตามสถานะการรับเงิน
- แก้ไข Receipt Voucher
- ยกเลิก Receipt Voucher

## Page Responsibilities

- แสดงคิวบิลขายค้างรับและประวัติรับเงิน
- สร้าง `RCP` เพื่อรับเงินจาก Customer
- รองรับรับหลาย SB ใน RCP เดียวตาม customer/payment account rule
- เขียน bank statement เงินเข้าและ recalc AR/SB paid status
- รองรับส่วนลด ค่าธรรมเนียม WHT/ภาษีหัก ณ ที่จ่าย ตาม target

## Non-Responsibilities

- ไม่สร้าง SB/POS/WTO
- ไม่ตัด stock
- ไม่แก้ยอดบิลขายเดิมนอกจาก payment status/paid amount
- ไม่ใช้ payment supplier PMT แทน receipt

## Lifecycle / Operation Flow

| Step | User action | System result |
|---|---|---|
| 1 | เปิดคิว | GET outstanding SB/customer receivable |
| 2 | เลือกบิล | validate customer และยอดค้าง |
| 3 | บันทึกรับเงิน | POST RCP + bank statement |
| 4 | ประวัติ | แสดง RCP เสร็จสิ้น/ยกเลิก |
| 5 | edit | ยกเลิก RCP เดิมและออก RCP ใหม่ใน transaction เดียว |
| 6 | cancel | reverse receipt/bank facts และ recalc SB |

## API / Data Contract

### Current API

- `GET /api/sales/receipts - queue/history`
- `POST /api/sales/receipts - create receipt`
- `PATCH /api/sales/receipts - cancel/replace receipt`

### Runtime Contract Batch 2026-06-12

`RCP` write path now has an explicit header/allocation contract:

- Header: `customer_receipts`
- Per-SB allocation facts: `customer_receipt_allocations`
- Receipt timeline: `customer_receipt_status_logs`
- Compatibility cash/AR read fact for existing reports: `receipts`
- Cash/bank movement: `bank_statement`
- AR current balance/status: `sales_bills.received_amount`, `sales_bills.receivable_balance`, `sales_bills.status`
- SB timeline: `sales_bill_status_logs`

`POST /api/sales/receipts` accepts the current single-bill form payload and the target `lines[]` payload. Both are validated by the same allocation rules. The single-bill payload maps to exactly one allocation line and is not allowed to infer a bill or amount from other state.

Request contract for target multi-bill create:

```json
{
  "date": "2026-06-12",
  "customerId": "CUST001",
  "accountId": "ACC001",
  "method": "TRANSFER",
  "amount": 12000,
  "withholdingTax": 0,
  "discount": 0,
  "fee": 0,
  "notes": "optional",
  "lines": [
    {
      "salesBillDocNo": "SB2606-0001",
      "receiptAmount": 12000,
      "withholdingTaxAmount": 0,
      "discountAmount": 0
    }
  ]
}
```

`method` must resolve to an active `payment_methods.code` or active `payment_methods.name`. `customerId`, `accountId`, and `salesBillDocNo` are outward business codes/document numbers resolved server-side to internal ids.

The server computes and validates:

- `gross_amount = sum(lines.receiptAmount)`
- `discount_total = sum(lines.discountAmount)`
- `withholding_tax_total = sum(lines.withholdingTaxAmount)`
- `net_cash_in = gross_amount - bank_fee_total - withholding_tax_total`
- `allocated_ar_amount = receiptAmount + discountAmount + withholdingTaxAmount`
- `outstanding_after = outstanding_before - allocated_ar_amount`

Cancel contract:

```json
{
  "action": "cancel",
  "docNo": "RCP2606-0001",
  "reason": "reason required"
}
```

Cancel does not delete the original receipt, allocation, or bank facts. It marks `customer_receipts`, allocation rows, and compatibility `receipts` rows as `cancelled`, appends a reversing `bank_statement` money-out row with `ref_type = RCP-CANCEL`, restores `sales_bills.received_amount` / `receivable_balance`, recalculates SB status, and appends receipt/SB status logs.

Edit contract uses cancel-and-reissue, not silent in-place mutation. The UI can submit an existing `id` through `POST /api/sales/receipts`, or API callers can use:

```json
{
  "action": "replace",
  "docNo": "RCP2606-0001",
  "reason": "แก้ไขยอดรับ",
  "values": {
    "date": "2026-06-12",
    "customerId": "CUST001",
    "accountId": "ACC001",
    "method": "TRANSFER",
    "amount": 10000,
    "withholdingTax": 0,
    "discount": 0,
    "fee": 0,
    "lines": [
      {
        "salesBillDocNo": "SB2606-0001",
        "receiptAmount": 10000,
        "withholdingTaxAmount": 0,
        "discountAmount": 0
      }
    ]
  }
}
```

Replace runs in one database transaction: cancel old RCP, reverse old bank/AR effects, validate the replacement against the restored SB balances, create a new RCP number, write new bank/AR effects, and append receipt/SB status logs linking the replacement to the old doc no.

No fallback/hard-coded option policy:

- Outstanding SB selection reads only SB with positive `receivable_balance` and non-cancelled status.
- Customer must resolve by active `customers.code`.
- Account must resolve by active `accounts.code`.
- Payment method must resolve from active `payment_methods`; UI choices are master-data driven.
- Sales bill must resolve by `sales_bills.doc_no`; internal ids are not accepted as business references.
- Status writes use centralized runtime constants, not UI display labels.

### API / DB Optimization Batch 2026-06-12

`GET /api/sales/receipts` keeps the same response shape but avoids broad ORM payloads and the previous `OR` queue query:

- Sales Bill queue is split into two indexed queries: outstanding SB and active-allocation SB for edit/history context, then merged by `doc_no` server-side.
- Sales Bill and RCP history queries select only fields used by the page response; relation `include` of full Customer/Account rows is intentionally avoided.
- RCP history ordering uses `customer_receipts(date desc, created_at desc, id desc)`.
- Outstanding SB queue uses a partial index for `receivable_balance > 0` and non-cancelled statuses.
- Active allocation lookup uses a partial index on `customer_receipt_allocations(sales_bill_id)` where `status = 'active'`.

The optimization remains no-fallback/no-hardcode: master data still comes from active Customer/Account/Payment Method tables, and receipt write paths still validate business codes/doc numbers server-side.

### Data Contract

- UI ใช้ outward business document/code เป็นหลัก และให้ server resolve internal id
- list/detail/print/export ต้องอ่าน source contract เดียวกันเพื่อลด drift
- transaction write ต้องทำใน server transaction และ append timeline/status/audit ตาม document policy
- ถ้า field เป็น money/qty/date/business code ให้ validate ตาม `docs/design.md` และ server-side ซ้ำ

## Validation / Status Rules

- SB ต้องไม่ cancelled และยังมียอดค้างรับ
- receipt amount/discount/WHT ต้อง reconcile กับยอดค้าง
- บัญชีรับเงินต้อง active
- cancel ต้องไม่ลบ audit และต้อง recalc AR

## Business Rules

- รับเงินได้เฉพาะบิลขายที่มียอดค้างรับ
- ระบบสามารถเลือกหลายบิลขายใน Receipt Voucher เดียวได้
- ระบบคำนวณยอดคงเหลือหลังรับเงินอัตโนมัติ
- ยอดรับต้องไม่เกินยอดค้างรับของบิล
- การรับเงินบางส่วนจะเปลี่ยนสถานะบิลเป็น Partial
- เมื่อรับเงินครบ ระบบเปลี่ยนสถานะบิลเป็น Paid
- ระบบบันทึกประวัติการรับเงินทุกครั้ง
- สามารถระบุบัญชีรับเงินได้
- เมื่อบันทึก `RCP` ต้องสร้าง `bank_statement` เงินเข้า
- เมื่อแก้ไขหรือยกเลิก `RCP` ต้อง reverse หรือปรับผลเดิมอย่างตรวจสอบย้อนหลังได้ แล้วคำนวณยอดรับแล้ว/ยอดค้างรับของบิลใหม่

## Side Effects

- สร้าง receipt/RCP facts และ `bank_statement` เงินเข้า
- recalc SB paid/receivable status
- cancel reverse receipt/bank facts

## Current Code Baseline

- Current `apps/next` page/API code is accepted as the P0 implementation baseline as of 2026-06-11.
- This page belongs to the transaction/stock/payment risk group; accepted baseline means proofed against current code, not target-complete.
- Runtime changes must preserve documented status, allocation, ledger, payment, lock, and reversal boundaries, or update this page-flow and the canonical flow first.
- See [[P0 Transaction Stock Payment Current Code Baseline]] for API/permission/side-effect proof notes and open critical gaps.

## Current Gap

Multi-bill receipt allocation DB/API create path, UI picker, cancel/reversal path, and edit via cancel-and-reissue are implemented in the active Next app. Printed RCP detail and customer advance allocation remain future work.

## Implementation Checklist

- [x] Verify current Next page/component against this page-flow
- [x] Verify API route handlers match Current API and status rules above
- [x] Add additive DB contract for `customer_receipts`, `customer_receipt_allocations`, and `customer_receipt_status_logs`
- [x] Update create API to write RCP header, allocation facts, legacy receipt line facts, bank statement, SB balances, and status logs in one transaction
- [x] Build UI multi-bill allocation picker instead of single-bill-only modal
- [x] Add cancel API and UI flow without deleting audit facts
- [x] Add migration/backfill plan for old `receipts` history into `customer_receipts`
- [x] Implement approved edit policy as cancel-and-reissue replacement in one transaction
- [x] Optimize Customer Receipt API read payloads and DB indexes for outstanding queue, active allocation lookup, and RCP history order
- [ ] Add browser QA checklist for create partial/full/multi-bill and over-receipt blocking
