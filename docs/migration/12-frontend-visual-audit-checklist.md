# 12 Frontend Visual Audit Checklist

## Objective

ตรวจหน้า Vue ใหม่เทียบกับ archived source ทีละหน้า โดยใช้ legacy UI เป็น baseline สำหรับ wording, layout order, icon, font size, spacing, visible states และ empty-state copy ก่อนเดินต่อ Auth/Role หรือ real function wiring แบบเต็มระบบ

## Rule

- ใช้ `old-apps/legacy/index.html` เป็น reference/source material เท่านั้น
- ห้าม import, route หรือ execute `old-apps/legacy/` ใน `old-apps/vue/`
- ใช้ Playwright ช่วยจับ screenshot/DOM ของ legacy และ Vue เพื่อเทียบทุกหน้า
- ระหว่าง visual audit ให้ใช้ mock/fixture ที่ตั้งใจให้ตรงกับ legacy baseline ของหน้านั้นก่อน ห้ามใช้เลขสุ่มคนละชุด เพราะจะทำให้แยก visual mismatch ออกจาก data mismatch ได้ยาก
- แก้ทีละ batch และ update status หลังจบ batch
- หน้าใดต่อ real mutation ต้องมี minimum validation/type ก่อนต่อ function จริง
- หน้าใดมี gradient/KPI cards ต้องเช็คทั้งลำดับการ์ดและทิศ/ฝั่งสี gradient ให้ตรง legacy ไม่ใช่เช็คเฉพาะข้อความ

## Status Legend

- `Pending`: ยังไม่ได้เทียบ
- `Auditing`: กำลังเทียบ legacy vs Vue
- `Fixed`: แก้ UI/wording/layout รอบแรกแล้ว
- `Playwright Checked`: มี screenshot/DOM check หลังแก้
- `Needs Data`: ต้องรอข้อมูลจริงหรือ function wiring เพื่อเทียบ behavior ลึก

## Current Priority

Visual baseline checkpoint is accepted as sufficient for the current frontend clone pass as of 2026-05-17.

Next work should move to Auth/Role mapping and real service/function wiring. Any remaining visual mismatch should be handled as a targeted follow-up when a user reports it or when it blocks a specific function-wiring task.

Paused broad visual-review priority list:

1. Main dashboards: `dashboard`, `dailyReport`, `ownerDaily`, `anomalyDetector`
2. Daily operation pages
3. Production
4. Purchase/Sales/Stock
5. Finance/Debt/Foreign finance
6. Finance-accounting/reports/assets/loans
7. Master data
8. Admin

## Playwright Compare Plan

For each page:

1. Open legacy static app and navigate to the matching legacy view.
2. Open Vue app route.
3. Set Vue page fixture/mock values to match the visible legacy baseline for that page.
4. Capture desktop screenshot at 1440x1000.
5. Capture mobile/tablet screenshot at 390x844.
6. Extract heading/button/table labels from both pages.
7. Record mismatch list before editing.
8. Fix Vue page.
9. Re-run screenshot/DOM check and mark status.

## Fixture Policy

- `Visual fixture`: data used only to compare layout and wording with legacy screenshots.
- `Preview/mock data`: allowed only after the page layout already matches; must be clearly replaced before real function wiring.
- `Real data`: comes later from services/queries after Auth/Role and validation are ready.
- If legacy baseline is empty, Vue should also show the same empty state first. Add populated fixture only when needed to inspect table/card layout.

## Batch 1: Main Dashboards

| Order | View Key | Legacy View | Vue Route | Vue File | Status | Notes |
|---:|---|---|---|---|---|---|
| 1 | `dashboard` | `view-dashboard` | `/` | `views/DashboardView.vue` | Playwright Checked | Round 1 fixed: filter bar, hero, KPI baseline, chart row, Aging/Channel/Quick Insights row, empty Top Suppliers/Customers, finance/stock section order. Screenshots saved in `reports/frontend-visual-audit/`. |
| 2 | `dailyReport` | `view-dailyReport` | `/daily-report` | `views/trackingDashboards/DailyReportView.vue` | Playwright Checked | Round 1 fixed: header/date controls, 2 large KPI cards, group heading, empty-state baseline, bill tables, expense empty state. Screenshots saved in `reports/frontend-visual-audit/`. |
| 3 | `ownerDaily` | `view-ownerDaily` | `/owner-daily` | `views/trackingDashboards/OwnerDailyView.vue` | Playwright Checked | Round 1 fixed: fixture reset to legacy empty baseline, trading/pending blocks hidden when zero, top section order now follows legacy. Minor numeric formatting polish remains. |
| 4 | `anomalyDetector` | `view-anomalyDetector` | `/anomaly-detector` | `views/trackingDashboards/AnomalyDetectorView.vue` | Playwright Checked | Round 2 live baseline check: reset visible baseline to `ทุกอย่างปกติ!` when no anomalies and reran desktop/mobile screenshots against GitHub Pages. Screenshots saved in `reports/frontend-visual-audit/batch-b-live-main-1-rerun/`. |

## Batch 2: Daily Operations 1

| Order | View Key | Legacy View | Vue Route | Vue File | Status | Notes |
|---:|---|---|---|---|---|---|
| 1 | `purchase` | `view-purchase` | `/purchase` | `views/purchase/PurchaseBillsView.vue` | Playwright Checked | Round 1 fixed: empty fixture baseline, top action order, legacy filter chips, table headers, empty copy, and export/fix labels. |
| 2 | `sales` | `view-sales` | `/sales` | `views/sales/SalesBillsView.vue` | Playwright Checked | Round 1 fixed: empty fixture baseline, removed always-visible pending banner, top actions, type/cost/profit chips, table headers, and export label. |
| 3 | `stockIssue` | `view-stockIssue` | `/sales/stock-issue` | `views/sales/StockIssueView.vue` | Playwright Checked | Round 1 fixed: route title, hero/stats section, filter bar, `+ เบิกออกใหม่`, table headers/action, and empty copy. |
| 4 | `paymentApproval` | `view-paymentApproval` | `/daily/payment-approval` | `views/daily/PaymentApprovalView.vue` | Playwright Checked | Round 1 fixed: route title icon and fixture counts reset to 0/0 for AP and expense baseline. |
| 5 | `payment` | `view-payment` | `/purchase/payments` | `views/purchase/SupplierPaymentsView.vue` | Playwright Checked | Round 2 live menu-flow check against GitHub Pages: summary cards use `0.00`, outstanding panel and payment history filters align with live wording, voucher count/total badges restored, and history table headers now match legacy (`📋 บิลซื้อที่ตัดชำระ`, `บัญชี`, `วิธี`, `รายการ`, `ยอดรวม`). Screenshots saved in `reports/frontend-visual-audit/supplier-payments-menu-flow-rerun/`. |

