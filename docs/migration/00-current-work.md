# 00 Current Work

## Current Status

Date: 2026-05-19
Active app: `apps/next`
Primary remote: `new-origin`
Last pushed checkpoint: UI-D3 Match Log / Deal Margin / Compare Margin legacy UI parity (`dcfa1c1 fix: restore dual costing margin legacy ui parity`)

## Current Batch

`Batch SYS: System and Cleanup`

Goal:

- Finish remaining system/admin/report placeholders and then run a full navigation QA pass.
- Implement self-service password change through Supabase Auth only; never store or migrate password values into application tables.
- Keep migration/backup/reset tools as safe read/design baselines until destructive actions have explicit confirmation, audit, backup, RLS, and rollback design.
- Build `/reports` as an index/search surface over active report routes before duplicating report-specific query logic.
- During this and future clone batches, keep the legacy/Vue screen as the visual baseline first. Preserve cards, colors, banners, tables, button placement, labels, spacing, and compact density unless a documented deviation is approved. If Vue has been simplified or has known layout/column drift, use `old-apps/legacy/` as the stronger baseline before improving the data wiring.
- Current docs slice: SYS0 System/Admin module overview is implemented, validated, and pushed. It maps `/admin/change-password`, `/admin/migration-tools`, `/reports`, admin polish, full-route QA order, permissions, and destructive-action safety constraints.
- Current implementation slice: SYS1 `/admin/change-password` self-service Supabase Auth flow is implemented, validated, and pushed. It preserves legacy UI, validates password syntax/confirmation/current-password, verifies current password with Supabase Auth, updates via `updateUser`, and does not store password in app tables.
- Current implementation slice: SYS2 `/admin/migration-tools` safe read/design baseline is implemented, validated, and pushed. It preserves legacy Backup/Restore cards while disabling export, restore, cloud migration, user migration, reset, snapshot cleanup, and auto-backup actions until destructive-action design is approved.
- Current polish slice: SYS3 `/admin/audit` and `/admin/users-permissions` polish is implemented, validated, and pushed. Audit now has current-page CSV export; Users & Permissions now has summary cards for active, branch-scoped, pending Auth link, and must-change-password users. Branch-scope enforcement remains a SYS5/auth hardening follow-up.
- Current QA slice: SYS5 full system cleanup route QA is implemented, validated, and pushed. It confirmed all active navigation routes have dedicated pages, protected routes redirect unauthenticated users, SYS routes render authenticated desktop/mobile without page-level overflow, and the retrospective legacy UI parity backlog is now queued.

## Previous Batch M Notes

- Current docs slice: M0 Main Dashboards module overview is implemented, validated, and pushed. It maps all 11 remaining Main placeholder routes, their legacy/Vue visual baselines, shared data sources, write risks, and recommended implementation order.
- Current implementation slice: M1 `/dashboard`, `/owner-daily`, and `/daily-report` read/report baselines is implemented, validated, and pushed.
- Current implementation slice: M2 `/profit-cost-analysis` read/report baseline is implemented and validated locally. It preserves the legacy/Vue gradient hero, filter card, metal chips, KPI density, AP/AR row, Revenue/GP sections, Top Product/Top GP blocks, tabs, disabled export, and read-only product drill modal.
- Current implementation slice: M3 `/pending-sales`, `/sales-plan`, and `/sales-commission` read/design baselines is implemented and validated locally. LME save, sales plan lock/save, supplier assignment, bulk assignment, export, and all persistence remain disabled until target schemas, permissions, audit, and stock reservation semantics are designed.
- Current implementation slice: M4 `/cash-flow-calendar` and `/business-calendar` read/design baselines is implemented and validated locally. It preserves the legacy/Vue blue/purple banners, month controls, KPI card density, chart cards, calendar/table surfaces, today/negative/weekend markers, read-only cash drill modal, and business mode tables while keeping export/auto-sync/write actions disabled.
- Current implementation slice: M5 `/cash-others-summary` and `/anomaly-detector` read baselines is implemented and validated locally. It keeps Cash & Others legacy visual blocks and Anomaly Detector read-only scan behavior, with fix actions limited to active Next links.
- Current QA slice: M6 Main QA sweep is implemented, validated, and pushed. It confirmed 11/11 Main route/page/API coverage, unauth guards, authenticated API/page smoke, read-only/write-control constraints, sitemap status, and desktop/mobile no page-level overflow.

