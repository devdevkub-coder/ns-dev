---
name: codebase-migrate
description: Run NS Scrap ERP large codebase migrations and multi-file refactors in local reviewable batches. Use for legacy-to-Vue route migration, schema cleanup, repeated transforms, auth/permission refactors, and module-by-module modernization. Do not assume Composio CLI, Linear, Jira, or GitHub PR automation unless explicitly requested.
metadata:
  short-description: Codebase migrations + multi-file refactors
---

# Codebase Migrate

Coordinate framework upgrades, API renames, config rewrites, and structural refactors across many files. In this repository, local edits are driven by the agent and external tracking/PR automation is optional.

## NS Scrap ERP Project Note

In this repository, use this skill primarily for local reviewable batch planning and execution. Do not assume Composio CLI, Linear, Jira, or GitHub PR automation is configured unless the user explicitly asks to use it.

Follow `AGENTS.md` first. For NS Scrap ERP, good batches are menu/module slices, master data groups, auth/permission flows, legacy-to-Vue route groups, DB migration groups, or repeated code transforms.

## When to Use

- Framework upgrade (React 17 → 19, Node 18 → 22, Django 4 → 5).
- API rename across a monorepo (e.g., `getUserById` → `users.byId`).
- Config/format migration (webpack → vite, eslint → biome, jest → vitest).
- Any "change 200 files the same way" task that needs to ship in reviewable slices.

## Optional External Automation

Only use Composio CLI, Linear, Jira, or GitHub PR automation when the user explicitly asks for it and the tools are already configured.

Local tools the agent will use directly: `git`, `rg`, `jscodeshift`/`ts-morph`/`comby`/`ast-grep` (language-appropriate), and your test runner.

## Planning Phase

1. **Define the transform precisely.** Bad: "migrate to vitest." Good: "replace `jest.mock` with `vi.mock`, swap `jest.fn()` for `vi.fn()`, rename `jest.config.js` → `vitest.config.ts` using template X."
2. **Scope the blast radius:**
   ```bash
   rg -l 'jest\.(mock|fn|spyOn)' | wc -l
   rg -l 'from "jest"' | sort
   ```
3. **Track the batch locally unless external tooling is requested:**
   ```bash
   rg -l 'pattern-to-transform' | sort > reports/migration-batch.list
   ```

## Execute in Reviewable Batches

Loop: pick N files or one module → transform → test → document result → next batch.

```bash
# Batch helper: first 25 untouched files matching the pattern
BATCH=$(rg -l 'jest\.mock' | grep -v done.list | head -25)
echo "$BATCH" > batch.list
```

The agent runs the codemod on `batch.list`, then:

```bash
git checkout -b migrate/vitest-batch-03
xargs < batch.list codemod-runner   # e.g. jscodeshift / ts-morph / comby
npm test -- --changed
git add -A && git commit -m "migrate(test): jest → vitest (batch 3)"
git push -u origin migrate/vitest-batch-03
```

## Safety Rails

- **One transform per PR.** Never mix a rename with a format change.
- **Keep a `done.list`** of files already migrated so the next batch skips them.
- **Run the full test suite on the last batch**, even if per-batch PRs ran `--changed`.
- **Codemod first, hand-edit second.** If the codemod misses 3 files, patch them manually and note it in the PR body.
- **Roll back per-batch**, not globally. Each PR should revert cleanly.

## Verification Loop

After each merge:

```bash
rg 'jest\.(mock|fn|spyOn)' | wc -l     # should trend to 0
npm test                                # full suite
```

## Troubleshooting

- **Codemod regex catches too much** → switch to AST-based tooling (`ast-grep`, `ts-morph`) for structural matches.
- **Tests pass locally, CI fails** → pin Node/Python version parity; check `.nvmrc` / `pyproject.toml`.
- **PR too big to review** → cut batch size in half; maintainers won't review 800-line diffs.
- **Conflicts between batches** → rebase the open batch before merging the current one; never force-push merged batches.