## Batch 3: Daily Operations 2

| Order | View Key | Legacy View | Vue Route | Vue File | Status | Notes |
|---:|---|---|---|---|---|---|
| 1 | `receiptVoucher` | `view-receiptVoucher` | `/purchase/receipt-vouchers` | `views/purchase/ReceiptVouchersView.vue` | Playwright Checked | Round 1 fixed: route title, empty fixture baseline, legacy header/action/table labels. |
| 2 | `receipt` | `view-receipt` | `/sales/receipts` | `views/sales/CustomerReceiptsView.vue` | Playwright Checked | Round 1 fixed: outstanding AR panel, summary cards, duplicate-clean button, `+ Receipt Voucher`, history table, and empty fixture baseline. |
| 3 | `transfer` | `view-transfer` | `/daily/transfer` | `views/daily/TransferView.vue` | Playwright Checked | Round 1 fixed: empty fixture baseline while keeping legacy filter chips and table labels. |
| 4 | `expense` | `view-expense` | `/daily/expense` | `views/daily/ExpenseView.vue` | Playwright Checked | Round 1 fixed: empty fixture baseline, export count 0, and legacy action/filter labels. |
| 5 | `pettyAdvance` | `view-pettyAdvance` | `/daily/petty-advance` | `views/daily/PettyAdvanceView.vue` | Playwright Checked | Round 1 fixed: empty fixture baseline with legacy hero/action/table labels. |

## Batch 4: Daily Operations 3

| Order | View Key | Legacy View | Vue Route | Vue File | Status | Notes |
|---:|---|---|---|---|---|---|
| 1 | `expenseDashboard` | `view-expenseDashboard` | `/daily/expense-dashboard` | `views/daily/ExpenseDashboardView.vue` | Playwright Checked | Round 1 fixed: empty fixture baseline, removed mock anomaly row, and month labels now use Thai/Buddhist-year short format like legacy. |
| 2 | `stockTransfer` | `view-stockTransfer` | `/stock/transfer` | `views/stock/StockTransferView.vue` | Playwright Checked | Round 1 fixed: route title, removed non-legacy info banner, empty fixture baseline, legacy period chips, filter labels, table headers, and summary text. |
| 3 | `billSwapHistory` | `view-billSwapHistory` | `/daily/bill-swap-history` | `views/daily/BillSwapHistoryView.vue` | Playwright Checked | Round 1 fixed: route title emoji, empty fixture baseline, and table column set now matches legacy 8-column layout. |

## Batch 5: Production

| Order | View Key | Legacy View | Vue Route | Vue File | Status | Notes |
|---:|---|---|---|---|---|---|
| 1 | `production` | `view-production` | `/production/orders` | `views/production/ProductionView.vue` | Playwright Checked | Round 1 fixed: empty fixture baseline, removed mock production cards, legacy clear-button behavior, and period filter date setting. |
| 2 | `productionDashboard` | `view-productionDashboard` | `/production/dashboard` | `views/production/ProductionDashboardView.vue` | Playwright Checked | Round 2 live menu-flow check against GitHub Pages: live baseline is empty, while Vue intentionally uses populated visual fixtures for backend/refactor baseline. KPI cards, daily line chart, monthly grouped bar chart, order-status donut, Top 10 products, and Machine Utilization are visible with mock values. Screenshots saved in `reports/frontend-visual-audit/production-dashboard-visual-fixture/`. |
| 3 | `wipReport` | `view-wipReport` | `/production/wip-report` | `views/production/WipReportView.vue` | Playwright Checked | Round 1 checked: table headings and empty baseline match legacy. |
| 4 | `productionReport` | `view-productionReport` | `/production/report` | `views/production/ProductionReportView.vue` | Playwright Checked | Round 1 checked: refresh/export controls, grouped headings, and report table headers match legacy. |
| 5 | `productionCostReport` | `view-productionCostReport` | `/production/production-cost-report` | `views/production/ProductionCostReportView.vue` | Playwright Checked | Round 1 checked: export control and cost report table headers match legacy. |
| 6 | `yieldLossReport` | `view-yieldLossReport` | `/production/yield-loss-report` | `views/production/YieldLossReportView.vue` | Playwright Checked | Round 1 checked: export control and yield/loss table headers match legacy. |
| 7 | `machineUtil` | `view-machineUtil` | `/production/machine-utilization` | `views/production/MachineUtilizationView.vue` | Playwright Checked | Round 1 checked: machine utilization table headers match legacy. |

## Batch 6: Dual Costing / Trading / PO

