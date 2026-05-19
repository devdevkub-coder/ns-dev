# 18 Next System Sitemap

## Purpose

This document is the route, page, API, and permission baseline for the active Next.js app under `apps/next/`.

Use it before every new module batch:

- update this file when a navigation route, page, or API route is added or changed
- keep `docs/api/openapi.yaml` in the same batch when an API contract changes
- do not count catch-all placeholder pages as completed module pages

## Baseline

Date: 2026-05-19

Sources:

- Navigation: `apps/next/src/lib/navigation.ts`
- Pages: `apps/next/src/app/**/page.tsx`
- APIs: `apps/next/src/app/api/**/route.ts`
- Permission mapping: `permissionForPath()` in `apps/next/src/lib/navigation.ts`

Status terms:

- `done`: real page/API baseline exists for the current migration phase
- `read baseline`: DB-connected read surface exists, write flow is deferred
- `in progress`: docs/API contract or implementation work has started, but the runtime route is not validated yet
- `partial write`: at least one write flow exists, but full business side effects are not complete
- `placeholder`: route resolves through `[...slug]` scaffold only
- `missing`: no real page/API or no known mapping
- `deferred`: intentionally postponed until a later module batch

## Route Coverage Summary

| Area | Navigation routes | Real pages | Placeholder routes | API coverage |
|---|---:|---:|---:|---|
| Main | 11 | 11 | 0 | all 11 read/read-design APIs |
| Tracking | 3 | 1 | 2 | supplier only |
| Daily | 13 | 13 | 0 | partial |
| Production | 8 | 8 | 0 | read baseline plus output category write |
| Dual Costing | 7 | 1 | 6 | PO buy only |
| Finance and Debt | 6 | 1 | 5 | AP only |
| Foreign Finance | 6 | 6 | 0 | fx-rate, intl-transfer, overseas-receipt, fcd-ledger, fx-gain-loss, bank-reconciliation |
| Stock | 6 | 6 | 0 | balance, ledger, status convert, grade convert, adjust, customer return |
| Trading | 2 | 1 | 1 | matching only |
| PO Reports | 1 | 1 | 0 | outstanding only |
| Reports | 1 | 0 | 1 | none |
| Finance / Accounting | 18 | 18 | 0 | financial-dashboard, cash-flow-analysis, cf-forecast-calendar, working-capital, stock-finance, profit-leak, tax-vat-wht, pl-statement, balance-sheet, cash-flow-statement, asset-register, depreciation, asset-disposal, loan-contracts, loan-dashboard, equity-maint, opening-balance, historical-data |
| Master Data | 18 | 18 | 0 | broad master-data coverage |
| Admin | 6 | 4 | 2 | company, users, audit, transaction ledger |

## Route Inventory

### Main

