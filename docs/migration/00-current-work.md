# 00 Current Work

## Active SIT semantic integration and promotion — 2026-08-03

Objective: รวมงาน UI/runtime ที่ผู้ใช้อนุมัติไว้กับ `sit-origin/main` ล่าสุดโดยไม่ทำให้งาน Dev ด้าน Auth, Roles/Permissions, Finance/FCD, Production, WTI/WTO หรือ business flow อื่นหาย แล้วตรวจครบก่อน push ไป SIT แบบไม่ force.

Working state:

- Integration branch: `codex/sit-main-integration-20260801`
- Integration worktree: `C:\new-ns-scrap-erp-worktrees\sit-main-integration-20260801`
- Local source before merge: `85e26807d`; first fetched SIT source: `63f455a7f`.
- First semantic merge completed in `f985ac0`; the additional `sit-origin/main` commit `33e01ceb1` is now merged without conflict. It splits Master Data role permissions and adds migration `20260803100000_split_master_data_permissions.sql`.
- Primary workspace remains untouched because it contains unrelated dirty work. SIT secrets remain only in ignored env files and must not enter Git.

Preserved decisions:

- Keep the latest SIT credential flow, temporary-password behavior, proxy/Auth fixes, branch access, and Roles/Permissions behavior.
- Keep accepted local runtime-table semantics: descriptive business text left, document/date/status/action centered, numeric measures right, matching header/body alignment, shared row actions, sort/resize where already required, and non-wrapping documents/dates/numbers.
- Keep accepted control sizing: filters `h-9`, normal business-entry controls `h-10`, page actions `h-10`, while preserving existing widths and responsive behavior.
- Keep accepted Stock Planning, Production Report, Deal Margin, sidebar-title, WTI/WTO camera/gallery, Cost Pool, and Allocation Ledger changes.
- Cost Pool user-facing wording uses `รายการ` only; do not reintroduce `รายการต้นทุน`, `ล็อต`, `ลอท`, or `Lot`.
- Do not apply the new permission migration to a database as part of this Git integration; DB promotion requires its own verified preflight/target/apply/postflight step.

Required validation before push:

- Resolve both merge layers and prove `sit-origin/main` is an ancestor of the final commit.
- Run focused Auth/Permission, Dual Costing, Production, runtime-table, control-height, sidebar-title, and WTI/WTO attachment tests.
- Run workspace lint, type-check, production build, and `git diff --check`.
- Perform a fresh independent acceptance audit, fetch/compare SIT again, then push only if the branch is not behind and no conflict marker or secret is present.

Current proof:

- Focused Auth/Permission, Dual Costing, Production, Stock Planning, runtime-table, control-height, sidebar-title, and WTI/WTO attachment suites pass `100/100`; the runtime-table guard must run from `apps/next` and uses a 20-second timeout for its whole-source scan.
- Workspace lint passes with `0` errors and `10` existing warnings; workspace TypeScript passes with an 8 GB Node heap.
- SIT-env Webpack production build passes and generates `331` routes.
- The build gate caught and removed one duplicate-import merge regression in `LineSettingsPageClient.tsx`; fresh type-check, lint, and build all pass after that correction.
- `git diff --check` and conflict-marker scans pass. The new permission migration is present in Git but has not been applied to a database by this integration batch.

Immediate next tasks:

1. Commit the validated duplicate-import merge correction and this handoff checkpoint.
2. Complete the independent acceptance gate, then fetch and compare `sit-origin/main` again; if it advanced, merge the new commits before publication.
3. Push `HEAD` to `sit-origin/main` without force, verify remote SHA/deployment, and report the assigned Plane issue through REST only when the issue mapping is confirmed.
