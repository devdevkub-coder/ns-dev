---
title: Page Flow Index
tags:
  - page-flow
  - menu
status: draft
updated: 2026-06-11
---

# Page Flow Index

รายชื่อไฟล์ flow รายหน้าสำหรับทุก route ที่อยู่ในเมนูใหม่ `apps/next/src/lib/navigation.ts`.

- จำนวน route ในเมนูใหม่: 110
- Scope: active menu only
- Legacy-only pages ที่ไม่มีในเมนูใหม่ไม่อยู่ใน index นี้

## Detail Completion Status

ไฟล์รายหน้าทุก route ถูกสร้างครบและมี minimum detailed contract ครบ 110/110 routes แล้ว:

- ทุกไฟล์มี responsibilities, non-responsibilities, lifecycle/read flow, API/data contract, validation/status rules, side effects, current gaps, และ implementation checklist
- Batch 1 deepened page-specific details and Current API for core Purchase, Sales, Payment, and Stock pages:
  - `/purchase/po-buy`
  - `/purchase/bills`
  - `/purchase/advance-payments`
  - `/purchase/payments`
  - `/purchase/receipt-vouchers`
  - `/daily/payment-approval`
  - `/sales/po-sell`
  - `/sales/bills`
  - `/sales/receipts`
  - `/daily/weight-ticket-dashboard`
  - `/daily/weight-ticket-list`
  - `/stock/balance`
  - `/stock/ledger`
  - `/stock/transfer`
  - `/stock/status-convert`
  - `/stock/convert`
  - `/stock/adjust`
- Batch 2 deepened Daily Cash, Finance & Debt, and Production active pages:
  - `/daily/transfer`
  - `/daily/expense`
  - `/daily/expense-dashboard`
  - `/daily/petty-advance`
  - `/finance/ar`
  - `/finance/ap`
  - `/finance/bank`
  - `/finance/cash-position`
  - `/finance/customer-advance`
  - `/production/orders`
  - `/production/report`
- Batch 3 deepened report/read-model pages across main dashboards, tracking, trading/PO reports, dual costing, general reports, and finance-accounting pages with Current API/read-model contracts.
- Batch 4 deepened all active master-data and admin/system pages, and separated platform/support behavior into [[System Supporting Flows]].
- P0 transaction/stock/payment pages are now accepted as current implementation baseline per [[P0 Transaction Stock Payment Current Code Baseline]]; target-complete gaps remain active for runtime hardening.
- Finance & Debt was deepened again into [[Finance Debt Flow]] plus 6 route-level files. The page files now record legacy baseline, current API query/response, side-effect boundaries, and remaining allocation/status/correction gaps for Petty Advance, AR, AP, Bank Statement, Cash Position, and Customer Advance.
- Trading / PO Reports was deepened into [[Trading Flow]] plus 3 route-level files. The page files now record legacy ex-VAT Trading baseline, current `GET`/export APIs, PB/SB Trading matching boundaries, PO Outstanding include/exclude rules, and remaining write/reverse/filter/drilldown gaps.
- Main Dashboard / Reports was deepened into [[Main Dashboard Reports Flow]] plus route-level files. The page files record current dashboard/report APIs, query params, source tables/helpers, response sections, no-side-effect boundaries, and remaining formula/drilldown/export gaps for active dashboard/report pages.
- Finance Accounting was deepened into [[Finance Accounting Flow]]. The overview now records all 19 finance-accounting APIs, current query params, source builders/tables, read/design-only write states, and shared management-report boundaries; each route-level page-flow file now points to that overview. Legacy clone planning for this category is tracked in `docs/migration/22-finance-accounting-legacy-clone-plan.md`; use its FA0 reading inventory and page-flow update queue before changing Finance / Accounting runtime behavior.
- Master Data current code is now accepted as the baseline per [[Master Data Current Code Baseline]]; master-data page-flow files should sync to current code rather than wait for legacy proof.
- P1 finance/production/daily read-model pages are now accepted as current-code baseline per [[P1 Finance Production Current Code Baseline]]; remaining P1 work is source/cutoff/status/write-side-effect reconciliation when behavior changes.
- P2 report/read-model pages are now accepted as current-code baseline per [[P2 Report Current Code Baseline]]; remaining P2 work is formula/source/cutoff reconciliation only when report definitions change or discrepancies are found.
- P3 Admin/System proof completed against current code on 2026-06-11; admin/system page-flow files now record accepted API/permission boundaries.
- Remaining follow-up is no longer missing page-flow coverage or current-code proof; it is runtime hardening for high-risk P0 gaps before claiming target-complete behavior.
- ไฟล์ที่มี detailed doc เฉพาะทางอยู่แล้วให้ยึด canonical doc ที่ link ในคอลัมน์ Existing detailed doc เป็น source of truth แล้ว sync page-flow file ให้ตรงเมื่อ contract เปลี่ยน
- Tracking 360 was deepened into [[Tracking 360 Flow]] plus 3 route-level files. The page files now record legacy drilldown/detail behavior, current `GET`/xlsx APIs, source tables, formula rules, read-only boundaries, and remaining drilldown/source-link/aging gaps.