## Previous Batch A Notes

- Current implementation slice: A5 Financial Statements management/read baselines is implemented, validated, and pushed.
- Current implementation slice: A4 Tax / VAT / WHT transaction-derived read/design baseline is implemented, validated, and pushed.
- Current implementation slice: A2 Cash Flow Analysis + Forecast Calendar read baseline is implemented, validated, and pushed. It uses AR/AP/cash/bank/loan/tax schedule sources, preserves legacy UI first, and keeps forecast/payment/reclass writes disabled.
- Current implementation slice: A3 Working Capital + Stock Finance read baselines (`working-capital`, `stock-finance`, `profit-leak`) is implemented, validated, and pushed. It reuses AR/AP/stock/cash sources, preserves legacy UI first, and keeps financing/reclass/write actions disabled until accounting side effects are designed.
- Current implementation slice: A1 Financial Dashboard read baseline (`financial-dashboard`) is implemented, validated, and pushed. It reuses A2/A3/A5 helper outputs where practical, preserves legacy UI first, and keeps GL/statutory/write actions disabled.
- A6 Fixed Assets read baseline (`asset-register`, `depreciation`, `asset-disposal`) is implemented, validated, and pushed. Keep acquisition, depreciation posting/reverse, disposal status mutation, and GL posting disabled until accounting side effects are designed.
- A7 Loans / Equity / Opening / Historical read baseline is implemented, validated, and pushed. Keep loan schedule/payment generation, equity save, opening balance apply/lock, historical save/sync, and GL posting disabled until accounting side effects are designed.
- Current QA slice: A8 Accounting QA Batch is implemented, validated, and pushed. It confirmed 18/18 Finance / Accounting page/API coverage, unauth guards, authenticated route/API smoke, and disabled write controls.
- A5 must remain labeled as management/read baseline only. Do not claim statutory P&L/Balance Sheet/Cash Flow until GL journal header/line, COA mapping, closing period, retained earnings roll-forward, and cash-flow mapping are designed.

## Legacy UI Parity Retrospective

Status date: 2026-05-19

