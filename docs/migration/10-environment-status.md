# 10 Environment Status

## Current Direction

### Production Input Return Permission Fix 2026-07-23

- Applied `20260723173500_add_production_input_return_permission.sql` and `20260723200000_grant_production_input_return_to_system_admin.sql` to dev-target using the local dev database connection after confirming the local database had neither the permission catalog row nor its role grants.
- Postflight confirms `production.orders.input_return` is active and granted to `admin`, `owner`, `production_department`, and `system_admin`. No production order, stock, or ledger rows were changed.
- Applied and recorded `20260723190000_separate_production_and_stock_receipt_costs.sql` to dev-target after the first authorized return attempt exposed missing `production_input_returns` stock-receipt cost columns. Postflight confirms `stock_receipt_unit_cost`, `stock_receipt_total_cost`, and `cost_variance` exist; no business rows were changed.
- Applied and recorded `20260724100000_add_production_output_wip_source.sql` to dev-target. `production_outputs` now stores the selected WIP source product, RM/FG category, and source warehouse for production-round traceability; no existing business rows were changed.

Development database and auth testing should use a separate Supabase dev/target project.

The customer's old production Supabase remains the legacy source system for read-only audit and migration-source dumps.

### Access Control Migration Checkpoint 2026-07-19

- Applied with Supabase CLI to dev-target `fhglqymcdmrgbsbadnwr` and SIT `vbjlkxbytccklhqvxjuu`: `20260719010334_access_control_finance_action_grants` and `20260719011602_access_control_advance_expense_actions`.
- Postflight confirmed both environments contain the six required action catalog permissions and twelve admin/owner role grants for the checked action set.
- Because both environments have pre-existing migration-history drift, the apply used temporary migration workdirs containing remote-history placeholders and only the two intended SQL migrations. No legacy migration was re-run.

### Cache/Image Checkpoint 2026-07-18

- Dev-target, SIT และ customer UAT ตรวจ `products` 236 รายการเท่ากัน: 62 รายการมี original+thumbnail ครบ 124 Storage objects, 174 รายการไม่มีรูป, missing/orphan asset `0`
- Applied and recorded migrations `20260718140000_clear_legacy_product_image_names` and `20260718143000_drop_legacy_product_image_names` in all three environments; `products.image_names` no longer exists
- Product/impurity product upload now uses versioned Storage keys with `Cache-Control: 31536000`; WTI/WTO attachment upload already uses the same max-age policy
- Runtime Redis/browser hit/miss/latency/request-reduction evidence still requires traffic from the deployed SIT/UAT code with observability enabled; no browser UAT was run in this coding batch

### Access-Control Checkpoint 2026-07-19

- Applied and recorded `20260719005346_access_control_action_permissions`, `20260719005635_access_control_split_admin_permissions`, `20260719010334_access_control_finance_action_grants`, and `20260719011602_access_control_advance_expense_actions` in dev-target and SIT only; customer UAT was not changed.
- Dry-run and postflight checks found all 34 permission codes from the first catalog batch, both new view grants (`system.users.view`, `system.roles.view`), and all 28 split finance/advance/expense action grants for the existing `admin`, `owner`, and `system_admin` roles in both environments.
- A fresh authenticated dev probe confirmed `/admin/users` and `/admin/roles-permissions` returned HTTP 200 after the migrations. The legacy manage grants remain in place for compatibility while route checks move to the split permissions.

Important account boundary:
- `legacy-prod-source`, `dev-target`, and future `staging-uat` should be separate Supabase account/project contexts where practical.
- Do not assume access tokens, Auth users, API keys, Storage buckets, or project settings are shared between them.
- A future `new-prod` project has not been created yet.

Git branch boundary:
- Customer UAT has one Git promotion target: `uat-origin/main` (`nserprich99-creator/ns-erp`).
- `new-origin/uat` was retired on 2026-07-17 and must not be used or recreated.
- The actual UAT environment must still be identified from deployment env and database env (`NEXT_PUBLIC_SUPABASE_URL`, `DATABASE_URL`, Vercel project/domain, and target remote) before any promote/deploy/debug action.
- The old remote branch `new-origin/staging` was deleted on 2026-06-25 to avoid confusion and must not be recreated.
- The `staging-uat` name in this document refers to a future Supabase environment/project, not a Git branch.

## Supabase Projects

### Legacy Production / Source

- Project ref: `mqsgptraslgpyzbpndlg`
- Supabase context: customer's old Supabase account/project context
- Purpose: legacy production/source system
- Usage: read-only audit, source dump, migration mapping
- Do not use for day-to-day development
- Do not apply schema changes directly unless explicitly approved

### Development / Target

