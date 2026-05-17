# 10 Environment Status

## Current Direction

Development database and auth testing should use a separate Supabase dev/target project.

The customer's old production Supabase remains the legacy source system for read-only audit and migration-source dumps.

Important account boundary:
- `legacy-prod-source`, `dev-target`, and future `staging-uat` should be separate Supabase account/project contexts where practical.
- Do not assume access tokens, Auth users, API keys, Storage buckets, or project settings are shared between them.
- A future `new-prod` project has not been created yet.

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

- Project ref: not created yet
- Purpose: user testing, customer UAT, migration rehearsal, release validation
- Expected usage:
  - deploy tested schema from `dev-target`
  - seed sanitized or approved snapshot data
  - let customer/user validate business flow
  - run reconciliation checks before any production cutover
- Should be a separate Supabase project, not another database inside the same project

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
- raw production exports

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

Next master data progress is tracked in:

```text
docs/migration/13-next-master-data-progress.md
```

Current Next status as of 2026-05-17:
- `apps/next` is the active migration target for the new frontend direction.
- `old-apps/vue` remains the audited visual/source baseline for existing cloned pages.
- `old-apps/legacy` remains archived source material only.
- `customers` is the first Next master-data baseline page with API/Prisma/dev-target wiring.
- Remaining master-data pages will be ported in batches and documented after each batch.
- Import pages are intentionally excluded from the current master CRUD baseline batch.

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

DB schema redesign is intentionally paused:
- No new target DB schema has been applied to `dev-target`.
- No security/access migration is currently committed as ready to apply.
- `public.users`, `roles`, and `roles_config` replacement design still needs a dedicated DB design pass after the frontend login flow is usable.