| Route | Label | Page status | APIs | Primary tables | Permission |
|---|---|---|---|---|---|
| `/owner-daily` | Owner Daily Control | read baseline | `GET /api/owner-daily` | `accounts`, `bank_statement`, `sales_bills`, `purchase_bills`, `expenses`, `receipts`, `payments`, `stock_ledger`, `trading_deals`, `production_orders` | `reports.reports.view` |
| `/anomaly-detector` | ตรวจจับความผิดปกติ | read baseline | `GET /api/anomaly-detector` | `accounts`, `bank_statement`, `stock_ledger`, `sales_bills`, `purchase_bills`, `customers`, `suppliers`, `trading_deals` | `reports.reports.view` |
| `/daily-report` | Daily Report | read baseline | `GET /api/daily-report` | `purchase_bills`, `sales_bills`, `expenses`, `receipts`, `payments`, `bank_statement`, `products` | `reports.reports.view` |
| `/dashboard` | Dashboard | read baseline | `GET /api/dashboard` | `purchase_bills`, `sales_bills`, `expenses`, `accounts`, `bank_statement`, `stock_ledger`, `production_orders`, `trading_deals` | `reports.reports.view` |
| `/profit-cost-analysis` | Profit & Cost Analysis | read baseline | `GET /api/profit-cost-analysis` | `purchase_bills`, `sales_bills`, `stock_ledger`, `products`, `suppliers`, `customers`, `branches`, `purchase_channels`, `sales_channels` | `reports.reports.view` |
| `/pending-sales` | รายการรอขาย | read/design baseline | `GET /api/pending-sales` | `po_sells`, `po_buys`, `purchase_bills`, `trading_deals`, `stock_ledger`, `products`, `customers` | `reports.reports.view` |
| `/sales-plan` | วางแผนการขาย (LME) | read/design baseline | `GET /api/sales-plan` | `stock_ledger`, `products`, derived pending sales/LME reference | `reports.reports.view` |
| `/sales-commission` | Sales Tracking Dashboard | read/design baseline | `GET /api/sales-commission` | `purchase_bills`, `suppliers`, `salespersons` | `reports.reports.view` |
| `/cash-flow-calendar` | Cash Flow Calendar | read/design baseline | `GET /api/cash-flow-calendar` | `accounts`, `bank_statement` | `reports.reports.view` |
| `/business-calendar` | Business Calendar | read/design baseline | `GET /api/business-calendar` | `purchase_bills`, `sales_bills`, `expenses`, `receipts`, `payments` | `reports.reports.view` |
| `/cash-others-summary` | Cash & Others Summary | read/design baseline | `GET /api/cash-others-summary` | `accounts`, `bank_statement`, `sales_bills`, `purchase_bills`, `stock_ledger`, `stock_issues`, `trading_deals`, `expenses` | `reports.reports.view` |

### Tracking

| Route | Label | Page status | APIs | Primary tables | Permission |
|---|---|---|---|---|---|
| `/tracking/customer` | Customer Tracking | read baseline | `GET /api/tracking/customer` | `customers`, `sales_bills`, `receipts` | `reports.reports.view` |
| `/tracking/supplier` | Supplier Tracking | read baseline | `GET /api/tracking/supplier` | `suppliers`, `purchase_bills`, `payments` | `reports.reports.view` |
| `/tracking/product` | Product Tracking | read baseline | `GET /api/tracking/product` | `products`, `purchase_bills.items`, `sales_bills.items`, `stock_ledger` | `reports.reports.view` |

### Daily

| Route | Label | Page status | APIs | Primary tables | Permission |
|---|---|---|---|---|---|
| `/purchase/bills` | บิลรับซื้อ | partial write | `GET/POST/PATCH /api/purchase/bills` | `purchase_bills`, `suppliers`, `products`, `stock_ledger` | `finance.cash.view` |
| `/purchase/bills/[id]` | Purchase bill detail/edit | partial write | `PATCH /api/purchase/bills` | `purchase_bills`, `stock_ledger` | `finance.cash.view` |
| `/sales/bills` | บิลขาย | read baseline | `GET /api/sales/bills` | `sales_bills`, `customers` | `finance.cash.view` |
| `/sales/stock-issue` | เบิกออกรอบิล | read baseline | `GET /api/sales/stock-issue` | `stock_issues` | `finance.cash.view` |
| `/daily/payment-approval` | อนุมัติโอนเงิน | read baseline | `GET /api/daily/payment-approval` | payments/approval source TBD | `finance.cash.view` |
| `/purchase/payments` | จ่ายเงิน Supplier | partial write | `GET/POST /api/purchase/payments` | `payments`, `purchase_bills`, `accounts` | `finance.cash.view` |
| `/purchase/receipt-vouchers` | ใบสำคัญรับเงิน | read baseline | `GET /api/purchase/receipt-vouchers` | `receipt_vouchers` | `finance.cash.view` |
| `/sales/receipts` | รับเงิน Customer | partial write | `GET/POST /api/sales/receipts` | `receipts`, `sales_bills`, `accounts` | `finance.cash.view` |
| `/daily/transfer` | โอนเงินระหว่างบัญชี | partial write | `GET/POST /api/daily/transfers` | `bank_statement`, `accounts` | `finance.cash.view` |
| `/daily/expense` | ค่าใช้จ่าย | partial write | `GET/POST /api/daily/expenses` | `expenses`, `bank_statement` | `finance.cash.view` |
| `/daily/petty-advance` | เงินสำรองจ่าย / กู้กรรมการ | partial write | `GET/POST /api/daily/petty-advances`, `POST /api/daily/petty-advances/returns` | `petty_advances`, `bank_statement` | `finance.cash.view` |
| `/daily/expense-dashboard` | Dashboard ค่าใช้จ่าย | done | uses expense/daily data internally | `expenses` | `finance.cash.view` |
| `/stock/transfer` | โอนสินค้าระหว่างสาขา | partial write | `GET/POST /api/stock/transfer` | `stock_ledger` | `stock.ledger.view` |
| `/daily/bill-swap-history` | ประวัติเปลี่ยน Supplier ในบิล | read baseline | `GET /api/daily/bill-swap-history` | `bill_swap_history` | `finance.cash.view` |