- Project ref: `fhglqymcdmrgbsbadnwr`
- Supabase context: new development Supabase account/project context
- MCP server name: `supabase`
- Purpose: development, Supabase Auth testing, RLS testing, schema migration testing, frontend integration
- Status: project-level `.mcp.json` has been added so this repo points `supabase` to the dev project by default
- Note: global Supabase MCP entries were removed to avoid cross-project confusion
- Note: restart the Codex session before verifying MCP runtime tools
- LINE config update on 2026-07-13: dev-target has independent active `PMT` and `RCP` rules routed to the single active group `ทดสอบ`, both with stop-after-match enabled. The RCP rule is named `รับเงิน Customer → กลุ่มทดสอบ`; real loader/resolver verification returned only that group, official LINE validation returned HTTP 200, and live RCP job `168` reached `sent` on attempt 1 without a duplicate job.
- LINE link caveat on 2026-07-13: dev-target still has no `NEXT_PUBLIC_APP_URL`, so financial Flex messages fall back to `http://localhost:3000` for the open-system button. Do not copy the UAT URL into dev by assumption; configure the actual public dev URL when one exists.

### System Integration Test / SIT

- Project ref: `vbjlkxbytccklhqvxjuu`
- Current meaning in this project: `devkub1/ns-dev` Vercel SIT database/environment
- Local ignored env reference: `apps/next/.env.sit.local`
- Purpose: integration deployment smoke/UAT-before-customer checks for the separate `devdevkub-coder/ns-dev` repository and Vercel project
- Should remain separate from `dev-target`, customer UAT, legacy production, and future new production.

Status update on 2026-07-15:
- The Vercel project `devkub1/ns-dev` was configured with SIT Supabase/Postgres/KV env values from `apps/next/.env.sit.local`, plus derived `NEXT_PUBLIC_SUPABASE_*` values.
- The Vercel project output directory was corrected to `apps/next/.next`, then production redeploy `dpl_J583TfDv8PQjZi3UUrGbY29ML1qS` completed with `READY`.
- SIT database project `vbjlkxbytccklhqvxjuu` was refreshed from dev-target `fhglqymcdmrgbsbadnwr`.
- Before the refresh, a local SIT backup was written under `/tmp/ns-erp-dev-to-sit-20260715-034341`.
- Restored scope: application schemas `public`, `maintenance`, `supabase_migrations`, plus required Supabase Auth identity tables `auth.users` and `auth.identities`.
- Post-refresh reconciliation matched dev exactly for the checked scope: 202 tables, 67,008 rows, and 0 row-count differences.
- SIT has 117 public RLS policies, 91 RLS-enabled public tables, 17 public routines, 44 auth users, 43 auth identities, 21 app users, and 115 migration-history rows.
- The 6 not-yet-validated check constraints in SIT match dev exactly (`director_employees_type_chk` and supplier-advance VAT/type checks), so they are inherited dev state rather than restore drift.
- Post-refresh login repair restored required `public` grants for Supabase roles, added the app runtime database keys `DATABASE_URL`, `DATABASE_PRISMA_URL`, and `DATABASE_RUNTIME_URL` to Vercel production, and kept SIT-only test login values in the ignored local/Vercel SIT env rather than committed files.
- The deployed Prisma/pg runtime uses the Supabase pooler with `sslmode=require&uselibpqcompat=true`; this avoids the `SELF_SIGNED_CERT_IN_CHAIN` failure seen in `POST /api/auth/login-complete`.
- Latest SIT production redeploy `dpl_CAnQTGKviTNEdM4gHp9e9WdSHGi5` completed with `READY` and `ns-erp-sit.vercel.app` points to it. Browser smoke verification returned Supabase token `200`, `/api/auth/login-complete` `200`, and redirected to `/`.

Status update on 2026-07-16:
- Applied `20260716190000_add_customer_advance_vat_breakdown.sql` to dev-target `fhglqymcdmrgbsbadnwr`. Existing CADV rows: 2; invalid targets before migration: 0; post-migration valid tax breakdowns: 2/2; VAT constraints present: 3/3. Existing rows are explicitly `NONE`; new VAT-inclusive CADV records snapshot the master VAT rate by document date.
- Applied the CADV create/branch migrations and the Supplier ADV base-credit normalization migration directly to SIT with transactional error stopping.
- Applied `20260716190000_add_customer_advance_vat_breakdown.sql` to SIT `vbjlkxbytccklhqvxjuu` and recorded migration history. Postflight confirms all 4 VAT-breakdown columns, all 3 VAT arithmetic/type constraints, and 0 invalid CADV rows; SIT currently has no CADV business rows to backfill.
- SIT now has the CADV tables with required document branch support and validated ADV arithmetic constraints. `ADV012607-0004` reconciles to gross cash 10,700, allocated base 4,900, and remaining base 5,100.
- Repaired the SIT Storage layer after the database refresh left product/WTI storage keys without buckets or binary objects. Public 10 MB buckets `product-images` and `weight-ticket-pdfs` now use the documented MIME contracts and match the current UAT source object counts at 124 and 407. A real product thumbnail returned HTTP 200, and a service-role upload/public-read/delete health check passed for `weight-ticket-pdfs`.
- Supabase CLI still reports pre-existing migration-history drift, so do not run a blanket `supabase db push` until remote-only migration versions are reconciled with the repository.
- Verification on 2026-07-16 confirmed SIT still has migration-history row `20260716190000` plus the expected `public.customer_advances` VAT columns (`vat_type`, `vat_rate_percent`, `subtotal_amount`, `vat_amount`) and related tax-breakdown constraints. Current SIT `customer_advances` row count is `0`.

