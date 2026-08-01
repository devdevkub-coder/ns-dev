# 00 Current Work

## Active SIT semantic integration and runtime-table closeout — 2026-08-01

Objective: finish the semantic merge of `sit-origin/main` into the accepted local work, preserve both sides' validated business behavior, and close the active Next runtime-table consistency regression reported in Product Tracking `รายการขาย`.

Working state:

- Integration branch: `codex/sit-main-integration-20260801`
- Integration worktree: `C:\new-ns-scrap-erp-worktrees\sit-main-integration-20260801`
- Source: local committed work at `3c255dbf8` plus `sit-origin/main` at `4858d08e8`; final merge history preserves both sources as parents.
- No unresolved merge conflict is present. The original dirty worktree remains preserved, with safety ref `refs/codex-safety/pre-sit-merge-20260801`.
- SIT secrets remain only in ignored `apps/next/.env.sit.local`; no secret or connection string belongs in Git.

Active decisions:

- Preserve merged SIT finance/FCD, status, branch-scope, form-safety, WTI/WTO, Production, Stock Planning, LINE settings, and NSERP-159 behavior.
- Apply the `docs/design.md` runtime-table contract across active `apps/next`: `ns-table`, non-wrapping headers/documents/dates, shared density, semantic header/body alignment, and shared row actions. Primary dense/wide grids keep sort/resize; document, form, print, and compact detail tables do not gain invented behavior.
- Apply the single-line control-height contract across active `apps/next`: normal business-entry fields use `h-10`, filters use explicit `h-9`, and compact inline table editors plus multiline/check/file controls keep their intentional sizing. Preserve every existing width and responsive rule.
- For every registered sidebar route, derive the AppShell heading and breadcrumb from its sidebar label, stripping parenthetical helper text; document/detail routes without a sidebar entry keep their contextual title.
- Keep the previously requested Cost Pool seller/wording contract; it is an explicit adjacent scope, not a table-only regression.
- The user requested a project-wide detailed table check, so final closeout combines the complete static runtime-table inventory with representative Desktop/Mobile visual verification through Codex Browser. The mandatory local login/RSC/navigation guard has been rerun against the final production build.

Current proof:

- Focused runtime-table and adjacent contract suite: 15 files / 83 tests passed after the independent-audit follow-up.
- Workspace lint passed with 0 errors and 10 pre-existing/out-of-scope warnings; workspace type-check passed with an 8 GB Node heap after the default 2 GB heap exhausted memory.
- Webpack production build passed and generated 331 routes with the ignored SIT environment explicitly loaded into the build process.
- The final production login/RSC/navigation guard passed 112 navigation routes / 225 checks with 0 failures and 0 target failures after the final SIT-env build restart.
- `git diff --check` passed after the latest table follow-up.
- The project-wide control-height sweep passed the focused shared-control contract test (2/2), changed-file and workspace lint with 0 errors, workspace type-check, SIT-env webpack production build (331 routes), static residual rescan, and local `/api/health` HTTP 200. Browser UAT was not requested for this UI-only batch.
- Static inventory covers direct runtime JSX tables, shared `Table` call sites, and classified print-template exceptions; the detailed checkpoint is in `docs/migration/22-next-design-audit-plan.md`.
- Shared `ns-table` CSS now keeps every right-aligned numeric body/footer cell non-wrapping with tabular numerals. The runtime guard verifies direct numeric alignment plus the shared CSS contract, and verifies direct status cells are centered and non-wrapping; FCD Conversion/Revaluation status cells were the final two violations and are corrected on Desktop/Mobile.
- Representative Codex Browser QA passed Desktop routes `/daily/weight-ticket-list`, `/production/report`, `/stock/planning`, `/stock/balance`, `/finance/cash-position`, `/finance-accounting/working-capital`, `/purchase/po-buy`, `/sales/po-sell`, and `/master-data/customers`; Mobile checks passed Weight Ticket cards, Production Report, Stock Planning, and Customer cards. No console error was observed during the sweep.
- `/tracking/product` had no current-period rows, so the Product Detail `รายการซื้อ` / `รายการขาย` real-data modal could not be reopened in this pass; the final source contract and focused tests cover the corrected date/document geometry.
- The shared SIT `P2022` blocker for `/tracking/customer` and `/dual-costing/cost-allocation-ledger` is resolved by applying and recording existing migration `20260727110000_add_trading_allocation_fact_cost_pool_entry`. Preflight found `0` allocation-fact rows; no business data was changed or backfilled. Postflight confirmed both nullable columns, the restrictive FK, both indexes, migration history, and authenticated HTTP 200 responses for Customer Tracking, Product Tracking, Allocation Ledger, Trading Matching, and Trading Dashboard.
- Fresh independent acceptance after the numeric/status follow-up returned `ACCEPTED` with no remaining runtime-table contract gap.
- Sidebar title contract test covers every effective sidebar route plus the dynamic-detail fallback; the focused test passed 2/2, workspace lint/type-check passed, and the Webpack production build compiled all 331 static pages. Browser UAT was not requested for this shared wording-only batch.
- Fresh independent acceptance audit returned `ACCEPTED` for the sidebar title/breadcrumb contract.

Immediate next tasks:

1. Keep this integration branch local; do not push until explicitly requested.
2. For any further database change, keep the same target verification, migration-history preflight, transaction, and postflight discipline; do not use runtime fallbacks for schema drift.
3. Before an eventual push, fetch and compare the authorized destination again and verify the intended merge ancestry/content.