- Legacy/Vue UI parity became an explicit project rule at `59ba09f docs: require legacy ui parity for clone batches`.
- The rule was strengthened at `b2258d6 docs: strengthen legacy ui parity rule`, requiring clone/migration batches to preserve cards, colors, banners, tables, button placement, labels, spacing, and compact density; when Vue is simplified or inconsistent, `old-apps/legacy/` is the stronger baseline.
- Batches completed after `59ba09f` should be treated as implemented under the legacy UI parity rule. This includes the Foreign Finance baselines and the Finance / Accounting A6, A7, A5, and A4 batches already pushed.
- Batches completed before `59ba09f` were not guaranteed to have the same explicit visual parity standard. They should be queued for a retrospective UI parity audit/revise pass before being marked final for UAT, especially screens cloned from legacy/Vue with cards, dashboards, dense tables, or color-coded finance states.
- For future batches, do not redesign first. Clone the legacy visual surface first, wire active Next data second, then document any approved deviation.
- Current parity slice: `/finance/ap` was revised first after SYS. It restores the legacy AP red header, mega payable/aging/top supplier cards, colored KPIs, aging cards, red tabs, summary/detail table layout, Channel/Aging filters, and full-filter detail footer total while keeping export as active `.xlsx` behavior.
- Current parity slice: `/finance/ar` was revised after AP. It restores the legacy AR pending-sale banner, blue/cyan/teal dashboard cards, aging bars, Top 5 customer card, Channel/Aging filters, and detail table layout/colors while keeping export as active `.xlsx` behavior.
- Current parity slice: `/finance/cash-position` was revised after AR. It restores the legacy Cash Position dashboard cards, liquid composition donut, AR/AP bars, Top accounts list, colored summary cards, Net Cash strip, and account table columns/type badges.
- Current parity slice: `/finance/bank` was revised after Cash Position. It restores the legacy Bank Statement hero, account/date controls, four KPI cards, two chart panels, opening-balance row, dark gradient statement table header, colored amount columns, and disabled duplicate-cleanup button while keeping export as active `.xlsx` behavior.
- Current parity slice: `/stock/balance` was revised after Bank Statement. It restores the legacy Stock Balance hero, KPI/status cards, matrix/detail toggle, group/status/branch/product filters, selected-product inline panel, donut/top-group charts, metal-group matrix table, and detail table mode while keeping export as active `.xlsx` behavior.
- Current parity slice: `/stock/ledger` was revised after Stock Balance. It restores the legacy dense toolbar-first layout, product/branch/movement/date filters, balance-mode segmented control, negative-stock badge, disabled cleanup actions, legacy 12-column ledger table, colored movement/counterparty/balance cells, and active `.xlsx` export. Read-only bill/timeline modals and write actions such as grade fix or branch move remain deferred until permission/audit/write design is approved.
- Current parity slice: `/stock/convert` was revised after Stock Ledger. It restores the legacy Grade Adjustment hero/CTA, seven KPI cards, Source Type and Cost Status filters, red/green source-target table grouping, disabled Confirm Cost/Reverse actions, and source/target/loss/cost-flow modal grouping while keeping the existing simplified POST semantics unchanged. Full cost allocation, manual lot selection, reverse, and pending-cost workflows remain deferred.
- Current parity slice: `/stock/adjust` was revised after Stock Convert. It restores the legacy Stock Count Adjustment amber hero, note-only warning, five KPI cards, Quick Adjust toolbar with branch/type/date filters, disabled CSV placeholder, 13-column adjustment table, and usage guidance box while preserving the existing note-only stock ledger write semantics.
- Current parity slice: `/sales/po-sell` was revised after Stock Adjust. It restores the legacy PO Sell info banner, six KPI cards, Top 5 Customer and PO outstanding panels, match-status chips, compact filter bar, 12-column table, and disabled create/edit/cancel actions while preserving the read/export baseline and deferring PO Sell writes/reconciliation design.
- Current parity slice: `/trading/dashboard` was revised after PO Sell to close the first-10 post-SYS UI parity audit. It restores the legacy violet/fuchsia Trading Dashboard hero, date filter card, mega Trading Performance card, Trading AR/AP card, ten KPI cards, trend/matching/product panels, Trading Purchases/Sales tables, and Trading by Product table. The API remains read-only and now derives legacy dashboard totals from trading purchase/sales bills plus `trading_deals`; Trading Matching write actions remain deferred.
- Current parity slice: `/finance/supplier-advance` and `/finance/customer-advance` are being revised after the first-10 audit. They restore the legacy compact advance layout: amber/emerald info banner copy, two summary cards plus disabled blue create CTA, 11-column table with Rate and disabled cancel action, legacy empty-state wording, and active `.xlsx` export as a secondary Next capability. Create/cancel/allocation writes remain deferred until dedicated advance/allocation schema, audit, RLS, rollback, and reconciliation design are approved.
- Current parity slice: `/stock/status-convert` and `/stock/customer-return` was revised after finance advance and pushed as `8ea1bbc`. It restores the legacy purple/pink compact stock operation surfaces while keeping send-back/export/reverse/cost-policy/write hardening deferred.
- Current parity slice: Daily Reports / รายงานประจำวัน was revised after stock operations and pushed as `dc1c30b`. It restores read-only legacy visual/data surfaces only: owner daily due-today/gap/activity/pending panels, daily report date controls, group breakdown, cash movement by type/account, expense category bars, analytics/top tables, and print dialog trigger. No posting/write/mutation actions are enabled.
- Current parity slice: Tracking 360 was revised after Daily Reports and pushed as `d4bc621`. It restores the legacy colored hero surfaces, compact filter cards, summary/top panels, tabs, dense tracking tables, product/supplier/customer selectors where available, yearly comparison tables, and Product Tracking legacy revenue-first sort. This remains read/export only; customer/supplier/product drilldown and item JSON normalization are still deferred until the data contract is confirmed.
- Current parity slice: Batch D Group A was revised after Tracking 360 and pushed as `0c9df8e`. It restores the legacy PO Buy blue info banner, colored KPI cards, Top Supplier/outstanding panels, compact filter/status/purpose-tab layout, checkbox/action table shell, and Trading Matching fuchsia hero/action cluster, GP mega card, status donut, match-rate/monthly/top-pair panels, compact KPI row, two-tab layout, and unmatched split tables. All create/move/cancel/cleanup/pull/recalc/reverse/match actions remain disabled/read-only.
- Added to post-SYS parity queue per user request: `/admin/company-profile` (`https://new-ns-scrap-erp.vercel.app/admin/company-profile`). It already exists in the system sitemap and visual audit checklist, but now must be rechecked under the same legacy-first rule after the current Batch D parity slices finish.
- Current parity slice: Batch D Group B was revised after Group A and pushed as `488f7fa`. It restores the legacy Cost Pool warning copy/icons, compact filters, 12-column table, and Cost Allocator `①/②` step sequence, Auto Match button placement, Manual option shell, preview table, and disabled confirm-match surface. No allocation/match write behavior is enabled.
- Current parity slice: `/admin/company-profile` was revised after Batch D Group B per user request and pushed as `bebef00`. It restores the legacy company-profile action row, separate receipt/delivery preview buttons, usage note wording, field labels/placeholders, logo delete label, and compact form density while preserving existing API validation and `system.settings.manage` write guard.
- Current parity slice: Batch D Group C was revised after Company Profile and pushed as `dcfa1c1`. It restores Match Log's legacy `📋` info box, PO Sell filter shell, visible-row summary cards, and disabled Reverse action column; Deal Margin's match-status donut/legend, `PO Sell`/`Sell Qty` table shape, and legacy empty state; and Compare Margin's legacy first-screen order with date filters/row stats reduced after the core cards. No reverse/allocation mutation is enabled; Deal Margin `sellQty` is exposed as current `trading_deals.matched_qty` and documented in OpenAPI until normalized PO Sell allocation logs are designed.

