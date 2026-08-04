# SIT Semantic Integration — 2026-08-03

## Objective

รวม accepted local UI/runtime work กับงานล่าสุดจาก `sit-origin/main` โดยรักษา Auth, Roles/Permissions, Finance/FCD, Production, WTI/WTO และ business flow ที่มีอยู่ แล้วส่งขึ้น SIT แบบไม่ force.

## Integration outcome

- Integration worktree: `C:\new-ns-scrap-erp-worktrees\sit-main-integration-20260801`
- First semantic merge: `f985ac081`, preserving accepted local UX/UI while integrating SIT runtime changes.
- Master-data permission split integrated through `60962b39c` without replacing either side wholesale.
- Payment Approval bigint serialization fix integrated in `766bcfd364f29ac3edcc1c32df7974cf2b464917`.
- Final remote state verified at `sit-origin/main = 766bcfd36` on 2026-08-03.

## Preserved scope

- Latest SIT credential, temporary-password, proxy/Auth, branch access และ Roles/Permissions behavior.
- Accepted runtime-table alignment, form/control height, navigation titles, Stock Planning, Production Report, WTI/WTO camera/gallery, Cost Pool, Allocation Ledger, Deal Margin และ LINE settings/manual behavior.
- Permission migration remains a Git artifact only; this integration did not apply it to a database.

## Validation checkpoint

- Focused Auth/Permission, Dual Costing, Production, Stock Planning, runtime-table, control-height, sidebar-title, WTI/WTO attachment และ Payment Approval serialization coverage passed.
- Workspace lint passed with `0` errors and existing warnings only; workspace type-check passed.
- SIT-env Webpack production build generated `331` routes.
- `git diff --check`, conflict-marker scan, secret-path scan และ final independent acceptance audit passed before publication.

This file is historical evidence. Active work and next steps belong only in `docs/migration/00-current-work.md`.