### Production

| Route | Label | Page status | APIs | Primary tables | Permission |
|---|---|---|---|---|---|
| `/production/orders` | ใบสั่งผลิต | read baseline | `GET /api/production/orders` | `production_orders` | `production.operations.view` |
| `/production/output-categories` | หมวดหมู่ผลผลิต | partial write | `GET/POST /api/production/output-categories`, `PATCH /api/production/output-categories/{id}` | `production_output_categories` | `production.operations.view` |
| `/production/dashboard` | Production Dashboard | read baseline | `GET /api/production/dashboard` | production aggregate tables | `production.operations.view` |
| `/production/wip-report` | WIP คงเหลือ | read baseline | `GET /api/production/wip-report` | `production_inputs`, `production_outputs`, `stock_ledger` | `production.operations.view` |
| `/production/report` | รายงานการผลิต / Yield | read baseline | `GET /api/production/report` | production aggregate tables | `production.operations.view` |
| `/production/production-cost-report` | Production Cost Report | read baseline | `GET /api/production/production-cost-report` | `process_costs`, production tables | `production.operations.view` |
| `/production/yield-loss-report` | Yield/Loss + Abnormal | read baseline | `GET /api/production/yield-loss-report` | production aggregate tables | `production.operations.view` |
| `/production/machine-utilization` | Machine Utilization | read baseline | `GET /api/production/machine-utilization` | `production_machines`, production tables | `production.operations.view` |

### Dual Costing

| Route | Label | Page status | APIs | Primary tables | Permission |
|---|---|---|---|---|---|
| `/purchase/po-buy` | PO Buy | read baseline / polished | `GET /api/purchase/po-buy` | `po_buys`, `suppliers`, `products` | `finance.cash.view` |
| `/sales/po-sell` | PO Sell | read baseline | `GET /api/sales/po-sell` | `po_sells`, `customers`, `sales_channels`, `branches`, `products`, `trading_deals` / match data | `finance.cash.view` |
| `/dual-costing/cost-pool` | Cost Pool | read-derived baseline | `GET /api/dual-costing/cost-pool` | `po_buys`, `purchase_bills`, `production_outputs`, `grade_adjustments`, `trading_deals`, `products`, `branches` | `finance.cash.view` |
| `/dual-costing/cost-allocator` | Cost Allocator | read-only simulation baseline | `GET /api/dual-costing/cost-allocator` | `po_sells`, `sales_bills`, `trading_deals`, derived Cost Pool rows | `finance.cash.view` |
| `/dual-costing/match-log` | Match Log | read baseline | `GET /api/dual-costing/match-log` | `trading_deals`, `purchase_bills`, `sales_bills`, `products`, party lookups | `finance.cash.view` |
| `/dual-costing/deal-margin` | Deal Margin Report | read baseline | `GET /api/dual-costing/deal-margin` | `trading_deals`, `products`, `customers`, `sales_bills` | `finance.cash.view` |
| `/dual-costing/compare-margin` | Compare Deal vs Stock | read baseline | `GET /api/dual-costing/compare-margin` | `trading_deals`, `sales_bills` | `finance.cash.view` |

### Finance And Debt

