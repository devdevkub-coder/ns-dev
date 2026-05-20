# 19 Next Legacy UI Parity Audit

## Scope

Date: 2026-05-20

Audit target:

- Active app: `apps/next`
- Legacy baseline: downloaded HTML snapshot from `https://sirimasth.github.io/ns-scrap-erp/`
- Excluded sections: `ข้อมูลหลัก` (`master-data`) and `ระบบ` (`admin`)

Method:

- Use source/code scan as the primary coverage method.
- Compare Next route/component surfaces against legacy `app.component('view-*')` blocks.
- Preserve legacy UI first: cards, colors, banners, tables, button placement, labels, spacing, and density.
- Keep write actions disabled/read-only unless schema, permissions, audit, rollback, and reconciliation are already designed.

Baseline notes:

- The remote legacy HTML snapshot differs from local `old-apps/legacy/index.html`, so remote snapshot is the stronger baseline for this audit pass.
- Next has 82 audited routes after excluding `master-data` and `admin`.
- Automatic menu mapping matched 77 routes to legacy views.

## Priority Legend

- `P0`: High UAT/business impact; current Next surface is still generic or misses major legacy workflow surface.
- `P1`: Clear visual/workflow drift; fix after P0.
- `P2`: Smaller polish or secondary behavior drift.
- `P3`: Next-only route or approved deviation candidate.

## P0 Backlog

| Route | Legacy view | Current issue | Next file |
|---|---|---|---|

## Completed In This Parity Pass

