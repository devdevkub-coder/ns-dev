# 11 Frontend Clone Tracker

## Objective

Clone the legacy frontend screens from `old-apps/legacy/index.html` into the Vue/Vite app under `old-apps/vue/` while preserving wording, labels, emoji, layout order, and visual behavior as closely as practical before reconnecting real functions.

## Policy

- Clone wording/layout from legacy 100%.
- Do not rewrite user-facing copy for style.
- Do not connect real mutations until the UI surface is complete for the batch.
- Work in batches of 5 pages.
- Update this tracker after every batch.
- Preserve legacy behavior notes as placeholders when function wiring is not done yet.

## Status Legend

- `Pending`: not started
- `Cloned UI`: route/view exists and visually follows legacy
- `Wording Checked`: headings, labels, buttons, helper text copied from legacy
- `Build Passed`: latest batch passed `npm run build`
- `Browser Checked`: manually opened in local app
- `Function Pending`: UI exists but real data/mutations are not connected

## Current Strategy

1. Clone shell and page surfaces first. Status: completed for all currently inventoried sidebar/pages.
2. Remove transition-only route/placeholder naming from the new app. Status: completed for `/legacy/...` routes and `LegacyPlaceholderView`.
3. Run page-by-page visual audit before Auth. Status: active; see `docs/migration/12-frontend-visual-audit-checklist.md`.
4. Map Supabase Auth and role visibility after the key UI surfaces are visually acceptable.
5. Wire real read/write functions after role/action mapping.
6. Reconcile database schema later; do not redesign DB during UI clone batches.

## Sidebar / Route Coverage

- Legacy sidebar groups are now represented in the Vue sidebar.
- All sidebar entries now map directly to Vue route components; fallback placeholder routes have been removed from the new app.
- New app runtime routes no longer use `/legacy/...`; examples: `/daily-report`, `/owner-daily`, `/production/dashboard`, `/admin/audit`.
- `old-apps/legacy/` remains source material only. The Vue app must not import, route to, or execute archived legacy files.
- Latest route/menu build check: `npm run build` passed on 2026-05-16.
- Latest automated check: `npm test` passed on 2026-05-16 after route cleanup.

## Progress Log