| Route | Label | Page status | APIs | Primary tables | Permission |
|---|---|---|---|---|---|
| `/finance/ar` | ลูกหนี้ (AR) | read baseline | `GET /api/finance/ar` | `sales_bills`, `receipts`, `customers`, `branches` | `finance.cash.view` |
| `/finance/ap` | เจ้าหนี้ (AP) | read baseline | `GET /api/finance/ap` | `purchase_bills`, `payments` | `finance.cash.view` |
| `/finance/bank` | Cash / Bank Statement | read baseline | `GET /api/finance/bank` | `bank_statement`, `accounts` | `finance.cash.view` |
| `/finance/cash-position` | Cash Position | read baseline | `GET /api/finance/cash-position` | `accounts`, `bank_statement`, `sales_bills`, `purchase_bills` | `finance.cash.view` |
| `/finance/supplier-advance` | จ่ายล่วงหน้า Supplier | read baseline | `GET /api/finance/supplier-advance` | `bank_statement` (`SADV`), `suppliers`, `accounts` | `finance.cash.view` |
| `/finance/customer-advance` | รับล่วงหน้าจาก Customer | read baseline | `GET /api/finance/customer-advance` | `bank_statement` (`CADV`), `customers`, `accounts` | `finance.cash.view` |

### Foreign Finance

| Route | Label | Page status | APIs | Primary tables | Permission |
|---|---|---|---|---|---|
| `/finance/foreign/intl-transfer` | โอนเงินต่างประเทศ | read/form baseline | `GET /api/finance/foreign/intl-transfer` | `accounts`, `overseas_recipients`, `overseas_remittance_purposes`, `fx_rates`, `bank_statement` (`ITF`) | `finance.cash.view` |
| `/finance/foreign/overseas-receipt` | รับเงินจากต่างประเทศ | read/form baseline | `GET /api/finance/foreign/overseas-receipt` | `customers`, `accounts`, `sales_bills`, `fx_rates`, `bank_statement` (`ORC`/`ORC-FEE`) | `finance.cash.view` |
| `/finance/foreign/fx-rate` | FX Rate Management | manage baseline | `GET/POST/PATCH /api/finance/foreign/fx-rate` | `fx_rates`, `currencies` | `finance.cash.view` |
| `/finance/foreign/fcd-ledger` | FCD Ledger | read baseline | `GET /api/finance/foreign/fcd-ledger` | `accounts`, `bank_statement`, `fx_rates` | `finance.cash.view` |
| `/finance/foreign/fx-gain-loss-report` | FX Gain/Loss Report | read baseline | `GET /api/finance/foreign/fx-gain-loss-report` | `fx_gain_loss`, `bank_statement` | `finance.cash.view` |
| `/finance/foreign/bank-reconciliation` | Bank Reconciliation | read/design baseline | `GET /api/finance/foreign/bank-reconciliation` | `accounts`, `bank_statement` | `finance.cash.view` |

### Stock

| Route | Label | Page status | APIs | Primary tables | Permission |
|---|---|---|---|---|---|
| `/stock/balance` | สต๊อกคงเหลือ | read baseline | `GET /api/stock/balance` | `stock_ledger`, `products`, `branches`, `warehouses` | `stock.ledger.view` |
| `/stock/ledger` | Stock Ledger | read baseline | `GET /api/stock/ledger` | `stock_ledger` | `stock.ledger.view` |
| `/stock/status-convert` | ปรับสถานะสินค้า | partial write | `GET/POST /api/stock/status-convert` | `stock_ledger` | `stock.ledger.view` |
| `/stock/convert` | Grade Adjustment | partial write | `GET/POST /api/stock/convert` | `stock_ledger`, `grade_adjustments` | `stock.ledger.view` |
| `/stock/adjust` | นับสต๊อก / Stock Count Adjust | partial write | `GET/POST /api/stock/adjust` | `stock_ledger`, `stock_adjustments` | `stock.ledger.view` |
| `/stock/customer-return` | Customer Return / ของคืน | partial write | `GET/POST /api/stock/customer-return` | `stock_ledger` | `stock.ledger.view` |

### Trading And PO Reports

| Route | Label | Page status | APIs | Primary tables | Permission |
|---|---|---|---|---|---|
| `/trading/dashboard` | Trading Dashboard | read baseline | `GET /api/trading/dashboard` | `trading_deals`, `customers`, `suppliers`, `products` | `finance.cash.view` |
| `/trading/matching` | Trading Matching | read baseline | `GET /api/trading/matching` | `purchase_bills`, `sales_bills`, `trading_deals` | `finance.cash.view` |
| `/po-reports/outstanding` | PO ซื้อ/ขาย คงเหลือ | read baseline | `GET /api/po-reports/outstanding` | `po_buys`, `po_sells` | `reports.reports.view` |