| Order | View Key | Legacy View | Vue Route | Vue File | Status | Notes |
|---:|---|---|---|---|---|---|
| 1 | `poBuy` | `view-poBuy` | `/purchase/po-buy` | `views/purchase/PoBuyView.vue` | Playwright Checked | Round 1 fixed: route title, empty fixture baseline, legacy filter/status chips, purpose cards, and PO header-level table columns. |
| 2 | `poSell` | `view-poSell` | `/sales/po-sell` | `views/sales/PoSellView.vue` | Playwright Checked | Round 2 rechecked via GitHub Pages menu flow. Fixed the PO Sell empty baseline to match legacy content: green purpose banner, 6 KPI cards, Top 5 Customer card, PO ค้างส่งสินค้า card, two-line filter bar, found-count label, 2-decimal totals, status chips, and match-oriented table columns. Screenshots: `reports/frontend-visual-audit/po-sell-final/`. |
| 3 | `costPool` | `view-costPool` | `/dual-costing/cost-pool` | `views/dualCosting/CostPoolView.vue` | Playwright Checked | Round 1 checked: table columns and empty baseline match legacy. |
| 4 | `costAllocator` | `view-costAllocator` | `/dual-costing/cost-allocator` | `views/dualCosting/CostAllocatorView.vue` | Playwright Checked | Round 2 rechecked via GitHub Pages menu flow. Fixed title/menu wording to `Cost Allocator (ทอง/เหลือง)`, restored the live intro copy, step ⓪ source selector, empty product baseline, and source buttons. Screenshots: `reports/frontend-visual-audit/cost-allocator-final/`. |
| 5 | `matchLog` | `view-matchLog` | `/dual-costing/match-log` | `views/dualCosting/MatchLogView.vue` | Playwright Checked | Round 2 rechecked via GitHub Pages menu flow. Fixed empty baseline details: 2-decimal total qty/cost values, cost-type option icons, no PO Sell fixture options, and matching filter/table text. Screenshots: `reports/frontend-visual-audit/match-log-final/`. |
| 6 | `dealMargin` | `view-dealMargin` | `/dual-costing/deal-margin` | `views/dualCosting/DealMarginView.vue` | Playwright Checked | Round 1 checked: export control and margin table headers match legacy. |
| 7 | `compareMargin` | `view-compareMargin` | `/dual-costing/compare-margin` | `views/dualCosting/CompareMarginView.vue` | Playwright Checked | Round 1 checked: summary heading and empty baseline match legacy. |
| 8 | `tradingDashboard` | `view-tradingDashboard` | `/trading/dashboard` | `views/dualCosting/TradingDashboardView.vue` | Playwright Checked | Round 1 fixed: restored trend/matching/top-product sections and kept legacy gradient direction/order for hero and mega card. |
| 9 | `tradingMatching` | `view-tradingMatching` | `/trading/matching` | `views/dualCosting/TradingMatchingView.vue` | Playwright Checked | Round 1 fixed: empty fixture baseline, `Deals (0)`, removed mock rows/actions, and table headers align with legacy. |
| 10 | `poOutstanding` | `view-poOutstanding` | `/po-reports/outstanding` | `views/dualCosting/PoOutstandingView.vue` | Playwright Checked | Round 1 fixed: empty fixture baseline, buy/sell counts 0/0, and table headers match legacy. |

## Batch 7: Finance / Debt

| Order | View Key | Legacy View | Vue Route | Vue File | Status | Notes |
|---:|---|---|---|---|---|---|
| 1 | `ar` | `view-ar` | `/finance/ar` | `views/finance/ArView.vue` | Playwright Checked | Round 2 rechecked via GitHub Pages menu flow. Reset to live empty baseline: removed fixture AR rows and pending-sale banner, restored 2-decimal totals, live customer/channel filter options, aging bucket labels/colors, Top 5 empty state, and table empty state. Screenshots: `reports/frontend-visual-audit/ar-final/`. |
| 2 | `ap` | `view-ap` | `/finance/ap` | `views/finance/ApView.vue` | Playwright Checked | Round 2 visual fixture pass against GitHub Pages menu-flow reference. Kept legacy AP structure but intentionally populated detailed mock data across aging buckets: mega payable card, aging bars, Top 5 suppliers, KPI cards, aging cards, summary/detail tabs, supplier/channel filters, summary totals, and detail rows. Screenshots: `reports/frontend-visual-audit/ap-visual-fixture/`. |
| 3 | `bank` | `view-bank` | `/finance/bank` | `views/finance/BankStatementView.vue` | Playwright Checked | Round 2 rechecked via GitHub Pages menu flow. Fixed live empty baseline: account option list, default cash HQ account, opening balance `500,000.00`, opening row date `-`, and 2-decimal money formatting. Screenshots: `reports/frontend-visual-audit/bank-final/`. |
| 4 | `cashPosition` | `view-cashPosition` | `/finance/cash-position` | `views/finance/CashPositionView.vue` | Playwright Checked | Round 2 rechecked via GitHub Pages menu flow. Fixed live cash baseline: 7 account rows, cash/bank/FCD/OD totals, AR/AP zero state, Top account order, lower Net Cash Position card, donut center, and 2-decimal money formatting. Screenshots: `reports/frontend-visual-audit/cash-position-final/`. |
| 5 | `supplierAdvance` | `view-supplierAdvance` | `/finance/supplier-advance` | `views/finance/SupplierAdvanceView.vue` | Playwright Checked | Round 1 fixed: removed mock advance rows/actions and aligned with empty legacy table baseline. |
| 6 | `customerAdvance` | `view-customerAdvance` | `/finance/customer-advance` | `views/finance/CustomerAdvanceView.vue` | Playwright Checked | Round 1 fixed: removed mock advance rows/actions and aligned with empty legacy table baseline. |

## Batch 8: Foreign Finance

| Order | View Key | Legacy View | Vue Route | Vue File | Status | Notes |
|---:|---|---|---|---|---|---|
| 1 | `intlTransfer` | `view-intlTransfer` | `/finance/foreign/intl-transfer` | `views/finance/IntlTransferView.vue` | Playwright Checked | Round 1 fixed: removed mock KPI/cards/actions, restored legacy heading, button text, table columns, and purple info tone. |
| 2 | `overseasReceipt` | `view-overseasReceipt` | `/finance/foreign/overseas-receipt` | `views/finance/OverseasReceiptView.vue` | Playwright Checked | Round 1 fixed: removed mock summary/cards, restored legacy heading, button text, and receipt table columns. |
| 3 | `fxRate` | `view-fxRate` | `/finance/foreign/fx-rate` | `views/finance/FxRateView.vue` | Playwright Checked | Round 2 rechecked via GitHub Pages menu flow. Fixed live FX baseline: `2026-05-17` history rows, 5 latest-rate cards including `SGD → THB`, JPY/EUR card order, and 2-decimal rate formatting. Screenshots: `reports/frontend-visual-audit/fx-rate-final/`. |
| 4 | `fcdLedger` | `view-fcdLedger` | `/finance/foreign/fcd-ledger` | `views/finance/FcdLedgerView.vue` | Playwright Checked | Round 1 checked: FCD ledger table columns match legacy baseline. |
| 5 | `fxGainLossReport` | `view-fxGainLossReport` | `/finance/foreign/fx-gain-loss-report` | `views/finance/FxGainLossReportView.vue` | Playwright Checked | Round 1 checked: FX gain/loss report table columns match legacy baseline. |
| 6 | `bankRecon` | `view-bankRecon` | `/finance/foreign/bank-reconciliation` | `views/finance/BankReconciliationView.vue` | Playwright Checked | Round 1 fixed: removed mock import/ERP rows and action text from baseline; reconciliation table headers match legacy. |

