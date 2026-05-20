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

## P1 Backlog

| Route | Legacy view | Current issue | Next file |
|---|---|---|---|
| `/purchase/bills` | `view-purchase` | Legacy has dense purchase action/table surface including print/receipt/export/bulk controls; Next shared table appears simplified. | `apps/next/src/components/daily/TransactionBillsPageClient.tsx` |
| `/sales/bills` | `view-sales` | Legacy has pending-sale banner, profit recalc, trading match controls, and denser action surface. | `apps/next/src/components/daily/TransactionBillsPageClient.tsx` |
| `/sales/stock-issue` | `view-stockIssue` | Legacy amber Pending Sale hero and convert-to-sales-bill action surface are not fully cloned. | `apps/next/src/app/sales/stock-issue/page.tsx` |
| `/purchase/payments` | `view-payment` | Next list/form is simplified; legacy supports richer multi-bill payment workflow. | `apps/next/src/components/daily/MoneyMovementPageClient.tsx` |
| `/sales/receipts` | `view-receipt` | Next list/form is simplified; legacy supports richer multi-bill receipt workflow. | `apps/next/src/components/daily/MoneyMovementPageClient.tsx` |
| `/purchase/receipt-vouchers` | `view-receiptVoucher` | Missing blue header/create CTA, create/edit modal, and print preview surface. | `apps/next/src/components/daily/ReceiptVouchersPageClient.tsx` |
| `/daily/petty-advance` | `view-pettyAdvance` | Missing purple/pink hero, five KPI cards, Top 10 recipient panel, and detail modal with linked expenses/returns. | `apps/next/src/components/daily/DailyPettyAdvancePageClient.tsx` |
| `/daily/bill-swap-history` | `view-billSwapHistory` | Missing rose/pink hero, KPI cards, product/weight old/new price, and before-VAT diff table. | `apps/next/src/components/daily/BillSwapHistoryPageClient.tsx` |
| `/production/wip-report` | `view-wipReport` | Missing age-days column/color highlighting and legacy table density. | `apps/next/src/components/production/ProductionReportPageClient.tsx` |
| `/production/report` | `view-productionReport` | Columns are close, but legacy card/table density and grouped report surface are not fully cloned. | `apps/next/src/components/production/ProductionReportPageClient.tsx` |
| `/production/yield-loss-report` | `view-yieldLossReport` | Missing amber info banner and colored P&L Impact card trio. | `apps/next/src/components/production/ProductionReportPageClient.tsx` |
| `/production/machine-utilization` | `view-machineUtil` | Missing formula info banner and legacy columns such as Est.Hrs/cost emphasis. | `apps/next/src/components/production/ProductionReportPageClient.tsx` |

## P2 / Polish

| Route | Legacy view | Current issue |
|---|---|---|
| `/pending-sales` | `view-pendingSales` | Next has main shell, but legacy dashboard/table density should be rechecked before final UAT. |
| `/anomaly-detector` | `view-anomalyDetector` | Next scan UI is close, but legacy copy references 40 checks/11 groups and has jump-to-fix behavior. |
| `/daily/transfer` | `view-transfer` | Missing period chips and exact action density. |
| `/stock/transfer` | `view-stockTransfer` | Needs closer visual pass; likely minor density/action drift. |

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

1. P1 Dashboard data parity follow-up: `/dashboard` server-side filters, aging buckets, cash composition, stock-by-branch/group, and richer chart datasets
2. P1 Daily transaction surfaces
3. P1/P2 production report polish
