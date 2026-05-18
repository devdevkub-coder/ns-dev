# NS Scrap ERP Agent Rules

This project is an existing NS Scrap ERP system that must be rehabilitated and refactored, not rewritten blindly.

## Must Follow

- Use Thai for user-facing explanations unless the user explicitly requests another language.
- Active implementation/deploy target is the Next.js app under `apps/next/`.
- Treat `old-apps/legacy/` and `old-apps/vue/` as source material only. Do not route to, import, or execute them from the active app.
- Use `dev-target` Supabase for development and schema work. Do not develop directly against `legacy-prod-source`.
- Never commit secrets, production dumps, raw sensitive exports, or `.env.local`.
- Do not store user passwords in application tables. Use `auth.users` as the authentication source of truth.
- Do not use destructive git commands or revert user changes unless explicitly requested.
- Update docs at every meaningful checkpoint as if the session can close at any time.
- Use a sub agent by default for Playwright/browser QA work; the main agent still defines scope and integrates findings.
- Split large refactors into reviewable batches with one clear module, transform, or behavior change per batch.
- After a batch is validated, committed, and pushed, immediately start the next batch from `docs/migration/00-current-work.md` and the relevant tracker unless the user pauses, redirects, or the next step requires explicit approval for high-risk work.

## Required Reading

Before substantial work, read:
- `docs/migration/00-current-work.md`
- `docs/migration/00-doc-index.md`
- `REQUIREMENTS_TARGET_SYSTEM.md`
- `docs/migration/README.md`
- `docs/migration/09-implementation-tasklist.md`
- `docs/migration/10-environment-status.md`

For database or migration work, also read:
- `docs/migration/01-current-state.md`
- `docs/migration/04-master-data-definition.md`
- `docs/migration/05-schema-mapping.md`
- `docs/migration/07-reconciliation-plan.md`
- `docs/agent-rules/database.md`

## Detailed Rule Files

Read only the relevant detailed rule files for the task:

- Project config, MCP, skills, secrets: `docs/agent-rules/configuration.md`
- Database and Supabase environments: `docs/agent-rules/database.md`
- Active app, legacy source, migration priority, code organization: `docs/agent-rules/development.md`
- Forms, API payloads, syntax validation, master data list pattern: `docs/agent-rules/validation.md`
- Testing, browser QA, Playwright expectations: `docs/agent-rules/testing.md`
- Sub agent usage and close rules: `docs/agent-rules/sub-agents.md`
- Resumable checkpoint docs: `docs/agent-rules/session-handoff.md`
- Git and communication: `docs/agent-rules/git-communication.md`

## Project Goal

Improve the existing system so both code and database structure are correct, maintainable, and traceable while preserving current business flow as much as practical.

Do not treat this as a greenfield rewrite unless explicitly instructed.

## Current Environment Shortlist

- Active app: `apps/next/`
- Dev/target Supabase: `fhglqymcdmrgbsbadnwr`
- Legacy production/source Supabase: `mqsgptraslgpyzbpndlg` read-only
- Staging/UAT: not created yet
- New production: not created yet
- Project MCP config: `.mcp.json`
- Project skills: `.agents/skills/`
- Current work handoff: `docs/migration/00-current-work.md`

## Validation Baseline

For meaningful code changes, run validation proportional to risk. For the active Next app, prefer:

```bash
npm run lint --workspace @ns-scrap-erp/next
npm run type-check --workspace @ns-scrap-erp/next
npm run build --workspace @ns-scrap-erp/next
```

For docs-only changes, at minimum run:

```bash
git diff --check
```
