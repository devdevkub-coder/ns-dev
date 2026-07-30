---
title: Cash Position Page Flow
tags:
  - page-flow
  - menu
  - finance-debt
  - cash-position
status: accepted-baseline
updated: 2026-07-30
route: /finance/cash-position
---

# Cash Position Page Flow

## Scope

| Field | Value |
|---|---|
| Menu section | Finance & Debt |
| Route | `/finance/cash-position` |
| Page | Cash Position |
| Current Next | accepted code baseline |

## Canonical References

[[Finance Debt Flow]], [[Finance Cash Position Page Flow]], [[Finance Bank Statement Page Flow]], [[Finance AR Page Flow]], [[Finance AP Page Flow]]

## Page Purpose

หน้านี้เป็น dashboard สภาพคล่องรวม. ใช้ตอบว่าเงินสด/ธนาคารเหลือเท่าไร, มี AR ที่คาดว่าจะเข้าเท่าไร, มี AP ที่ต้องจ่ายเท่าไร, และ net position เป็นอย่างไร.

## Legacy Baseline

Legacy `view-cashPosition`:

- รวม active accounts แยก `เงินสด`, `ธนาคาร`, `FCD`, `OD`.
- คำนวณ OD used/available.
- รวม AR จาก sales bills และ AP จาก purchase bills.
- แสดงสูตร `เงินสด + ธนาคาร + FCD + ลูกหนี้ - เจ้าหนี้ - OD ใช้ไป`.
- มี top account และ account table.

## Page Responsibilities

- อ่าน account balances ต่อ `account + currency` จาก currency-aware Bank/FCD ledger projection.
- รวมยอดตาม account type.
- อ่าน AR exposure THB จาก `sales_bills.receivable_balance`.
- อ่าน AP exposure THB จาก `purchase_bills.payable_balance`.
- แสดง near due AR/AP.
- แสดง account table พร้อม balance.
- เป็น aggregate/read model เท่านั้น.

## Non-Responsibilities

- ไม่สร้าง bank statement.
- ไม่ทำ transfer/payment/receipt.
- ไม่แก้ account balance manual.
- ไม่เป็น source of truth ของยอดเงินคงเหลือ.
- ไม่แทนงบกระแสเงินสด/GL ในหมวดการเงิน-บัญชี.

## Lifecycle / Read Flow

| Step | User action | System result |
|---|---|---|
| 1 | เปิดหน้า | GET cash position aggregate |
| 2 | ดู summary | render account balance, exposure, net after AP |
| 3 | ดู near due | show top AR/AP within due window |
| 4 | drilldown target | link ไป bank/AR/AP source pages |

## Current API

`GET /api/finance/cash-position`

Current query: none.

Response:

- `accounts`
- `byType`
- `exposure.ar`
- `exposure.ap`
- `nearDue.ar`
- `nearDue.ap`
- `summary.accountBalance`
- `summary.netAfterAp`
- `summary.netExposure`

Permission ปัจจุบัน: `finance.cash.view`.

## Data Contract

- Account outward id/code = `accounts.code`.
- Account balance target derives from persisted currency-aware movements ณ as-of; `accounts.opening_balance` ไม่ใช่ source ของยอดยกมา.
- AR/AP exposure rows use source document `doc_no`.
- Cash Position ใช้ carrying THB เป็นยอด FCD หลัก; native balance/rate อยู่ใน FCD drilldown และหน้าแลกเงิน.
- Aggregate page itself has no row-level `created_at`; source drilldowns must expose created date.

## Validation / Status Rules

- Exclude cancelled SB/PB/payment/receipt from active exposure.
- AP uses purchase bill cancelled status list.
- AR due date uses `due_date` or credit term fallback.
- AP current due date uses bill date in API; target should align with AP page due date policy.
- ห้ามรวม native foreign amount เป็น THB; ถ้าไม่มี persisted carrying THB ต้องแสดง unavailable และไม่เดาจาก current rate.

## Side Effects

- Read-only. No cash, AP, AR, stock, or accounting side effect.

## Current Code Baseline

- Current API uses the persisted Bank Statement/FCD projection through `buildFinanceCashPosition`, and reads AR/AP directly from `sales_bills.receivable_balance` and `purchase_bills.payable_balance`.
- Account Master and `account_currency_balances` provide selectable capability only; neither is an opening-balance source.

## Current Gap

- As-of, branch and account-group filters plus XLSX source links are implemented.
- Native balance/rate remains intentionally outside this aggregate and is available in FCD drilldown.
- Need reconciliation tests ให้ summary/table/Bank/FCD/AR/AP ตรงกัน ณ as-of เดียวกัน.

## Implementation Checklist

- [x] Verify current Next page/component against this page-flow
- [x] Verify API route handlers match Current API and status rules above
- [x] Capture legacy cash position baseline
- [ ] Implement as-of/account+currency policy
- [ ] Add drilldown links
- [ ] Reconcile customer advance/supplier advance inclusion
