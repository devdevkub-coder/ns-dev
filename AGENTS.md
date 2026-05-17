# NS Scrap ERP Agent Rules

This project is an existing NS Scrap ERP system that must be rehabilitated and refactored, not rewritten blindly.

## Required Reading

Before doing substantial work, read:
- `SRS.md`
- `docs/migration/README.md`
- `docs/migration/09-implementation-tasklist.md`
- `docs/migration/10-environment-status.md`

For database or migration work, also read:
- `docs/migration/01-current-state.md`
- `docs/migration/04-master-data-definition.md`
- `docs/migration/05-schema-mapping.md`
- `docs/migration/07-reconciliation-plan.md`

## Project-Level Configuration Rule

Project-specific knowledge and configuration should live in this repository, not in global user configuration.

Keep these in project-level files:
- agent rules: `AGENTS.md`
- project-level skills: `.agents/skills/`
- MCP project routing: `.mcp.json`
- migration plans: `docs/migration/`
- requirements and architecture docs: `SRS.md`
- non-secret env templates: `.env.example`
- git ignore rules: `.gitignore`

Do not put this project's MCP routing in global Codex config unless explicitly requested. Global MCP entries can cause other projects or future sessions to connect to the wrong project or vault.

Project-level MCP entries in `.mcp.json`:
- `supabase`: dev-target Supabase project
- `supabase-prod-source`: legacy production source, read-only
- `obsidian`: Obsidian vault scoped to this repository path

Project-level skills live in `.agents/skills/`. Project-specific shortcut skills must point back to `AGENTS.md` and the canonical docs instead of duplicating project rules.

Current project-level skills:
- `ns-scrap-erp-migration`: shortcut for DB, migration, Supabase Auth/RLS, and phase planning tasks
- `ns-scrap-erp-input-validation`: shortcut for required/syntax validation on forms, API payloads, and database-backed write flows
- `ns-scrap-erp-obsidian`: shortcut for project notes, MOCs, decision logs, and Obsidian navigation
- `ns-scrap-erp-quality-audit`: shortcut for click-path audit, browser QA, accessibility, workspace surface audit, and final verification
- `codebase-migrate`: batch-oriented migration/refactor workflow; use local reviewable batches unless external Composio tooling is explicitly configured
- `webapp-testing`: Playwright-oriented local web app testing workflow for archived legacy source checks, Vue/Vite routes, screenshots, console logs, and browser behavior
- `vue-best-practices`: Vue 3 best practices for `.vue`, Vue Router, Pinia, and Vite work
- `vue-vite-project-setup`: project-specific Vue/Vite setup workflow that keeps legacy source archived separately while building the new Vue app
- `vue-vitest-testing`: project-specific Vue/Vitest testing workflow for components, stores, services, schemas, and migration-critical logic
- `pinia`: Pinia store patterns for Vue client/app state
- `supabase`: official Supabase agent skill for Database, Auth, RLS, Storage, CLI, MCP, migrations, and security tasks
- `supabase-postgres-best-practices`: official Supabase Postgres performance, schema, indexing, and RLS guidance

Keep these out of git and only in local/private storage:
- `.env.local`
- OAuth tokens
- database passwords
- service role keys
- production dumps
- raw sensitive exports

## Primary Goal

The main requirement is to improve the existing system so that both code and database structure are correct, maintainable, and traceable while preserving the current business flow as much as possible.

Do not treat this as a greenfield rewrite unless explicitly instructed.

## Language

Use Thai for user-facing explanations unless the user explicitly requests another language.

## Architecture Direction

Target stack:
- Vue 3
- Vite
- TypeScript
- Vue Router
- Pinia
- TanStack Query
- Tailwind CSS
- Zod
- VueUse
- Supabase Auth / Postgres / Storage
- IndexedDB / Dexie only where offline or local cache is required

## Legacy Source Rules

- The old application is archived locally under `old-apps/legacy/`; this path is ignored by git.
- The audited Vue/Vite baseline lives locally under `old-apps/vue/`; this path is ignored by git.
- The active deploy target currently lives under `apps/next/`.
- Do not route to, import, or execute `old-apps/legacy/` from the active app.
- Use `old-apps/legacy/` and `old-apps/vue/` only as source material: copy the necessary function/module into the active app, then refactor it into the new structure.
- Preserve the existing UI appearance and business flow where possible while implementing it in the new app.
- Refactor by module and by risk, not by wholesale replacement.
- Large refactors must be split into reviewable batches with one clear module, transform, or behavior change per batch.

## Migration Priority

Work must generally follow this order:
1. Project structure and development foundation
2. Security, users, roles, permissions
3. Master data
4. Key basic data
5. Core transactions
6. Inventory and stock logic
7. Finance and operational controls
8. Advanced modules
9. Reporting and cutover

Do not start heavy transaction migration before master data and key basic data are defined and validated.