Status update on 2026-07-19:
- Before the Profit & Cost read-model migration, a custom-format backup of SIT schemas `public` and `supabase_migrations` plus a plain schema dump was written to `/tmp/ns-erp-profit-cost-sit-20260719-160926` with SHA-256 checksums.
- Applied and recorded migration `20260719160000_create_profit_cost_reporting_read_model.sql` on SIT project `vbjlkxbytccklhqvxjuu` using one transaction after all preflight issue counts returned zero.
- Backfill projected 31 Purchase Bills, 20 Sales Bills, 266 fact rows, and 135 daily-rollup rows. Postflight found zero reconciliation issues, zero unmapped Purchase Bill channels, and zero incomplete active Sales Bill COGS lines.
- Fact and daily totals match exactly: purchase `5,542,883.85`, revenue `629,499.67`, and COGS `453,344.86`. The stock-ledger projection trigger and validated Sales Bill line-profit constraint are present.
- No browser/deployed SIT smoke was run in this migration batch.

### Customer Receipt CADV Migration

Migration `20260718100000_add_customer_receipt_advance_allocations.sql` was applied with Supabase CLI to both SIT project `vbjlkxbytccklhqvxjuu` and customer UAT project `ekeomeumqjvbhgwyaqwe` on 2026-07-18. The CLI migration history for both environments now contains `20260718100000`; the existing later history entries `20260718140000` and `20260718143000` remain intact. The apply was executed from temporary workdirs populated with each remote migration history, so only the CADV receipt allocation migration was pushed despite pre-existing migration-history drift.

### Staging / UAT

- Active project ref: `ekeomeumqjvbhgwyaqwe`
- Previous project ref: `oolzfvqhovmjhiocfqdw` (superseded for the current customer UAT deployment)
- Current meaning in this project: customer-facing UAT database/environment
- Purpose: user testing, customer UAT, migration rehearsal, release validation
- Expected usage:
  - deploy tested schema from `dev-target`
  - seed sanitized or approved snapshot data
  - let customer/user validate business flow
  - run reconciliation checks before any production cutover
- Should be a separate Supabase project, not another database inside the same project

Current Git policy as of 2026-07-17:
- customer UAT code is promoted only from the approved SIT source into `uat-origin/main`
- `new-origin/uat` is retired; a local branch named `uat` is not a deployment target

Schema parity checkpoint on 2026-07-17:
- Before the SIT-to-UAT promotion, direct schema dumps of `public`, `maintenance`, `auth`, and `supabase_migrations` found UAT missing Customer Advance allocation breakdown migration `20260716082726`, Supplier ADV monetary precision, `sales_plans` RLS, and two `app_users` lifecycle comments.
- Existing migration `20260716082726_add_customer_advance_allocation_breakdown.sql` was applied and recorded in UAT. New migration `20260717093000_align_finance_precision_and_sales_plan_rls.sql` was applied and recorded in dev-target, SIT, and UAT after confirming no Supplier ADV value had more than two decimal places.
- Postflight normalized schema dumps for SIT and UAT are identical. UAT retains two historical CADV migration-history rows (`20260715133000`, `20260715143000`) not present in SIT because SIT received the equivalent schema through its database refresh; this is history-only and not schema drift.
- Promotion completed at commit `77786f70`: `new-origin/dev`, `sit-origin/main`, and customer `uat-origin/main` now point to the same commit. Remote branch `new-origin/uat` was deleted and must not be recreated.
- Later on 2026-07-17, CADV edit/cancel and ADV credit UI commit `14429b45` was promoted from `sit-origin/main` to customer `uat-origin/main` by fast-forward. A fresh normalized schema dump comparison for SIT `vbjlkxbytccklhqvxjuu` and UAT `ekeomeumqjvbhgwyaqwe` across `public`, `maintenance`, `auth`, and `supabase_migrations` was identical, so no additional UAT database migration was required. Migration-history difference remains history-only: UAT has `20260715133000` and `20260715143000` while SIT does not.

