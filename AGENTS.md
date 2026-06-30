# NS Scrap ERP Agent Rules

This project is an existing NS Scrap ERP system that must be rehabilitated and refactored, not rewritten blindly.

## Must Follow

- **TOKEN-LIGHT RULE LOADING:** Do not read root `Peach.md` by default. At the start of a task, read `AGENTS.md` plus only the detailed rule files that match the work. The small router at `.agents/rules/peach.md` exists only to choose the right rule file; it must not pull the old full Peach context into every task.
- Use Thai for user-facing explanations unless the user explicitly requests another language.
- Active implementation/deploy target is the Next.js app under `apps/next/`.
- Treat `old-apps/legacy/` and `old-apps/vue/` as source material only. Do not route to, import, or execute them from the active app.
- Use `dev-target` Supabase for development and schema work. Do not develop directly against `legacy-prod-source`.
- Never commit secrets, production dumps, raw sensitive exports, or `.env.local`.
- Do not store user passwords in application tables. Use `auth.users` as the authentication source of truth.
- Do not use destructive git commands or revert user changes unless explicitly requested.
- Git remote policy:
  - push to `new-origin` only unless the user explicitly says otherwise
  - `origin` / `https://github.com/sirimasth/ns-scrap-erp.git` is legacy read-only reference material only
  - never push, force-push, create branches, delete branches, open PRs, write tags, or otherwise mutate `origin` / `https://github.com/sirimasth/ns-scrap-erp.git`
  - use `origin` only for read operations such as fetch, log, diff, show, and checkout-to-inspect
  - if both remotes exist, verify the destination remote before push, branch deletion, or PR creation
- Update docs at every meaningful checkpoint as if the session can close at any time. Every time development or browser/UAT testing of a business flow is completed, you MUST write or update a flow summary (e.g. in the walkthrough or a design note) explaining "what is what" (the business entities and states) and "why it has to be like this" (the rationale behind the design and logic).
- Use a sub agent by default for Playwright/browser QA work; the main agent still defines scope and integrates findings.
- **🚫 NO DOM ON PLANE:** Do not use DOM automation, browser sub-agents, or Playwright to access, login, click, input, or interact with `https://plane.devkub.com/` under any circumstances. All interactions with Plane must be executed programmatically via backend REST APIs or node/bash scripts, or handled manually by the user.
- If the user requests modifications or code improvements, only perform the code changes and verify compilation locally. Do NOT run browser or DOM UAT testing unless the user explicitly requests testing (i.e. do not use browser sub-agent unless told to test).
- Split large refactors into reviewable batches with one clear module, transform, or behavior change per batch.
- During clone/migration batches, use `docs/design.md` as the active design convention source and keep legacy/Vue parity unless a difference is documented and approved.
- For every UI/page change in `apps/next/`, check these three inputs before editing:
  1. the business flow / requirement for that page,
  2. `docs/design.md`,
  3. the closest reference page in the active app.
- Do not patch UI from memory or from a loosely similar page alone. If `docs/design.md` and an existing page differ, follow `docs/design.md` unless an override is documented in `docs/migration/00-current-work.md`.
- For form/list/filter work, explicitly verify wording, field behavior, layout grouping, and control sizing against the relevant flow and reference page before claiming completion.
- For form field type decisions, map every field to the `Field Input Decision Matrix` in `docs/design.md` before choosing `text`, `number`, or `money pattern`.
- If a field looks numeric but represents money, identifier, or business code, do not infer the input type from appearance alone; use the matrix and the page flow.
- Do not change application code outside the intended business flow just to tolerate bad, legacy, or malformed data. If data violates the target contract, fix the data, migration, seed, or source-of-truth process instead of adding compatibility branches, fallback logic, skip-row handling, or silent coercion in runtime code.
- After a batch is validated, committed, and pushed, immediately start the next batch from `docs/migration/00-current-work.md` and the relevant tracker unless the user pauses, redirects, or the next step requires explicit approval for high-risk work.

## Team Git Workflow

Use `new-origin` branches with this promotion path:

```text
codex/* or feature/*
  -> dev
  -> uat
  -> main
```

- `main` is production-ready only. Do not work directly on `main`, and do not push directly to `main` unless the user explicitly asks for a coordinated release or hotfix.
- `uat` is for UAT/pre-production verification. Merge or promote from `dev` only after the integrated batch is ready for broader QA.
- The old remote branch `staging` has been deleted to avoid confusion. Do not recreate, push to, or promote through `staging`.
- `dev` is the shared integration branch. Start normal feature, bugfix, migration, and refactor work from `dev`.
- `codex/*` or `feature/*` branches are for scoped work. Keep each branch focused on one feature, bugfix, migration batch, or behavior change.
- After completing and validating a feature branch, merge or PR it into `dev` first, then promote `dev` to `uat`, then promote `uat` to `main`.
- Agents should finish work on `dev` or a scoped feature branch, not on `main`.
- Before creating a branch, pushing, merging, or opening a PR, verify the current branch, worktree, and destination remote:

```bash
git remote -v
git branch --show-current
git status --short --branch
```

- Start normal work with:

```bash
git fetch new-origin
git switch dev
git pull --ff-only new-origin dev
git switch -c codex/<task-name>
```

- Do not push, force-push, tag, delete branches, or open PRs against `origin`.
- Do not mix unrelated changes into the same branch. Leave generated local files, dev-server artifacts, and unrelated user changes out of commits.
- Merge into `dev` after local validation. Promote to `uat` after integration validation and browser QA where relevant. Promote to `main` only after UAT is accepted.

## Required Reading

Before substantial work, read:
- `docs/migration/00-current-work.md`
- `docs/migration/00-doc-index.md`
- `docs/design.md`
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
- General task lifecycle and closeout workflow: `docs/agent-rules/workflow.md`
- UI, layout, dark mode, font, table, modal, and visual QA rules: `docs/agent-rules/ui.md`
- Forms, API payloads, syntax validation, master data list pattern: `docs/agent-rules/validation.md`
- LINE, Flex Message, PDF, and share notification rules: `docs/agent-rules/line-notification.md`
- Plane backlog, issue analysis, comments, attachments, and status workflow: `docs/agent-rules/plane.md`
- Testing, browser QA, Playwright expectations: `docs/agent-rules/testing.md`
- Sub agent usage and close rules: `docs/agent-rules/sub-agents.md`
- Resumable checkpoint docs: `docs/agent-rules/session-handoff.md`
- Git and communication: `docs/agent-rules/git-communication.md`

Only open root `Peach.md` when the user explicitly asks for old Peach history, or when investigating why a legacy Peach rule existed.

## Project Goal

Improve the existing system so both code and database structure are correct, maintainable, and traceable while preserving current business flow as much as practical.

Do not treat this as a greenfield rewrite unless explicitly instructed.

## Current Environment Shortlist

- Active app: `apps/next/`
- Git remotes:
  - `new-origin` = active target repo `https://github.com/terner/new-ns-scrap-erp.git`
  - `origin` = old/legacy repo `https://github.com/sirimasth/ns-scrap-erp.git`
- Active branches on `new-origin`: `main`, `uat`, `dev`
- Dev/target Supabase: `fhglqymcdmrgbsbadnwr`
- Legacy production/source Supabase: `mqsgptraslgpyzbpndlg` read-only
- Git UAT branch: `uat` (`staging` remote branch has been deleted)
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
