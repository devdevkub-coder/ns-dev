# 08 Cutover Plan

## Objective

วางแผนขึ้นใช้งานจริงโดยลด downtime และลดความเสี่ยงข้อมูลผิด

## Target Production Decision

ยังไม่ตัดสินใจว่า final production จะเป็น:
- upgrade/migrate กลับเข้า old customer environment
- หรือสร้าง `new-prod` Supabase project แล้ว migrate/cut over

ก่อนตัดสินใจต้องมี:
- staging/UAT ผ่านแล้ว
- migration dry run ผ่านแล้ว
- reconciliation ผ่านแล้ว
- backup และ rollback plan ชัดเจน
- ลูกค้า sign-off

## Pre-Cutover

- final backup of legacy DB
- freeze window agreement
- final migration dry run
- reconciliation sign-off
- user communication
- rollback criteria confirmation

## Cutover Steps

1. freeze write access ของระบบเดิมตามที่ตกลง
2. ดึง final data snapshot
3. run migration scripts
4. run reconciliation queries
5. run smoke test ของ core flows
6. business owner sign-off
7. เปิดใช้งานระบบปรับปรุงแล้ว

## Backout Plan

ถ้าเกิดกรณีต่อไปนี้:
- reconciliation fail
- transaction core fail
- stock or payment totals mismatch เกิน threshold
- role/access critical issue

ให้:
- stop cutover
- revert to legacy operations
- restore from pre-cutover backup ถ้าจำเป็น
- log incident และ root cause

## First-Day Monitoring

- purchase creation
- sales creation
- payment posting
- receipt posting
- stock movement
- user login / permission
- dashboard sanity checks
