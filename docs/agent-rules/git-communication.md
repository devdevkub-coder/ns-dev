# Git And Communication Rules

## Git Rules

- Do not revert user changes unless explicitly requested.
- Do not use destructive git commands unless explicitly requested.
- Keep commits focused by phase or module.
- Push only to `new-origin` / `https://github.com/terner/new-ns-scrap-erp.git`.
- Use `new-origin/uat` as the Git UAT branch. The old remote branch `new-origin/staging` has been deleted to avoid confusion; do not recreate it or promote through it.
- Treat the Git branch name `uat` as workflow metadata only. The real UAT target is whichever deployment/database env the user is referring to. Before any promote/deploy/debug step, verify the actual UAT target from env/deployment settings instead of assuming it maps 1:1 to `new-origin/uat`.
- Treat `origin` / `https://github.com/sirimasth/ns-scrap-erp.git` as legacy read-only reference material only.
- Never push, force-push, create branches, delete branches, open PRs, write tags, or otherwise mutate `origin` / `https://github.com/sirimasth/ns-scrap-erp.git`.
- Use `origin` only for read operations such as fetch, log, diff, show, and checkout-to-inspect.
- Do not commit local tool settings such as `.claude/settings.local.json` unless the user explicitly wants it.

## Dirty Workspace Sync Rules

Before any fetch/merge/pull/push/deploy check that may affect `dev`, `uat`, `main`, `peach`, or a shared feature branch:

- Run and report `git status --short --branch`, `git remote -v`, and the intended source/destination branches.
- If the main workspace has uncommitted or untracked app work, do not switch branches, pull, merge, or push from that dirty workspace until the exact files are classified as either user/local work, generated artifacts, or intended commit content.
- Prefer a temporary worktree for sync/merge/conflict checks when the main workspace is dirty. Do not rely on an auto-stash as the primary safety mechanism.
- If a stash is unavoidable, name it with the task and timestamp, verify both tracked and untracked entries, and restore/check required untracked files before declaring the app recovered.
- Never push a branch as "updated" until the intended local UI/runtime changes are proven present in the commit to be pushed. Use `git diff --name-status <remote>/<branch>...HEAD` or `git show --name-status HEAD` for proof.
- After pushing, verify the deploy target separately. A successful Git push is not the same as a successful Vercel/server deploy.

Incident note: on 2026-07-05, local UI work disappeared from the visible workspace because sync work returned the checkout to clean `dev` while the real local changes were stored in a stash, including a required untracked component. The prevention rule is: protect dirty local work first, sync in a clean temp worktree, then commit/push only after verifying the intended files are actually in the branch.

## Communication Rules

When explaining work:
- Be direct and concise.
- Explain tradeoffs clearly.
- Surface risk early.
- State whether a change affects legacy behavior, database structure, or migration assumptions.

Default user-facing task reports to Thai and use the user's preferred combined table format:

1. Problem / duplication report: columns `#`, `Problem found`, `Severity`, `Recommended action`.
2. Files changed report: columns `File`, `What changed`, `Status`; use status symbols such as `✅` and `❌` in the `Status` column.
3. Design decision report: columns `Topic`, `Decision`.

After those tables, add only a short validation and remaining-risk summary. For tiny answers, a concise Thai confirmation is acceptable.
