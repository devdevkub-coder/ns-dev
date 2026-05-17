---
title: Migration Documents
aliases:
  - Migration MOC
  - Migration Map of Content
  - Migration Document Index
tags:
  - ns-scrap-erp
  - moc
  - migration
status: active
created: 2026-05-16
---

# Migration Documents

MOC สำหรับชุดเอกสาร `docs/migration/` ใช้คุมการ refactor และ migration ของ NS Scrap ERP จากระบบเดิมไปสู่โครงสร้างที่ถูกหลักกว่า โดยยังรักษา business flow เดิมและ traceability ของข้อมูล

## Start Here

- [[docs/migration/README|Migration README]] - ภาพรวมชุดเอกสาร, เป้าหมาย และลำดับอ่าน
- [[SRS]] - requirements กลางที่ใช้ยืนยัน scope
- [[AGENTS]] - rules สำหรับ agent, database, environment และ git safety
- [[2026-05-16-project-decisions|Project Decisions]] - decision log ล่าสุดของโปรเจกต์

## Document Set

- [[01-current-state]] - สรุป current application/database state, structural problems และสิ่งที่ควร keep/refactor/rebuild
- [[02-master-plan]] - migration strategy, phase plan, environment plan, dependencies และ success criteria
- [[03-target-architecture]] - target stack, source layout, data architecture และ design rules
- [[04-master-data-definition]] - master data groups, key basic data และ source-of-truth rules
- [[05-schema-mapping]] - mapping rules, high-level mapping, transform topics และ deliverables ต่อ table
- [[06-module-rollout]] - rollout order และ gate criteria สำหรับปล่อย module ทีละส่วน
- [[07-reconciliation-plan]] - reconciliation areas, validation methods และ acceptance rule
- [[08-cutover-plan]] - production decision, pre-cutover, cutover steps, backout และ first-day monitoring
- [[09-implementation-tasklist]] - phase-based task list ตั้งแต่ baseline/safety ถึง deployment readiness
- [[10-environment-status]] - Supabase project status, MCP routing, env files, Docker DB status และ sensitive data rules

## Recommended Reading Flow

1. อ่าน [[01-current-state]] เพื่อเข้าใจ baseline และ risk
2. ใช้ [[02-master-plan]] กับ [[03-target-architecture]] เพื่อกำหนดทิศทาง implementation
3. ปิด [[04-master-data-definition]] และ [[05-schema-mapping]] ก่อนแตะ transaction migration หนัก
4. ใช้ [[06-module-rollout]] กับ [[09-implementation-tasklist]] เพื่อแตกงานเป็น phase
5. ใช้ [[07-reconciliation-plan]], [[08-cutover-plan]] และ [[10-environment-status]] ก่อน migration rehearsal หรือ production cutover

## Key Migration Rules

- ฐานข้อมูลเดิมเป็น baseline และ migration source ไม่ใช่ target model สุดท้าย
- ใช้ relational structure, foreign keys และ header/line tables สำหรับ transaction-critical data
- ใช้ `auth.users` เป็น authentication source of truth และไม่เก็บ password ใน application tables
- ใช้ `dev-target` สำหรับ schema/Auth/RLS/frontend integration testing
- ใช้ `legacy-prod-source` แบบ read-only เว้นแต่มีคำสั่ง explicit พร้อมขอบเขตชัดเจน

## Related Maps

- [[_Index|Project Home]]
- [[Architecture Map]]