## File Naming Changes

| Old Name | New Name | Meaning |
|---|---|---|
| `SRS.md` | `REQUIREMENTS_TARGET_SYSTEM.md` | SRS/requirements ของระบบใหม่หรือระบบเป้าหมาย |
| `NS_Scrap_ERP_System_Requirements.md` | `REQUIREMENTS_LEGACY_PROTOTYPE.md` | เอกสาร requirement/description ของระบบเก่า/prototype |

## Latest Completed Implementation Checkpoints

- `cf7df95 docs: prefer sub agents for playwright qa`
  - Documented that Playwright QA should use sub agents by default
- `285eef6 chore: add playwright mcp config`
  - Added project-level Playwright MCP config
  - Documented Playwright MCP environment status
- `3805587 chore: upgrade next app to tailwind v4`
  - Upgraded active Next app to Tailwind CSS v4
  - Validated lint, type-check, build, and Tailwind package resolution
- `e900c6f docs: require resumable session handoffs`
  - Added resumable session handoff rules to `AGENTS.md`
  - Recorded TW4 as the next active batch after an interrupted install
- `14df0a5 docs: define sub agent operating rules`
  - Added sub agent use/close rules to `AGENTS.md`
  - Added operating model to this current work document
- `fa08cb1 docs: standardize requirements and doc index`
  - Renamed ambiguous requirements files
  - Added `00-doc-index.md` and this current work document
- `12fda4b feat: complete production report baseline`
  - Production pages/APIsครบแบบ read/report baseline
- `2d08f0d feat: add production category baseline`
  - Production output categories + production orders baseline
- `3ad5501 docs: add sitemap openapi preflight tasks`
  - Added Batch PRE for sitemap/OpenAPI before next major module

## Next Required Batch

`Batch F: Finance and Debt`

Tasks:

1. F0 legacy inventory and DB mapping - docs checkpoint first
2. F1 AR page/API - next implementation slice
3. F2 AP polish - existing AP route/page needs filter/sort/pagination/export/detail review
4. F3 Bank Statement - next read/reconciliation baseline after AR/AP
5. F4-F6 Cash Position, Supplier Advance, Customer Advance - read baseline first, no allocation/write rule guesses