## Batch 9: Stock

| Order | View Key | Legacy View | Vue Route | Vue File | Status | Notes |
|---:|---|---|---|---|---|---|
| 1 | `stockBalance` | `view-stockBalance` | `/stock/balance` | `views/stock/StockBalanceView.vue` | Playwright Checked | Round 2 rechecked via GitHub Pages menu flow. Restored live empty baseline: blue/cyan hero subtitle, 5 KPI cards, RM/WIP/FG summary cards, filter row, empty donut/top-category panels, and empty matrix table. Screenshots: `reports/frontend-visual-audit/stock-balance-final/`. |
| 2 | `stockLedger` | `view-stockLedger` | `/stock/ledger` | `views/stock/StockLedgerView.vue` | Playwright Checked | Round 2 rechecked via GitHub Pages menu flow. Restored live empty baseline: product/branch/type/date filters, balance-mode toggle, negative-count chip, soft duplicate/orphan cleanup actions, found-count badge, fixed-width ledger table, and `ยังไม่มี Stock Movement` empty state. Screenshots: `reports/frontend-visual-audit/stock-ledger-final/`. |
| 3 | `statusConvert` | `view-statusConvert` | `/stock/status-convert` | `views/stockGaps/StatusConvertView.vue` | Playwright Checked | Round 1 fixed: route title emoji aligned; table/action labels match legacy. |
| 4 | `gradeAdjustment` | `view-gradeAdjustment` | `/stock/convert` | `views/stock/GradeStatusConvertView.vue` | Playwright Checked | Round 2 rechecked via GitHub Pages menu flow. Restored live empty baseline: cyan/teal hero, `+ ปรับเกรดใหม่` action, 7 summary cards, search/source/cost filters, Source/Target color-banded table headers, and `ยังไม่มีรายการปรับเกรด` empty state. Screenshots: `reports/frontend-visual-audit/grade-adjustment-final/`. |
| 5 | `stockAdjust` | `view-stockAdjust` | `/stock/adjust` | `views/stock/StockAdjustView.vue` | Playwright Checked | Round 2 rechecked via GitHub Pages menu flow. Restored live empty baseline: orange hero, Note-only principle block, 5 KPI cards, quick-adjust/search/filter toolbar, empty stock-adjust table, and `💡 ใช้เมื่อไหร่` guidance block. Screenshots: `reports/frontend-visual-audit/stock-adjust-final/`. |
| 6 | `customerReturn` | `view-customerReturn` | `/stock/customer-return` | `views/stockGaps/CustomerReturnView.vue` | Playwright Checked | Round 2 rechecked via GitHub Pages menu flow. Restored live empty baseline: purple/pink hero subtitle, 3 KPI cards, search/branch/CSV toolbar, empty customer-return table, and `💡 ข้อแนะนำ` guidance block. Screenshots: `reports/frontend-visual-audit/customer-return-final/`. |

## Batch 10: Reports / Finance Accounting

| Order | View Key | Legacy View | Vue Route | Vue File | Status | Notes |
|---:|---|---|---|---|---|---|
| 1 | `reports` | `view-reports` | `/reports` | `views/systemGaps/ReportsView.vue` | Playwright Checked | Round 1 fixed: default report tab reset to legacy baseline so no extra table headers appear before user selection. |
| 2 | `finDashboard` | `view-finDashboard` | `/finance-accounting/financial-dashboard` | `views/financeReports/FinancialDashboardView.vue` | Playwright Checked | Round 2 rechecked via GitHub Pages menu flow. Restored live visual baseline: empty 6-month P&L chart, Cash & Bank-only asset donut, 0-value cash need/inflow cards, full finance section cards, P&L summary, balance sheet, and Cash Health Insights. Screenshots: `reports/frontend-visual-audit/financial-dashboard-final/`. |
| 3 | `cashFlowAnalysis` | `view-cashFlowAnalysis` | `/finance-accounting/cash-flow-analysis` | `views/financeReports/CashFlowAnalysisView.vue` | Playwright Checked | Round 1 checked: cash-flow analysis headings and table labels match legacy baseline. |
| 4 | `cashFlowForecast` | `view-cashFlowForecast` | `/finance-accounting/cf-forecast-calendar` | `views/financeReports/CashFlowForecastView.vue` | Playwright Checked | Round 2 rechecked via GitHub Pages menu flow. Restored live 30-day baseline: 9,100,000.00 start/end cash, no expected in/out events, flat forecast graph, 30-day calendar beginning 2026-05-17, two-decimal money formatting, and empty AR/AP insight tables. Screenshots: `reports/frontend-visual-audit/cash-flow-forecast-final/`. |
| 5 | `workingCapital` | `view-workingCapital` | `/finance-accounting/working-capital` | `views/financeReports/WorkingCapitalView.vue` | Playwright Checked | Round 2 rechecked via GitHub Pages menu flow. Restored live zero-state baseline: 90-day period selector, CCC 0.0 card, full-width CCC breakdown bars, Current/Quick ratio gauges, Stock Turnover panel, 7 KPI cards, five analysis cards, and the legacy calculation table. Screenshots: `reports/frontend-visual-audit/working-capital-final/`. |
| 6 | `stockFinance` | `view-stockFinance` | `/finance-accounting/stock-finance` | `views/financeReports/StockFinanceView.vue` | Playwright Checked | Round 1 checked: stock finance header, tab labels, and stock-value table headings match legacy baseline. |
| 7 | `profitLeak` | `view-profitLeak` | `/finance-accounting/profit-leak` | `views/financeReports/ProfitLeakView.vue` | Playwright Checked | Round 1 fixed: restored low-margin/customer/supplier/outlier tables and legacy table headers. |
| 8 | `taxVAT` | `view-taxVAT` | `/finance-accounting/tax-vat-wht` | `views/financeReports/TaxVatView.vue` | Playwright Checked | Round 1 fixed: VAT/WHT table headers and Tax Calendar table restored to legacy sequence. |
| 9 | `plStatement` | `view-plStatement` | `/finance-accounting/pl-statement` | `views/financeReports/PlStatementView.vue` | Playwright Checked | Round 2 rechecked via GitHub Pages menu flow. Restored live zero-state baseline: period toolbar order, branch selector, quick range buttons, 2026-05-17 period end date, zero Net Profit waterfall, Stock vs Trading split cards, split GP mini chart, and two-decimal money formatting. Screenshots: `reports/frontend-visual-audit/pl-statement-final/`. |
| 10 | `balanceSheet` | `view-balanceSheet` | `/finance-accounting/balance-sheet` | `views/financeReports/BalanceSheetView.vue` | Playwright Checked | Round 1 checked: baseline visible surface matches legacy header/export-only view. |
| 11 | `cashFlowStatement` | `view-cashFlowStatement` | `/finance-accounting/cash-flow-statement` | `views/financeReports/CashFlowStatementView.vue` | Playwright Checked | Round 1 checked: baseline visible surface matches legacy header/export-only view. |