- 2026-05-16: Batch 7 completed for daily finance pages: `paymentApproval`, `transfer`, `expense`, `pettyAdvance`, `expenseDashboard`.
- 2026-05-16: Batch 8 completed for production pages: `production`, `productionDashboard`, `wipReport`, `productionReport`, `machineUtil`.
- 2026-05-16: Batch 9 completed for Dual Costing / Trading / PO outstanding pages: `costPool`, `costAllocator`, `matchLog`, `dealMargin`, `compareMargin`, `tradingDashboard`, `tradingMatching`, `poOutstanding`.
- 2026-05-16: Batch 10 completed for finance, debt, and foreign finance pages: `ar`, `ap`, `bank`, `cashPosition`, `supplierAdvance`, `customerAdvance`, `intlTransfer`, `overseasReceipt`, `fxRate`, `fcdLedger`, `fxGainLossReport`, `bankRecon`.
- 2026-05-16: Batch 11 completed for master/import gaps: `mdDirector`, `mdMachine`, `mdProductionLine`, `mdBeneficiary`, `mdPaymentMethod`, `mdRemittancePurpose`, `mdImport`, `importTxn`.
- 2026-05-16: Batch 12 completed for stock gaps: `statusConvert`, `customerReturn`.
- 2026-05-16: Batch 13 completed for main/tracking dashboards: `ownerDaily`, `anomalyDetector`, `dailyReport`, `profitCostAnalysis`, `salesPlan`, `salesCommission`, `cashFlowCalendar`, `businessCalendar`, `cashOthersSummary`, `customerTracking`, `supplierTracking`, `productTracking`.
- 2026-05-16: Batch 14 completed for finance/accounting reports: `finDashboard`, `cashFlowAnalysis`, `cashFlowForecast`, `workingCapital`, `stockFinance`, `profitLeak`, `taxVAT`, `plStatement`, `balanceSheet`, `cashFlowStatement`.
- 2026-05-16: Batch 15 completed for reports/assets/loans/admin gaps: `reports`, `assetRegister`, `depreciation`, `assetDisposal`, `loanContracts`, `loanDashboard`, `equityMaint`, `openingBalance`, `historicalData`, `changePassword`, `transactionLedger`, `audit`.
- 2026-05-16: Batch 16 completed for missed legacy pages: `billSwapHistory`, `productionCostReport`, `yieldLossReport`.
- 2026-05-16: Sidebar labels were normalized to keep legacy icon and label separate. New app displays one icon column plus one text label, with duplicate leading icons removed from labels.
- 2026-05-16: Frontend review pass completed with subagents for route/sidebar coverage, wording/UI, and technical cleanup.
- 2026-05-16: High-impact cleanup applied: dashboard no longer shows internal migration wording, duplicate `ownerDaily` sidebar item removed, production detail tabs no longer show clone placeholder copy, purchase bill wording adjusted to `บิลรับซื้อ`, and shell controls received accessible labels.
- 2026-05-16: Main/tracking dashboard review pass: `anomalyDetector` header/body structure re-aligned to legacy, `Placeholder:` action copy removed from tracking dashboard alerts, and Vue global `.text-3xl` override removed so legacy header font sizes render at Tailwind's original scale.
- 2026-05-16: Full category audit pass started across daily, production, dual-costing/trading/PO, finance/debt, foreign finance, stock, reports, finance-accounting, master data, and admin. Static route coverage check shows all sidebar routes mapped to Vue components and 0 remaining fallback routes.
- 2026-05-16: User-facing technical copy cleanup applied outside main dashboards: removed visible `(placeholder)`/clone wording from production and dual-costing actions, removed `Vue migration`/`Vue Shell` shell wording, and changed sample user activity note from `dev bypass` to normal login wording.
- 2026-05-16: New-app route cleanup applied: removed `/legacy/...` URLs, removed `LegacyPlaceholderView.vue` and the placeholder route catalog, and renamed navigation internals from `legacyView` to `viewKey`.
- 2026-05-16: Static source check confirmed `old-apps/vue/src` and `old-apps/vue/index.html` have no runtime references to `old-apps/legacy`, `/legacy`, `LegacyPlaceholderView`, `legacyPlaceholderRoutes`, `legacyView`, or `legacy.*` route names.
- 2026-05-16: Visual audit checklist created at `docs/migration/12-frontend-visual-audit-checklist.md`; Playwright compare workflow added via `npm run visual:compare -- <viewKey>`.
- 2026-05-16: Daily Report visual round 1 completed with Playwright screenshots. Vue route `/daily-report` now matches the legacy top structure more closely: orange header with date controls, two large KPI cards, legacy group heading, empty-state baseline, bill tables, expense empty state, and daily cash section.
- 2026-05-16: Visual audit fixture policy added: use mock/fixture values that match the visible legacy baseline first, then replace with real data later after Auth/Role, validation, and service wiring.
- 2026-05-16: Batch 1 Playwright visual audit completed for main dashboards: `dashboard`, `dailyReport`, `ownerDaily`, and `anomalyDetector`. Vue fixtures were reset to the visible legacy baseline and screenshots were saved in `reports/frontend-visual-audit/`.
- 2026-05-16: Batch 2 Playwright visual audit completed for first daily operation pages: `purchase`, `sales`, `stockIssue`, `paymentApproval`, and `payment`. Empty legacy baseline fixtures were applied and screenshots were saved in `reports/frontend-visual-audit/`.
- 2026-05-16: Batch 3 Playwright visual audit completed for daily finance/receipt pages: `receiptVoucher`, `receipt`, `transfer`, `expense`, and `pettyAdvance`. Empty legacy baseline fixtures were applied and screenshots were saved in `reports/frontend-visual-audit/`.
- 2026-05-16: Batch 4 Playwright visual audit completed for remaining daily operation pages: `expenseDashboard`, `stockTransfer`, and `billSwapHistory`. Empty legacy baseline fixtures, route titles, period chips, month labels, and bill-swap table columns were aligned with legacy; screenshots were saved in `reports/frontend-visual-audit/`.
- 2026-05-16: Batch 5 Playwright visual audit completed for production pages: `production`, `productionDashboard`, `wipReport`, `productionReport`, `productionCostReport`, `yieldLossReport`, and `machineUtil`. Production order mock cards were removed for empty baseline, route title icon was aligned, and report/table labels were checked against legacy screenshots.
- 2026-05-16: Batch 6 Playwright visual audit completed for Dual Costing / Trading / PO pages: `poBuy`, `poSell`, `costPool`, `costAllocator`, `matchLog`, `dealMargin`, `compareMargin`, `tradingDashboard`, `tradingMatching`, and `poOutstanding`. Mock rows were reset where legacy baseline is empty, PO table columns were re-aligned, and `tradingDashboard` gradient/section order was checked against legacy.
- 2026-05-16: Batch 7 Playwright visual audit completed for Finance/Debt pages: `ar`, `ap`, `bank`, `cashPosition`, `supplierAdvance`, and `customerAdvance`. Non-legacy actions/mock rows were removed, AP aging columns were restored, Bank Statement was reset to the one-row baseline, and gradient/card order was checked where present.
- 2026-05-16: Batch 8 Playwright visual audit completed for Foreign Finance pages: `intlTransfer`, `overseasReceipt`, `fxRate`, `fcdLedger`, `fxGainLossReport`, and `bankRecon`. Mock KPI/cards/rows were reset where legacy baseline is empty, foreign transfer/receipt table columns were re-aligned, and reconciliation mock actions were removed from the baseline.
- 2026-05-16: Batch 9 Playwright visual audit completed for Stock pages: `stockBalance`, `stockLedger`, `statusConvert`, `gradeAdjustment`, `stockAdjust`, and `customerReturn`. New-style simplified stock screens were re-aligned to legacy headings/actions/table columns, with mock rows removed and gradient/card ordering checked where present.
- 2026-05-16: Batch 10 Playwright visual audit completed for Reports / Finance Accounting pages: `reports`, `finDashboard`, `cashFlowAnalysis`, `cashFlowForecast`, `workingCapital`, `stockFinance`, `profitLeak`, `taxVAT`, `plStatement`, `balanceSheet`, and `cashFlowStatement`. Report tab baseline, finance section headings, Profit Leak tables, Tax/VAT/WHT tables, and P&L quick filters were aligned with legacy screenshots.
- 2026-05-16: Batch 11 Playwright visual audit completed for Assets / Loans / System gaps: `assetRegister`, `depreciation`, `assetDisposal`, `loanContracts`, `loanDashboard`, `equityMaint`, `openingBalance`, `historicalData`, `changePassword`, `transactionLedger`, and `audit`. Sample fixtures were reset to legacy empty baselines where needed, and route/menu titles with embedded legacy icons were restored for this group.
- 2026-05-16: Batch 12 Master/Admin visual audit started with parallel subagent support. Completed fixes include `mdCustomer`, `mdSalesperson`, `mdDirector`, `mdMachine`, `mdProductionLine`, `mdBeneficiary`, `mdPaymentMethod`, and `mdRemittancePurpose`: list-first master baseline, legacy action order, Thai route titles, table action columns, and fixture rows for screenshot parity. `npm run build` passed after the sub-batch.
- 2026-05-17: Batch 12 master core follow-up completed for `mdProduct`, `mdAccount`, `mdChannel`, `mdExpense`, and `mdCurrency`. Restored legacy table columns/actions, tab ordering, fixture rows, and removed non-legacy table titles. `mdWarehouse` was sanity checked as a Vue split route because legacy exposes it as part of `สาขา / คลัง`, not a standalone view. `npm test` and `npm run build` passed.
- 2026-05-17: `poSell` (`/sales/po-sell`) was rechecked against `https://sirimasth.github.io/ns-scrap-erp/` through the live sidebar menu. Vue content baseline now matches the legacy empty-state page: purpose banner, 6 KPI cards, Top 5 Customer, PO ค้างส่งสินค้า, filter bar order, found-count label, 2-decimal totals, and match table headers. Screenshots saved in `reports/frontend-visual-audit/po-sell-final/`.
- 2026-05-17: `costAllocator` (`/dual-costing/cost-allocator`) was rechecked against `https://sirimasth.github.io/ns-scrap-erp/` through the live sidebar menu. Vue now matches the live empty baseline: route/menu title `Cost Allocator (ทอง/เหลือง)`, dual-costing intro copy, step ⓪ source selector, PO Sell/Spot Sell buttons, and empty product select. Screenshots saved in `reports/frontend-visual-audit/cost-allocator-final/`.
- 2026-05-17: `finDashboard` (`/finance-accounting/financial-dashboard`) was rechecked against `https://sirimasth.github.io/ns-scrap-erp/` through the live sidebar menu. Vue visual fixture was reset to the live baseline: empty 6-month P&L chart, Cash & Bank-only asset donut, 0-value cash need/inflow cards, full finance section cards, P&L summary, balance sheet, and Cash Health Insights. Screenshots saved in `reports/frontend-visual-audit/financial-dashboard-final/`.
- 2026-05-17: `cashFlowForecast` (`/finance-accounting/cf-forecast-calendar`) was rechecked against `https://sirimasth.github.io/ns-scrap-erp/` through the live sidebar menu. Vue visual fixture was reset to the live 30-day baseline: 9,100,000.00 start/end cash, no expected in/out events, flat forecast graph, 30-day calendar beginning 2026-05-17, two-decimal money formatting, and empty AR/AP insight tables. Screenshots saved in `reports/frontend-visual-audit/cash-flow-forecast-final/`.
- 2026-05-17: `workingCapital` (`/finance-accounting/working-capital`) was rechecked against `https://sirimasth.github.io/ns-scrap-erp/` through the live sidebar menu. Vue visual fixture was reset to the live zero-state baseline: 90-day period selector, CCC 0.0 card, full-width CCC breakdown bars, Current/Quick ratio gauges, Stock Turnover panel, 7 KPI cards, five analysis cards, and the legacy calculation table. Screenshots saved in `reports/frontend-visual-audit/working-capital-final/`.
- 2026-05-17: `plStatement` (`/finance-accounting/pl-statement`) was rechecked against `https://sirimasth.github.io/ns-scrap-erp/` through the live sidebar menu. Vue visual fixture was reset to the live zero-state baseline: period toolbar order, branch selector, quick range buttons, 2026-05-17 period end date, zero Net Profit waterfall, Stock vs Trading split cards, split GP mini chart, and two-decimal money formatting. Screenshots saved in `reports/frontend-visual-audit/pl-statement-final/`.
- 2026-05-17: `mdCustomer` (`/master-data/customers`) was rechecked against `https://sirimasth.github.io/ns-scrap-erp/` through the live sidebar menu. Vue now keeps real query wiring but falls back to the live visual baseline when the new DB query is empty: 3 customer rows, checkbox column, action order, active status wording, and two-decimal credit limits. Screenshots saved in `reports/frontend-visual-audit/customer-master-final/`.
- 2026-05-17: `matchLog` (`/dual-costing/match-log`) was rechecked against `https://sirimasth.github.io/ns-scrap-erp/` through the live sidebar menu. Vue now matches the live empty baseline: 2-decimal total qty/cost values, cost-type option icons, no PO Sell fixture options, and matching filter/table text. Screenshots saved in `reports/frontend-visual-audit/match-log-final/`.
- 2026-05-17: `ar` (`/finance/ar`) was rechecked against `https://sirimasth.github.io/ns-scrap-erp/` through the live sidebar menu. Vue now matches the live empty baseline: removed visual fixture AR rows and pending-sale banner, restored 2-decimal totals, live customer/channel filter options, aging bucket labels/colors, Top 5 empty state, and table empty state. Screenshots saved in `reports/frontend-visual-audit/ar-final/`.
- 2026-05-17: `ap` (`/finance/ap`) was reworked as a detailed visual fixture against `https://sirimasth.github.io/ns-scrap-erp/` menu-flow reference. The legacy AP structure is preserved while Vue intentionally shows mock payables across aging buckets: mega payable card, aging bars, Top 5 suppliers, KPI cards, aging cards, summary/detail tabs, supplier/channel filters, summary totals, and detail rows. Screenshots saved in `reports/frontend-visual-audit/ap-visual-fixture/`.
- 2026-05-17: `bank` (`/finance/bank`) was rechecked against `https://sirimasth.github.io/ns-scrap-erp/` through the live sidebar menu. Vue now matches the live empty baseline: account option list, default cash HQ account, opening balance `500,000.00`, opening row date `-`, and 2-decimal money formatting. Screenshots saved in `reports/frontend-visual-audit/bank-final/`.
- 2026-05-17: `cashPosition` (`/finance/cash-position`) was rechecked against `https://sirimasth.github.io/ns-scrap-erp/` through the live sidebar menu. Vue now matches the live cash baseline: 7 account rows, cash/bank/FCD/OD totals, AR/AP zero state, Top account order, lower Net Cash Position card, and 2-decimal money formatting. Screenshots saved in `reports/frontend-visual-audit/cash-position-final/`.
- 2026-05-17: `fxRate` (`/finance/foreign/fx-rate`) was rechecked against `https://sirimasth.github.io/ns-scrap-erp/` through the live sidebar menu. Vue now matches the live FX baseline: `2026-05-17` history rows, 5 latest-rate cards including `SGD → THB`, JPY/EUR card order, and 2-decimal rate formatting. Screenshots saved in `reports/frontend-visual-audit/fx-rate-final/`.
- 2026-05-17: `stockBalance` (`/stock/balance`) was rechecked against `https://sirimasth.github.io/ns-scrap-erp/` through the live sidebar menu. Vue now restores the live empty baseline: blue/cyan hero subtitle, 5 KPI cards, RM/WIP/FG summary cards, filter row, empty donut/top-category panels, and empty matrix table. Screenshots saved in `reports/frontend-visual-audit/stock-balance-final/`.
- 2026-05-17: `stockLedger` (`/stock/ledger`) was rechecked against `https://sirimasth.github.io/ns-scrap-erp/` through the live sidebar menu. Vue now restores the live empty baseline: product/branch/type/date filters, balance-mode toggle, negative-count chip, soft duplicate/orphan cleanup actions, found-count badge, fixed-width ledger table, and `ยังไม่มี Stock Movement` empty state. Screenshots saved in `reports/frontend-visual-audit/stock-ledger-final/`.
- 2026-05-17: `gradeAdjustment` (`/stock/convert`) was rechecked against `https://sirimasth.github.io/ns-scrap-erp/` through the live sidebar menu. Vue now restores the live empty baseline: cyan/teal hero, `+ ปรับเกรดใหม่` action, 7 summary cards, search/source/cost filters, Source/Target color-banded table headers, and `ยังไม่มีรายการปรับเกรด` empty state. Screenshots saved in `reports/frontend-visual-audit/grade-adjustment-final/`.
- 2026-05-17: `stockAdjust` (`/stock/adjust`) was rechecked against `https://sirimasth.github.io/ns-scrap-erp/` through the live sidebar menu. Vue now restores the live empty baseline: orange hero, Note-only principle block, 5 KPI cards, quick-adjust/search/filter toolbar, empty stock-adjust table, and `💡 ใช้เมื่อไหร่` guidance block. Screenshots saved in `reports/frontend-visual-audit/stock-adjust-final/`.
- 2026-05-17: `customerReturn` (`/stock/customer-return`) was rechecked against `https://sirimasth.github.io/ns-scrap-erp/` through the live sidebar menu. Vue now restores the live empty baseline: purple/pink hero subtitle, 3 KPI cards, search/branch/CSV toolbar, empty customer-return table, and `💡 ข้อแนะนำ` guidance block. Screenshots saved in `reports/frontend-visual-audit/customer-return-final/`.
- 2026-05-17: Batch 12 parallel subagent pass completed for remaining master gaps, import pages, and admin pages: `mdProductionLine`, `mdBeneficiary`, `mdRemittancePurpose`, `mdImport`, `importTxn`, `companyProfile`, `userPermission`, `userActivity`, and `backup`. Added the missing `importTxn` visual-compare mapping, restored legacy fixture baselines/card orders/action columns, and kept destructive import/backup/admin actions as placeholders. `npm test` and `npm run build` passed after merge.
- 2026-05-17: Main/tracking pending visual batch completed for `profitCostAnalysis`, `pendingSales`, `salesPlan`, `salesCommission`, `cashFlowCalendar`, `businessCalendar`, `cashOthersSummary`, `customerTracking`, `supplierTracking`, and `productTracking`. Added missing visual-compare mappings, restored legacy baseline wording/layout for pending sales, sales plan, sales tracking, business calendar, cash summary, and supplier tracking, and kept legacy shell-only floating export/Auto-Sync out of the Vue app.
- 2026-05-17: Live GitHub Pages visual compare added via `scripts/visual-compare-live.mjs` and run against `https://sirimasth.github.io/ns-scrap-erp/` using `admin/admin`. `cashOthersSummary` was re-aligned to live layout, two-decimal money formatting, and the customer-visible Trading Pending รับเงิน block. Pending Sales was later rebuilt against the legacy menu-flow baseline.
- 2026-05-17: `pendingSales` rebuilt again from the legacy menu-flow page, not a direct URL check. Vue now restores the legacy Pending Sales surface: header subtitle, LME Config inputs, LME % details table, Customer/metal-group filters, KPI row, summary/detail tables, and Pool & Stock RM/FG/WIP sections. Playwright screenshots saved as `reports/frontend-visual-audit/pendingSales-menu-flow-legacy.png` and `reports/frontend-visual-audit/pendingSales-menu-flow-vue.png`.
- 2026-05-17: Batch A detailed visual/cleanup pass completed for `cashOthersSummary` and `pendingSales`. Playwright opened both pages through the sidebar menu and captured desktop/mobile screenshots under `reports/frontend-visual-audit/batch-a/`. `PendingSalesView.vue` was reduced from 556 to 235 lines by splitting header/LME/filter/KPI/table/pool-stock sections and moving populated visual data into `pendingSales/visualFixtures.ts`. `CashOthersSummaryView.vue` fixture naming was clarified with `cashOthersVisual...`.
- 2026-05-17: Batch B live-baseline pass started against `https://sirimasth.github.io/ns-scrap-erp/` for main pages. Captured live/Vue desktop/mobile screenshots for `ownerDaily`, `anomalyDetector`, `dailyReport`, `dashboard`, and `profitCostAnalysis` under `reports/frontend-visual-audit/batch-b-live-main-1/`. Fixed `anomalyDetector` empty baseline to match `ทุกอย่างปกติ!` and restored the `หมวดสินค้า (ทุกหมวด)` chip bar on `profitCostAnalysis`; rerun screenshots saved under `batch-b-live-main-1-rerun/`.
- 2026-05-17: `businessCalendar` was checked directly against the live GitHub Pages baseline and Vue `/business-calendar`; visible structure, mode controls, chart headings, and summary table headings match. Screenshots saved under `reports/frontend-visual-audit/business-calendar-live/`.
- 2026-05-17: `businessCalendar` Round 3 completed against local legacy menu-flow baseline at `http://127.0.0.1:5180/`. Vue now uses the empty visual baseline, two-decimal KPI money formatting, legacy-style chart grid/legend, and all-day combined table with no extra calendar grid. Screenshots saved under `reports/frontend-visual-audit/business-calendar-local-rerun-2/`.
- 2026-05-17: `supplierTracking` live menu-flow rerun completed against `https://sirimasth.github.io/ns-scrap-erp/` using `admin/admin`. Live baseline is empty, but Vue intentionally keeps populated `supplierTrackingVisualSuppliers` fixtures for backend/refactor baseline: KPI cards, Top 5, monthly chart, and table rows are visible with sample values. Screenshots were saved under `reports/frontend-visual-audit/supplier-tracking-visual-fixture-rerun/`.
- 2026-05-17: `payment` / `จ่ายเงิน Supplier` live menu-flow rerun completed against `https://sirimasth.github.io/ns-scrap-erp/`. Vue now aligns the empty payment baseline more closely: two-decimal summary cards, outstanding panel, history heading, history filter labels, voucher badges, and payment history table headers (`📋 บิลซื้อที่ตัดชำระ`, `บัญชี`, `วิธี`, `รายการ`, `ยอดรวม`). Screenshots were saved under `reports/frontend-visual-audit/supplier-payments-menu-flow-rerun/`.
- 2026-05-17: `productionDashboard` live menu-flow baseline checked against `https://sirimasth.github.io/ns-scrap-erp/`. Live baseline is empty, but Vue intentionally uses populated production visual fixtures for backend/refactor baseline: KPI cards, daily line chart, monthly grouped bar chart, order-status donut, Top 10 products, and Machine Utilization are all visible. Screenshots were saved under `reports/frontend-visual-audit/production-dashboard-visual-fixture/`.
- 2026-05-17: Visual baseline checkpoint accepted for the current frontend clone pass. The latest detailed rechecks covered finance/accounting (`finDashboard`, `cashFlowForecast`, `workingCapital`, `plStatement`), master data (`mdCustomer`), stock pages, core finance/debt pages, and selected high-drift dashboards. At this checkpoint, the Vue UI is sufficient to pause visual cloning and move toward Auth/Role mapping plus real service/function wiring. Remaining visual mismatches should be handled as targeted follow-up issues, not as a blocker for the next phase.