## Database Rules

- The current database dump is a baseline and migration source, not the final target model.
- Prefer relational structure over transaction-critical `jsonb`.
- Split transaction headers and lines.
- Use real foreign keys where practical.
- Keep ledger-style tables traceable and preferably append-only.
- Use `auth.users` as the authentication source of truth.
- Do not store user passwords in application tables.
- Normalize roles and permissions instead of duplicating permission models.
- Define reconciliation queries for any migrated financial, stock, or transaction data.

## Sensitive Data Rules

Never commit secrets or sensitive database dumps.

Do not commit:
- database passwords
- Supabase service role keys
- private access tokens
- production `.env` files
- `reports/db_audit/full_dump.sql`
- raw data exports that contain customer, supplier, user, auth, payment, or financial data

If generated audit files are needed for local analysis, keep them local unless the user explicitly approves committing sanitized versions.

## Database Environment Rules

Use a separate Supabase dev/target project for development, auth testing, RLS testing, and frontend integration.

The customer's old production Supabase should be treated as a legacy source system only.

Environment naming:
- `dev-target`: `fhglqymcdmrgbsbadnwr`
- `legacy-prod-source`: `mqsgptraslgpyzbpndlg`
- `staging-uat`: not created yet
- `new-prod`: not created yet

Account boundary:
- `dev-target`, `legacy-prod-source`, and future `staging-uat` should be separate Supabase account/project contexts where practical.
- Do not assume access tokens, Auth users, API keys, Storage buckets, or project settings are shared.

Rules:
- For Supabase access, try the project-level MCP server first (`supabase` for `dev-target`, `supabase-prod-source` for read-only legacy source) before falling back to Supabase CLI, `psql`, or direct connection strings.
- If MCP is not visible or not authenticated, report that explicitly and only use CLI/`psql` as a fallback with the target project verified first.
- Do not develop directly against `legacy-prod-source`.
- Do not run destructive operations against `legacy-prod-source` unless the user explicitly asks for it and the command scope is clear.
- Use legacy production DB credentials only for read-only audit, dump, and migration-source work.
- Apply schema changes to `dev-target` first.
- Test Supabase Auth and RLS in `dev-target`, not in plain local Postgres.
- Use future `staging-uat` for customer/user testing before any production cutover.
- Final production target is open: either validated migration back into the customer's old environment or a new production Supabase project.

## Code Organization Rules

When creating the Vue/Vite structure, use:

```text
src/
  router/
  views/
  components/
  stores/
  composables/
  services/
  queries/
  schemas/
  lib/
```

Layer responsibilities:
- views: page composition
- components: reusable UI
- stores: client/app state only; do not store server cache or direct database access here
- queries/services: data access and mutations
- schemas: validation
- lib: pure utilities

Business logic should not be embedded in templates.

## Input Validation Rules

For every new or changed form/API field, define validation before saving data:
- Required fields must be explicit in the shared schema and shown in the UI.
- Validate syntax for every input field, not just presence. Examples: email syntax, phone number shape, tax ID length/digits, numeric ranges, date format/order, enum membership, text length, and allowed characters for names/codes.
- Validate on both client-side form submission and server/API boundaries. Client validation is for UX; server validation is authoritative.
- Show field-level error messages in the form for all validation failures.
- Do not rely on HTML input types alone. Use Zod or the module's existing schema layer as the source of truth.
- Keep validation practical for Thai business data: allow Thai text where appropriate, but reject control characters, obviously invalid punctuation, malformed identifiers, and negative values where not allowed.

## Testing and Validation

For migration/refactor work, include validation proportional to risk:
- schema validation for master data
- permission logic tests
- row count comparison
- orphan FK checks
- transaction total reconciliation
- stock balance reconciliation
- smoke tests for login and core flows

Use `ns-scrap-erp-quality-audit` for substantial UI, state, workflow, or release-readiness checks.
Use `ns-scrap-erp-migration` batch guidance for large legacy-to-Vue, DB, schema, or repeated code transformations.

For click-path work, verify:
- the touchpoint label and user expectation
- the handler call order
- state reads, writes, resets, and side effects
- async ordering and race conditions
- whether final UI state matches the action intent

For browser QA, verify:
- console and network failures
- desktop and mobile viewport behavior
- login, protected routes, logout, and core navigation
- valid and invalid form submissions
- accessibility basics: keyboard access, focus visibility, labels, and modal focus behavior

## Git Rules

- Do not revert user changes unless explicitly requested.
- Do not use destructive git commands unless explicitly requested.
- Keep commits focused by phase or module.
- Do not commit local tool settings such as `.claude/settings.local.json` unless the user explicitly wants it.

## Communication Rules

When explaining work:
- Be direct and concise.
- Explain tradeoffs clearly.
- Surface risk early.
- State whether a change affects legacy behavior, database structure, or migration assumptions.
