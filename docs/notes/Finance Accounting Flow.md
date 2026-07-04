---
title: Finance Accounting Flow
tags:
  - finance-accounting
  - reports
  - read-model
  - flow
status: accepted-baseline
updated: 2026-07-04
---

# Finance Accounting Flow

เอกสารนี้เป็น source หลักของหมวด `Finance / Accounting` ใน active Next app. สถานะปัจจุบันของหมวดนี้เป็น management/report baseline พร้อม controlled write flow สำหรับ asset lifecycle เบื้องต้น ได้แก่ ทะเบียนทรัพย์สิน, ค่าเสื่อมราคา, และจำหน่ายทรัพย์สิน. หมวดนี้ยังไม่ใช่ GL/statutory accounting close system. สำหรับสรุปแบบรายเมนูทั้ง `การเงิน & หนี้` และ `Finance / Accounting` ให้ดู [[Finance And Accounting Menu Summary]]

## Shared Boundary

- permission กลางของ API อ่านคือ `finance.financials.view`
- write action ที่เปิดแล้วใช้ `finance.financials.manage` และต้องมี validation/reversal policy เฉพาะหน้า
- Asset Register, Depreciation, และ Asset Disposal เปิด write flow เฉพาะ asset lifecycle; GL journal, statutory posting, bank/receipt posting, และ period close ยัง deferred
- ห้ามให้ report page เขียน `bank_statement`, `stock_ledger`, PB/SB status, AP/AR allocation, GL posting หรือ asset/loan/equity state จนกว่าจะมี write-flow + audit + reversal design แยก

## Current API Map

| Route | Current API | Query | Current source/builder | Current write state |
|---|---|---|---|---|
| `/finance-accounting/financial-dashboard` | `GET /api/finance-accounting/financial-dashboard` | `asOf`, `branchId` | `buildFinancialDashboard()` | read-only |
| `/finance-accounting/cash-flow-analysis` | `GET /api/finance-accounting/cash-flow-analysis` | `from`, `to`, `branchId` | `buildCashFlowAnalysis()` | read-only |
| `/finance-accounting/cf-forecast-calendar` | `GET /api/finance-accounting/cf-forecast-calendar` | `startDate`, `horizon`, `branchId` | `buildCashFlowForecastCalendar()` with AP/AR/expense/loan plus VAT/WHT due estimates | read-only forecast |
| `/finance-accounting/working-capital` | `GET /api/finance-accounting/working-capital` | `asOf`, `periodDays`, `branchId` | `buildWorkingCapital()` | read-only |
| `/finance-accounting/stock-finance` | `GET /api/finance-accounting/stock-finance` | `asOf`, `branchId` | `buildStockFinance()` | read-only |
| `/finance-accounting/profit-leak` | `GET /api/finance-accounting/profit-leak` | `from`, `to`, `branchId`, `targetMargin` | `buildProfitLeak()` | read-only |
| `/finance-accounting/tax-vat-wht` | `GET /api/finance-accounting/tax-vat-wht` | `year`, `month`, `branchId`, `format=xlsx` | `buildTaxVatWht()` | read-only tax baseline + export |
| `/finance-accounting/pl-statement` | `GET /api/finance-accounting/pl-statement` | `from`, `to`, `branchId`, `transactionMode` | `buildPlStatement()` | read-only management P&L |
| `/finance-accounting/balance-sheet` | `GET /api/finance-accounting/balance-sheet` | `asOf`, `branchId` | `buildBalanceSheet()` | read-only management balance sheet |
| `/finance-accounting/cash-flow-statement` | `GET /api/finance-accounting/cash-flow-statement` | `from`, `to`, `branchId` | `buildCashFlowStatement()` | read-only management cash flow |
| `/finance-accounting/asset-register` | `GET/POST/PATCH /api/finance-accounting/asset-register` | `q`, `category`, `status`, `format`, `template` | `assets`, `depreciations`, `branches`, `suppliers` | create/edit/import/export/deactivate enabled; GL acquisition posting deferred |
| `/finance-accounting/depreciation` | `GET/POST/PATCH /api/finance-accounting/depreciation` | `month`, `year`, `periodMonth`, `periodYear` | `assets`, `depreciations` | preview/commit/reverse enabled; GL depreciation posting deferred |
| `/finance-accounting/asset-disposal` | `GET/POST/PATCH /api/finance-accounting/asset-disposal` | none | `assets`, `depreciations`, `asset_disposals`, `customers` | create approved disposal and reverse enabled; receipt/bank/GL posting deferred |
| `/finance-accounting/loan-contracts` | `GET /api/finance-accounting/loan-contracts` | none | `loans`, `loan_schedules`, `loan_payments` | save/import/payment disabled |
| `/finance-accounting/loan-dashboard` | `GET /api/finance-accounting/loan-dashboard` | none | `loans`, `loan_schedules`, `loan_payments` | read-only |
| `/finance-accounting/asset-overview` | `GET /api/finance-accounting/asset-overview` | `asOf`, `branchId` | `buildCashOthersSummary()` + `buildFinancialDashboard()` | read-only |
| `/finance-accounting/equity-maint` | `GET /api/finance-accounting/equity-maint` | none | latest `equity` row | write disabled |
| `/finance-accounting/opening-balance` | `GET /api/finance-accounting/opening-balance` | none | `opening_balance`, `accounts` | save/apply disabled |
| `/finance-accounting/accounting-periods` | page/policy UI | none | accounting period policy/readiness state | policy UI; runtime write enforcement deferred |
| `/finance-accounting/posting-rules` | page/policy UI | none | source-to-account mapping readiness | policy UI; GL posting deferred |
| `/finance-accounting/historical-data` | `GET /api/finance-accounting/historical-data` | none | `historical_monthly` | save/clear disabled |