Status update on 2026-07-14:
- `apps/next/.env.uat.local` exists only as a local ignored reference file for customer UAT credentials and connection strings. It is not committed and is not loaded automatically by Vercel deployments.
- Customer UAT deployment/runtime must therefore still be verified from the live Vercel env plus the actual UAT database schema, not from the presence of `.env.uat.local` in one developer machine.
- UAT login failures reported as `ตรวจสอบบัญชีผู้ใช้งานไม่สำเร็จ` were traced to the active UAT database missing helper function `public.current_app_user_access_context()` while `public.has_app_permission()` already existed.
- Migration `20260712120000_add_current_app_user_access_context.sql` was applied directly to project `ekeomeumqjvbhgwyaqwe` and marked in `supabase_migrations.schema_migrations`.
- Post-fix verification confirmed both auth helper functions now exist in UAT, the migration history row exists, and an authenticated RPC call to `current_app_user_access_context()` for `watcharathat@gmail.com` returns the expected active app user context.
- A later UAT auth failure on `POST /api/auth/login-complete` was traced to schema drift versus dev: UAT was missing `public.app_users.account_status` and the rest of the current app-user lifecycle contract, plus `public.sales_plans` and the entire `maintenance` schema.
- Runtime schema sync was applied directly to UAT from the current dev database contract: `public.app_users` now includes `username`, lifecycle columns, defaults, and indexes; `public.sales_plans` now exists; and the `maintenance` schema/tables were recreated in UAT for parity with dev backups/admin support.
- Post-sync verification passed: a real Supabase password sign-in for `watcharathat@gmail.com` followed by `POST https://ns-erp-uat.vercel.app/api/auth/login-complete` returned HTTP `200`.
- Current customer UAT Git target remains the separate `uat-origin` repository, and on 2026-07-14 both `uat-origin/main` and `uat-origin/uat` were force-promoted from `new-origin/dev` so the customer UAT repo matches the active dev integration branch.
- After that promote, UAT application data was also overwritten directly from the current dev target for the active application schemas/tables (`public`, `maintenance`, application-owned `auth` data, and `supabase_migrations` application history).
- UAT Supabase Storage was synced from dev target for the business buckets `product-images` and `weight-ticket-pdfs`; post-sync object counts match dev exactly at `124` and `402`.
- Post-refresh verification on 2026-07-14 confirmed core business table counts match dev for users, customers, suppliers, products, WTI/WTO, PO Sell, PB/SB, petty advance, and stock ledger. Remaining row-count drift was limited to runtime log/audit tables (`app_activity_logs`, `app_audit_logs`, `app_auth_events`) created by the verification traffic itself.
- Direct Supabase password sign-in on the active UAT project `ekeomeumqjvbhgwyaqwe` still succeeds for `watcharathat@gmail.com` after the full code/schema/data/storage refresh.

Status update on 2026-07-16:
- Active UAT `ekeomeumqjvbhgwyaqwe` did not yet contain the CADV schema, so migrations `20260715133000_create_customer_advances.sql`, `20260715143000_add_branch_to_customer_advances.sql`, and `20260716190000_add_customer_advance_vat_breakdown.sql` were applied in dependency order and recorded in `supabase_migrations.schema_migrations`.
- Postflight confirms 4 CADV tables, 6 database-backed CADV statuses, required document `branch_id`, all 4 VAT-breakdown columns, all 3 VAT arithmetic/type constraints, and 0 invalid CADV rows. UAT had no CADV business rows to backfill.
- Verification on 2026-07-16 confirmed active UAT `ekeomeumqjvbhgwyaqwe` already contains migration-history rows `20260715133000`, `20260715143000`, and `20260716190000`, and the CADV tables `customer_advance_statuses`, `customer_advances`, `customer_advance_items`, and `customer_advance_status_logs` exist with the VAT-breakdown columns/constraints in place. Current UAT `customer_advances` row count is `0`.
- Supplier ADV parity checkpoint on 2026-07-16: direct SIT-vs-UAT schema comparison found one missing UAT unique index (`uq_supplier_advance_allocations_active_bill`) and Supplier ADV constraint drift. UAT still had 5 legacy `NOT VALID` constraints plus 4 missing validated checks around base-credit accounting (`allocated_amount`/`remaining_amount` vs subtotal base) even though SIT had already been normalized. Before validation, UAT also had 3 `supplier_advance_payments` rows and 3 `supplier_advance_allocations` rows still storing gross-style values in `allocated_amount` or `remaining_amount`. Those rows were normalized in place to the current base-credit rule (`remaining_amount = subtotal_amount - allocated_amount`, `allocated_amount = allocated_subtotal_amount`), the missing checks were added, the legacy `NOT VALID` checks were validated, and the missing partial unique index on active bill allocations was created. Postflight comparison shows parity with SIT for objects, columns, constraints, routines, and indexes within `public`, `maintenance`, `auth`, and `supabase_migrations`; bad-row rechecks for the Supplier ADV formulas returned `0`.