| Route | Page | Page flow file | Existing detailed doc |
|---|---|---|---|
| `/owner-daily` | Owner Daily Control | [main-dashboard-reports-owner-daily.md](main-dashboard-reports-owner-daily.md) | [[Main Dashboard Reports Flow]] |
| `/daily-report` | Daily Report | [main-dashboard-reports-daily-report.md](main-dashboard-reports-daily-report.md) | [[Main Dashboard Reports Flow]] |
| `/dashboard` | Financial Dashboard | [main-dashboard-reports-dashboard.md](main-dashboard-reports-dashboard.md) | [[Main Dashboard Reports Flow]] |
| `/profit-cost-analysis` | Profit & Cost Analysis | [main-dashboard-reports-profit-cost-analysis.md](main-dashboard-reports-profit-cost-analysis.md) | [[Main Dashboard Reports Flow]] |
| `/sales-plan` | วางแผนการขาย (LME) | [main-dashboard-reports-sales-plan.md](main-dashboard-reports-sales-plan.md) | [[Sales Flow]] |
| `/sales-commission` | Sales Tracking Dashboard | [main-dashboard-reports-sales-commission.md](main-dashboard-reports-sales-commission.md) | [[Main Dashboard Reports Flow]] |
| `/cash-flow-calendar` | Cash Flow Calendar | [main-dashboard-reports-cash-flow-calendar.md](main-dashboard-reports-cash-flow-calendar.md) | [[Main Dashboard Reports Flow]] |
| `/business-calendar` | Business Calendar | [main-dashboard-reports-business-calendar.md](main-dashboard-reports-business-calendar.md) | [[Main Dashboard Reports Flow]] |
| `/cash-others-summary` | Cash & Others Summary | [main-dashboard-reports-cash-others-summary.md](main-dashboard-reports-cash-others-summary.md) | [[Main Dashboard Reports Flow]] |
| `/tracking/customer` | Customer Tracking | [tracking-360-tracking-customer.md](tracking-360-tracking-customer.md) | [[Tracking 360 Flow]] |
| `/tracking/supplier` | Supplier Tracking | [tracking-360-tracking-supplier.md](tracking-360-tracking-supplier.md) | [[Tracking 360 Flow]] |
| `/tracking/product` | Product Tracking | [tracking-360-tracking-product.md](tracking-360-tracking-product.md) | [[Tracking 360 Flow]] |
| `/purchase/bills` | บิลรับซื้อ | [daily-transactions-purchase-bills.md](daily-transactions-purchase-bills.md) | [[Purchase Bills Page Flow]], [[Purchase Flow]] |
| `/sales/bills` | บิลขาย | [daily-transactions-sales-bills.md](daily-transactions-sales-bills.md) | [[Sales Bills Page Flow]], [[Sales Flow]] |
| `/sales/stock-issue` | เบิกออกรอบิล | [daily-transactions-sales-stock-issue.md](daily-transactions-sales-stock-issue.md) | Removed target flow; legacy reference only |
| `/daily/payment-approval` | อนุมัติจ่ายเงิน | [daily-transactions-daily-payment-approval.md](daily-transactions-daily-payment-approval.md) | [[Payment Flow]] |
| `/purchase/advance-payments` | เงินล่วงหน้า/มัดจำ | [daily-transactions-purchase-advance-payments.md](daily-transactions-purchase-advance-payments.md) | [[Supplier Advance Payment Flow]], [[Customer Advance Page Flow]] |
| `/purchase/payments` | จ่ายเงิน Supplier | [daily-transactions-purchase-payments.md](daily-transactions-purchase-payments.md) | [[Payment Flow]] |
| `/purchase/receipt-vouchers` | ใบสำคัญรับเงิน | [daily-transactions-purchase-receipt-vouchers.md](daily-transactions-purchase-receipt-vouchers.md) | [[Receipt Voucher Page Flow]], [[Printable Documents]], [[Payment Flow]] |
| `/sales/receipts` | รับเงิน Customer | [daily-transactions-sales-receipts.md](daily-transactions-sales-receipts.md) | [[Sales Flow]], [[Payment Flow]] |
| `/daily/weight-ticket-dashboard` | Dashboard ใบรับ-ส่งของ | [daily-transactions-daily-weight-ticket-dashboard.md](daily-transactions-daily-weight-ticket-dashboard.md) | [[WTI-WTO Flow]] |
| `/daily/weight-ticket-list` | รายการใบรับ-ส่งของ | [daily-transactions-daily-weight-ticket-list.md](daily-transactions-daily-weight-ticket-list.md) | [[WTI-WTO Flow]] |
| `/daily/transfer` | โอนเงินระหว่างบัญชี | [daily-transactions-daily-transfer.md](daily-transactions-daily-transfer.md) | [[Daily Cash Flow]] |
| `/daily/expense` | ค่าใช้จ่าย | [daily-transactions-daily-expense.md](daily-transactions-daily-expense.md) | [[Daily Cash Flow]] |
| `/daily/expense-dashboard` | Dashboard ค่าใช้จ่าย | [daily-transactions-daily-expense-dashboard.md](daily-transactions-daily-expense-dashboard.md) | [[Expense Dashboard Flow]] |
| `/purchase/po-buy` | PO Buy | [daily-transactions-purchase-po-buy.md](daily-transactions-purchase-po-buy.md) | [[PO Buy Page Flow]], [[Purchase Flow]] |
| `/sales/po-sell` | PO Sell | [daily-transactions-sales-po-sell.md](daily-transactions-sales-po-sell.md) | [[PO Sell Flow]], [[Sales Flow]] |
| `/daily/design-mockup` | Design Mockup | [daily-transactions-daily-design-mockup.md](daily-transactions-daily-design-mockup.md) | [[Architecture Map]] |
| `/production/orders` | ใบสั่งผลิต | [production-production-orders.md](production-production-orders.md) | [[Production Flow]] |
| `/production/report` | รายงานการผลิต / Yield | [production-production-report.md](production-production-report.md) | [[Production Flow]] |
| `/dual-costing/cost-pool` | Cost Pool | [dual-costing-dual-costing-cost-pool.md](dual-costing-dual-costing-cost-pool.md) | [[Dual Costing Flow]], [[Cost Pool]] |
| `/dual-costing/cost-allocator` | Cost Allocator | [dual-costing-dual-costing-cost-allocator.md](dual-costing-dual-costing-cost-allocator.md) | [[Dual Costing Flow]], [[Cost Pool]], [[PO Sell Flow]] |
| `/dual-costing/waiting-allocations` | Waiting Allocations | [dual-costing-dual-costing-waiting-allocations.md](dual-costing-dual-costing-waiting-allocations.md) | [[Dual Costing Flow]], [[Cost Pool]] |
| `/dual-costing/cost-allocation-ledger` | Allocation Ledger | [dual-costing-dual-costing-cost-allocation-ledger.md](dual-costing-dual-costing-cost-allocation-ledger.md) | [[Dual Costing Flow]], [[Cost Pool]] |
| `/dual-costing/report` | Dual Costing Report | [dual-costing-dual-costing-report.md](dual-costing-dual-costing-report.md) | [[Dual Costing Flow]], [[Cost Pool]] |
| `/dual-costing/match-log` | Match Log | [dual-costing-dual-costing-match-log.md](dual-costing-dual-costing-match-log.md) | [[Dual Costing Flow]], [[Cost Pool]], [[PO Sell Flow]] |
| `/dual-costing/deal-margin` | Deal Margin Report | [dual-costing-dual-costing-deal-margin.md](dual-costing-dual-costing-deal-margin.md) | [[Dual Costing Flow]], [[Cost Pool]] |
| `/dual-costing/compare-margin` | Compare Deal vs Stock | [dual-costing-dual-costing-compare-margin.md](dual-costing-dual-costing-compare-margin.md) | [[Dual Costing Flow]], [[Cost Pool]] |
| `/daily/petty-advance` | เงินสำรองจ่าย / กู้กรรมการ | [finance-debt-daily-petty-advance.md](finance-debt-daily-petty-advance.md) | [[Petty Advance Page Flow]] |
| `/finance/ar` | ลูกหนี้ (AR) | [finance-debt-finance-ar.md](finance-debt-finance-ar.md) | [[Finance AR Page Flow]] |
| `/finance/ap` | เจ้าหนี้ (AP) | [finance-debt-finance-ap.md](finance-debt-finance-ap.md) | [[Finance AP Page Flow]] |
| `/finance/bank` | Cash / Bank Statement | [finance-debt-finance-bank.md](finance-debt-finance-bank.md) | [[Finance Bank Statement Page Flow]] |
| `/finance/cash-position` | Cash Position | [finance-debt-finance-cash-position.md](finance-debt-finance-cash-position.md) | [[Finance Cash Position Page Flow]] |
| `/purchase/advance-payments?tab=customer` | รับล่วงหน้า Customer | [finance-debt-finance-customer-advance.md](finance-debt-finance-customer-advance.md) | [[Customer Advance Page Flow]] |
| `/stock/transfer` | โอนสินค้าระหว่างสาขา | [stock-stock-transfer.md](stock-stock-transfer.md) | [[Stock Transfer Page Flow]], [[Stock Ledger and Stock Balance]] |
| `/stock/balance` | สต๊อกคงเหลือ | [stock-stock-balance.md](stock-stock-balance.md) | [[Stock Balance Page Flow]], [[Stock Ledger and Stock Balance]] |
| `/stock/ledger` | Stock Ledger | [stock-stock-ledger.md](stock-stock-ledger.md) | [[Stock Ledger Page Flow]], [[Stock Ledger and Stock Balance]] |
| `/stock/status-convert` | ปรับสถานะสินค้า | [stock-stock-status-convert.md](stock-stock-status-convert.md) | [[Stock Status Convert Page Flow]] |
| `/stock/convert` | Grade Adjustment / ปรับเกรด | [stock-stock-convert.md](stock-stock-convert.md) | [[Stock Convert Page Flow]] |
| `/stock/adjust` | นับสต๊อก / Stock Count Adjust | [stock-stock-adjust.md](stock-stock-adjust.md) | [[Stock Adjust Page Flow]] |
| `/trading/dashboard` | Trading Dashboard | [trading-po-reports-trading-dashboard.md](trading-po-reports-trading-dashboard.md) | [[Trading Flow]] |
| `/trading/matching` | Trading Matching | [trading-po-reports-trading-matching.md](trading-po-reports-trading-matching.md) | [[Trading Flow]] |
| `/po-reports/outstanding` | PO ซื้อ/ขาย คงเหลือ | [trading-po-reports-po-reports-outstanding.md](trading-po-reports-po-reports-outstanding.md) | [[Trading Flow]], [[Purchase Flow]], [[PO Sell Flow]] |
| `/reports` | รายงานทั้งหมด | [reports-reports.md](reports-reports.md) | [[Main Dashboard Reports Flow]] |
| `/finance-accounting/financial-dashboard` | Financial Dashboard | [finance-accounting-finance-accounting-financial-dashboard.md](finance-accounting-finance-accounting-financial-dashboard.md) | [[Finance Accounting Flow]] |
| `/finance-accounting/cash-flow-analysis` | Cash Flow Analysis | [finance-accounting-finance-accounting-cash-flow-analysis.md](finance-accounting-finance-accounting-cash-flow-analysis.md) | [[Finance Accounting Flow]] |
| `/finance-accounting/cf-forecast-calendar` | CF Forecast Calendar | [finance-accounting-finance-accounting-cf-forecast-calendar.md](finance-accounting-finance-accounting-cf-forecast-calendar.md) | [[Finance Accounting Flow]] |
| `/finance-accounting/working-capital` | Working Capital Analysis | [finance-accounting-finance-accounting-working-capital.md](finance-accounting-finance-accounting-working-capital.md) | [[Finance Accounting Flow]] |
| `/finance-accounting/stock-finance` | Stock Finance Analysis | [finance-accounting-finance-accounting-stock-finance.md](finance-accounting-finance-accounting-stock-finance.md) | [[Finance Accounting Flow]] |
| `/finance-accounting/profit-leak` | Profit Leak Dashboard | [finance-accounting-finance-accounting-profit-leak.md](finance-accounting-finance-accounting-profit-leak.md) | [[Finance Accounting Flow]] |
| `/finance-accounting/tax-vat-wht` | Tax / VAT / WHT | [finance-accounting-finance-accounting-tax-vat-wht.md](finance-accounting-finance-accounting-tax-vat-wht.md) | [[Finance Accounting Flow]] |
| `/finance-accounting/pl-statement` | งบกำไรขาดทุน | [finance-accounting-finance-accounting-pl-statement.md](finance-accounting-finance-accounting-pl-statement.md) | [[Finance Accounting Flow]] |
| `/finance-accounting/balance-sheet` | งบดุล | [finance-accounting-finance-accounting-balance-sheet.md](finance-accounting-finance-accounting-balance-sheet.md) | [[Finance Accounting Flow]] |
| `/finance-accounting/cash-flow-statement` | งบกระแสเงินสด | [finance-accounting-finance-accounting-cash-flow-statement.md](finance-accounting-finance-accounting-cash-flow-statement.md) | [[Finance Accounting Flow]] |
| `/finance-accounting/gl-journals/[journalNo]` | GL Journal Detail | [finance-accounting-finance-accounting-gl-journal-detail.md](finance-accounting-finance-accounting-gl-journal-detail.md) | [[Finance Accounting Flow]], `docs/migration/23-finance-accounting-fa5-hardening-contract.md` |
| `/finance-accounting/asset-register` | Fixed Assets | [finance-accounting-finance-accounting-asset-register.md](finance-accounting-finance-accounting-asset-register.md) | [[Finance Accounting Flow]] |
| `/finance-accounting/depreciation` | ค่าเสื่อมราคา | [finance-accounting-finance-accounting-depreciation.md](finance-accounting-finance-accounting-depreciation.md) | [[Finance Accounting Flow]] |
| `/finance-accounting/asset-disposal` | จำหน่ายทรัพย์สิน | [finance-accounting-finance-accounting-asset-disposal.md](finance-accounting-finance-accounting-asset-disposal.md) | [[Finance Accounting Flow]] |
| `/finance-accounting/loan-contracts` | Loan / Leasing / BSL | [finance-accounting-finance-accounting-loan-contracts.md](finance-accounting-finance-accounting-loan-contracts.md) | [[Finance Accounting Flow]] |
| `/finance-accounting/loan-dashboard` | Loan Dashboard | [finance-accounting-finance-accounting-loan-dashboard.md](finance-accounting-finance-accounting-loan-dashboard.md) | [[Finance Accounting Flow]] |
| `/finance-accounting/asset-overview` | Net Worth / Track Asset | [finance-accounting-finance-accounting-asset-overview.md](finance-accounting-finance-accounting-asset-overview.md) | [[Finance Accounting Flow]] |
| `/finance-accounting/equity-maint` | Equity / ทุนจดทะเบียน | [finance-accounting-finance-accounting-equity-maint.md](finance-accounting-finance-accounting-equity-maint.md) | [[Finance Accounting Flow]] |
| `/finance-accounting/opening-balance` | Opening Balance | [finance-accounting-finance-accounting-opening-balance.md](finance-accounting-finance-accounting-opening-balance.md) | [[Finance Accounting Flow]] |
| `/finance-accounting/accounting-periods` | Accounting Periods | [finance-accounting-finance-accounting-accounting-periods.md](finance-accounting-finance-accounting-accounting-periods.md) | [[Finance Accounting Flow]], `docs/migration/23-finance-accounting-fa5-hardening-contract.md` |
| `/finance-accounting/posting-rules` | Posting Rules | [finance-accounting-finance-accounting-posting-rules.md](finance-accounting-finance-accounting-posting-rules.md) | [[Finance Accounting Flow]], `docs/migration/23-finance-accounting-fa5-hardening-contract.md` |
| `/finance-accounting/historical-data` | Historical Data | [finance-accounting-finance-accounting-historical-data.md](finance-accounting-finance-accounting-historical-data.md) | [[Finance Accounting Flow]] |
| `/master-data/customers` | ลูกค้า | [master-data-master-data-customers.md](master-data-master-data-customers.md) | This catalog |
| `/master-data/salespersons` | พนักงานขาย | [master-data-master-data-salespersons.md](master-data-master-data-salespersons.md) | This catalog |
| `/master-data/suppliers` | ผู้ขาย | [master-data-master-data-suppliers.md](master-data-master-data-suppliers.md) | This catalog |
| `/master-data/products` | สินค้า | [master-data-master-data-products.md](master-data-master-data-products.md) | This catalog |
| `/master-data/product-types` | ประเภทสินค้า | [master-data-master-data-product-types.md](master-data-master-data-product-types.md) | This catalog |
| `/master-data/product-units` | หน่วยสินค้า | [master-data-master-data-product-units.md](master-data-master-data-product-units.md) | This catalog |
| `/master-data/impurities` | รายการสิ่งเจือปน | [master-data-master-data-impurities.md](master-data-master-data-impurities.md) | [[WTI-WTO Flow]] |
| `/master-data/branches` | สาขา | [master-data-master-data-branches.md](master-data-master-data-branches.md) | This catalog |
| `/master-data/warehouses` | คลัง | [master-data-master-data-warehouses.md](master-data-master-data-warehouses.md) | This catalog |
| `/master-data/accounts` | บัญชีเงินบริษัท | [master-data-master-data-accounts.md](master-data-master-data-accounts.md) | [[Daily Cash Flow]] |
| `/master-data/payment-methods` | วิธีจ่าย/รับเงิน | [master-data-master-data-payment-methods.md](master-data-master-data-payment-methods.md) | [[Payment Flow]] |
| `/master-data/account-subtypes` | ประเภทบัญชีธนาคาร | [master-data-master-data-account-subtypes.md](master-data-master-data-account-subtypes.md) | This catalog |
| `/master-data/bank-names` | ชื่อธนาคาร | [master-data-master-data-bank-names.md](master-data-master-data-bank-names.md) | This catalog |
| `/master-data/channels` | ช่องทางขาย | [master-data-master-data-channels.md](master-data-master-data-channels.md) | [[Sales Flow]] |
| `/master-data/expense-categories` | หมวดค่าใช้จ่าย | [master-data-master-data-expense-categories.md](master-data-master-data-expense-categories.md) | [[Daily Cash Flow]] |
| `/master-data/expense-types` | ประเภทค่าใช้จ่าย | [master-data-master-data-expense-types.md](master-data-master-data-expense-types.md) | [[Daily Cash Flow]] |
| `/master-data/directors` | พนักงาน / กรรมการ | [master-data-master-data-directors.md](master-data-master-data-directors.md) | [[Petty Advance Page Flow]] |
| `/master-data/machines` | เครื่องจักร | [master-data-master-data-machines.md](master-data-master-data-machines.md) | [[Production Flow]] |
| `/master-data/machine-types` | ประเภทเครื่องจักร | [master-data-master-data-machine-types.md](master-data-master-data-machine-types.md) | [[Production Flow]] |
| `/master-data/production-lines` | Production Line | [master-data-master-data-production-lines.md](master-data-master-data-production-lines.md) | [[Production Flow]] |
| `/master-data/currencies` | สกุลเงิน | [master-data-master-data-currencies.md](master-data-master-data-currencies.md) | This catalog |
| `/master-data/beneficiaries` | ผู้รับเงินต่างประเทศ | [master-data-master-data-beneficiaries.md](master-data-master-data-beneficiaries.md) | This catalog |
| `/master-data/remittance-purposes` | วัตถุประสงค์โอน | [master-data-master-data-remittance-purposes.md](master-data-master-data-remittance-purposes.md) | This catalog |
| `/admin/system-settings` | ตั้งค่าระบบ | [admin-system-admin-system-settings.md](admin-system-admin-system-settings.md) | This catalog |
| `/admin/company-profile` | ข้อมูลบริษัท | [admin-system-admin-company-profile.md](admin-system-admin-company-profile.md) | [[Printable Documents]] |
| `/admin/transaction-ledger` | Transaction Ledger | [admin-system-admin-transaction-ledger.md](admin-system-admin-transaction-ledger.md) | [[Daily Cash Flow]], [[Payment Flow]] |
| `/admin/migration-tools` | Backup / Restore | [admin-system-admin-migration-tools.md](admin-system-admin-migration-tools.md) | This catalog |
| `/admin/audit` | Audit & Activity Log | [admin-system-admin-audit.md](admin-system-admin-audit.md) | [[Document History Table Design]] |
| `/admin/users-permissions` | Users & Permissions | [admin-system-admin-users-permissions.md](admin-system-admin-users-permissions.md) | This catalog |