## Tailwind v4 Migration Status

Status: completed and pushed in the TW4 checkpoint.

Changes:

- `apps/next` now uses `tailwindcss@4.3.0` and `@tailwindcss/postcss@4.3.0`.
- `apps/next/postcss.config.cjs` now uses the Tailwind v4 PostCSS plugin.
- `apps/next/src/app/globals.css` now uses `@import "tailwindcss";` and CSS-first `@theme` tokens.
- Removed `apps/next/tailwind.config.ts`; active app theme tokens now live in CSS.
- Root `package.json` still keeps Tailwind v3 for old Vue tooling; this is intentional until old Vue tooling is removed or upgraded.

Validation passed:

- `npm ls tailwindcss @tailwindcss/postcss --workspace @ns-scrap-erp/next`
- `npm run lint --workspace @ns-scrap-erp/next`
- `npm run type-check --workspace @ns-scrap-erp/next`
- `npm run build --workspace @ns-scrap-erp/next`

## Playwright MCP Status

Status: configured and pushed.

Changes:

- Added `playwright` server to project-level `.mcp.json`.
- Command: `npx --yes @playwright/mcp@latest --headless`
- Documented the setup in `docs/migration/10-environment-status.md`.

Validation passed:

- `node -e "JSON.parse(require('fs').readFileSync('.mcp.json','utf8')); console.log('mcp json ok')"`
- `npx --yes @playwright/mcp@latest --help`

Runtime note:

- Restart Codex before expecting `/mcp` or MCP resources/tools to show the new `playwright` server.

## Agent Rules Refactor Status

Status: completed and pushed in checkpoint `55c81c7`.

Changes:

- `AGENTS.md` is now a short entrypoint with hard rules, required reading, rule links, environment shortlist, and validation baseline.
- Detailed rules moved to `docs/agent-rules/`.
- `docs/migration/00-doc-index.md` now lists the agent rule documents.

Validation passed in its own checkpoint.

## System Map and API Contract Baseline Status

Status: completed and pushed in checkpoint `5ad3ab2`.

Changes:

- Added `docs/migration/18-next-system-sitemap.md`.
- Added `docs/api/openapi.yaml`.
- Updated `docs/migration/17-next-remaining-modules-progress.md` with PRE0/PRE1 execution logs.

Current findings:

- `/stock/balance` has an active read baseline and has been revised in the post-SYS legacy UI parity pass.
- `/stock/ledger` has a read baseline but still needs query/pagination/running-balance polish.
- Most main dashboard/reporting and finance-accounting routes remain placeholder coverage.

Validation:

- `git diff --check` passed.
- `npx --yes @redocly/cli lint docs/api/openapi.yaml` passed validity check with skeleton-level warnings for missing `operationId`, tag descriptions, and some 4XX responses.

## Current Priority Queue

1. Batch F: Finance and Debt
2. Batch T: Tracking 360
3. Batch D: Dual Costing / Trading / PO
4. Batch FF: Foreign Finance
5. Batch A: Finance / Accounting
6. Batch M: Main Dashboards and Operational Control
7. Batch SYS: System and Cleanup

Post-SYS UI parity priority after the first 10 route audit now includes a dedicated Daily Reports / รายงานประจำวัน group:

1. Finish Finance and Debt: `/finance/supplier-advance`, `/finance/customer-advance`
2. Finish Stock parity: `/stock/status-convert`, `/stock/customer-return` (completed locally; commit/push pending)
3. Daily Reports / รายงานประจำวัน: `/owner-daily`, `/daily-report`, with `/dashboard` checked where shared daily-report cards overlap
4. Tracking 360
5. Dual Costing / Trading / PO

## Batch S Stock Status

Status: completed and pushed in checkpoint `42ce82b`.

Implemented in this checkpoint:

- Added stock balance, status convert, grade convert, stock count adjust, and customer return API/page baselines.
- Hardened stock OpenAPI contract for touched stock endpoints with operation IDs, real query parameters, request schemas, and stock response schemas.
- Adjusted stock write forms to support direct `?new=1` URLs for form smoke testing and resumable links.
- Ran authenticated browser/API smoke with the provided dev user; credentials were used only in the browser session and were not stored in docs or code.