## Current Snapshot

- Frontend clone coverage: all inventoried sidebar/pages have Vue routes and view components.
- Sidebar/menu: direct Vue route mapping only; duplicate leading icons in labels removed.
- User-facing cleanup: visible clone/migration/dev-bypass wording removed from reviewed pages and shell.
- Runtime separation: `old-apps/legacy/` is archived source only; the new Vue app does not import or execute it.
- Verification: `npm run build` and `npm test` passed on 2026-05-17 after the latest `mdCustomer` visual fallback update.
- Visual baseline status: sufficient for the current clone checkpoint. The app is ready to stop broad visual-clone work and proceed to Auth/Role planning and service wiring.
- Remaining UI risk: small spacing/icon/font mismatches may remain and should be logged/fixed page-by-page only when found during Auth/function work or user review.
- Remaining functional risk: most cloned pages are still `Function Pending`; real reads/writes must be wired after Auth/Role mapping.

## Next Active Work

1. Connect Supabase Auth login against `dev-target`.
2. Persist session, protect routes, and map sidebar/action visibility by role.
3. Wire real read/write services page-by-page, starting with master data and low-risk setup pages before transaction-heavy pages.
4. Add validation/type coverage before connecting each real mutation.
5. Keep visual fixes targeted during function wiring; do not restart broad UI clone unless new drift is reported.