### Reports

| Route | Label | Page status | APIs | Primary tables | Permission |
|---|---|---|---|---|---|
| `/reports` | รายงานทั้งหมด | placeholder | missing | TBD | `reports.reports.view` |

### Finance / Accounting

| Route | Label | Page status | APIs | Primary tables | Permission |
|---|---|---|---|---|---|
| `/finance-accounting/financial-dashboard` | Financial Dashboard | read baseline | `GET /api/finance-accounting/financial-dashboard` | `sales_bills`, `purchase_bills`, `expenses`, `stock_ledger`, `accounts`, `bank_statement`, `assets`, `loans`, `loan_schedules` | `finance.financials.view` |
| `/finance-accounting/cash-flow-analysis` | Cash Flow Analysis | read baseline | `GET /api/finance-accounting/cash-flow-analysis` | `accounts`, `bank_statement`, `sales_bills`, `purchase_bills`, `receipts`, `payments`, `expenses`, `stock_ledger`, `loan_payments` | `finance.financials.view` |
| `/finance-accounting/cf-forecast-calendar` | CF Forecast Calendar | read baseline | `GET /api/finance-accounting/cf-forecast-calendar` | `accounts`, `sales_bills`, `purchase_bills`, `expenses`, `loan_schedules`, `tax-vat-wht derived` | `finance.financials.view` |
| `/finance-accounting/working-capital` | Working Capital Analysis | read baseline | `GET /api/finance-accounting/working-capital` | `sales_bills`, `purchase_bills`, `stock_ledger`, `accounts`, `bank_statement`, `loan_schedules` | `finance.financials.view` |
| `/finance-accounting/stock-finance` | Stock Finance Analysis | read baseline | `GET /api/finance-accounting/stock-finance` | `stock_ledger`, `products`, `branches`, `warehouses` | `finance.financials.view` |
| `/finance-accounting/profit-leak` | Profit Leak Dashboard | read baseline | `GET /api/finance-accounting/profit-leak` | `sales_bills`, `purchase_bills`, `expenses`, `loan_payments`, `stock_ledger`, `production_outputs`, `fx_gain_loss`, `payments`, `receipts` | `finance.financials.view` |
| `/finance-accounting/tax-vat-wht` | Tax / VAT / WHT | read/design baseline | `GET /api/finance-accounting/tax-vat-wht` | `sales_bills`, `purchase_bills`, `expenses`, `payments`, `receipts` | `finance.financials.view` |
| `/finance-accounting/pl-statement` | งบกำไรขาดทุน (P&L) | management/read baseline | `GET /api/finance-accounting/pl-statement` | `sales_bills`, `expenses`, `depreciations`, `loan_payments`, `fx_gain_loss` | `finance.financials.view` |
| `/finance-accounting/balance-sheet` | งบดุล | management/read baseline | `GET /api/finance-accounting/balance-sheet` | `accounts`, `bank_statement`, `sales_bills`, `purchase_bills`, `stock_ledger`, `assets`, `loans`, `equity` | `finance.financials.view` |
| `/finance-accounting/cash-flow-statement` | งบกระแสเงินสด | management/read baseline | `GET /api/finance-accounting/cash-flow-statement` | `bank_statement`, `accounts` | `finance.financials.view` |
| `/finance-accounting/asset-register` | Fixed Assets / ทรัพย์สิน | read baseline | `GET /api/finance-accounting/asset-register` | `assets`, `depreciations`, `branches`, `suppliers` | `finance.financials.view` |
| `/finance-accounting/depreciation` | ค่าเสื่อมราคา | read/design baseline | `GET /api/finance-accounting/depreciation` | `assets`, `depreciations` | `finance.financials.view` |
| `/finance-accounting/asset-disposal` | จำหน่ายทรัพย์สิน | read/design baseline | `GET /api/finance-accounting/asset-disposal` | `assets`, `depreciations`; disposal table missing | `finance.financials.view` |
| `/finance-accounting/loan-contracts` | Loan / Leasing / BSL | read/design baseline | `GET /api/finance-accounting/loan-contracts` | `loans`, `loan_schedules`, `loan_payments` | `finance.financials.view` |
| `/finance-accounting/loan-dashboard` | Loan Dashboard | read baseline | `GET /api/finance-accounting/loan-dashboard` | `loans`, `loan_schedules`, `loan_payments` | `finance.financials.view` |
| `/finance-accounting/equity-maint` | Equity / ทุนจดทะเบียน | read/design baseline | `GET /api/finance-accounting/equity-maint` | `equity` | `finance.financials.view` |
| `/finance-accounting/opening-balance` | Opening Balance / ตั้งต้นยอด | read/design baseline | `GET /api/finance-accounting/opening-balance` | `opening_balance`, `accounts`, `branches` | `finance.financials.view` |
| `/finance-accounting/historical-data` | ข้อมูลย้อนหลัง ม.ค.-เม.ย. 2026 | read/design baseline | `GET /api/finance-accounting/historical-data` | `historical_monthly` | `finance.financials.view` |