Verification already run:

- Desktop browser smoke: all six stock pages returned HTTP 200 with no login/error state.
- Mobile browser smoke at 390x844: stock read pages and write forms rendered without visible errors.
- Authenticated API smoke: all six stock APIs returned HTTP 200.
- Write form smoke: `/stock/status-convert?new=1`, `/stock/convert?new=1`, `/stock/adjust?new=1`, and `/stock/customer-return?new=1` rendered title, fields, cancel, and save controls; no submit was performed.
- `npx --yes @redocly/cli lint docs/api/openapi.yaml --max-problems 200` passed validity with existing skeleton warnings outside the stock batch.

Final local validation:

- `git diff --check` passed.
- `npm run type-check --workspace @ns-scrap-erp/next` passed.
- `npm run lint --workspace @ns-scrap-erp/next` passed.
- `npm run build --workspace @ns-scrap-erp/next` passed.

Commit:

- `42ce82b feat: add stock module baselines` pushed to `main`.

Known carry-over from Batch S:

- Stock ledger row detail modal remains a follow-up.
- Field-level validation messages on stock write forms remain a follow-up; server-side Zod validation is active.
- Reconciliation query/report for grade convert and count adjust remains a follow-up.
- Void/reversal and final WAC/cost-source policy remain broader stock hardening work.

## Post-SYS Stock UI Parity Slice

Status: completed locally; commit/push pending.

Current checkpoint:

- `/stock/status-convert` is being revised back toward the legacy purple/pink compact surface: legacy title, usage tip, search placeholder, `+ ปรับสถานะใหม่` action, no summary cards, 10-column table, status-flow chips, reason/created-by columns, and legacy empty state.
- `/stock/customer-return` is being revised back toward the legacy purple/pink compact surface: legacy title, 3 KPI cards, search + branch filter + disabled CSV control, 11-column table, return status/action cells, guidance box, and legacy empty state.
- API changes are display/read-only additions only: status convert rows now expose `note` and `createdBy`; customer return rows now expose `branchId`/`warehouseId` for unambiguous UI filtering.
- No POST/write semantics, stock policy, WAC policy, customer-return send-back semantics, schema migrations, or permission rules were changed in this slice.

Validation:

- `npm run lint --workspace @ns-scrap-erp/next` passed.
- `npm run type-check --workspace @ns-scrap-erp/next` passed.
- `npm run build --workspace @ns-scrap-erp/next` passed.
- `git diff --check` passed.

Browser QA:

- Authenticated main Playwright checked `/stock/status-convert` and `/stock/customer-return` at `http://localhost:3100` on desktop 1365x900 and mobile 390x844; both APIs returned 200, no page-level horizontal overflow, no new console warnings/errors, and legacy markers/columns/cards/actions were present.
- Subagent unauth smoke confirmed both routes redirect to login, both APIs return 401, login desktop/mobile has no horizontal overflow, and no related console/page/network errors were reported.

Next:

- Commit and push the stock parity slice.
- Start Daily Reports / รายงานประจำวัน: `/owner-daily`, `/daily-report`, with `/dashboard` checked where shared daily-report cards overlap.

## Batch F Finance and Debt Status

Status: active batch started after checkpoint `a2fd1ba`.

Current scope:

- F0 maps the legacy/Vue finance-debt pages and target DB tables before implementation.
- F1 AR read/report baseline is implemented, validated, and pushed.
- F2 AP polish is implemented, validated, and pushed.
- F3 Bank Statement read/reconciliation baseline is implemented, validated, and pushed.
- F4 Cash Position aggregation baseline is implemented, validated, and pushed.
- F5 Supplier Advance read baseline is implemented, validated, and pushed.
- F6 Customer Advance read baseline is implemented, validated, and pushed.
- F7 Finance QA checkpoint is documented and pushed.
- Money-moving writes remain out of scope until reconciliation and allocation rules are clear.

## Batch T Tracking 360 Status

Status: active batch started after finance checkpoint `1c0b5c7`.

Current scope:

