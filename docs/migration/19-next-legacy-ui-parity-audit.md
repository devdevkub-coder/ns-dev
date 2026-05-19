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
| `/daily/expense` | `view-expense` | Next flattens expense entry to a single category row. Legacy has voucher lines, dynamic category creation, payee/bank fields, VAT/WHT per line, and pay-now vs pending modes. | `apps/next/src/components/daily/DailyExpensePageClient.tsx` |
| `/daily/expense-dashboard` | `view-expenseDashboard` | Next reuses a simple summary; legacy has rose/orange hero, 3/6/12 month selector, anomaly alert cards, heatmap table, and explanatory note. | `apps/next/src/app/daily/expense-dashboard/page.tsx` |
| `/production/orders` | `view-production` | Missing full tabbed detail editor, status/lock banners, Header/Input/Output/Process Cost/Cost Allocation tabs, and richer status actions. | `apps/next/src/components/production/ProductionOrdersPageClient.tsx` |
| `/production/dashboard` | `view-productionDashboard` | Missing legacy hero, daily/monthly chart panels, status donut, Top 10 product card, and Machine Utilization panel. | `apps/next/src/components/production/ProductionReportPageClient.tsx` |
| `/production/production-cost-report` | `view-productionCostReport` | Missing seven cost cards and cost-type breakdown emphasis. | `apps/next/src/components/production/ProductionReportPageClient.tsx` |

## Completed In This Parity Pass

| Route | Checkpoint | Notes |
|---|---|---|
| `/daily/payment-approval` | 2026-05-20 | Restored legacy green gradient hero, AP/expense tabs, search/date/approved filters, select all/clear, five KPI strip, amber selected-total action bar, AP/expense dense tables, highlighted bank/account cells, local-only selection/pay amount state, and disabled approve/print controls. No approval mutation, print document generation, DB schema, or API write behavior was added. |

## P1 Backlog

| Route | Legacy view | Current issue | Next file |
|---|---|---|---|
| `/po-reports/outstanding` | `view-poOutstanding` | Legacy purple hero, buy/sell tabs, export, supplier/customer/product filters, KPI colors, cost-deducted warning, checkbox column, received/sold columns, footer totals are missing or simplified. | `apps/next/src/components/purchase-flow/PoOutstandingPageClient.tsx` |
| `/reports` | `view-reports` | Legacy is a tabbed aggregate report surface; Next is currently a report index/search catalog. Treat as deviation only if explicitly approved. | `apps/next/src/app/reports/ReportsIndexPageClient.tsx` |
| `/sales-plan` | `view-salesPlan` | Legacy has dense editable planning table with product/customer/channel/container/%LME/lock/delete; Next is a read shell. | `apps/next/src/components/main/MainSalesControlClients.tsx` |
| `/dashboard` | `view-dashboard` | Legacy has filter bar, alert cards, top supplier/customer, trend/chart panels, and four colored business sections; Next is simplified. | `apps/next/src/components/main/MainDashboardsPageClient.tsx` |
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

1. P0 Daily tools: `/daily/expense`, `/daily/expense-dashboard`
2. P0 Production tools: `/production/orders`, `/production/dashboard`, `/production/production-cost-report`
3. P1 PO/Reports/Main: `/po-reports/outstanding`, `/reports`, `/sales-plan`, `/dashboard`
4. P1 Daily transaction surfaces
5. P1/P2 production report polish
