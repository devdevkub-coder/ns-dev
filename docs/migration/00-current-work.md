# 00 Current Work

## NSERP-180 — Compact AR/AP filters — 2026-08-04

Active objective: reduce the desktop filter height on `/finance/ar` and `/finance/ap` while preserving every finance/query contract.

- Worktree: `C:\new-ns-scrap-erp-worktrees\nserp-180-ar-ap-compact-filters-20260804`
- Branch: `codex/nserp-180-ar-ap-compact-filters`
- Base: `sit-origin/main` at `6294a58dae2aebba4d9a3113d83996086322b1fc`
- Plane issue `NSERP-180` is `In Progress`; Plane access remains REST-only.
- Expected writes: AR/AP page clients and their page-flow notes only.
- Preserve: API/query behavior, date/status/customer/supplier/channel/branch filters, pagination, export, permissions, data and mobile filter behavior.

Required validation before publication:

1. Targeted lint, workspace lint, type-check, build and `git diff --check`.
2. Fresh desktop/mobile Codex Browser evidence for both AR and AP plus an independent acceptance verdict.
3. Fresh remote comparison, intended-only commit, normal SIT push and remote-SHA/deploy verification.
4. Upload evidence, add the Thai completion report and move Plane to `wait for test` through REST, then read everything back as UTF-8.