## Batch 11: Assets / Loans / System Gaps

| Order | View Key | Legacy View | Vue Route | Vue File | Status | Notes |
|---:|---|---|---|---|---|---|
| 1 | `assetRegister` | `view-assetRegister` | `/finance-accounting/asset-register` | `views/systemGaps/AssetRegisterView.vue` | Playwright Checked | Round 1 fixed: reset sample assets to empty baseline, restored button order, `📥 CSV`, and Thai table headers. |
| 2 | `depreciation` | `view-depreciation` | `/finance-accounting/depreciation` | `views/systemGaps/DepreciationView.vue` | Playwright Checked | Round 1 fixed: reset mock assets/runs so pending and reverse rows do not appear in baseline. |
| 3 | `assetDisposal` | `view-assetDisposal` | `/finance-accounting/asset-disposal` | `views/systemGaps/AssetDisposalView.vue` | Playwright Checked | Round 1 checked: disposal header/action/table headings match legacy baseline. |
| 4 | `loanContracts` | `view-loanContracts` | `/finance-accounting/loan-contracts` | `views/systemGaps/LoanContractsView.vue` | Playwright Checked | Round 1 fixed: restored BSL title/subtitle, template/add actions, KPI labels, filters, empty baseline, and Thai table columns. |
| 5 | `loanDashboard` | `view-loanDashboard` | `/finance-accounting/loan-dashboard` | `views/systemGaps/LoanDashboardView.vue` | Playwright Checked | Round 1 checked: dashboard headings and due/overdue table labels match legacy baseline. |
| 6 | `equityMaint` | `view-equityMaint` | `/finance-accounting/equity-maint` | `views/systemGaps/EquityMaintenanceView.vue` | Playwright Checked | Round 1 checked: equity heading and save action match legacy baseline. |
| 7 | `openingBalance` | `view-openingBalance` | `/finance-accounting/opening-balance` | `views/systemGaps/OpeningBalanceView.vue` | Playwright Checked | Round 1 fixed: restored `⭐` route title, Go-Live heading, Save/Push actions, full legacy tab order, and empty fixture counts. |
| 8 | `historicalData` | `view-historicalData` | `/finance-accounting/historical-data` | `views/systemGaps/HistoricalDataView.vue` | Playwright Checked | Round 1 fixed: restored `📅` route/menu title; tab/action/table heading order checked. |
| 9 | `changePassword` | `view-changePassword` | `/admin/change-password` | `views/systemGaps/ChangePasswordView.vue` | Playwright Checked | Round 1 fixed: restored `🔒` route/menu title; page headings match legacy baseline. |
| 10 | `transactionLedger` | `view-transactionLedger` | `/admin/transaction-ledger` | `views/systemGaps/TransactionLedgerView.vue` | Playwright Checked | Round 1 fixed: restored `📒` route/menu title and reset account/ledger mock rows to empty legacy baseline. |
| 11 | `audit` | `view-audit` | `/admin/audit` | `views/systemGaps/AuditLogView.vue` | Playwright Checked | Round 1 checked: audit table headings match legacy baseline. |

## Batch 12 - Master / Admin Visual Audit In Progress

