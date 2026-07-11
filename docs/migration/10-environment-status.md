# 10 Environment Status

## Current Direction

Development database and auth testing should use a separate Supabase dev/target project.

The customer's old production Supabase remains the legacy source system for read-only audit and migration-source dumps.

Important account boundary:
- `legacy-prod-source`, `dev-target`, and future `staging-uat` should be separate Supabase account/project contexts where practical.
- Do not assume access tokens, Auth users, API keys, Storage buckets, or project settings are shared between them.
- A future `new-prod` project has not been created yet.

Git branch boundary:
- `new-origin/uat` is only the default Git promotion branch in the main repo workflow.
- The actual UAT environment must be identified from deployment env and database env (`NEXT_PUBLIC_SUPABASE_URL`, `DATABASE_URL`, Vercel project/domain, and target remote) before any promote/deploy/debug action.
- Do not assume every environment called `uat` is backed by `new-origin/uat`; customer UAT may be served from a different remote/repo while still using the customer UAT env.
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

Status update on 2026-07-11:
- The active customer UAT deployment is `https://ns-erp-uat.vercel.app` and its Vercel Production environment now points Supabase URL, anon/publishable key, service-role/secret key, and PostgreSQL pooler connection to project ref `ekeomeumqjvbhgwyaqwe`.
- The project started with no `public` tables or Auth users. Before restore, a local UAT snapshot was created under `/tmp/ns-erp-dev-to-uat-20260711-143907`.
- Dev project `fhglqymcdmrgbsbadnwr` was cloned into the new UAT project for `public` schema/data, `auth.users`, `auth.identities`, and `supabase_migrations.schema_migrations`.
- Exact reconciliation passed with no per-table row-count differences: both environments have 140 public base tables and 32,737 public rows, 44 Auth users, 43 Auth identities, 117 public RLS policies, 90 RLS-enabled public tables, 15 public routines, and 106 migration-history rows.
- Supabase Storage objects were not copied in this PostgreSQL clone. Storage buckets, object metadata, and binary files must be provisioned or migrated as a separate controlled step before UAT flows that depend on stored PDFs/images are accepted.
- Applied UAT migrations `20260711173000`, `20260711190000`, and `20260711200000` to project `ekeomeumqjvbhgwyaqwe` after a scoped WTI/WTO backup. The confirmation-owned WTO hold migration released 5 active holds that belonged to draft WTO documents. Post-migration checks found 0 draft active holds and 0 WTI/WTO reconciliation issues; weight columns are `numeric(18,2)`, and the active-hold guard trigger plus Warehouse FK are installed.
- The Warehouse shape constraint remains intentionally `NOT VALID` because 45 historical WTI rows do not yet have an explicitly mapped Warehouse ID. They are listed by `public.weight_ticket_warehouse_migration_issues`; runtime must not guess from the legacy free-text warehouse value. New and edited WTI documents must use the real `warehouses.id`.

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
```

Remaining manual updates:
- replace dev database password and pooler host in `DATABASE_URL` / `SUPABASE_DB_URL`

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
- Login prefill is supported for test-only convenience:
  - local dev uses `DEV_LOGIN_IDENTIFIER` / `DEV_LOGIN_PASSWORD`
  - Vercel production can temporarily enable test prefill through `NEXT_PUBLIC_ENABLE_TEST_LOGIN_PREFILL=1`, `NEXT_PUBLIC_TEST_LOGIN_IDENTIFIER`, and `NEXT_PUBLIC_TEST_LOGIN_PASSWORD`
  - `NEXT_PUBLIC_*` values are visible to anyone visiting the site; remove these env vars before real UAT or production use, and never commit real credentials to git
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