- T0 inventory and DB mapping is documented and pushed.
- T1 Customer Tracking read baseline is implemented, validated, and pushed.
- T2 Supplier Tracking polish is implemented, validated, and pushed.
- T3 Product Tracking read/report baseline is implemented, validated, and pushed.
- T4 Tracking QA Batch passed after correcting Product Tracking slow movers, and is pushed.
- D0 Dual Costing / Trading / PO legacy inventory and DB mapping is complete and pushed.
- D1 PO Sell read baseline is implemented, validated, and pushed.
- D2 PO Buy read-only polish is implemented, validated, and pushed. Write flows remain deferred.
- D3 Trading Dashboard read baseline is implemented, validated, and pushed. Dashboard remains read-only.
- D4 Trading Matching read-only polish is implemented, validated, and pushed. Write/reverse/recalc actions remain deferred.
- D5 Cost Pool read-derived baseline is implemented, validated, and pushed. UI keeps the legacy amber warning band, blue/orange/purple cost cards, summary cards, filters, export, table, and read-only detail modal; write allocation remains deferred.
- D6 Cost Allocator read-only simulation baseline is implemented, validated, and pushed. UI keeps the legacy purple step-card flow; confirm/write remains disabled until allocation logs and reversal rules are designed.
- D7a Match Log read baseline is implemented, validated, and pushed. It reads `trading_deals` as current source because normalized allocation logs are not designed yet; reverse/write remains deferred.
- D7b Deal Margin read baseline is implemented, validated, and pushed. It reads `trading_deals` matched sales/purchase amounts and preserves the legacy purple/pink gross margin card layout.
- D7c Compare Margin read baseline is implemented, validated, and pushed. It compares deal-side `trading_deals` with stock-side `sales_bills` revenue/COGS and preserves the legacy blue/purple/emerald diff-card layout.
- D8 Dual Costing QA checkpoint is implemented, validated, and pushed. It fixed PO Sell date filters, Trading Matching filter scope, Cost Pool business-facing display refs/status options, Cost Allocator modes, Deal Margin match status, Compare Margin stock scope, and PO Sell OpenAPI row names.
- FF0 Foreign Finance legacy inventory and DB mapping is completed and pushed. FF1 FX Rate manage baseline is implemented, validated, and pushed.
- Tracking routes must use active Next app only; legacy/Vue tracking views are source material.
- Keep T1-T3 read/report baselines first; no write flows in tracking pages.
- DB design preference clarified: use meaningful business-facing codes/running document numbers for user-visible references; keep UUID/opaque IDs internal only.
- Permission carry-over: trading/dual-costing currently uses `finance.cash.view`; split into dedicated trading/cost/profit permissions in a later auth batch instead of changing guards ad hoc.

Initial F0 findings:

- Legacy/Vue finance-debt pages: AR, AP, Bank Statement, Cash Position, Supplier Advance, Customer Advance.
- Related money write flows already exist in daily/purchase/sales surfaces: supplier payments, customer receipts, petty advances/returns, transfers, payment approval, and transaction ledger.
- Target DB mapping: `sales_bills`, `receipts`, `purchase_bills`, `payments`, `bank_statement`, `accounts`, plus party and branch lookup tables.
- Bank statement rows are shared side effects from payment/receipt/expense/transfer/petty flows, so bank reconciliation should be read-first before any write changes.

Initial FF0 findings:

