# 02 Migration Master Plan

## Main Goal

ปรับระบบเดิมให้:
- code ถูกหลักขึ้น
- database ถูกหลักขึ้น
- ข้อมูลเดิมยังใช้ต่อได้
- ผู้ใช้ยังทำงานตาม flow เดิมได้

## Strategy

- ใช้ระบบเดิมเป็นฐาน
- refactor ตาม module
- ทำ foundation และ master data ก่อน
- ย้าย transaction ทีละกลุ่ม
- ตรวจ reconciliation ทุก phase

## Phases

### Phase 0: Discovery and Freeze

- freeze codebase baseline
- freeze database dump baseline
- ยืนยัน scope ของ phase แรก
- ยืนยัน module priority กับลูกค้า

### Phase 1: Foundation

- วาง project structure ใหม่
- แยก auth / app user / role / permission model
- แยก master data model
- กำหนด document numbering, branch scope, warehouse scope
- define target schema v1

### Phase 2: Master Data Migration

- migrate branches
- migrate warehouses
- migrate customers
- migrate suppliers
- migrate products
- migrate accounts
- migrate channels / currencies / expense categories
- validate completeness

### Phase 3: Core Transaction Refactor

- purchase
- sales
- payments
- receipts
- stock movements

เป้าหมาย:
- แยก header / lines
- ลด jsonb
- ทำ FK และ traceability ให้ถูกต้อง

### Phase 4: Operational Control

- expense
- AR/AP
- transfer
- approval
- import/export
- audit

### Phase 5: Advanced Business

- production
- dual costing
- trading
- international finance
- bank reconciliation

### Phase 6: Reporting and Cutover

- reports
- dashboards
- reconciliation
- user acceptance
- cutover

## Environment Plan

### Current

- `legacy-prod-source`: customer's old Supabase environment, used as source/read-only audit and migration source
- `dev-target`: new Supabase development environment for schema, auth, RLS, and frontend integration

### Planned

- `staging-uat`: future Supabase project for customer/user testing and migration rehearsal
- `new-prod`: optional future Supabase project for final production cutover

### Open Production Decision

Final production strategy is not decided yet:
- Option A: apply the validated migration back into the customer's old environment
- Option B: create a new production project and migrate/cut over from the old environment

This must be decided after staging/UAT, reconciliation planning, backup planning, and rollback planning are mature.

## Dependencies

- master data ต้องเสร็จก่อน transaction
- transaction core ต้องนิ่งก่อน inventory costing
- inventory ต้องนิ่งก่อน production/trading
- auth and permissions ต้องชัดก่อน rollout จริง

## Success Criteria

- code แยก module ชัด
- DB ไม่พึ่ง transaction JSON structures เป็นหลัก
- ตัวเลขซื้อ/ขาย/สต๊อก/เงินตรงกับระบบเดิมในขอบเขตที่ตกลง
- ผู้ใช้ใช้งาน flow หลักได้โดยไม่เสีย business continuity