## Page Semantics

| Page group | Meaning |
|---|---|
| Management financial statements | P&L, Balance Sheet, Cash Flow Statement, Financial Dashboard. These are report-derived statements from operational tables, not locked statutory statements yet. |
| Cash/working capital planning | Cash Flow Analysis, CF Forecast Calendar, Working Capital, Stock Finance, Profit Leak. These explain cash pressure, inventory/AR/AP days, stock finance risk, margin leakage, and estimated VAT/WHT due dates. |
| Tax baseline | Tax / VAT / WHT reads transaction tax fields, global opening balance carry-forward for the go-live period, missing-tax-document aging, source document links, export, and tax calendar assumptions. It is not a filing ledger and has no filing lock/status today. |
| Asset baseline | Asset Register creates/maintains asset master, Depreciation posts/reverses monthly depreciation rows, Asset Disposal closes/reverses asset lifecycle using latest NBV, and Asset Overview remains read-only. |
| Loan/equity/opening/historical | Loan Contracts/Dashboard, Equity, Opening Balance, Historical Data read setup/support tables. Write paths need approval/audit/cutover design before enabling. |
| Period and posting policy | Accounting Periods is the target owner for month/year close states, soft close, lock, and reopen. Posting Rules is the readiness surface for source-to-account mapping before any GL/statutory posting is enabled. |

## Validation Rules

- Every report must state whether it uses actual, forecast, accrual or historical data.
- `asOf` reports use facts up to end-of-day of the selected date.
- period reports use document/business dates in the selected range unless a page explicitly states another basis.
- Currency, FCD, OD and FX treatment must not be silently mixed into THB totals without a documented conversion rule.
- Opening/historical/cutover data must be locked by a cutover approval policy before any write action is enabled.
- Asset and loan write flows need idempotency, audit trail, reversal and bank/GL side-effect policy before moving beyond read baseline.

## Open Gaps

- no normalized GL journal/posting layer yet
- no statutory close/period lock
- tax filing status and PP30/PND workflow are not implemented
- asset acquisition/disposal/depreciation GL posting remains deferred in this dev-scope batch; source lifecycle rows and reversals are enabled
- loan payment posting to bank statement/interest/principal split remains design-only
- opening balance and historical-data writes are disabled until cutover approval policy is defined
- Accounting Periods and Posting Rules are visible policy surfaces but do not yet enforce closed-period locks across all transaction write APIs
- monthly/yearly close needs the snapshot layer from [[Reporting History Snapshot Policy]] before dashboards/statements can be frozen reliably