Status update on 2026-07-11:
- The active customer UAT deployment is `https://ns-erp-uat.vercel.app` and its Vercel Production environment now points Supabase URL, anon/publishable key, service-role/secret key, and PostgreSQL pooler connection to project ref `ekeomeumqjvbhgwyaqwe`.
- The project started with no `public` tables or Auth users. Before restore, a local UAT snapshot was created under `/tmp/ns-erp-dev-to-uat-20260711-143907`.
- Dev project `fhglqymcdmrgbsbadnwr` was cloned into the new UAT project for `public` schema/data, `auth.users`, `auth.identities`, and `supabase_migrations.schema_migrations`.
- Exact reconciliation passed with no per-table row-count differences: both environments have 140 public base tables and 32,737 public rows, 44 Auth users, 43 Auth identities, 117 public RLS policies, 90 RLS-enabled public tables, 15 public routines, and 106 migration-history rows.
- Supabase Storage objects were not copied in this PostgreSQL clone. Storage buckets, object metadata, and binary files must be provisioned or migrated as a separate controlled step before UAT flows that depend on stored PDFs/images are accepted.
- Applied UAT migrations `20260711173000`, `20260711190000`, and `20260711200000` to project `ekeomeumqjvbhgwyaqwe` after a scoped WTI/WTO backup. The confirmation-owned WTO hold migration released 5 active holds that belonged to draft WTO documents. Post-migration checks found 0 draft active holds and 0 WTI/WTO reconciliation issues; weight columns are `numeric(18,2)`, and the active-hold guard trigger plus Warehouse FK are installed.
- Superseded correction: WTI header `โกดัง` is a required physical-location text field, not the RM/WIP/FG stock Warehouse dimension. Corrective migration `20260711213000` removes the mistakenly added header `warehouse_id`; WTO continues using real `warehouses.id` per line, while WTI stock Warehouse is resolved automatically by the downstream stock/PB flow rather than selected in the WTI form.
- UAT release source is the separate `uat-origin` repository (`nserprich99-creator/ns-erp`) production branch `main`, not the old watcharathat Preview project. Commit `e0e70892` was fast-forwarded to that branch and Vercel reported a successful production deployment. `https://ns-erp-uat.vercel.app/` and `/api/health` both returned HTTP 200 after deployment.
- The new UAT Supabase project initially had no Storage buckets. Bucket `weight-ticket-pdfs` is now provisioned as public with a 10 MB file limit and allowed MIME types PDF/JPEG/PNG/WebP; service-role upload, public read, and delete health checks passed.
- The locally stored `UAT_VERCEL_TOKEN` is no longer valid. GitHub-to-Vercel automatic deployment works, but direct Vercel CLI/API operations require a replacement token before they can be used again.

Status update on 2026-07-01:
- Customer UAT Supabase is available at project ref `oolzfvqhovmjhiocfqdw`.
- Customer-facing UAT should be verified by env/deployment settings first. At the time of the latest checks, the customer UAT deployment was the Vercel customer project/domain pointing `NEXT_PUBLIC_SUPABASE_URL` to `oolzfvqhovmjhiocfqdw`.
- The current dev database snapshot was dumped from the active Next app `DATABASE_URL` in `apps/next/.env.local` at `2026-07-01 11:23:04 +07`.
- UAT was backed up before restore, then restored with the dev snapshot for `public` plus the required `auth.users` and `auth.identities` rows needed by public foreign keys and login.
- Post-restore validation matched the restored snapshot: `public` has 135 tables and 26,171 rows; `auth.users` has 43 rows and `auth.identities` has 42 rows.
- A later comparison against live dev showed 10 additional rows in dev after the dump time, so UAT matches the dump snapshot, not subsequent dev writes.
- LINE WTI/WTO Storage was repaired on UAT after finding older notification logs had been generated while the deployment still pointed Storage URLs at the dev Supabase host. The current Vercel `NEXT_PUBLIC_SUPABASE_URL` points to `oolzfvqhovmjhiocfqdw`, and UAT bucket `weight-ticket-pdfs` is now public with allowed MIME types `application/pdf`, `image/jpeg`, `image/png`, and `image/webp`; public read health checks passed for both PNG and PDF on the UAT host.

### New Production / Target

- Project ref: not created yet
- Purpose: future production target after schema, auth, RLS, migration, and UAT are ready
- Do not create or configure until the migration plan and cutover plan are mature enough

### Final Production Decision

There are two possible final production strategies:

1. Deploy back into the customer's old Supabase environment.
2. Create a new production Supabase project and migrate/cut over from `legacy-prod-source`.

This decision is still open.

Current preference for safety:
- Use `dev-target` for implementation.
- Add `staging-uat` before customer testing.
- Decide old environment upgrade vs new production project after schema, migration, UAT, backup, rollback, and reconciliation plans are mature.

## MCP Status

Project-level MCP config exists at `.mcp.json`.

`supabase` points to the dev project:

```text
supabase -> https://mcp.supabase.com/mcp?project_ref=fhglqymcdmrgbsbadnwr
```

Legacy production/source reference is available as:

```text
supabase-prod-source -> https://mcp.supabase.com/mcp?project_ref=mqsgptraslgpyzbpndlg&read_only=true
```

Global MCP status:

```text
supabase -> https://mcp.supabase.com/mcp?project_ref=fhglqymcdmrgbsbadnwr
supabase-prod-source -> https://mcp.supabase.com/mcp?project_ref=mqsgptraslgpyzbpndlg&read_only=true
```

