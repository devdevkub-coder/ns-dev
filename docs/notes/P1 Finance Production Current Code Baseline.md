---
title: P1 Finance Production Current Code Baseline
tags:
  - page-flow
  - finance
  - production
  - verification
status: accepted-baseline
updated: 2026-06-11
---

# P1 Finance Production Current Code Baseline

เอกสารนี้บันทึกผล proof P1 ตาม current `apps/next` code/API ณ 2026-06-11 สำหรับกลุ่ม:

- Daily read model: `/daily/expense-dashboard`
- Finance & Debt read models: `/finance/ar`, `/finance/ap`, `/finance/bank`, `/finance/cash-position`, `/finance/customer-advance`
- Production user-facing menu pages: `/production/orders`, `/production/output-categories`, `/production/dashboard`, `/production/report`

## Decision

current Next code/API ของ P1 เป็น accepted baseline สำหรับเอกสารรายหน้าแล้ว

ความหมาย:

- ใช้ current page/API เป็น source of truth ของ flow เริ่มต้น
- ยังไม่ต้องรอ legacy proof เพื่อถือว่าเอกสารรายหน้าครบ
- งานต่อของ P1 คือ source/cutoff/status/write-side-effect reconciliation เมื่อจะปรับ finance/production behavior
- กลุ่ม finance report เป็น read model เป็นหลัก ส่วน production output categories เป็น simple master-data write surface ตาม current code

## API / Permission Families

| Area | Routes | API baseline | Permission |
|---|---|---|---|
| Expense dashboard | `/daily/expense-dashboard` | no page-specific `/api/daily/expense-dashboard`; expected source is `/api/daily/expenses` until a dashboard aggregate API is added | `finance.cash.view` through expense source API |
| Finance AR/AP | `/finance/ar`, `/finance/ap` | `GET /api/finance/ar`, `GET /api/finance/ap`; support `format=xlsx` export | `finance.cash.view` |
| Finance bank/cash | `/finance/bank`, `/finance/cash-position` | `GET /api/finance/bank`, `GET /api/finance/cash-position`; bank supports `format=xlsx` export | `finance.cash.view` |
| Customer advance | `/finance/customer-advance` | `GET /api/finance/customer-advance`; supports `format=xlsx` export | `finance.cash.view` |
| Production orders | `/production/orders` | `GET /api/production/orders` current read/list/detail-summary baseline | `production.operations.view` |
| Production output categories | `/production/output-categories` | `GET /api/production/output-categories`, `POST /api/production/output-categories`, `PATCH /api/production/output-categories/[id]` | simple master-data service contract |
| Production reports | `/production/dashboard`, `/production/report` | dedicated `GET /api/production/...` read models using `loadProductionMetrics` | `production.operations.view` |

Production cost report and other legacy/supporting production report surfaces are not part of the target Production navigation after the 2026-06-13 menu scope decision.

## Current Source Notes

| Area | Current source shape |
|---|---|
| AR | reads `sales_bills`, `receipts`, customers, branches, channels, and pending issue summary; excludes cancelled by default. |
| AP | reads `purchase_bills`, `payments`, suppliers, branches; excludes cancelled purchase-bill statuses by default. |
| Bank | reads `bank_statement` plus active accounts and computes running balances from opening balance + statement rows. |
| Cash position | derives account balances, AR exposure, and AP exposure from accounts, bank statement, sales bills, receipts, purchase bills, and payments. |
| Customer advance | current code reads `bank_statement` rows with `ref_type = CADV`; used/remaining allocation is still a baseline gap. |
| Production metrics | dashboard/report/WIP/cost pages use `loadProductionMetrics` and `summarizeProductionMetrics`. |
| Output categories | current route delegates to `listSimpleMasterData` / `saveSimpleMasterData` for `productionOutputCategories`. |

## Side-Effect Policy

P1 report/read pages must not:

- write `stock_ledger`
- write `bank_statement`
- settle AP/AR
- mutate purchase/sales/payment/production source status
- silently change formula/cutoff rules without updating the page-flow document

Allowed current P1 write surface:

- `/production/output-categories` may create/update category master data through its documented API.

Any future production order write/reversal, WIP ledger, stock movement, or accounting side effect must be documented in [[Production Flow]] and the relevant page-flow file before runtime changes.

## Open Reconciliation Items

These are not blockers for baseline acceptance:

- `/daily/expense-dashboard` needs either a page-specific aggregate API or an explicit decision to keep reading `/api/daily/expenses`.
- `customer-advance` needs durable allocation/used amount source before it can become a full customer-advance settlement view.
- production write/reversal and stock ledger ownership remain documented target gaps in [[Production Flow]].
- production output category effect enforcement still depends on the future production write flow.
- finance/production exports and drilldowns should be refined page by page when UI behavior is changed.

## Related Page Flow Files

All 12 P1 page-flow files are marked `accepted-baseline` after this proof pass. P0 remains the main pending proof queue because it owns transaction, payment, and stock side effects.
