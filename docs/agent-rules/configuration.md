# Configuration Rules

## Project-Level Configuration

Project-specific knowledge and configuration should live in this repository, not in global user configuration.

Keep these in project-level files:
- agent rules: `AGENTS.md`
- detailed agent rules: `docs/agent-rules/`
- project-level skills: `.agents/skills/`
- MCP project routing: `.mcp.json`
- migration plans: `docs/migration/`
- requirements and architecture docs: `REQUIREMENTS_TARGET_SYSTEM.md`
- non-secret env templates: `.env.example`
- git ignore rules: `.gitignore`

Do not put this project's MCP routing in global Codex config unless explicitly requested. Global MCP entries can cause other projects or future sessions to connect to the wrong project or vault.

Project-level MCP entries in `.mcp.json`:
- `supabase`: production Supabase project
- `supabase-prod-source`: legacy production source, read-only
- `obsidian`: Obsidian vault scoped to this repository path
- `playwright`: Playwright MCP for browser QA

Project-level skills live in `.agents/skills/`. Project-specific shortcut skills must point back to `AGENTS.md` and the canonical docs instead of duplicating project rules.

## Current Project-Level Skills

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

## Sensitive Data

Keep these out of git and only in local/private storage:
- `.env.local`
- OAuth tokens
- database passwords
- service role keys
- production dumps
- raw sensitive exports

Never commit:
- database passwords
- Supabase service role keys
- private access tokens
- production `.env` files
- `reports/db_audit/full_dump.sql`
- raw data exports that contain customer, supplier, user, auth, payment, or financial data

If generated audit files are needed for local analysis, keep them local unless the user explicitly approves committing sanitized versions.
