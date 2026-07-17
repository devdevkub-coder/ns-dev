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
- Keep `docs/migration/00-current-work.md` short and operational. It is the active handoff file, not a long changelog. Leave there only the current objective, active batch, blockers, latest still-active decisions, expected write areas, required validation, and immediate next tasks. Move completed checkpoints, long validation logs, deploy logs, and old batch summaries into archive/tracker documents instead of letting `00-current-work.md` grow indefinitely.
- Keep document roles separated:
  - `AGENTS.md` = project rules and operating constraints
  - `docs/migration/00-current-work.md` = active handoff only
  - `docs/migration/00-doc-index.md` = routing index for canonical docs
  - `docs/migration/README.md` = migration-doc entrypoint only
  - `docs/migration/` = plan, tracker, and archive documents
  - `docs/notes/README.md` = filesystem entrypoint for business/domain/page-flow notes
  - `docs/notes/` = business, domain, and page-flow source documents
- Do not let `docs/migration/README.md`, `docs/migration/00-doc-index.md`, and `docs/migration/00-current-work.md` drift into overlapping roles again. If a document starts acting as both router, tracker, and long history log, split it.
- Obsidian-specific MOC files such as `docs/notes/_Index.md` may remain for vault navigation, but they are not the primary start-here file for normal repo work.
- Keep `docs/` root reserved for global cross-project documents only. New business notes, page-flow notes, and dated work summaries must not be created directly under `docs/`; place them under `docs/notes/` or the appropriate subfolder instead.
- Use a sub agent by default for Playwright/browser QA work; the main agent still defines scope and integrates findings.
- **🚫 NO DOM ON PLANE:** Do not use DOM automation, browser sub-agents, or Playwright to access, login, click, input, or interact with `https://plane.devkub.com/` under any circumstances. All interactions with Plane must be executed programmatically via backend REST APIs or node/bash scripts, or handled manually by the user.
- If the user requests modifications or code improvements, only perform the code changes and verify compilation locally. Do NOT run browser or DOM UAT testing unless the user explicitly requests testing (i.e. do not use browser sub-agent unless told to test).
- Split large refactors into reviewable batches with one clear module, transform, or behavior change per batch.
- During clone/migration batches, use `docs/design.md` as the active design convention source and keep legacy/Vue parity unless a difference is documented and approved.
- When the user asks for a UI/design/page report, design judgment, or "คิดว่าไง" on a concrete app page, you MUST inspect the real rendered page in the browser first, then inspect the relevant code, and only then report findings or recommend edits. Do not report from code scans alone unless the page cannot be opened; if it cannot be opened, say that explicitly.
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

## User Reporting Preference

For user-facing task reports, default to Thai and use the user's preferred combined table format:

1. Problem / duplication report: columns `#`, `Problem found`, `Severity`, `Recommended action`.
2. Files changed report: columns `File`, `What changed`, `Status`; use status symbols such as `✅` and `❌` in the `Status` column.
3. Design decision report: columns `Topic`, `Decision`.

After those tables, add only a short validation and remaining-risk summary. For tiny answers, a concise Thai confirmation is acceptable.

## Team Git Workflow

Use this promotion path:

```text
codex/* or feature/* -> dev -> uat -> main
```

- `origin` is legacy read-only. Do not push, force-push, tag, delete branches, or open PRs there.
- `dev` is the normal integration target. `main` is release-only.
- The word `UAT` means the active deployed UAT environment, not just a branch name. Verify the real target from env/deployment settings before any promotion.
- Customer UAT promotion uses remote `uat-origin`. When the user says `push UAT` or `promote dev to UAT` without another target, use the customer UAT target defined by the current deployment/env rules, not `new-origin/uat` by assumption.
- Before any mutating git action, verify remote, branch, worktree, and target ancestry.
- Keep branches scoped. Do not mix unrelated changes into the same commit/promotion batch.
- Follow the operational git procedure in `docs/agent-rules/git-communication.md`.

## Required Reading

Before substantial work, read:
- `docs/migration/00-current-work.md`
- `docs/migration/00-doc-index.md`
- `docs/design.md`
- `REQUIREMENTS_TARGET_SYSTEM.md`

Then load only the additional documents routed by:
- `docs/migration/00-doc-index.md`
- `docs/agent-rules/README.md`

For database, migration, or environment work, read the relevant DB/env documents before acting.

## Detailed Rule Files

Read only the rule files relevant to the task. Use `docs/agent-rules/README.md` as the router for detailed rule files.

Only open root `Peach.md` when the user explicitly asks for old Peach history, or when investigating why a legacy Peach rule existed.

## Project Goal

Improve the existing system so both code and database structure are correct, maintainable, and traceable while preserving current business flow as much as practical.

Do not treat this as a greenfield rewrite unless explicitly instructed.

## Current Environment Shortlist

- Active app: `apps/next/`
- Project MCP config: `.mcp.json`
- Project skills: `.agents/skills/`
- Current work handoff: `docs/migration/00-current-work.md`
- Current env, remotes, deployment targets, and Supabase IDs: `docs/migration/10-environment-status.md`

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