Note: these were added to the Codex runtime/global MCP config because the current Codex CLI did not auto-load project-level `.mcp.json` after restart. This is an explicit operational exception for this project. Keep the canonical routing in `.mcp.json`, and verify the server URLs before using Supabase.

Session verification as of 2026-05-16:
- MCP tool access for `supabase` is available in the active agent runtime.
- `get_project_url` confirms `https://fhglqymcdmrgbsbadnwr.supabase.co`.
- `get_publishable_keys` returned enabled dev anon and publishable keys.
- `list_tables` for `public` returned no tables yet, so the dev target has not received the legacy public import.
- `list_mcp_resources(server="supabase")` returns `Method not found` for this MCP server; use the Supabase MCP tools directly instead.

Next session should verify the MCP server:

```text
list_mcp_resources(server="supabase")
```

Previous observed blocker:

```text
codex mcp get supabase -> No MCP server named 'supabase' found.
```

Current CLI verification:

```text
codex mcp list -> supabase and supabase-prod-source enabled
```

Session handoff as of 2026-05-16 15:00 +07:
- `codex mcp add supabase --url https://mcp.supabase.com/mcp?project_ref=fhglqymcdmrgbsbadnwr` completed.
- `codex mcp add supabase-prod-source --url https://mcp.supabase.com/mcp?project_ref=mqsgptraslgpyzbpndlg&read_only=true` completed.
- `codex mcp list` shows both servers enabled.
- The current agent runtime still needs a fresh session before MCP tools are expected to appear.
- After restart, first action should be MCP verification, not Supabase CLI fallback.

Session handoff update as of 2026-05-16:
- `rtk codex mcp login supabase` completed successfully through OAuth.
- `rtk codex mcp list` shows `supabase` enabled with OAuth auth.
- This running agent session still returns `Auth required` from `list_mcp_resources(server="supabase")`, so restart Codex before the next MCP verification.
- `supabase-prod-source` auth is shown as unsupported because it is configured read-only with the Supabase MCP URL; do not use it for writes.

If a future session still reports `supabase` is not authenticated, run:

```bash
rtk codex mcp login supabase
```

Then restart the Codex session again and run `/mcp` or `list_mcp_resources(server="supabase")`.

## Obsidian MCP

Obsidian MCP is configured at project level in `.mcp.json`.

```text
obsidian -> npx --yes @bitbonsai/mcpvault@latest /Users/watcharathatsrithanesiganon/Documents/GitHub/ns-scrap-erp
```

Purpose:
- use this repository as the Obsidian vault
- read/write project Markdown documents
- manage SRS, migration docs, and planning notes

Status:
- global Codex config should not contain `mcp_servers.obsidian`
- current Codex runtime may need a restart before `/mcp` shows the project-level `obsidian` tools

Supabase MCP also remains project-level in `.mcp.json`.

## Playwright MCP

Playwright MCP is configured at project level in `.mcp.json`.

```text
playwright -> npx --yes @playwright/mcp@latest --headless
```

Purpose:
- browser QA for the active Next.js app
- page inspection and accessibility snapshots
- screenshots and click-path verification
- support route/page smoke checks before UAT

Status as of 2026-05-18:
- Node.js `v25.8.1` satisfies the Playwright MCP Node.js requirement.
- `.mcp.json` validates as JSON.
- `npx --yes @playwright/mcp@latest --help` runs successfully.
- Current Codex runtime may need a restart before `/mcp` shows the `playwright` tools.

Operational notes:
- Keep Playwright MCP project-level unless there is a confirmed need to use it globally across repositories.
- Use the local Playwright CLI/test tooling for repeatable regression tests.
- Use Playwright MCP for exploratory browser inspection, click-path debugging, accessibility snapshots, and quick QA reconnaissance.

## Environment Files

### `.env.local`

Purpose: local machine secrets and dev values. This file is ignored by git.

Current expected values:

```env
VITE_SUPABASE_URL=https://fhglqymcdmrgbsbadnwr.supabase.co
VITE_SUPABASE_ANON_KEY=replace-with-dev-anon-key
DATABASE_URL=postgresql://postgres.fhglqymcdmrgbsbadnwr:replace-with-dev-db-password@replace-with-dev-pooler-host:5432/postgres
SUPABASE_DB_USER=postgres.fhglqymcdmrgbsbadnwr
SUPABASE_DB_URL=postgresql://postgres.fhglqymcdmrgbsbadnwr:replace-with-dev-db-password@replace-with-dev-pooler-host:5432/postgres
EXCHANGERATE_API_KEY=replace-with-api-key
CRON_SECRET=replace-with-random-16-plus-char-secret
```

Remaining manual updates:
- replace dev database password and pooler host in `DATABASE_URL` / `SUPABASE_DB_URL`
- add `EXCHANGERATE_API_KEY` only if Sales Plan live USD/THB should have fallback when Google Finance is unavailable
- add `CRON_SECRET` in Vercel project settings before relying on `/api/cron/sales-plan-lme`