| # | View Key | Legacy View | Vue Route | Vue File | Status | Notes |
|---:|---|---|---|---|---|---|
| 1 | `mdCustomer` | `view-mdCustomer` | `/master-data/customers` | `views/masterData/CustomersView.vue` | Playwright Checked | Round 2 rechecked via GitHub Pages menu flow. Kept real query wiring but added live visual fallback when DB query is empty: 3 customer rows, checkbox column, action order, active status wording, and two-decimal credit limits. Screenshots: `reports/frontend-visual-audit/customer-master-final/`. |
| 2 | `mdSalesperson` | `view-mdSalesperson` | `/master-data/salespersons` | `views/masterData/SalespersonsView.vue` | Playwright Checked | Round 1 fixed: Thai route title, removed duplicate action bar, restored `+ เพิ่มพนักงาน`, table action column, and fallback rows for legacy screenshot parity. |
| 3 | `mdDirector` | `view-mdDirector` | `/master-data/directors` | `views/masterDataGaps/DirectorsView.vue` | Playwright Checked | Round 1 fixed: list-first baseline, export/add actions, table headers, and row count aligned with legacy. |
| 4 | `mdMachine` | `view-mdMachine` | `/master-data/machines` | `views/masterDataGaps/MachinesView.vue` | Playwright Checked | Round 1 fixed: removed visible setup form, restored export/add actions, action columns, and legacy row count. |
| 5 | `mdProductionLine` | `view-mdProductionLine` | `/master-data/production-lines` | `views/masterDataGaps/ProductionLinesView.vue` | Playwright Checked | Round 2 fixed: fixture rows, blue add action, checkbox column, single action column, status wording, and table spacing aligned with legacy master baseline. |
| 6 | `mdBeneficiary` | `view-mdBeneficiary` | `/master-data/beneficiaries` | `views/masterDataGaps/BeneficiariesView.vue` | Playwright Checked | Round 2 fixed: fixture rows, blue add action, checkbox column, single action column, status wording, and table spacing aligned with legacy master baseline. |
| 7 | `mdPaymentMethod` | `view-mdPaymentMethod` | `/master-data/payment-methods` | `views/masterDataGaps/PaymentMethodsView.vue` | Playwright Checked | Round 1 fixed: removed setup form, restored export/add/action columns, and adjusted fixture row count. |
| 8 | `mdRemittancePurpose` | `view-mdRemittancePurpose` | `/master-data/remittance-purposes` | `views/masterDataGaps/RemittancePurposesView.vue` | Playwright Checked | Round 2 fixed: fixture rows, blue add action, checkbox column, single action column, status wording, and table spacing aligned with legacy master baseline. |
| 9 | `mdSupplier` | `view-mdSupplier` | `/master-data/suppliers` | `views/masterData/SuppliersView.vue` | Playwright Checked | Round 1 fixed: added fallback rows and `แก้ไข`/`ลบ` action columns while preserving legacy action order. |
| 10 | `mdProduct` | `view-mdProduct` | `/master-data/products` | `views/masterData/ProductsView.vue` | Playwright Checked | Round 1 fixed: fallback rows and action columns added; route now matches legacy action/table order. |
| 11 | `mdBranch` | `view-mdBranch` | `/master-data/branches` | `views/masterData/BranchesView.vue` | Playwright Checked | Round 1 fixed: restored `สาขา / คลัง` title, branch/warehouse tabs, `ผู้จัดการ` column, and legacy row count. |
| 12 | `mdWarehouse` | warehouse split route | `/master-data/warehouses` | `views/masterData/WarehousesView.vue` | Split Route Checked | Legacy has warehouse as a tab under `สาขา / คลัง`, not a standalone view; Vue split route sanity checked only. |
| 13 | `mdAccount` | `view-mdAccount` | `/master-data/accounts` | `views/masterData/AccountsView.vue` | Playwright Checked | Round 1 fixed: restored `SWIFT`, fallback rows, status, and action columns. |
| 14 | `mdChannel` | `view-mdChannel` | `/master-data/channels` | `views/masterData/ChannelsView.vue` | Playwright Checked | Round 1 fixed: restored tab-before-actions order, single active table, fallback rows, and action columns. |
| 15 | `mdExpense` | `view-mdExpense` | `/master-data/expense-categories` | `views/masterData/ExpenseCategoriesView.vue` | Playwright Checked | Round 1 fixed: removed non-legacy table title, added fallback rows, and action columns. |
| 16 | `mdCurrency` | `view-mdCurrency` | `/master-data/currencies` | `views/masterData/CurrenciesView.vue` | Playwright Checked | Round 1 fixed: replaced FX-rate style columns with legacy `จุดทศนิยม`/status/action columns and fallback rows. |
| 17 | `mdImport` | `view-mdImport` | `/master-data/import` | `views/masterDataGaps/MasterImportView.vue` | Playwright Checked | Round 1 fixed: initial preview/log badges removed, entity cards and required/import wording aligned with legacy import baseline. |
| 18 | `importTxn` | `view-importTxn` | `/master-data/import-transactions` | `views/masterDataGaps/TransactionImportView.vue` | Playwright Checked | Round 1 fixed: visual compare mapping added, initial preview/log mocks removed, import header/tabs/template actions aligned. |
| 19 | `companyProfile` | `view-companyProfile` | `/admin/company-profile` | `views/admin/CompanyProfileView.vue` | Playwright Checked | Round 1 checked after legacy wording patch; no additional page patch needed. |
| 20 | `userPermission` | `view-userPermission` | `/admin/users-permissions` | `views/admin/UsersPermissionsView.vue` | Playwright Checked | Round 1 fixed: users/roles fixtures expanded to legacy baseline counts. |
| 21 | `userActivity` | `view-userActivity` | `/admin/user-activity` | `views/admin/UserActivityView.vue` | Playwright Checked | Round 1 checked; baseline close to legacy with fixture log/export/clear still placeholder only. |
| 22 | `backup` | `view-backup` | `/admin/migration-tools` | `views/admin/MigrationToolsView.vue` | Playwright Checked | Round 1 fixed: auto-backup/storage/record fixtures, legacy card order, migrate/reset/danger/help sections restored with placeholder-safe actions. |
| 23 | `profitCostAnalysis` | `view-profitCostAnalysis` | `/profit-cost-analysis` | `views/trackingDashboards/ProfitCostAnalysisView.vue` | Playwright Checked | Round 2 live baseline check: restored `หมวดสินค้า (ทุกหมวด)` chip bar under filters and reran desktop/mobile screenshots against GitHub Pages. Screenshots saved in `reports/frontend-visual-audit/batch-b-live-main-1-rerun/`. |
| 24 | `pendingSales` | `view-pendingSales` | `/sales/pending` | `views/sales/PendingSalesView.vue` | Playwright Checked | Round 4 Batch A: componentized page into header/LME/filter/KPI/table/pool-stock sections and moved visible data to `pendingSales/visualFixtures.ts`. Menu-flow desktop/mobile screenshots saved in `reports/frontend-visual-audit/batch-a/`. Legacy local is currently empty while Vue intentionally uses populated visual fixtures to verify table/card layout. |
| 25 | `salesPlan` | `view-salesPlan` | `/sales-plan` | `views/trackingDashboards/SalesPlanView.vue` | Playwright Checked | Round 1 fixed: route title icon, stock remaining table restored, and sample plan rows removed from initial baseline. |
| 26 | `salesCommission` | `view-salesCommission` | `/sales-commission` | `views/trackingDashboards/SalesCommissionView.vue` | Playwright Checked | Round 1 fixed: route title icon, legacy supplier assignment heading/columns restored, non-legacy commission comparison removed from initial baseline. |
| 27 | `cashFlowCalendar` | `view-cashFlowCalendar` | `/cash-flow-calendar` | `views/trackingDashboards/CashFlowCalendarView.vue` | Playwright Checked | Round 1 checked; main controls and chart headings match legacy. Legacy floating export is intentionally not carried into Vue shell. |
| 28 | `businessCalendar` | `view-businessCalendar` | `/business-calendar` | `views/trackingDashboards/BusinessCalendarView.vue` | Playwright Checked | Round 3 local menu-flow baseline check against `http://127.0.0.1:5180/`: empty fixture baseline restored, KPI money values show `0.00`, chart grid/legend and all-day combined table match legacy structure, and extra calendar grid was removed. Floating legacy Export Excel/Auto-Sync shell remains intentionally excluded from Vue. Screenshots saved in `reports/frontend-visual-audit/business-calendar-local-rerun-2/`. |
| 29 | `cashOthersSummary` | `view-cashOthersSummary` | `/cash-others-summary` | `views/trackingDashboards/CashOthersSummaryView.vue` | Playwright Checked | Round 3 Batch A: menu-flow desktop/mobile screenshots saved in `reports/frontend-visual-audit/batch-a/`; visible fixture variables renamed to `cashOthersVisual...`. Main known intentional drift: Vue shows the customer-requested Trading Pending block while current legacy local does not. |
| 30 | `customerTracking` | `view-customerTracking` | `/tracking/customer` | `views/trackingDashboards/CustomerTrackingView.vue` | Playwright Checked | Round 1 checked; list tabs and table headers match legacy. |
| 31 | `supplierTracking` | `view-supplierTracking` | `/tracking/supplier` | `views/trackingDashboards/SupplierTrackingView.vue` | Playwright Checked | Round 3 live menu-flow check against GitHub Pages: live baseline remains empty, while Vue intentionally uses populated visual fixtures to preserve backend/refactor baseline. KPI cards, Top 5, monthly chart, and table rows are visible with sample values (`906,000`, 3 suppliers, `5,560` kg, payable `398,000`). Screenshots saved in `reports/frontend-visual-audit/supplier-tracking-visual-fixture-rerun/`. |
| 32 | `productTracking` | `view-productTracking` | `/tracking/product` | `views/trackingDashboards/ProductTrackingView.vue` | Playwright Checked | Round 1 checked; list tabs and table headers match legacy. |

