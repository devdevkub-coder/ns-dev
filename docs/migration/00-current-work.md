# 00 Current Work

## Current Status

Date: 2026-05-19
Active app: `apps/next`
Primary remote: `new-origin`
Last pushed checkpoint: M4 Main calendar read/design baselines (`a2dad1e feat: add main calendar baselines`)

## Current Batch

`Batch M: Main Dashboards and Operational Control`

Goal:

- Port main dashboard/control/reporting routes from placeholders into Next page/API baselines.
- Start with read/report baselines before enabling planning, assignment, anomaly fix, export, or dashboard write actions.
- Reuse existing purchase/sales/stock/finance/production/tracking/trading helper outputs where practical instead of re-querying inconsistently.
- During this and future clone batches, keep the legacy/Vue screen as the visual baseline first. Preserve cards, colors, banners, tables, button placement, labels, spacing, and compact density unless a documented deviation is approved. If Vue has been simplified or has known layout/column drift, use `old-apps/legacy/` as the stronger baseline before improving the data wiring.
- Current docs slice: M0 Main Dashboards module overview is implemented, validated, and pushed. It maps all 11 remaining Main placeholder routes, their legacy/Vue visual baselines, shared data sources, write risks, and recommended implementation order.
- Current implementation slice: M1 `/dashboard`, `/owner-daily`, and `/daily-report` read/report baselines is implemented, validated, and pushed.
- Current implementation slice: M2 `/profit-cost-analysis` read/report baseline is implemented and validated locally. It preserves the legacy/Vue gradient hero, filter card, metal chips, KPI density, AP/AR row, Revenue/GP sections, Top Product/Top GP blocks, tabs, disabled export, and read-only product drill modal.
- Current implementation slice: M3 `/pending-sales`, `/sales-plan`, and `/sales-commission` read/design baselines is implemented and validated locally. LME save, sales plan lock/save, supplier assignment, bulk assignment, export, and all persistence remain disabled until target schemas, permissions, audit, and stock reservation semantics are designed.
- Current implementation slice: M4 `/cash-flow-calendar` and `/business-calendar` read/design baselines is implemented and validated locally. It preserves the legacy/Vue blue/purple banners, month controls, KPI card density, chart cards, calendar/table surfaces, today/negative/weekend markers, read-only cash drill modal, and business mode tables while keeping export/auto-sync/write actions disabled.

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

- `/stock/balance` is still a placeholder and is the first concrete page target for `Batch S`.
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