Observed current state:
- `VITE_SUPABASE_URL` points to `fhglqymcdmrgbsbadnwr`.
- `VITE_SUPABASE_ANON_KEY` has been filled with the dev publishable key in local `.env.local`.
- `DATABASE_URL` and `SUPABASE_DB_URL` point to the dev-target project ref, but still use placeholder dev pooler host/password, so DB import into `dev-target` cannot run yet.
- Legacy production database connection values have been removed from `.env.local`; use only `supabase-prod-source` MCP or approved read-only dump tooling for source inspection.

### `.env.example`

Purpose: committed template only. Do not put real credentials in this file.

## Docker DB Status

The previous local Docker Postgres database has been removed.

Current policy:
- no local Docker DB baseline
- no plain local Postgres for auth/RLS testing
- use Supabase dev/target for DB + Auth + RLS development

## Sensitive Data

Do not commit:
- `.env.local`
- Supabase DB passwords
- service role keys
- `reports/db_audit/full_dump.sql`
- `reports/db_audit/public_app_dump.sql`
- `reports/` local audit artifacts unless a sanitized file is explicitly approved
- raw production exports

Cleanup note:
- Keep local `reports/` artifacts for now because they may still be useful for audit/migration reference.
- Delete or archive `reports/` during a later project cleanup pass after confirming no remaining migration/debug task needs those files.

## Current Import Prep Status

Prepared local source dump:

```text
reports/db_audit/public_app_dump.sql
```

This file was generated from `legacy-prod-source` with `pg_dump --schema=public --no-owner --no-privileges --clean --if-exists`.

Important constraints:
- It contains only legacy application tables in `public`.
- It intentionally excludes Supabase-managed schemas such as `auth`, `storage`, `realtime`, and `vault`.
- It is ignored by git because it may contain sensitive customer, supplier, auth-adjacent, transaction, payment, and financial data.

Import status as of 2026-05-17:
- Imported `reports/db_audit/public_app_dump.sql` into `dev-target` (`fhglqymcdmrgbsbadnwr`) as a legacy baseline.

Thai address master data status as of 2026-05-17:
- Added `public.thai_provinces` with 77 rows.
- Added `public.thai_districts` with 928 rows.
- Added `public.thai_subdistricts` with 7,436 rows.
- Customer structured address columns now use these reference tables in the Vue customer form for province, district, subdistrict, and postal-code selection.
- `public` now has 47 application tables.
- Import intentionally did not migrate Supabase `auth` data.
- The only non-clean import issue observed after table creation was `user_profiles_user_id_fkey`, because `public.user_profiles.user_id` references missing `auth.users` rows. The FK was not created; this is acceptable for the temporary baseline while auth migration is deferred.
- Auth/RLS is temporarily out of scope for UI data wiring. RLS has been disabled on imported `public` tables in `dev-target`, and `anon` / `authenticated` have table access so the local Vue app can read real baseline data without login. Re-enable and redesign RLS before UAT/production.

Next DB actions:
1. Run master data quality checks on the imported baseline.
2. Decide whether to keep `public.users` / `roles` / `roles_config` temporarily for reference only or replace them immediately in the auth schema design.
3. Create/confirm dev Auth users later, then map to `app_users`.
4. Reconcile key row counts before schema refactor batches.

## Current Focus

Current implementation focus is the Next.js master data port before returning to full Auth/Role enforcement.

Status as of 2026-05-18:
- Current git checkpoint is `d6e8b29 feat: standardize supplier master form`.
- Customer and supplier are the most advanced master-data pages: structured form validation, Thai address form, frontend search/filter/sort/count/pagination, active toggle, and `.xlsx` export.
- Product still exists as a generic shared master-data page and is the next likely candidate for the same specialized pattern.
- Sidebar/shadcn/Tailwind v4 design experiment was reset out of the current baseline. The active deploy/code baseline remains the pre-shadcn Next shell with Tailwind v3.

Next master data progress is tracked in:

```text
docs/migration/13-next-master-data-progress.md
```

