---
title: Project Decisions - 2026-05-16
aliases:
  - NS Scrap ERP Project Decisions
  - 2026-05-16 Project Decisions
tags:
  - ns-scrap-erp
  - project/decisions
  - migration
  - architecture
type: decision-log
status: active
date: 2026-05-16
project: NS Scrap ERP
---

# Project Decisions - 2026-05-16

## Related Documents

- [[SRS|SRS.md]]
- [[AGENTS|AGENTS.md]]
- [[.mcp.json|.mcp.json]]
- [[docs/migration/README|Migration README]]
- [[docs/migration/09-implementation-tasklist|Implementation Tasklist]]
- [[docs/migration/10-environment-status|Environment Status]]

## Purpose

สรุป decision สำคัญจากการคุยเรื่องการปรับระบบ NS Scrap ERP เดิมให้ถูกหลักทั้ง code และ database

## Main Direction

เป้าหมายไม่ใช่ rewrite ใหม่ทั้งก้อน แต่คือ `rehabilitate + refactor` ระบบเดิม:

- รักษา business flow เดิมที่ผู้ใช้คุ้นเคย
- ปรับ code structure ให้ดูแลง่าย
- ปรับ database structure ให้ถูกหลัก relational มากขึ้น
- ใช้ข้อมูลเดิมเป็น migration source
- ย้ายทีละ module ตาม risk และ dependency

> [!important] Main Direction
> ระบบนี้เป็นการ rehabilitate และ refactor ระบบเดิม ไม่ใช่ greenfield rewrite เว้นแต่มีคำสั่งชัดเจนให้ทำใหม่ทั้งก้อน

## Tech Stack Decision

Target stack:

- Vue 3
- Vite
- TypeScript
- Vue Router
- Pinia
- TanStack Query for Vue
- Tailwind CSS
- Zod
- VueUse
- Supabase Auth / Postgres / Storage
- Dexie / IndexedDB เฉพาะกรณีที่ต้องรองรับ offline/local cache จริง
- Vitest
- Playwright

## Vue Shell Implementation Decision

2026-05-16 session update:

- เพิ่ม Vue/Vite shell ที่ `old-apps/vue/`
- ย้าย legacy เดิมไว้ที่ `old-apps/legacy/` เป็น archived source เท่านั้น
- เพิ่มโครง `old-apps/vue/src/` ตาม target architecture:
  - `router`
  - `views`
  - `components`
  - `stores`
  - `composables`
  - `services`
  - `queries`
  - `schemas`
  - `lib`
  - `styles`
- เพิ่ม `package.json`, `package-lock.json`, `vite.config.ts`, `tsconfig.json`, `tailwind.config.ts`, `postcss.config.js`
- เพิ่ม route เริ่มต้น:
  - `/` dashboard shell แบบ protected route
  - `/login` Supabase Auth target login shell
  - ไม่มี `/legacy` bridge กลับไปหาไฟล์เก่า
- เพิ่ม Supabase client boundary ที่ `old-apps/vue/src/services/supabase/client.ts`
- เพิ่ม auth service/store placeholder โดยใช้ Supabase Auth เป็นเป้าหมาย
- เพิ่ม TanStack Query provider และ query client
- เพิ่ม read-only master data pilot routes:
  - `/master-data/suppliers`
  - `/master-data/salespersons`
  - `/master-data/products`
  - `/master-data/accounts`
  - `/master-data/currencies`
  - `/master-data/expense-categories`
  - `/master-data/channels`
- เพิ่ม Branches เป็น CRUD/form mutation pilot ตัวแรก:
  - `/master-data/branches`
  - Zod form validation
  - create/edit branch form
  - active/inactive action
  - TanStack Query invalidation หลัง mutation
  - preview-mode in-memory mutation เมื่อยังไม่มี Supabase env
- เพิ่ม Warehouses เป็น CRUD/FK form mutation pilot:
  - `/master-data/warehouses`
  - Zod form validation
  - create/edit warehouse form
  - branch select จาก branch query
  - active/inactive action
  - TanStack Query invalidation หลัง mutation
  - preview-mode in-memory mutation เมื่อยังไม่มี Supabase env