- Active Next foreign finance routes started as placeholders: International Transfer, Overseas Receipt, FX Rate, FCD Ledger, FX Gain/Loss, and Bank Reconciliation. FF1 promotes FX Rate to a manage baseline.
- Existing support tables are `accounts`, `bank_statement`, `currencies`, `fx_gain_loss`, `overseas_recipients`, and `overseas_remittance_purposes`.
- FF1 adds historical `fx_rates`. There is still no dedicated `fcd_ledger` table, no confirmed `intl_transfers`/`overseas_receipts` tables, and no `bank_imports` table in the active Prisma schema.
- FF4 FCD Ledger read baseline is implemented, validated, and pushed. It derives from FCD/foreign-currency accounts and bank statement rows without mutating bank rows.
- FCD Ledger does not infer foreign movement from THB bank rows or current currency rates. Foreign movement stays zero unless future ITF/ORC source tables provide true foreign amounts; opening foreign balance comes from `accounts.opening_balance`.
- FF5 FX Gain/Loss read baseline is implemented, validated, and pushed. It reads realized rows from `fx_gain_loss` only and does not auto-post.
- FF6 Bank Reconciliation read/design baseline is implemented, validated, and pushed. It shows ERP bank rows and disables import/match writes until normalized import/match state exists.
- FF2/FF3 International Transfer and Overseas Receipt read/form baselines are implemented, validated, and pushed. They intentionally do not write `bank_statement`, post FX gain/loss, complete, approve, or reverse until dedicated transaction schemas and idempotency/reversal rules exist.
- FF7 Foreign Finance QA checkpoint is implemented, validated, and pushed. All six foreign finance APIs returned 200 in browser smoke; type-check, lint, build, OpenAPI validity, and diff check passed. OpenAPI still has the existing 113 skeleton warnings outside this batch.
- User-facing refs should be `ITF*`, `ORC*`, `ref_no`, account code/account no, and currency symbol/code; do not expose UUID/ref_id as the primary display.
- A0 Finance / Accounting overview is implemented locally as a docs checkpoint. All 18 routes are still placeholders; active schema supports management baselines for cash, AR/AP, stock value, assets, loans, equity, and opening balance, but GL/statutory posting remains deferred. Recommended next slice is A6 Fixed Assets read baseline before dashboards/statements.

Next concrete task:

1. Validate, commit, and push A0 Finance / Accounting overview.
2. Preserve legacy/Vue visual baseline first: colors, cards, panels, table density, button placement, and labels.
3. Use sub agents by default for Playwright/browser QA, and split read-only scouting/contract review into parallel sub agents when work can be separated cleanly.

## Operating Model

Before each module batch:

1. Read the module overview and legacy source touchpoints.
2. Break the module into page-level tasks.
3. For each page, document the expected fields, buttons, modals, APIs, DB tables, validation, pagination/sort/export, and Playwright checks.
4. Implement in reviewable slices.
5. Update the relevant tracker before moving to the next slice.
6. Commit/push after each meaningful checkpoint.

Use sub agents only for bounded parallel work:

- legacy flow search
- route/API inventory
- independent page audit
- Playwright smoke verification
- isolated docs or page/API implementation with clear file ownership

For Playwright work, use a sub agent by default so browser QA can run in parallel while the main agent continues implementation or integration. The main agent must define the exact Playwright scope and then integrate findings before committing.

Close sub agents when their task is integrated, no longer needed, blocked, overlapping, or after a batch checkpoint leaves them with no remaining work. Do not leave reminder agents open unless the user explicitly requested one for the active task list.

## Handoff Checklist

At every checkpoint, update docs as if a new session will start from only the repository:

1. Current batch/task/page
2. Exact partial work and files touched
3. Commands already run and result
4. Validation still required
5. Next concrete task
6. Whether to continue immediately or pause for discussion

## Known Carry-over Work

- `reports/` is untracked/local and must not be committed unless explicitly approved.
- Production write flow is not complete:
  - create/edit production order
  - production input/output write
  - process cost write
  - reverse/cancel/close/lock cost
  - stock ledger/cost allocation reconciliation
- Purchase follow-ups:
  - void/reversal
  - PO remaining qty reconciliation
  - header/line table refactor
- Sales follow-ups:
  - create/edit/post
  - FIFO/COGS
- Stock follow-ups:
  - Stock ledger row detail modal
  - Stock write form field-level messages
  - Stock reconciliation reports for grade convert/count adjust
  - Stock transfer cancel/void and cost source
- Finance follow-ups:
  - Payment approval persistence/printing
  - AP/AR allocation/reconciliation
- Auth/permission:
  - branch-scope enforcement
  - full legacy role matrix migration

## Validation Baseline

Latest full app validation passed during TW4:

- `npm run type-check --workspace @ns-scrap-erp/next`
- `npm run lint --workspace @ns-scrap-erp/next`
- `npm run build --workspace @ns-scrap-erp/next`

Tailwind dependency check:

- `npm ls tailwindcss @tailwindcss/postcss --workspace @ns-scrap-erp/next`