## Validation / Type Strategy

- During pure UI clone, deep form validation can stay pending as long as no real mutation is connected.
- Before wiring a form to real create/update/delete, that form needs minimum Zod schema, TypeScript payload type, required-field checks, numeric/date coercion rules, and user-facing error state.
- Shared validation patterns should be extracted module-by-module, not after every screen is already wired.
- Full reconciliation and cross-table validation still belongs later in the database/migration phase.

## Clone Order From This Point

Priority is based on user-facing flow and dependency risk: daily operations first, then master/setup gaps, then finance/inventory reports, then advanced dashboards.

| Priority | Batch | Group | Pages | Reason |
|---|---:|---|---|---|
| 1 | 7 | รายการประจำวัน | `paymentApproval`, `transfer`, `expense`, `pettyAdvance`, `expenseDashboard` | Daily money movement and approval surfaces must exist before role/action mapping. |
| 2 | 8 | การผลิต | `production`, `productionDashboard`, `wipReport`, `productionReport`, `machineUtil` | Core operation module; needs screens before production permissions/functions. |
| 3 | 9 | Dual Costing / Trading | `costPool`, `costAllocator`, `matchLog`, `dealMargin`, `compareMargin` | Depends on PO Buy/Sell surfaces already present. |
| 4 | 10 | การเงิน & หนี้ | `ar`, `ap`, `bank`, `cashPosition`, `supplierAdvance`, `customerAdvance` | Finance overview and debt tracking after daily transaction screens. |
| 5 | 11 | สินค้า gaps | `statusConvert`, `customerReturn`, plus split `gradeAdjustment` if needed | Stock menu is visible; remaining inventory workflows should become real pages. |
| 6 | 12 | ข้อมูลหลัก gaps | `mdDirector`, `mdMachine`, `mdProductionLine`, `mdBeneficiary`, `mdPaymentMethod`, `mdRemittancePurpose`, `mdImport`, `importTxn` | Master/setup screens that support later functions and imports. |
| 7 | 13 | หน้าหลัก / Tracking | `ownerDaily`, `anomalyDetector`, `dailyReport`, `profitCostAnalysis`, `salesPlan`, `salesCommission`, `cashFlowCalendar`, `businessCalendar`, `cashOthersSummary`, `customerTracking`, `supplierTracking`, `productTracking` | Dashboards/tracking after core transaction surfaces are present. |
| 8 | 14 | การเงินต่างประเทศ | `intlTransfer`, `overseasReceipt`, `fxRate`, `fcdLedger`, `fxGainLossReport`, `bankRecon` | Specialized finance flows. |
| 9 | 15 | Finance / Accounting reports | `finDashboard`, `cashFlowAnalysis`, `cashFlowForecast`, `workingCapital`, `stockFinance`, `profitLeak`, `taxVAT`, `plStatement`, `balanceSheet`, `cashFlowStatement` | Management/accounting reports after source screens. |
| 10 | 16 | Assets / Loans / System gaps | `assetRegister`, `depreciation`, `assetDisposal`, `loanContracts`, `loanDashboard`, `equityMaint`, `openingBalance`, `historicalData`, `changePassword`, `transactionLedger`, `audit` | Lower-frequency admin/accounting setup and system screens. |