## Full Page Checklist

| Group | View Key | Vue Route | Status |
|---|---|---|---|
| Main | `ownerDaily` | `/owner-daily` | Playwright Checked |
| Main | `anomalyDetector` | `/anomaly-detector` | Playwright Checked |
| Main | `dailyReport` | `/daily-report` | Playwright Checked |
| Main | `dashboard` | `/` | Playwright Checked |
| Main | `profitCostAnalysis` | `/profit-cost-analysis` | Playwright Checked |
| Main | `pendingSales` | `/sales/pending` | Playwright Checked |
| Main | `salesPlan` | `/sales-plan` | Playwright Checked |
| Main | `salesCommission` | `/sales-commission` | Playwright Checked |
| Main | `cashFlowCalendar` | `/cash-flow-calendar` | Playwright Checked |
| Main | `businessCalendar` | `/business-calendar` | Playwright Checked |
| Main | `cashOthersSummary` | `/cash-others-summary` | Playwright Checked |
| Tracking | `customerTracking` | `/tracking/customer` | Playwright Checked |
| Tracking | `supplierTracking` | `/tracking/supplier` | Playwright Checked |
| Tracking | `productTracking` | `/tracking/product` | Playwright Checked |
| Daily | `purchase` | `/purchase` | Playwright Checked |
| Daily | `sales` | `/sales` | Playwright Checked |
| Daily | `stockIssue` | `/sales/stock-issue` | Playwright Checked |
| Daily | `paymentApproval` | `/daily/payment-approval` | Playwright Checked |
| Daily | `payment` | `/purchase/payments` | Playwright Checked |
| Daily | `receiptVoucher` | `/purchase/receipt-vouchers` | Playwright Checked |
| Daily | `receipt` | `/sales/receipts` | Playwright Checked |
| Daily | `transfer` | `/daily/transfer` | Playwright Checked |
| Daily | `expense` | `/daily/expense` | Playwright Checked |
| Daily | `pettyAdvance` | `/daily/petty-advance` | Playwright Checked |
| Daily | `expenseDashboard` | `/daily/expense-dashboard` | Playwright Checked |
| Daily | `stockTransfer` | `/stock/transfer` | Playwright Checked |
| Daily | `billSwapHistory` | `/daily/bill-swap-history` | Playwright Checked |
| Production | `production` | `/production/orders` | Playwright Checked |
| Production | `productionDashboard` | `/production/dashboard` | Playwright Checked |
| Production | `wipReport` | `/production/wip-report` | Playwright Checked |
| Production | `productionReport` | `/production/report` | Playwright Checked |
| Production | `productionCostReport` | `/production/production-cost-report` | Playwright Checked |
| Production | `yieldLossReport` | `/production/yield-loss-report` | Playwright Checked |
| Production | `machineUtil` | `/production/machine-utilization` | Playwright Checked |
| Dual Costing | `poBuy` | `/purchase/po-buy` | Playwright Checked |
| Dual Costing | `poSell` | `/sales/po-sell` | Playwright Checked |
| Dual Costing | `costPool` | `/dual-costing/cost-pool` | Playwright Checked |
| Dual Costing | `costAllocator` | `/dual-costing/cost-allocator` | Playwright Checked |
| Dual Costing | `matchLog` | `/dual-costing/match-log` | Playwright Checked |
| Dual Costing | `dealMargin` | `/dual-costing/deal-margin` | Playwright Checked |
| Dual Costing | `compareMargin` | `/dual-costing/compare-margin` | Playwright Checked |
| Finance/Debt | `ar` | `/finance/ar` | Playwright Checked |
| Finance/Debt | `ap` | `/finance/ap` | Playwright Checked |
| Finance/Debt | `bank` | `/finance/bank` | Playwright Checked |
| Finance/Debt | `cashPosition` | `/finance/cash-position` | Playwright Checked |
| Finance/Debt | `supplierAdvance` | `/finance/supplier-advance` | Playwright Checked |
| Finance/Debt | `customerAdvance` | `/finance/customer-advance` | Playwright Checked |
| Foreign Finance | `intlTransfer` | `/finance/foreign/intl-transfer` | Playwright Checked |
| Foreign Finance | `overseasReceipt` | `/finance/foreign/overseas-receipt` | Playwright Checked |
| Foreign Finance | `fxRate` | `/finance/foreign/fx-rate` | Playwright Checked |
| Foreign Finance | `fcdLedger` | `/finance/foreign/fcd-ledger` | Playwright Checked |
| Foreign Finance | `fxGainLossReport` | `/finance/foreign/fx-gain-loss-report` | Playwright Checked |
| Foreign Finance | `bankRecon` | `/finance/foreign/bank-reconciliation` | Playwright Checked |
| Stock | `stockBalance` | `/stock/balance` | Playwright Checked |
| Stock | `stockLedger` | `/stock/ledger` | Playwright Checked |
| Stock | `statusConvert` | `/stock/status-convert` | Playwright Checked |
| Stock | `gradeAdjustment` | `/stock/convert` | Playwright Checked |
| Stock | `stockAdjust` | `/stock/adjust` | Playwright Checked |
| Stock | `customerReturn` | `/stock/customer-return` | Playwright Checked |
| Trading | `tradingDashboard` | `/trading/dashboard` | Playwright Checked |
| Trading | `tradingMatching` | `/trading/matching` | Playwright Checked |
| PO Reports | `poOutstanding` | `/po-reports/outstanding` | Playwright Checked |
| Reports | `reports` | `/reports` | Playwright Checked |
| Finance Accounting | `finDashboard` | `/finance-accounting/financial-dashboard` | Playwright Checked |
| Finance Accounting | `cashFlowAnalysis` | `/finance-accounting/cash-flow-analysis` | Playwright Checked |
| Finance Accounting | `cashFlowForecast` | `/finance-accounting/cf-forecast-calendar` | Playwright Checked |
| Finance Accounting | `workingCapital` | `/finance-accounting/working-capital` | Playwright Checked |
| Finance Accounting | `stockFinance` | `/finance-accounting/stock-finance` | Playwright Checked |
| Finance Accounting | `profitLeak` | `/finance-accounting/profit-leak` | Playwright Checked |
| Finance Accounting | `taxVAT` | `/finance-accounting/tax-vat-wht` | Playwright Checked |
| Finance Accounting | `plStatement` | `/finance-accounting/pl-statement` | Playwright Checked |
| Finance Accounting | `balanceSheet` | `/finance-accounting/balance-sheet` | Playwright Checked |
| Finance Accounting | `cashFlowStatement` | `/finance-accounting/cash-flow-statement` | Playwright Checked |
| Finance Accounting | `assetRegister` | `/finance-accounting/asset-register` | Playwright Checked |
| Finance Accounting | `depreciation` | `/finance-accounting/depreciation` | Playwright Checked |
| Finance Accounting | `assetDisposal` | `/finance-accounting/asset-disposal` | Playwright Checked |
| Finance Accounting | `loanContracts` | `/finance-accounting/loan-contracts` | Playwright Checked |
| Finance Accounting | `loanDashboard` | `/finance-accounting/loan-dashboard` | Playwright Checked |
| Finance Accounting | `equityMaint` | `/finance-accounting/equity-maint` | Playwright Checked |
| Finance Accounting | `openingBalance` | `/finance-accounting/opening-balance` | Playwright Checked |
| Finance Accounting | `historicalData` | `/finance-accounting/historical-data` | Playwright Checked |
| Master Data | `mdCustomer` | `/master-data/customers` | Playwright Checked |
| Master Data | `mdSalesperson` | `/master-data/salespersons` | Playwright Checked |
| Master Data | `mdSupplier` | `/master-data/suppliers` | Playwright Checked |
| Master Data | `mdProduct` | `/master-data/products` | Playwright Checked |
| Master Data | `mdBranch` | `/master-data/branches` | Playwright Checked |
| Master Data | `mdAccount` | `/master-data/accounts` | Playwright Checked |
| Master Data | `mdChannel` | `/master-data/channels` | Playwright Checked |
| Master Data | `mdExpense` | `/master-data/expense-categories` | Playwright Checked |
| Master Data | `mdDirector` | `/master-data/directors` | Playwright Checked |
| Master Data | `mdMachine` | `/master-data/machines` | Playwright Checked |
| Master Data | `mdProductionLine` | `/master-data/production-lines` | Playwright Checked |
| Master Data | `mdCurrency` | `/master-data/currencies` | Playwright Checked |
| Master Data | `mdBeneficiary` | `/master-data/beneficiaries` | Playwright Checked |
| Master Data | `mdPaymentMethod` | `/master-data/payment-methods` | Playwright Checked |
| Master Data | `mdRemittancePurpose` | `/master-data/remittance-purposes` | Playwright Checked |
| Master Data | `mdImport` | `/master-data/import` | Playwright Checked |
| Master Data | `importTxn` | `/master-data/import-transactions` | Playwright Checked |
| Admin | `companyProfile` | `/admin/company-profile` | Playwright Checked |
| Admin | `changePassword` | `/admin/change-password` | Playwright Checked |
| Admin | `transactionLedger` | `/admin/transaction-ledger` | Playwright Checked |
| Admin | `backup` | `/admin/migration-tools` | Playwright Checked |
| Admin | `audit` | `/admin/audit` | Playwright Checked |
| Admin | `userPermission` | `/admin/users-permissions` | Playwright Checked |
| Admin | `userActivity` | `/admin/user-activity` | Playwright Checked |