| Route | Checkpoint | Notes |
|---|---|---|
| `/daily/payment-approval` | 2026-05-20 | Restored legacy green gradient hero, AP/expense tabs, search/date/approved filters, select all/clear, five KPI strip, amber selected-total action bar, AP/expense dense tables, highlighted bank/account cells, local-only selection/pay amount state, and disabled approve/print controls. No approval mutation, print document generation, DB schema, or API write behavior was added. |
| `/daily/expense-dashboard` | 2026-05-20 | Restored legacy rose/orange dashboard surface for dashboard-only mode: 3/6/12 month selector, four KPI cards, anomaly/no-anomaly panels, category-by-month heatmap, footer totals, and anomaly rule note. It uses existing `/api/daily/expenses` rows and legacy-compatible `amount + vat` dashboard math; no write/export/repair action or new API was added. |
| `/daily/expense` | 2026-05-20 | Restored the first legacy list/read surface: blue Expense Voucher info banner and create CTA, gradient monthly/pending/paid/trend cards, category/payee progress panels, dense filter bar with date/payee/account/status/clear/export shell, and a denser table with due date, reference, category, overdue state, Net Pay emphasis, VAT/WHT breakdown, and edit action. Destructive repair tools, delete, quick-pay, multi-line voucher write, auto category creation, and export remain deferred. |
| `/production/orders` | 2026-05-20 | Restored the first legacy production operations surface: dense filter card with date/status/preset ranges, card-grid order list with status color, target product, input/planned/output KPIs, yield bar, and cost footer; detail opens as a read-only tabbed surface with status actions disabled, target product banner, lock/status banners, six KPI cards, Header/Input/Output/Process Cost/Cost Allocation tabs, production variance panel, and allocation preview. Input/output/reverse/recompute/status mutation remains disabled. |
| `/production/dashboard` | 2026-05-20 | Restored the legacy production dashboard surface: purple/pink hero with range presets and custom dates, four colored KPI cards, daily Input/Output/Loss chart panel, monthly Input/Output chart panel, status panel, Top 10 products table with code/cost/avg cost, and Machine Utilization table. API changes are read-only aggregate fields only; no production mutation, cost recompute, stock write, or posting behavior was added. |
| `/production/production-cost-report` | 2026-05-20 | Restored the legacy cost report surface: date filter/export row, seven cost cards, gradient Total/Cost per Kg card, 13-column cost breakdown table, legacy CSV columns, and cost allocation method field from the read helper. It renders existing read-only `costBreakdown` data; no cost recalculation, stock mutation, or posting behavior was added. |
| `/po-reports/outstanding` | 2026-05-20 | Restored the legacy PO outstanding report surface: purple hero, buy/sell tabs, active CSV export, four colored KPI cards per tab, partner/product filters, cost-deducted warning and read-only checkbox shell, received/sold columns, expected delivery columns, empty states, and footer totals. Cost-deducted toggle remains disabled because it is a cost-pool write side effect requiring audit/permission design. |
| `/reports` | 2026-05-20 | Restored the legacy tabbed aggregate report surface as the primary screen: date range with "เว้นว่างเพื่อดูทุกช่วงเวลา", active `Export CSV รายงานนี้`, five report tabs for purchase/sales channel/supplier/product/customer summaries, dense aggregate tables, totals footer, and read-only `/api/reports/aggregate` data from purchase/sales bills. The existing Next report catalog remains as a secondary shortcut section below the legacy report surface. No write, schema, or mutation behavior was added. |
| `/sales-plan` | 2026-05-20 | Restored the legacy Sales Plan visual shell: amber/orange hero copy, active local month/group/channel filters, green CSV placement, white KPI cards with locked/pending subtitles, the 12-column editable-looking plan table shell, indigo product-analysis table with highlighted available/profit columns and footer totals, and yellow remaining-to-lock table with legacy totals. All add/remove/lock/edit persistence remains disabled/read-only until sales-plan schema, stock reservation semantics, permissions, audit, and rollback are designed. |
| `/dashboard` | 2026-05-20 | Restored the first legacy dashboard visual shell: dark period/filter bar, purple/pink Financial Dashboard hero, slate-blue dashboard container, six gradient KPI cards, chart/aging/channel/quick-insight cluster, warning alert bar, Top Supplier/Customer ranking cards, trend/group panels, and four separate Purchase/Sales/Finance/Stock colored business blocks. This slice reuses the existing read payload only; server-side filters, aging buckets, real chart datasets, cash composition, branch stock tables, and richer dashboard API fields remain follow-up read-only parity work. |
| `/purchase/bills` | 2026-05-20 | Restored the first legacy purchase bill list shell: blue purchase banner, export/create action placement, KPI strip, transaction/source filter density, colored status/type/VAT badges, creator/time column, and compact action cluster while preserving the existing purchase GET/POST/PATCH behavior. Print, supplier swap, cancel, delete, sync, repair, and bulk destructive actions remain deferred/disabled until audit and rollback semantics are designed. |
| `/sales/bills` | 2026-05-20 | Restored the first legacy sales bill read/list shell: amber Pending Sale warning, emerald sales banner, disabled recalc/export/create controls, KPI strip, gross profit/margin and received columns, colored status/type/VAT badges, creator/time column, and disabled action cluster. The sales API was extended only with existing read fields (`ref_no`, transaction mode, VAT invoice metadata, creator/update metadata); no sales write endpoint or schema behavior was added. |
| `/sales/stock-issue` | 2026-05-20 | Restored the first legacy Pending Sale surface: amber/orange hero, four KPI cards for pending count/weight/WAC/estimated sale, status filter, weight/cost/estimate table columns, legacy status wording, and convert/edit/cancel action shell. The stock-issue API was extended only with read filters and derived item quantity; create/edit/convert/cancel/delete remain disabled until stock-ledger reversal, sales-bill generation, audit, permission, and rollback semantics are designed. |
| `/purchase/payments` | 2026-05-20 | Restored the first legacy Payment Voucher money-movement shell in the shared component: rose/red hero, create CTA, five KPI cards, search/date/account filters, outstanding bill selector that pre-fills supplier and amount from existing GET payload, voucher net summary, dense history table with amount/WHT/Fee/net columns, footer totals, account chips, and disabled view/print action shell. Existing POST behavior is preserved; multi-bill voucher, split accounts, print document generation, edit/delete/reverse, and allocation writes remain deferred. |
| `/sales/receipts` | 2026-05-20 | Restored the first legacy Receipt Voucher money-movement shell in the shared component: emerald/green hero, create CTA, KPI cards, search/date/account filters, outstanding bill selector that pre-fills customer and amount from existing GET payload, voucher net summary, dense receipt history table, footer totals, and disabled view/print action shell. Existing POST behavior is preserved; multi-bill voucher, print document generation, edit/delete/reverse, and allocation writes remain deferred. |
| `/purchase/receipt-vouchers` | 2026-05-20 | Restored the first legacy Receipt Voucher read/print surface: blue info header copy, compact search toolbar, disabled create CTA, KPI strip, legacy list columns for seller/tax ID/purchase bill/weight/amount, print/edit/delete action cluster with edit/delete disabled, legacy empty state, footer totals, and read-only print preview using fields already present in `receipt_vouchers`. The GET endpoint now exposes existing print/detail fields only; create/edit/delete/save, purchase-bill prefill, dynamic amount-in-words, company-profile print header wiring, and cloud sync remain deferred. |
| `/daily/petty-advance` | 2026-05-20 | Restored the legacy petty advance shell around the existing write flow: purple/pink hero, five KPI cards, Top 10 recipient panel, compact filter/action bar, type/status chips, used/returned/remaining/action table shape, legacy return modal fields for date/account/notes, and read-only detail modal with summary plus return history. Existing create/edit/return POST semantics are preserved; delete, expense allocation, linked-expense schema assumptions, and destructive cleanup remain deferred. |
| `/daily/bill-swap-history` | 2026-05-20 | Restored the legacy bill-swap history report shell: rose/pink hero, before-VAT explanation, KPI strip, supplier/product/bill search, before/after supplier names, weight derived from amount/price when available, old/new price columns, old/new before-VAT amount columns, before-VAT diff coloring, footer totals, and legacy empty state. The API only adds read joins for supplier names and purchase bill doc numbers; full old/new item snapshot parity remains deferred because the target `bill_swap_history` schema stores compact row fields rather than legacy `oldItems/newItems`. |
| `/production/wip-report` | 2026-05-20 | Restored WIP polish in the shared production report surface: API now exposes `ageDays`, rows sort by age first, WIP table includes age-days column, and rows get amber/red highlighting for stale WIP similar to legacy. No production mutation or schema behavior changed. |
| `/production/report` | 2026-05-20 | Restored the missing legacy report block by adding client-side product output summary before the detail table and stronger table/card visual emphasis using existing read payload fields (`productName`, `outputQty`, `totalCost`). Branch/machine/status server filters and exact multi-output item aggregation remain deferred. |
| `/production/yield-loss-report` | 2026-05-20 | Restored the legacy amber explanation banner and P&L Impact card trio for Yield Gain, Abnormal Loss, and Net P&L using existing API fields. Row amount coloring now emphasizes abnormal loss, gain, and net P&L; output loss reason parity remains deferred until loss-output notes are wired. |
| `/production/machine-utilization` | 2026-05-20 | Restored the legacy formula info banner and expanded table shape with Est.Hrs and total cost columns using existing API fields. Actual yield, yield diff, and utilization now receive legacy-like color emphasis; maintenance status remains read-only. |
| `/daily/transfer` | 2026-05-20 | Restored the legacy transfer filter/action density: blue info copy, compact filter card, account placeholders with direction icons, clear-filter button, period chips for all/today/7 days/current month, inline count/total summary, rounded table shell, and explicit edit/delete action column. Existing create/edit POST behavior is preserved; delete remains disabled because the active Next API has no reviewed DELETE/tombstone flow. |
| `/stock/transfer` | 2026-05-20 | Restored the legacy stock transfer density: compact search/date/from-branch/to-branch filters, all/today/7-days/current-month period chips, inline count/weight summary, blue create CTA, red/emerald source-destination modal panels, sender/receiver/notes fields, item-row density, seven-column table with kg labels, legacy empty state, and disabled cancel action shell. Existing stock ledger POST behavior is preserved; cancel/tombstone flow and sender/receiver persistence remain deferred until schema/write semantics are reviewed. |
| `/pending-sales` | 2026-05-20 | Restored the legacy Pending Sales polish: LME Reference Pricing now uses disabled input-style fields and disabled save shell, LME percent details show product count and editable-looking percent inputs, CSV export is active client-side, gain/diff formulas now use `avgPriceRemain` like legacy, and the Patch 28 `ตารางรอขาย` section is back with formula explanation, five KPI cards, shortage highlighting, dual-costing table, footer totals, and CSV export. All changes are read/report only; LME save, LME percent persistence, matching/allocation writes, and sales-plan locks remain deferred. |