## Batch Plan

| Batch | Legacy View | New Route | New File | UI | Wording | Build | Browser | Function |
|---|---|---|---|---|---|---|---|---|
| 1 | login/shell | `/login`, `/` | `LoginView.vue`, `AppShell.vue` | Cloned UI | Wording Checked | Build Passed | Pending | Function Pending |
| 1 | `view-userPermission` | `/admin/users-permissions` | `views/admin/UsersPermissionsView.vue` | Cloned UI | Wording Checked | Build Passed | Pending | Function Pending |
| 1 | `view-companyProfile` | `/admin/company-profile` | `views/admin/CompanyProfileView.vue` | Cloned UI | Wording Checked | Build Passed | Pending | Function Pending |
| 1 | `view-userActivity` | `/admin/user-activity` | `views/admin/UserActivityView.vue` | Cloned UI | Wording Checked | Build Passed | Pending | Function Pending |
| 1 | `view-backup` | `/admin/migration-tools` | `views/admin/MigrationToolsView.vue` | Cloned UI | Wording Checked | Build Passed | Pending | Function Pending |
| 2 | `view-mdBranch` | `/master-data/branches` | `views/masterData/BranchesView.vue` | Cloned UI | Wording Checked | Build Passed | Pending | Function Partial |
| 2 | warehouse legacy surface | `/master-data/warehouses` | `views/masterData/WarehousesView.vue` | Cloned UI | Wording Checked | Build Passed | Pending | Function Partial |
| 2 | `view-mdCustomer` | `/master-data/customers` | `views/masterData/CustomersView.vue` | Cloned UI | Wording Checked | Build Passed | Playwright Checked | Function Partial |
| 2 | `view-mdSupplier` | `/master-data/suppliers` | `views/masterData/SuppliersView.vue` | Cloned UI | Wording Checked | Build Passed | Pending | Function Pending |
| 2 | `view-mdSalesperson` | `/master-data/salespersons` | `views/masterData/SalespersonsView.vue` | Cloned UI | Wording Checked | Build Passed | Pending | Function Pending |
| 3 | `view-mdProduct` | `/master-data/products` | `views/masterData/ProductsView.vue` | Cloned UI | Wording Checked | Build Passed | Pending | Function Pending |
| 3 | `view-mdAccount` | `/master-data/accounts` | `views/masterData/AccountsView.vue` | Cloned UI | Wording Checked | Build Passed | Pending | Function Pending |
| 3 | `view-mdCurrency` | `/master-data/currencies` | `views/masterData/CurrenciesView.vue` | Cloned UI | Wording Checked | Build Passed | Pending | Function Pending |
| 3 | `view-mdExpense` | `/master-data/expense-categories` | `views/masterData/ExpenseCategoriesView.vue` | Cloned UI | Wording Checked | Build Passed | Pending | Function Pending |
| 3 | `view-mdChannel` | `/master-data/channels` | `views/masterData/ChannelsView.vue` | Cloned UI | Wording Checked | Build Passed | Pending | Function Pending |
| 4 | `view-purchase` | `/purchase` | `views/purchase/PurchaseBillsView.vue` | Cloned UI | Wording Checked | Build Passed | Pending | Function Pending |
| 4 | `view-receiptVoucher` | `/purchase/receipt-vouchers` | `views/purchase/ReceiptVouchersView.vue` | Cloned UI | Wording Checked | Build Passed | Pending | Function Pending |
| 4 | `view-poBuy` | `/purchase/po-buy` | `views/purchase/PoBuyView.vue` | Cloned UI | Wording Checked | Build Passed | Pending | Function Pending |
| 4 | `view-payment` | `/purchase/payments` | `views/purchase/SupplierPaymentsView.vue` | Cloned UI | Wording Checked | Build Passed | Pending | Function Pending |
| 4 | purchase payment link surface | `/purchase/payments` | `views/purchase/SupplierPaymentsView.vue` | Cloned UI | Wording Checked | Build Passed | Pending | Function Pending |
| 5 | `view-sales` | `/sales` | `views/sales/SalesBillsView.vue` | Cloned UI | Wording Checked | Build Passed | Pending | Function Pending |
| 5 | `view-pendingSales` | `/sales/pending` | `views/sales/PendingSalesView.vue` | Cloned UI | Wording Checked | Build Passed | Playwright Checked | Function Pending |
| 5 | `view-stockIssue` | `/sales/stock-issue` | `views/sales/StockIssueView.vue` | Cloned UI | Wording Checked | Build Passed | Pending | Function Pending |
| 5 | `view-poSell` | `/sales/po-sell` | `views/sales/PoSellView.vue` | Cloned UI | Wording Checked | Build Passed | Playwright Checked | Function Pending |
| 5 | `view-receipt` | `/sales/receipts` | `views/sales/CustomerReceiptsView.vue` | Cloned UI | Wording Checked | Build Passed | Pending | Function Pending |
| 6 | `view-stockLedger` | `/stock/ledger` | `views/stock/StockLedgerView.vue` | Cloned UI | Wording Checked | Build Passed | Playwright Checked | Function Pending |
| 6 | `view-stockBalance` | `/stock/balance` | `views/stock/StockBalanceView.vue` | Cloned UI | Wording Checked | Build Passed | Playwright Checked | Function Pending |
| 6 | `view-stockTransfer` | `/stock/transfer` | `views/stock/StockTransferView.vue` | Cloned UI | Wording Checked | Build Passed | Pending | Function Pending |
| 6 | `view-stockAdjust` | `/stock/adjust` | `views/stock/StockAdjustView.vue` | Cloned UI | Wording Checked | Build Passed | Playwright Checked | Function Pending |
| 6 | `view-gradeAdjustment` / `view-statusConvert` | `/stock/convert` | `views/stock/GradeStatusConvertView.vue` | Cloned UI | Wording Checked | Build Passed | Playwright Checked | Function Pending |
| 7 | `view-paymentApproval` | `/daily/payment-approval` | `views/daily/PaymentApprovalView.vue` | Cloned UI | Wording Checked | Build Passed | Pending | Function Pending |
| 7 | `view-transfer` | `/daily/transfer` | `views/daily/TransferView.vue` | Cloned UI | Wording Checked | Build Passed | Pending | Function Pending |
| 7 | `view-expense` | `/daily/expense` | `views/daily/ExpenseView.vue` | Cloned UI | Wording Checked | Build Passed | Pending | Function Pending |
| 7 | `view-pettyAdvance` | `/daily/petty-advance` | `views/daily/PettyAdvanceView.vue` | Cloned UI | Wording Checked | Build Passed | Pending | Function Pending |
| 7 | `view-expenseDashboard` | `/daily/expense-dashboard` | `views/daily/ExpenseDashboardView.vue` | Cloned UI | Wording Checked | Build Passed | Pending | Function Pending |
| 8 | `view-production` | `/production/orders` | `views/production/ProductionView.vue` | Cloned UI | Wording Checked | Build Passed | Pending | Function Pending |
| 8 | `view-productionDashboard` | `/production/dashboard` | `views/production/ProductionDashboardView.vue` | Cloned UI | Wording Checked | Build Passed | Pending | Function Pending |
| 8 | `view-wipReport` | `/production/wip-report` | `views/production/WipReportView.vue` | Cloned UI | Wording Checked | Build Passed | Pending | Function Pending |
| 8 | `view-productionReport` | `/production/report` | `views/production/ProductionReportView.vue` | Cloned UI | Wording Checked | Build Passed | Pending | Function Pending |
| 8 | `view-machineUtil` | `/production/machine-utilization` | `views/production/MachineUtilizationView.vue` | Cloned UI | Wording Checked | Build Passed | Pending | Function Pending |
| 9 | `view-costPool` | `/dual-costing/cost-pool` | `views/dualCosting/CostPoolView.vue` | Cloned UI | Wording Checked | Build Passed | Pending | Function Pending |
| 9 | `view-costAllocator` | `/dual-costing/cost-allocator` | `views/dualCosting/CostAllocatorView.vue` | Cloned UI | Wording Checked | Build Passed | Playwright Checked | Function Pending |
| 9 | `view-matchLog` | `/dual-costing/match-log` | `views/dualCosting/MatchLogView.vue` | Cloned UI | Wording Checked | Build Passed | Playwright Checked | Function Pending |
| 9 | `view-dealMargin` | `/dual-costing/deal-margin` | `views/dualCosting/DealMarginView.vue` | Cloned UI | Wording Checked | Build Passed | Pending | Function Pending |
| 9 | `view-compareMargin` | `/dual-costing/compare-margin` | `views/dualCosting/CompareMarginView.vue` | Cloned UI | Wording Checked | Build Passed | Pending | Function Pending |
| 9 | `view-tradingDashboard` | `/trading/dashboard` | `views/dualCosting/TradingDashboardView.vue` | Cloned UI | Wording Checked | Build Passed | Pending | Function Pending |
| 9 | `view-tradingMatching` | `/trading/matching` | `views/dualCosting/TradingMatchingView.vue` | Cloned UI | Wording Checked | Build Passed | Pending | Function Pending |
| 9 | `view-poOutstanding` | `/po-reports/outstanding` | `views/dualCosting/PoOutstandingView.vue` | Cloned UI | Wording Checked | Build Passed | Pending | Function Pending |
| 10 | `view-ar` | `/finance/ar` | `views/finance/ArView.vue` | Cloned UI | Wording Checked | Build Passed | Playwright Checked | Function Pending |
| 10 | `view-ap` | `/finance/ap` | `views/finance/ApView.vue` | Cloned UI | Wording Checked | Build Passed | Playwright Checked | Function Pending |
| 10 | `view-bank` | `/finance/bank` | `views/finance/BankStatementView.vue` | Cloned UI | Wording Checked | Build Passed | Playwright Checked | Function Pending |
| 10 | `view-cashPosition` | `/finance/cash-position` | `views/finance/CashPositionView.vue` | Cloned UI | Wording Checked | Build Passed | Playwright Checked | Function Pending |
| 10 | `view-supplierAdvance` | `/finance/supplier-advance` | `views/finance/SupplierAdvanceView.vue` | Cloned UI | Wording Checked | Build Passed | Pending | Function Pending |
| 10 | `view-customerAdvance` | `/finance/customer-advance` | `views/finance/CustomerAdvanceView.vue` | Cloned UI | Wording Checked | Build Passed | Pending | Function Pending |
| 10 | `view-intlTransfer` | `/finance/foreign/intl-transfer` | `views/finance/IntlTransferView.vue` | Cloned UI | Wording Checked | Build Passed | Pending | Function Pending |
| 10 | `view-overseasReceipt` | `/finance/foreign/overseas-receipt` | `views/finance/OverseasReceiptView.vue` | Cloned UI | Wording Checked | Build Passed | Pending | Function Pending |
| 10 | `view-fxRate` | `/finance/foreign/fx-rate` | `views/finance/FxRateView.vue` | Cloned UI | Wording Checked | Build Passed | Playwright Checked | Function Pending |
| 10 | `view-fcdLedger` | `/finance/foreign/fcd-ledger` | `views/finance/FcdLedgerView.vue` | Cloned UI | Wording Checked | Build Passed | Pending | Function Pending |
| 10 | `view-fxGainLossReport` | `/finance/foreign/fx-gain-loss-report` | `views/finance/FxGainLossReportView.vue` | Cloned UI | Wording Checked | Build Passed | Pending | Function Pending |
| 10 | `view-bankRecon` | `/finance/foreign/bank-reconciliation` | `views/finance/BankReconciliationView.vue` | Cloned UI | Wording Checked | Build Passed | Pending | Function Pending |
| 11 | `view-mdDirector` | `/master-data/directors` | `views/masterDataGaps/DirectorsView.vue` | Cloned UI | Wording Checked | Build Passed | Pending | Function Pending |
| 11 | `view-mdMachine` | `/master-data/machines` | `views/masterDataGaps/MachinesView.vue` | Cloned UI | Wording Checked | Build Passed | Pending | Function Pending |
| 11 | `view-mdProductionLine` | `/master-data/production-lines` | `views/masterDataGaps/ProductionLinesView.vue` | Cloned UI | Wording Checked | Build Passed | Pending | Function Pending |
| 11 | `view-mdBeneficiary` | `/master-data/beneficiaries` | `views/masterDataGaps/BeneficiariesView.vue` | Cloned UI | Wording Checked | Build Passed | Pending | Function Pending |
| 11 | `view-mdPaymentMethod` | `/master-data/payment-methods` | `views/masterDataGaps/PaymentMethodsView.vue` | Cloned UI | Wording Checked | Build Passed | Pending | Function Pending |
| 11 | `view-mdRemittancePurpose` | `/master-data/remittance-purposes` | `views/masterDataGaps/RemittancePurposesView.vue` | Cloned UI | Wording Checked | Build Passed | Pending | Function Pending |
| 11 | `view-mdImport` | `/master-data/import` | `views/masterDataGaps/MasterImportView.vue` | Cloned UI | Wording Checked | Build Passed | Pending | Function Pending |
| 11 | `view-importTxn` | `/master-data/import-transactions` | `views/masterDataGaps/TransactionImportView.vue` | Cloned UI | Wording Checked | Build Passed | Pending | Function Pending |
| 12 | `view-statusConvert` | `/stock/status-convert` | `views/stockGaps/StatusConvertView.vue` | Cloned UI | Wording Checked | Build Passed | Pending | Function Pending |
| 12 | `view-customerReturn` | `/stock/customer-return` | `views/stockGaps/CustomerReturnView.vue` | Cloned UI | Wording Checked | Build Passed | Playwright Checked | Function Pending |
| 13 | `view-ownerDaily` | `/owner-daily` | `views/trackingDashboards/OwnerDailyView.vue` | Cloned UI | Wording Checked | Build Passed | Pending | Function Pending |
| 13 | `view-anomalyDetector` | `/anomaly-detector` | `views/trackingDashboards/AnomalyDetectorView.vue` | Cloned UI | Wording Checked | Build Passed | Pending | Function Pending |
| 13 | `view-dailyReport` | `/daily-report` | `views/trackingDashboards/DailyReportView.vue` | Cloned UI | Wording Checked | Build Passed | Pending | Function Pending |
| 13 | `view-profitCostAnalysis` | `/profit-cost-analysis` | `views/trackingDashboards/ProfitCostAnalysisView.vue` | Cloned UI | Wording Checked | Build Passed | Playwright Checked | Function Pending |
| 13 | `view-salesPlan` | `/sales-plan` | `views/trackingDashboards/SalesPlanView.vue` | Cloned UI | Wording Checked | Build Passed | Playwright Checked | Function Pending |
| 13 | `view-salesCommission` | `/sales-commission` | `views/trackingDashboards/SalesCommissionView.vue` | Cloned UI | Wording Checked | Build Passed | Playwright Checked | Function Pending |
| 13 | `view-cashFlowCalendar` | `/cash-flow-calendar` | `views/trackingDashboards/CashFlowCalendarView.vue` | Cloned UI | Wording Checked | Build Passed | Playwright Checked | Function Pending |
| 13 | `view-businessCalendar` | `/business-calendar` | `views/trackingDashboards/BusinessCalendarView.vue` | Cloned UI | Wording Checked | Build Passed | Playwright Checked | Function Pending |
| 13 | `view-cashOthersSummary` | `/cash-others-summary` | `views/trackingDashboards/CashOthersSummaryView.vue` | Cloned UI | Wording Checked | Build Passed | Playwright Checked | Function Pending |
| 13 | `view-customerTracking` | `/tracking/customer` | `views/trackingDashboards/CustomerTrackingView.vue` | Cloned UI | Wording Checked | Build Passed | Playwright Checked | Function Pending |
| 13 | `view-supplierTracking` | `/tracking/supplier` | `views/trackingDashboards/SupplierTrackingView.vue` | Cloned UI | Wording Checked | Build Passed | Playwright Checked | Function Pending |
| 13 | `view-productTracking` | `/tracking/product` | `views/trackingDashboards/ProductTrackingView.vue` | Cloned UI | Wording Checked | Build Passed | Playwright Checked | Function Pending |
| 14 | `view-finDashboard` | `/finance-accounting/financial-dashboard` | `views/financeReports/FinancialDashboardView.vue` | Cloned UI | Wording Checked | Build Passed | Playwright Checked | Function Pending |
| 14 | `view-cashFlowAnalysis` | `/finance-accounting/cash-flow-analysis` | `views/financeReports/CashFlowAnalysisView.vue` | Cloned UI | Wording Checked | Build Passed | Pending | Function Pending |
| 14 | `view-cashFlowForecast` | `/finance-accounting/cf-forecast-calendar` | `views/financeReports/CashFlowForecastView.vue` | Cloned UI | Wording Checked | Build Passed | Playwright Checked | Function Pending |
| 14 | `view-workingCapital` | `/finance-accounting/working-capital` | `views/financeReports/WorkingCapitalView.vue` | Cloned UI | Wording Checked | Build Passed | Playwright Checked | Function Pending |
| 14 | `view-stockFinance` | `/finance-accounting/stock-finance` | `views/financeReports/StockFinanceView.vue` | Cloned UI | Wording Checked | Build Passed | Pending | Function Pending |
| 14 | `view-profitLeak` | `/finance-accounting/profit-leak` | `views/financeReports/ProfitLeakView.vue` | Cloned UI | Wording Checked | Build Passed | Pending | Function Pending |
| 14 | `view-taxVAT` | `/finance-accounting/tax-vat-wht` | `views/financeReports/TaxVatView.vue` | Cloned UI | Wording Checked | Build Passed | Pending | Function Pending |
| 14 | `view-plStatement` | `/finance-accounting/pl-statement` | `views/financeReports/PlStatementView.vue` | Cloned UI | Wording Checked | Build Passed | Playwright Checked | Function Pending |
| 14 | `view-balanceSheet` | `/finance-accounting/balance-sheet` | `views/financeReports/BalanceSheetView.vue` | Cloned UI | Wording Checked | Build Passed | Pending | Function Pending |
| 14 | `view-cashFlowStatement` | `/finance-accounting/cash-flow-statement` | `views/financeReports/CashFlowStatementView.vue` | Cloned UI | Wording Checked | Build Passed | Pending | Function Pending |
| 15 | `view-reports` | `/reports` | `views/systemGaps/ReportsView.vue` | Cloned UI | Wording Checked | Build Passed | Pending | Function Pending |
| 15 | `view-assetRegister` | `/finance-accounting/asset-register` | `views/systemGaps/AssetRegisterView.vue` | Cloned UI | Wording Checked | Build Passed | Pending | Function Pending |
| 15 | `view-depreciation` | `/finance-accounting/depreciation` | `views/systemGaps/DepreciationView.vue` | Cloned UI | Wording Checked | Build Passed | Pending | Function Pending |
| 15 | `view-assetDisposal` | `/finance-accounting/asset-disposal` | `views/systemGaps/AssetDisposalView.vue` | Cloned UI | Wording Checked | Build Passed | Pending | Function Pending |
| 15 | `view-loanContracts` | `/finance-accounting/loan-contracts` | `views/systemGaps/LoanContractsView.vue` | Cloned UI | Wording Checked | Build Passed | Pending | Function Pending |
| 15 | `view-loanDashboard` | `/finance-accounting/loan-dashboard` | `views/systemGaps/LoanDashboardView.vue` | Cloned UI | Wording Checked | Build Passed | Pending | Function Pending |
| 15 | `view-equityMaint` | `/finance-accounting/equity-maint` | `views/systemGaps/EquityMaintenanceView.vue` | Cloned UI | Wording Checked | Build Passed | Pending | Function Pending |
| 15 | `view-openingBalance` | `/finance-accounting/opening-balance` | `views/systemGaps/OpeningBalanceView.vue` | Cloned UI | Wording Checked | Build Passed | Pending | Function Pending |
| 15 | `view-historicalData` | `/finance-accounting/historical-data` | `views/systemGaps/HistoricalDataView.vue` | Cloned UI | Wording Checked | Build Passed | Pending | Function Pending |
| 15 | `view-changePassword` | `/admin/change-password` | `views/systemGaps/ChangePasswordView.vue` | Cloned UI | Wording Checked | Build Passed | Pending | Function Pending |
| 15 | `view-transactionLedger` | `/admin/transaction-ledger` | `views/systemGaps/TransactionLedgerView.vue` | Cloned UI | Wording Checked | Build Passed | Pending | Function Pending |
| 15 | `view-audit` | `/admin/audit` | `views/systemGaps/AuditLogView.vue` | Cloned UI | Wording Checked | Build Passed | Pending | Function Pending |
| 16 | `view-billSwapHistory` | `/daily/bill-swap-history` | `views/daily/BillSwapHistoryView.vue` | Cloned UI | Wording Checked | Build Passed | Pending | Function Pending |
| 16 | `view-productionCostReport` | `/production/production-cost-report` | `views/production/ProductionCostReportView.vue` | Cloned UI | Wording Checked | Build Passed | Pending | Function Pending |
| 16 | `view-yieldLossReport` | `/production/yield-loss-report` | `views/production/YieldLossReportView.vue` | Cloned UI | Wording Checked | Build Passed | Pending | Function Pending |