- เพิ่ม Customers เป็น CRUD/form mutation pilot:
  - `/master-data/customers`
  - Zod form validation
  - create/edit customer form
  - branch scope select จาก branch query
  - salesperson select จาก salespersons query
  - active/inactive action
  - TanStack Query invalidation หลัง mutation
  - preview-mode in-memory mutation เมื่อยังไม่มี Supabase env
- ปรับ visual baseline ของ `old-apps/vue/` ให้ใกล้ legacy UI:
  - ใช้ Sarabun font
  - ใช้ slate background และ white panel/table style
  - เอา gradient/decorative shell ออก
  - ไม่ import หรือ execute legacy runtime/CSS CDN จาก `old-apps/legacy/`
- เพิ่มสถานะ module ล่าสุดไว้ที่ [[Current Module Status]]
- รัน `npm install` แล้ว
- รัน `npm run build` ผ่านแล้ว

> [!important] Legacy Preservation
> Vue/Vite shell อยู่ใน `old-apps/vue/` ส่วน legacy เดิมถูกเก็บไว้ที่ `old-apps/legacy/` เพื่อใช้เป็น source สำหรับ copy เฉพาะ function/module ที่จำเป็นแล้ว refactor เข้าโครงใหม่เท่านั้น ระบบใหม่ไม่ route หรือ import กลับไปหา legacy runtime

Next implementation focus:

- เติม dev Supabase anon key จริงใน `.env.local`
- verify Supabase MCP/runtime หลังเปิด session ใหม่
- เริ่ม Auth/Permission schema ใน `dev-target`
- ขยาย master data จาก read-only pilot ไป create/edit, active/inactive, import/export และ validation/reconciliation

ยังไม่ใช้:

- Nuxt
- Prisma
- Redis
- backend framework ใหญ่ เช่น NestJS/Fastify จนกว่าจะมีเหตุผลชัดเจน

## Auth Decision

ใช้ Supabase Auth ต่อ

สิ่งที่ต้องเลิกใช้:

- plain password ใน `public.users`
- local fallback login ที่เทียบ password ใน frontend/local data
- role/permission model ที่ซ้ำกันหลายชั้น

Target model:

```text
auth.users
  -> app_users
  -> user_roles
  -> roles
  -> role_permissions
  -> user_branch_access
```

## Database Direction

DB เดิมมีข้อมูลจริงและมีคุณค่า แต่ไม่ควรเป็น target model สุดท้าย ดูรายละเอียดประกอบใน [[docs/migration/01-current-state|Current State]], [[docs/migration/04-master-data-definition|Master Data Definition]], [[docs/migration/05-schema-mapping|Schema Mapping]], และ [[docs/migration/07-reconciliation-plan|Reconciliation Plan]]

หลักที่ต้องทำ:

- แยก transaction header และ line tables
- ลด `jsonb` ใน transaction-critical data
- ใช้ FK จริงเท่าที่ทำได้
- ทำ ledger ให้ trace ได้
- ใช้ RLS ใน Supabase dev/target
- migration ต้องมี reconciliation

> [!warning] Database Migration Risk
> ใช้ database เดิมเป็น baseline และ migration source เท่านั้น ไม่ควรยึด schema เดิมเป็น target model สุดท้ายโดยไม่ทำ schema mapping และ reconciliation

## Environment Decision

Environment ปัจจุบัน:

```text
legacy-prod-source
project_ref: mqsgptraslgpyzbpndlg
account/context: Supabase เก่าของลูกค้า
usage: source/read-only/audit/migration mapping

dev-target
project_ref: fhglqymcdmrgbsbadnwr
account/context: Supabase dev ของเรา
usage: development, Auth/RLS testing, schema migration testing, frontend integration

staging-uat
status: not created yet
usage: customer/user testing and migration rehearsal

new-prod
status: not created yet
usage: optional final production target
```

Final production strategy ยังไม่ตัดสินใจ:
- option A: deploy/migrate กลับ old customer environment
- option B: สร้าง `new-prod` แล้ว migrate/cut over จาก `legacy-prod-source`

Preference ตอนนี้:

- ทำงานใน `dev-target`
- สร้าง `staging-uat` ตอนพร้อมให้ user test
- ค่อยตัดสิน final production หลัง UAT, backup, rollback, migration dry run และ reconciliation ชัดเจน

> [!important] Environment Decision
> `legacy-prod-source` เป็นแหล่งข้อมูลเก่าแบบ read-only/audit/migration mapping ส่วนงานพัฒนา, Auth/RLS testing, schema migration testing, และ frontend integration ต้องทำใน `dev-target`

## MCP Decision

MCP ที่ผูกกับ project นี้ควรอยู่ใน project-level [[.mcp.json|.mcp.json]]

Current project-level MCP:

- `supabase`: dev-target project
- `supabase-prod-source`: legacy-prod-source แบบ read-only
- `obsidian`: vault path scoped to this repository

Global MCP ไม่ควรมี Supabase/Obsidian ของ project นี้ เพื่อป้องกันการอ่านหรือเชื่อมผิด project

> [!warning] MCP Scope
> หลีกเลี่ยงการใส่ Supabase/Obsidian MCP ของโปรเจกต์นี้ไว้ใน global Codex config เพราะอาจทำให้ session อื่นเชื่อมผิด project หรืออ่าน vault ผิดที่

## Obsidian Decision

repo นี้ทำหน้าที่เป็น Obsidian vault สำหรับเอกสาร project ได้

แนวทาง:

- notes/project docs อยู่ใน repo นี้
- ไม่เปิด Obsidian vault ทุก project ให้ agent อ่านโดย default
- ถ้าต้องมี shared knowledge ให้แยก MCP server เช่น `obsidian-shared-readonly`

## Migration Documents Created

เอกสารหลักอยู่ที่:

- [[SRS|SRS.md]]
- [[AGENTS|AGENTS.md]]
- [[.mcp.json|.mcp.json]]
- [[docs/migration/README|docs/migration/README.md]]
- [[docs/migration/01-current-state|docs/migration/01-current-state.md]]
- [[docs/migration/02-master-plan|docs/migration/02-master-plan.md]]
- [[docs/migration/03-target-architecture|docs/migration/03-target-architecture.md]]
- [[docs/migration/04-master-data-definition|docs/migration/04-master-data-definition.md]]
- [[docs/migration/05-schema-mapping|docs/migration/05-schema-mapping.md]]
- [[docs/migration/06-module-rollout|docs/migration/06-module-rollout.md]]
- [[docs/migration/07-reconciliation-plan|docs/migration/07-reconciliation-plan.md]]
- [[docs/migration/08-cutover-plan|docs/migration/08-cutover-plan.md]]
- [[docs/migration/09-implementation-tasklist|docs/migration/09-implementation-tasklist.md]]
- [[docs/migration/10-environment-status|docs/migration/10-environment-status.md]]

## Immediate Next Work

1. Restart Codex session so project-level MCP is loaded.
2. Verify `/mcp` shows `supabase`, `supabase-prod-source`, and `obsidian`.
3. Login project-level `supabase` MCP if needed.
4. Fill dev Supabase values in `.env.local`:
   - `VITE_SUPABASE_ANON_KEY`
   - `DATABASE_URL`
5. Set Supabase dev project:
   - Auth URL configuration
   - Email/password provider
   - Automatic RLS
   - Data API exposure rules
6. Start Vue/Vite shell from `old-apps/vue/`.
7. Copy only necessary legacy functions/modules from `old-apps/legacy/` into the new Vue structure.
8. Start with foundation + master data, not purchase/sales/stock.

## Non-Negotiables

> [!danger] Non-Negotiables
> รายการนี้เป็นข้อห้ามหลักของ project และต้องใช้ร่วมกับ [[AGENTS|AGENTS.md]] ทุกครั้งก่อนทำงานที่มีผลต่อ code, database, environment, หรือ migration

- Do not develop directly against `legacy-prod-source`.
- Do not commit `.env.local`.
- Do not commit `reports/db_audit/full_dump.sql`.
- Do not store service role key in frontend.
- Do not change production/legacy schema without explicit approval.
- Do not start transaction migration before master data and key basic data are validated.