## P1 Backlog

| Route | Legacy view | Current issue | Next file |
|---|---|---|---|

## P2 / Polish

| Route | Legacy view | Current issue |
|---|---|---|
| `/anomaly-detector` | `view-anomalyDetector` | Next scan UI is close, but legacy copy references 40 checks/11 groups and has jump-to-fix behavior. |

## Cross-Cutting Layout Tasks

| Surface | Status | Notes |
|---|---|---|
| Sidebar navigation scroll | 2026-05-20 completed | Preserve sidebar `scrollTop` across route navigation and keep the selected menu item visible instead of resetting the menu to the top after clicking into another page. |

## Parity OK From Current Audit

- `/owner-daily`
- `/daily-report`
- `/profit-cost-analysis`
- `/sales-commission`
- `/cash-flow-calendar`
- `/business-calendar`
- `/cash-others-summary`
- `/tracking/customer`
- `/tracking/supplier`
- `/tracking/product`
- `/stock/balance`
- `/stock/ledger`
- `/stock/convert`
- `/stock/adjust`
- `/stock/status-convert`
- `/stock/customer-return`

## Missing Or Unmapped Legacy Views

Legacy views without a clear active Next counterpart after excluding master/admin:

- `waitingAllocations`
- `costAllocationLedger`
- `dualCostingReport`
- `trackAssetOverview`

Next routes without a direct standalone legacy page:

- `/production/output-categories`: legacy uses output category inside production output form; standalone Next setup route is likely a Next-only supporting page.

## Active Execution Order

1. P2 Anomaly Detector polish: category strip, severity visual parity, copy/rule coverage notes, and record-level jump-to-fix follow-up.
2. P1 Dashboard data parity follow-up: `/dashboard` server-side filters, aging buckets, cash composition, stock-by-branch/group, and richer chart datasets
