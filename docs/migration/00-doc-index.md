# 00 Documentation Index

## Purpose

ไฟล์นี้เป็นสารบัญกลางของเอกสาร NS Scrap ERP เพื่อให้ session ใหม่หรือ agent ใหม่รู้ทันทีว่าควรอ่านอะไรและไฟล์ไหนเป็น source of truth ของเรื่องใด

## Start Here

อ่านตามลำดับนี้ก่อนเริ่มงานใหญ่:

1. `AGENTS.md` - กฎ project, safety, environment, git, validation
2. `docs/migration/00-current-work.md` - สถานะล่าสุดและ next task
3. `REQUIREMENTS_TARGET_SYSTEM.md` - requirements ของระบบเป้าหมาย
4. `docs/migration/17-next-remaining-modules-progress.md` - tracker งานที่เหลือทั้งหมด
5. `docs/agent-rules/README.md` - index ของ rule รายละเอียดเฉพาะงาน
6. Tracker เฉพาะเรื่องที่เกี่ยวข้องกับงานนั้น

## Canonical Sources

| Topic | Canonical Document | Notes |
|---|---|---|
| Agent/project rules | `AGENTS.md` | hard rules และ entrypoint; ต้องตามก่อน skill/doc อื่น |
| Detailed agent rules | `docs/agent-rules/README.md` | rule เฉพาะเรื่อง เช่น DB, validation, testing, sub agents |
| Target requirements | `REQUIREMENTS_TARGET_SYSTEM.md` | แทนชื่อเดิม `SRS.md`; ใช้เป็น SRS ของระบบใหม่/เป้าหมาย |
| Legacy/prototype requirements | `REQUIREMENTS_LEGACY_PROTOTYPE.md` | แทนชื่อเดิม `NS_Scrap_ERP_System_Requirements.md`; ใช้อ้างอิงระบบเก่า |
| Current work status | `docs/migration/00-current-work.md` | สรุป batch ปัจจุบัน, next task, blockers |
| Migration document map | `docs/migration/README.md` | รายการ docs migration ทั้งชุด |
| Remaining module plan | `docs/migration/17-next-remaining-modules-progress.md` | batch/task tree, Playwright rule, OpenAPI/sitemap preflight |
| Next sitemap/API map | `docs/migration/18-next-system-sitemap.md` | route/page/API/permission status baseline for active Next app |
| OpenAPI baseline | `docs/api/openapi.yaml` | skeleton API contract catalog for current Next route handlers |
| Legacy page inventory | `docs/migration/20-legacy-page-inventory.md` | counted legacy sidebar entries and view IDs from `https://sirimasth.github.io/ns-scrap-erp/` |
| Environment status | `docs/migration/10-environment-status.md` | Supabase/Vercel/MCP/env |
| Master data | `docs/migration/13-next-master-data-progress.md` | Next master-data tracker |
| Auth/permission | `docs/migration/14-auth-permission-batch-plan.md` | login, users, roles, permissions |
| Daily transactions | `docs/migration/15-next-daily-transactions-progress.md` | purchase/sales/daily/finance linked flows |
| Production | `docs/migration/16-next-production-progress.md` | production pages/categories/reports |

## Requirements Documents

- `REQUIREMENTS_TARGET_SYSTEM.md`
  - ระบบเป้าหมายและ SRS ปัจจุบัน
  - ใช้ยืนยัน scope, module, roles, NFR, target architecture
  - อัปเดตเมื่อ flow ที่ยืนยันแล้วเปลี่ยน requirement
- `REQUIREMENTS_LEGACY_PROTOTYPE.md`
  - เอกสารระบบเก่า/prototype
  - ใช้อ้างอิง behavior, menus, roles, offline/local behavior เดิม
  - ไม่ใช่ source of truth ของ target architecture

## Agent Rule Documents

| File | Use For |
|---|---|
| `docs/agent-rules/README.md` | index rule รายละเอียด |
| `docs/agent-rules/configuration.md` | project config, MCP, skills, secrets |
| `docs/agent-rules/database.md` | DB design, Supabase environments, migration safety |
| `docs/agent-rules/development.md` | active app, legacy source, migration priority |
| `docs/agent-rules/validation.md` | form/API syntax validation, master data list pattern |
| `docs/agent-rules/testing.md` | test/QA, Playwright, click-path checks |
| `docs/agent-rules/sub-agents.md` | sub agent usage and close rules |
| `docs/agent-rules/session-handoff.md` | resumable checkpoint documentation |
| `docs/agent-rules/git-communication.md` | git and communication rules |

## Migration Trackers

| File | Use For |
|---|---|
| `01-current-state.md` | baseline ระบบเดิมและปัญหา |
| `02-master-plan.md` | migration master plan |
| `03-target-architecture.md` | target architecture |
| `04-master-data-definition.md` | master/key basic data definitions |
| `05-schema-mapping.md` | schema mapping |
| `06-module-rollout.md` | rollout order |
| `07-reconciliation-plan.md` | reconciliation checks |
| `08-cutover-plan.md` | cutover/backout |
| `09-implementation-tasklist.md` | phase tasklist หลัก |
| `10-environment-status.md` | environment/MCP/status |
| `11-frontend-clone-tracker.md` | legacy route clone tracker |
| `12-frontend-visual-audit-checklist.md` | visual/browser QA |
| `13-next-master-data-progress.md` | master data progress |
| `14-auth-permission-batch-plan.md` | auth/permission progress |
| `15-next-daily-transactions-progress.md` | daily transaction progress |
| `16-next-production-progress.md` | production progress |
| `17-next-remaining-modules-progress.md` | remaining module batch/task tree |
| `18-next-system-sitemap.md` | Next route/page/API/permission status map |
| `19-next-legacy-ui-parity-audit.md` | post-SYS legacy UI parity audit excluding master-data/admin |
| `20-legacy-page-inventory.md` | legacy sidebar page count and view ID inventory |

## Planned Documents

Batch PRE created:

- `docs/migration/18-next-system-sitemap.md`
- `docs/api/openapi.yaml`

## Naming Rules

- ใช้ prefix เลขสำหรับ migration docs ที่เป็นลำดับอ่านหรือ tracker: `00-`, `01-`, ...
- Requirements ที่เป็น root-level ให้ใช้ชื่อชัดเจน:
  - `REQUIREMENTS_TARGET_SYSTEM.md`
  - `REQUIREMENTS_LEGACY_PROTOTYPE.md`
- Tracker เฉพาะหมวดใช้รูปแบบ:
  - `NN-next-<module>-progress.md`
- เอกสารที่เป็นสถานะปัจจุบันต้องมีคำว่า `current` และอัปเดตบ่อยได้