### Master Data

| Route | Label | Page status | APIs | Primary tables | Permission |
|---|---|---|---|---|---|
| `/master-data/customers` | ลูกค้า | done | `GET/POST /api/master-data/customers`, `GET /export`, `PATCH /{id}/status` | `customers` | `master.customers.view` |
| `/master-data/salespersons` | พนักงานขาย | done | `GET/POST /api/master-data/salespersons`, `PATCH /{id}` | `salespersons` | `master.reference.view` |
| `/master-data/suppliers` | ผู้ขาย | done | `GET/POST /api/master-data/suppliers`, `GET /export`, `PATCH /{id}` | `suppliers` | `master.suppliers.view` |
| `/master-data/products` | สินค้า | done | `GET/POST /api/master-data/products`, `GET /export`, `PATCH /{id}` | `products` | `master.products.view` |
| `/master-data/product-types` | ประเภทสินค้า | done | `GET/POST /api/master-data/product-types`, `PATCH /{id}` | `product_types` | `master.reference.view` |
| `/master-data/product-units` | หน่วยสินค้า | done | `GET/POST /api/master-data/product-units`, `PATCH /{id}` | `product_units` | `master.reference.view` |
| `/master-data/branches` | สาขา / คลัง | done | `GET/POST /api/master-data/branches`, `PATCH /{id}` | `branches` | `master.reference.view` |
| `/master-data/warehouses` | Warehouses child page | done | `GET/POST /api/master-data/warehouses`, `PATCH /{id}` | `warehouses` | `master.reference.view` |
| `/master-data/accounts` | บัญชีเงิน | done | `GET/POST /api/master-data/accounts`, `PATCH /{id}` | `accounts` | `master.reference.view` |
| `/master-data/bank-names` | ชื่อธนาคาร | done | `GET/POST /api/master-data/bank-names`, `PATCH /{id}` | `bank_names` | `master.reference.view` |
| `/master-data/channels` | ช่องทางซื้อ/ขาย | done | `GET/POST /api/master-data/channels`, `PATCH /{id}` | `channels` | `master.reference.view` |
| `/master-data/expense-categories` | หมวดค่าใช้จ่าย | done | `GET/POST /api/master-data/expense-categories`, `PATCH /{id}` | `expense_categories` | `master.reference.view` |
| `/master-data/directors` | กรรมการ/พนักงาน | done | `GET/POST /api/master-data/directors`, `PATCH /{id}` | `directors` | `master.reference.view` |
| `/master-data/machines` | เครื่องจักร | done | `GET/POST /api/master-data/machines`, `PATCH /{id}` | `production_machines` | `master.reference.view` |
| `/master-data/production-lines` | Production Line | done | `GET/POST /api/master-data/production-lines`, `PATCH /{id}` | `production_lines` | `master.reference.view` |
| `/master-data/currencies` | สกุลเงิน | done | `GET/POST /api/master-data/currencies`, `PATCH /{id}` | `currencies` | `master.reference.view` |
| `/master-data/beneficiaries` | ผู้รับเงินต่างประเทศ | done | `GET/POST /api/master-data/beneficiaries`, `PATCH /{id}` | `beneficiaries` | `master.reference.view` |
| `/master-data/payment-methods` | วิธีจ่าย/รับเงิน | done | `GET/POST /api/master-data/payment-methods`, `PATCH /{id}` | `payment_methods` | `master.reference.view` |
| `/master-data/remittance-purposes` | วัตถุประสงค์โอน | done | `GET/POST /api/master-data/remittance-purposes`, `PATCH /{id}` | `remittance_purposes` | `master.reference.view` |
| `/api/master-data/thai-address` | Thai address lookup | API only | `GET /api/master-data/thai-address` | Thai address reference source | none yet |

