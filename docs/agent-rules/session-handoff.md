# Session Handoff Rules

Work as if the session can close at any time.

For every meaningful checkpoint, update the relevant documentation before or immediately after code changes:
- `docs/migration/00-current-work.md` for current status, next task, blockers, partial/incomplete work, and latest validation that is still needed to continue immediately.
- The module tracker for the active batch, such as `13-next-master-data-progress.md`, `15-next-daily-transactions-progress.md`, `16-next-production-progress.md`, or `17-next-remaining-modules-progress.md`.
- `docs/migration/00-doc-index.md` only when adding, renaming, or changing the canonical role of documents.
- `REQUIREMENTS_TARGET_SYSTEM.md` when a confirmed behavior changes target requirements.

Checkpoint notes must be written so a new session can continue without relying on chat history:
- current branch/remote when relevant
- exact active batch/task/page
- files changed or expected write areas
- commands already run and their result
- incomplete work and why it is incomplete
- next concrete task to execute
- validation still required before commit/push

`00-current-work.md` must stay compact. If a note is completed history rather than active handoff state, move it to the relevant tracker or an archive file instead of appending it to `00-current-work.md`.

After documenting a checkpoint, actively identify the next task from `00-current-work.md` and the relevant tracker. Continue with that task unless the user pauses, redirects, or asks to discuss first.

## Batch Continuation

When a batch is complete:

1. Update `docs/migration/00-current-work.md` with only the active carry-over state and next batch/task; put the completed scope, detailed validation log, commit hash, and push status in the relevant tracker and/or archive when they are no longer needed for immediate continuation.
2. Run the appropriate validation for the changed scope.
3. Commit and push the completed batch.
4. Immediately begin the next batch listed in `docs/migration/00-current-work.md`.

Do not stop after a successful push just to ask whether to continue. Stop only when:

- The user explicitly pauses, redirects, or asks for discussion.
- The next task requires destructive git operations, production deploy, production data mutation, or direct work against `legacy-prod-source`.
- The next task requires credentials, environment access, or a business decision that cannot be inferred from repo docs.
- The worktree has conflicting user changes that make the next batch unsafe to start.