## Full Legacy View Inventory

Extracted from `old-apps/legacy/index.html`:

```text
view-mdCustomer, view-mdSupplier, view-mdProduct, view-mdBranch, view-mdAccount,
view-mdChannel, view-mdExpense, view-mdMachine, view-mdCurrency, view-mdBeneficiary,
view-mdPaymentMethod, view-mdRemittancePurpose, view-mdProductionLine, view-mdDirector,
view-ar, view-ap, view-bank, view-cashPosition, view-stockBalance, view-stockLedger,
view-audit, view-dashboard, view-reports, view-purchase, view-payment, view-receipt,
view-transfer, view-expense, view-stockTransfer, view-sales, view-production,
view-productionReport, view-wipReport, view-machineUtil, view-productionCostReport,
view-yieldLossReport, view-poBuy, view-poSell, view-costPool, view-costAllocator,
view-matchLog, view-dealMargin, view-compareMargin, view-fxRate, view-supplierAdvance,
view-customerAdvance, view-intlTransfer, view-overseasReceipt, view-fcdLedger,
view-fxGainLossReport, view-bankRecon, view-stockIssue, view-paymentApproval,
view-billSwapHistory, view-pendingSales, view-cashFlowCalendar, view-businessCalendar,
view-cashOthersSummary, view-profitCostAnalysis, view-customerTracking,
view-supplierTracking, view-productTracking, view-mdImport, view-assetRegister,
view-depreciation, view-assetDisposal, view-pettyAdvance, view-expenseDashboard,
view-loanContracts, view-loanDashboard, view-plStatement, view-balanceSheet,
view-cashFlowStatement, view-finDashboard, view-cashFlowAnalysis, view-taxVAT,
view-equityMaint, view-workingCapital, view-cashFlowForecast, view-stockFinance,
view-ownerDaily, view-profitLeak, view-importTxn, view-openingBalance,
view-historicalData, view-receiptVoucher, view-userPermission, view-userActivity,
view-customerReturn, view-stockAdjust, view-tradingDashboard, view-tradingMatching,
view-gradeAdjustment, view-poOutstanding, view-salesPlan, view-backup,
view-companyProfile, view-changePassword, view-transactionLedger, view-mdSalesperson,
view-salesCommission, view-dailyReport, view-anomalyDetector, view-productionDashboard,
view-statusConvert
```