### Admin

| Route | Label | Page status | APIs | Primary tables | Permission |
|---|---|---|---|---|---|
| `/admin/company-profile` | ข้อมูลบริษัท | done | `GET/PUT /api/admin/company-profile` | `company_profile` | `system.settings.manage` |
| `/admin/change-password` | เปลี่ยน Password ของฉัน | self-service write | Supabase Auth client `signInWithPassword` + `updateUser` | `auth.users` | authenticated self-service |
| `/admin/transaction-ledger` | Transaction Ledger | read baseline | `GET /api/admin/transaction-ledger` | transaction ledger / `bank_statement` source | `finance.cash.view` |
| `/admin/migration-tools` | Backup / Restore | read/design baseline | no API; client reads localStorage size only | browser localStorage metadata | `system.backup.manage` |
| `/admin/audit` | Audit & Activity Log | read baseline | `GET /api/admin/auth-events` | `auth_audit_events` | `system.audit.view` |
| `/admin/users-permissions` | Users & Permissions | partial write | `GET/POST /api/admin/users`, `PATCH /api/admin/users/{id}`, `PATCH /status`, `POST /invite` | `auth.users`, `app_users`, role/permission tables | `system.users.manage` |

## Page Without Navigation Item

| Page | Status | Note |
|---|---|---|
| `/login` | done | Auth entry, intentionally not in sidebar |
| `/forgot-password` | done | Supabase Auth reset request flow |
| `/reset-password` | done | Supabase Auth password update flow |
| `/sitemap` | done | Developer/checklist route, not a business module |
| `/master-data/warehouses` | done | Real page and API exist, but the current sidebar groups warehouses under `/master-data/branches` |
| `/` | done | Root app route |

## API Catalog Summary

See `docs/api/openapi.yaml` for the current API skeleton. The OpenAPI file intentionally records path, method, auth requirement, and broad response shape first; detailed schemas should be added in the same batch that hardens each module contract.

Current API groups:

- Admin: company profile, audit/auth events, transaction ledger, user management
- Auth: current user context
- Daily: payments approvals, expenses, transfers, petty advances, bill swap history
- Master Data: customers, suppliers, products, lookup masters, Thai address lookup
- Production: orders, dashboard, reports, output categories
- Purchase/Sales: purchase bills, payments, receipt vouchers, sales bills, stock issue, receipts, PO Sell
- Finance/Foreign Finance: AR, AP, bank statement, cash position, advances, FX rate management
- Stock: ledger, transfer, balance, status convert, grade convert, count adjust, customer return
- Tracking/Trading/PO Reports: supplier tracking, trading matching, PO outstanding
- Health: simple runtime health endpoint

## Gaps Before Batch S

- Stock pages now have first Next page/API baselines.
- Stock write flows are traceable through `stock_ledger`, but production-grade void/reversal, branch-scope enforcement, and cost-source/WAC policy hardening remain follow-up work.
- Main dashboard/reporting routes now have 11/11 read or read-design page/API baselines; Finance / Accounting has 18/18 read or read-design page/API baselines, and Foreign Finance has dedicated route/API baselines with money-moving writes still deferred.
- Several write flows are intentionally partial and still need side-effect reconciliation before production use.
- `/sales/po-sell` D1 read baseline is implemented; write/cancel/match allocation flows remain deferred and user-facing identifiers should use `docNo`.
