---
title: Architecture Map
aliases:
  - Technical Architecture
  - System Architecture Map
  - Tech Stack Map
tags:
  - ns-scrap-erp
  - architecture
  - moc
status: active
created: 2026-05-16
---

# Architecture Map

แผนที่สรุป architecture, tech stack, environment, database และ auth ของ NS Scrap ERP เพื่อใช้เชื่อมจาก requirements ไปสู่ migration และ implementation

## Primary References

- [[REQUIREMENTS_TARGET_SYSTEM|Target Requirements]] - business scope, roles, functional requirements, NFR และ target stack
- [[AGENTS]] - architecture direction, database rules, environment rules และ code organization rules
- [[03-target-architecture]] - target application/data/API architecture
- [[10-environment-status]] - Supabase projects, MCP routing, env policy และ sensitive data rules
- [[2026-05-16-project-decisions|Project Decisions]] - decisions ที่มีผลต่อ direction และ constraints

## Application Architecture

Target stack:
- Current active implementation/deploy target: Next.js app in `apps/next/`
- Legacy/audited source references: `old-apps/legacy/` and `old-apps/vue/`
- Original target architecture notes below still describe the earlier Vue/Vite rehabilitation direction and should be reconciled into the target requirements as the Next implementation stabilizes.
- Vue 3
- Vite
- TypeScript
- Vue Router
- Pinia
- TanStack Query
- Tailwind CSS
- Zod
- VueUse
- Supabase Auth / Postgres / Storage
- IndexedDB / Dexie เฉพาะกรณี offline หรือ local cache ที่จำเป็น

Historical Vue target source layout:

```text
old-apps/vue/src/
  router/
  views/
  components/
  stores/
  composables/
  services/
  queries/
  schemas/
  lib/
```

Layer rules:
- `views` ใช้ประกอบหน้าและ route-level interaction
- `components` ใช้สำหรับ UI ที่ reuse ได้ เช่น forms, tables และ dialogs
- `stores` เก็บ client/app state เท่านั้น
- `queries` และ `services` รับผิดชอบ data access, mutations และ cache invalidation
- `schemas` เก็บ Zod validation และ payload schemas
- `lib` เก็บ pure utilities

## Legacy Source Boundary

- `old-apps/legacy/` คือ archived legacy source เท่านั้น
- `old-apps/vue/` คือ Vue/Vite application ใหม่
- ระบบใหม่ไม่ route หรือ import กลับไปหา legacy runtime
- การ migrate ใช้วิธี copy เฉพาะ function/module ที่จำเป็นจาก `old-apps/legacy/` เข้า `old-apps/vue/src/` แล้ว refactor
- Refactor ต้องทำเป็น module และตาม risk ไม่ใช่ wholesale replacement
- UI และ business flow เดิมต้องถูก preserve ใน implementation ใหม่เท่าที่ทำได้

## Data Architecture

Database direction:
- ใช้ relational-first model แทน transaction-critical `jsonb`
- แยก transaction headers และ lines
- ใช้ foreign keys จริงเท่าที่ practical
- ใช้ ledger-style tables ที่ trace ได้ และควร append-only สำหรับข้อมูลสำคัญ
- เอกสารธุรกิจที่มีเลขเอกสารต้องมี timeline/history แบบ append-only แยกจาก current-state table ตาม [[Document Timeline Policy]]
- target design ของ history ใช้ table เฉพาะตามเอกสารหรือ business flow ตาม [[Document History Table Design]]; ไม่ใช้ generic `document_events` เป็น source of truth ของ business timeline
- reports ควรเป็น derived layer จากข้อมูล canonical

เอกสารหลัก:
- [[04-master-data-definition]] - master data และ key basic data
- [[05-schema-mapping]] - mapping จาก schema เดิมไป target schema
- [[07-reconciliation-plan]] - row count, orphan FK, totals, stock และ transaction reconciliation

## Auth And Permissions

Auth direction:
- ใช้ Supabase Auth และ `auth.users` เป็น source of truth
- ใช้ application identity เช่น `app_users` สำหรับ profile/role mapping
- Normalize roles และ permissions แทนการ duplicate permission model
- ไม่เก็บ user passwords ใน application tables
- ทดสอบ Auth และ RLS ใน Supabase `dev-target` ไม่ใช้ plain local Postgres

เอกสารหลัก:
- [[REQUIREMENTS_TARGET_SYSTEM#4. Users and Roles]]
- [[03-target-architecture#Data Architecture Direction]]
- [[09-implementation-tasklist#Phase 3: Security and Access Model]]

## Environment Map

Current Supabase environments:
- `dev-target`: `fhglqymcdmrgbsbadnwr` สำหรับ development, Auth/RLS testing, schema migration testing และ frontend integration
- `legacy-prod-source`: `mqsgptraslgpyzbpndlg` สำหรับ read-only audit, source dump และ migration mapping
- `staging-uat`: ยังไม่สร้าง สำหรับ customer/user testing และ migration rehearsal
- `new-prod`: ยังไม่สร้าง และ production strategy ยังเปิดอยู่

Environment rules:
- ห้าม develop โดยตรงกับ `legacy-prod-source`
- Apply schema changes ที่ `dev-target` ก่อน
- เก็บ project MCP routing ใน `.mcp.json` ไม่ใส่ global Codex config
- เก็บ secrets, OAuth tokens, DB passwords, service role keys และ production dumps นอก git

เอกสารหลัก:
- [[10-environment-status]]
- [[AGENTS#Database Environment Rules]]
- [[AGENTS#Sensitive Data Rules]]

## Migration Architecture Links

- [[Migration Documents]]
- [[docs/migration/README|Migration README]]
- [[02-master-plan]]
- [[06-module-rollout]]
- [[08-cutover-plan]]
- [[09-implementation-tasklist]]