Current Next status as of 2026-05-17:
- `apps/next` is the active migration target for the new frontend direction.
- `old-apps/vue` remains the audited visual/source baseline for existing cloned pages.
- `old-apps/legacy` remains archived source material only.
- `customers` is the first enhanced Next master-data page with API/Prisma/dev-target wiring, frontend table search/filter/sort/count/pagination after one list load, postcode-first Thai address form, field-level syntax validation, person/contact structured name fields, and Excel-compatible export.
- Batch 1-4 master-data pages now have Next routes and APIs. Batch 4 fixture-backed masters that were not real legacy DB tables have additive target tables in `dev-target`.
- Next login uses Supabase Auth with email/password and username lookup through `app_users.username -> email`.
- Next auth/permission baseline now exists in `dev-target`: `app_users`, `app_roles`, `app_permissions`, `app_role_permissions`, `app_user_roles`, `app_user_branch_access`, helper RPC functions, and `app_auth_events`.
- Next `proxy.ts` now enforces normalized permissions for mapped paths and keeps a legacy admin/owner fallback during transition.
- `/admin/users-permissions` supports user create/edit/status/invite/reset actions without storing passwords in app tables.
- `/admin/company-profile` exists as a Next functional company print-profile page backed by the additive `company_profiles` singleton table, protected by `system.settings.manage`, with field-level syntax validation and small-logo data URL support for printable documents.
- `/admin/transaction-ledger` exists as a Next read-only ledger view over `accounts` and `bank_statement`, protected by `finance.cash.view`, with account balance cards, table filters, summary totals, account verification helper, linked purchase/sales bill badges, source payee enrichment, running balance, non-destructive duplicate diagnostics, and XLSX export; write/edit/delete mutations are intentionally deferred until audit/reconciliation rules are defined.
- `/admin/audit` reads the redesigned Audit / Activity feed for users with `system.audit.view`, with group/search/actor/target/event-type filters, server pagination, current-page CSV export, and detail metadata modal. The new dev-target source of truth is split into append-only `app_audit_logs` for trace-critical security/write/permission events and `app_activity_logs` for user/session/page/action activity; legacy `app_auth_events`, `audit_logs`, and deletion log tables are retained as compatibility/history sources only.
- Functional Next pages now use normalized client/server error handling for implemented pages (`customers`, `suppliers`, `products`, `/admin/users-permissions`, `/admin/audit`): API errors return a consistent `{ code, error, fieldErrors }` shape where applicable, Zod validation returns field errors, DB/internal errors are sanitized, and the UI maps auth/permission/conflict/network/invalid-response cases to Thai user-facing messages.
- Login and authorization security baseline:
  - Login credential prefill has been removed from every environment. The Login page never reads or sends default email/password values from environment variables.
  - Authorization requires a direct `auth.users.id -> app_users.auth_user_id` link. Email matching, legacy `user_profiles.role`, and Auth metadata role fallbacks are not accepted.
  - Retired login-prefill environment variables must not be restored; browser-exposed `NEXT_PUBLIC_*` variables must never contain credentials
- Supabase Auth email URL checklist:
  - Supabase Dashboard > Authentication > URL Configuration > `Site URL` should be `https://new-ns-scrap-erp.vercel.app`
  - add redirect allow-list entries for `https://new-ns-scrap-erp.vercel.app/**` and local dev such as `http://localhost:3000/**`
  - check Authentication > Email Templates for Invite user, Reset password, and Confirm signup; if code passes `redirectTo`, templates that should honor it must use `{{ .RedirectTo }}` rather than hardcoding `{{ .SiteURL }}`
  - `/api/admin/users/[id]/invite` sends reset links to `${window.location.origin}/reset-password` from the browser action; wrong email URLs usually mean Supabase Site URL, Redirect URLs, or email template variables are stale
- Import pages are intentionally excluded from the current master CRUD baseline batch.
- Project-level validation rules now require syntax validation for every new/changed form/API field. The detailed checklist lives in `.agents/skills/ns-scrap-erp-input-validation/SKILL.md`.

Frontend clone status as of 2026-05-16:
- All inventoried sidebar/pages have Vue routes and view components.
- New app routes no longer use `/legacy/...`.
- `LegacyPlaceholderView.vue` and the placeholder route catalog have been removed.
- `old-apps/legacy/` remains archived source material only; `old-apps/vue/` must not import, route to, or execute archived legacy files.
- `npm test` and `npm run build` passed after the route cleanup.

Remaining frontend work:
- browser visual review is still needed for each route across desktop/mobile
- real functions are still pending for most cloned pages
- sidebar/action visibility must be connected to Auth/Role mapping

DB schema redesign status:
- Additive target tables and customer classification/person-name fields have been applied to `dev-target` for the current master-data work.
- Security/access baseline migrations are applied to `dev-target`; they are additive and keep legacy `public.users`, `user_profiles`, `roles`, and `roles_config` for reference during migration.
- Full table-level RLS rollout for legacy/imported business tables is still pending and must be done table-by-table before UAT/production.
- Applied and recorded `20260724110000_add_production_output_wip_allocations.sql` to dev-target. `production_outputs.source_wip_allocations` is now available for multi-source WIP allocation snapshots; no existing business rows were changed.
- `20260724130000_add_production_output_drafts.sql` has been applied to dev-target using the project database credentials. Postflight confirmed `public.production_output_drafts` exists with the expected order, payload, audit, and timestamp columns; the table is empty and ready for Draft API testing.
- Applied and recorded `20260724150000_reconcile_production_wip_ledger_product_dimension.sql` to dev-target. Postflight updated 16 output WIP/loss ledger rows and 2 input-return WIP-out rows so the WIP bucket uses the production-order product dimension while preserving the original input product in `source_input_product_id` when it differed.
