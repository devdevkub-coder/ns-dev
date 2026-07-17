# 00 Documentation Index

## Purpose

ไฟล์นี้เป็น router กลางของเอกสาร NS Scrap ERP

หน้าที่ของไฟล์นี้คือบอกว่า:

1. หัวข้อไหนต้องไปอ่านไฟล์ไหน
2. ไฟล์ไหนเป็น source of truth ของหัวข้อนั้น

ไฟล์นี้ไม่ควรกลายเป็น catalog ยาวของทุก note ใน repo

## Start Here

ก่อนเริ่มงานใหญ่ให้อ่านตามลำดับนี้:

1. `AGENTS.md`
2. `docs/migration/00-current-work.md`
3. `docs/design.md`
4. `REQUIREMENTS_TARGET_SYSTEM.md`
5. tracker หรือ note เฉพาะเรื่องที่เกี่ยวข้อง

## Canonical Routing

| Topic | Canonical Document | Notes |
|---|---|---|
| Project rules | `AGENTS.md` | entrypoint หลักของกฎ project, env, git, validation |
| Detailed rules | `docs/agent-rules/README.md` | ใช้เมื่อต้องลงลึกเฉพาะด้าน |
| Active handoff | `docs/migration/00-current-work.md` | สถานะงานที่ active ตอนนี้เท่านั้น |
| Active handoff archive | `docs/migration/archive/` | checkpoint/history ที่ปิดแล้ว |
| Migration doc map | `docs/migration/README.md` | router ของชุด migration docs |
| Requirements | `REQUIREMENTS_TARGET_SYSTEM.md` | target behavior และ scope |
| Legacy reference requirements | `REQUIREMENTS_LEGACY_PROTOTYPE.md` | ใช้อ้างอิงระบบเก่า ไม่ใช่ target source of truth |
| UI/design conventions | `docs/design.md` | source of truth สำหรับ layout, wording, form, table, modal |
| Business and page-flow notes | `docs/notes/README.md` | index ของ flow/note ตามหมวดธุรกิจ |
| Per-page flow library | `docs/notes/page-flows/README.md` | index ราย route/page |
| Remaining module execution plan | `docs/migration/17-next-remaining-modules-progress.md` | tracker กลางของงานที่ยังเหลือ |
| Environment status | `docs/migration/10-environment-status.md` | env, Supabase, Vercel, MCP, active targets |
| API contract baseline | `docs/api/openapi.yaml` | catalog route/API ปัจจุบัน |
| Data dictionary | `docs/data-dictionary/` | ความหมายตาราง/คอลัมน์เชิงธุรกิจ |
| Page inventory checklist | `docs/page-inventory-checklist.csv` | checklist assign/QA |

## Which Document To Open

| If you need... | Open this first |
|---|---|
| รู้ว่าตอนนี้ต้องทำอะไรต่อ | `docs/migration/00-current-work.md` |
| รู้ว่าหัวข้อนี้มี note ไหนรองรับ | `docs/notes/README.md` |
| รู้ว่า page นี้มี flow แยกไหม | `docs/notes/page-flows/README.md` |
| รู้สถานะ implementation ของหมวดใหญ่ | tracker ใน `docs/migration/` ที่ตรงหมวด |
| รู้กฎ UI/UX กลาง | `docs/design.md` |
| รู้กฎ agent/workflow/git | `AGENTS.md` และ `docs/agent-rules/README.md` |
| รู้ environment ที่ใช้อยู่จริง | `docs/migration/10-environment-status.md` |

## Migration Trackers

ไฟล์กลุ่ม `docs/migration/` ใช้เป็น tracker / plan / history เป็นหลัก:

- `01-current-state.md`
- `02-master-plan.md`
- `03-target-architecture.md`
- `04-master-data-definition.md`
- `05-schema-mapping.md`
- `06-module-rollout.md`
- `07-reconciliation-plan.md`
- `08-cutover-plan.md`
- `09-implementation-tasklist.md`
- `10-environment-status.md`
- `13-next-master-data-progress.md`
- `14-auth-permission-batch-plan.md`
- `15-next-daily-transactions-progress.md`
- `16-next-production-progress.md`
- `17-next-remaining-modules-progress.md`
- `18-next-system-sitemap.md`
- `20-legacy-page-inventory.md`
- `21-db-first-identifier-cutover.md`
- `22-next-design-audit-plan.md`

## Structure Rule

- `docs/migration/` = active handoff, plan, tracker, archive
- `docs/notes/` = business/domain/page-flow notes
- `docs/agent-rules/` = detailed operating rules
- `docs/data-dictionary/` = table and column meaning
- `docs/` root = only global docs that truly need root visibility
