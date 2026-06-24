---
title: P2 Report Current Code Baseline
tags:
  - page-flow
  - report
  - verification
status: accepted-baseline
updated: 2026-06-11
---

# P2 Report Current Code Baseline

เอกสารนี้บันทึกผล proof P2 ตาม current `apps/next` code/API ณ 2026-06-11 สำหรับกลุ่ม report/read-model:

- Main Dashboard / Reports
- Tracking 360
- Trading / PO Reports
- Dual Costing
- General Reports
- Finance Accounting

## Decision

current Next code/API ของ P2 เป็น accepted baseline สำหรับเอกสารรายหน้าแล้ว

ความหมาย:

- ใช้ current page/API เป็น source of truth ของ flow เริ่มต้น
- ยังไม่ต้องรอ legacy proof เพื่อถือว่าเอกสารรายหน้าครบ
- งานต่อของ P2 คือ formula/source/cutoff reconciliation เมื่อ user ต้องการปรับรายงานหรือพบตัวเลขไม่ตรง
- P2 pages เป็น read model/report surface เป็นหลัก ไม่ควรมี transaction side effect

## API / Permission Families

| Family | Routes | API baseline | Permission |
|---|---|---|---|
| Main Dashboard / Reports | `/owner-daily`, `/daily-report`, `/dashboard` | `GET /api/dashboard`; `/api/owner-daily` และ `/api/daily-report` re-export dashboard handler | `reports.reports.view` |
| Main Dashboard / Reports | `/anomaly-detector`, `/profit-cost-analysis`, `/sales-plan`, `/sales-commission`, `/cash-flow-calendar`, `/business-calendar`, `/cash-others-summary` | dedicated `GET /api/...` report builders | `reports.reports.view` |
| Tracking 360 | `/tracking/customer`, `/tracking/supplier`, `/tracking/product` | `GET /api/tracking/customer`, `GET /api/tracking/supplier`, `GET /api/tracking/product` | `reports.reports.view` |
| General Reports | `/reports` | `GET /api/reports/aggregate` | `reports.reports.view` |
| PO Reports | `/po-reports/outstanding` | `GET /api/po-reports/outstanding` | `reports.reports.view` |
| Trading | `/trading/dashboard`, `/trading/matching` | `GET /api/trading/dashboard`, `GET /api/trading/matching` | `finance.cash.view` |
| Dual Costing | `/dual-costing/*` | dedicated `GET /api/dual-costing/...` read models | `finance.cash.view` |
| Finance Accounting | `/finance-accounting/*` | dedicated `GET /api/finance-accounting/...` read models | `finance.financials.view` |

## Current Source Notes

| Area | Current source shape |
|---|---|
| Dashboard alias pages | `/owner-daily` and `/daily-report` currently use the same dashboard API handler as `/dashboard`. |
| Reports hub | `/reports` client fetches `/api/reports/aggregate` and aggregates purchase bills, sales bills, products, channels, suppliers, and customers. |
| Tracking 360 | customer/supplier/product tracking reads operational bills, receipts/payments, and stock ledger where relevant. |
| Trading | trading dashboard/matching reads trading-mode purchase bills, sales bills, trading deals, products, suppliers, and customers. |
| Dual Costing | current code is read/simulation/management baseline; write decisions and durable allocation ledger are still future flow unless implemented separately. |
| Finance Accounting | current APIs are management read models and operational-derived reports; they are not a statutory GL close unless the page flow says so explicitly. |

## Side-Effect Policy

P2 pages must not:

- create or edit purchase/sales/payment/stock documents
- write `stock_ledger`
- write `bank_statement`
- settle AP/AR
- mutate source document status
- silently change formulas without updating the page-flow document

If a future P2 page needs a write action, it must be split into a documented write workflow or linked to the owning transaction page before implementation.

## Open Reconciliation Items

These are not blockers for baseline acceptance:

- final formula proof against legacy where management wants exact legacy parity
- cutoff/as-of/date range policy per report
- export/print parity per report
- drilldown/source-link completeness per report
- mapping from report row to source document where current UI is summary-only

## Related Page Flow Files

See `docs/notes/page-flows/` for per-route files. All P2 page-flow files are marked `accepted-baseline` after this proof pass.
