# Migration Documents

ชุดเอกสารนี้ใช้สำหรับวางแผน `refactor + migration` ของระบบ NS Scrap ERP เดิม โดยมีเป้าหมายหลักคือ:
- รักษา business flow เดิมที่ใช้งานอยู่
- ปรับโครงสร้าง code ให้ถูกหลักและดูแลง่ายขึ้น
- ปรับโครงสร้าง database ให้เป็น relational มากขึ้น
- ย้ายข้อมูลเดิมอย่างมีลำดับและตรวจสอบย้อนกลับได้

เอกสารอ้างอิงหลัก:
- [00-doc-index.md](/Users/watcharathatsrithanesiganon/Documents/GitHub/ns-scrap-erp/docs/migration/00-doc-index.md)
- [00-current-work.md](/Users/watcharathatsrithanesiganon/Documents/GitHub/ns-scrap-erp/docs/migration/00-current-work.md)
- [REQUIREMENTS_TARGET_SYSTEM.md](/Users/watcharathatsrithanesiganon/Documents/GitHub/ns-scrap-erp/REQUIREMENTS_TARGET_SYSTEM.md)
- [REQUIREMENTS_LEGACY_PROTOTYPE.md](/Users/watcharathatsrithanesiganon/Documents/GitHub/ns-scrap-erp/REQUIREMENTS_LEGACY_PROTOTYPE.md)
- [reports/db_audit/schema.sql](/Users/watcharathatsrithanesiganon/Documents/GitHub/ns-scrap-erp/reports/db_audit/schema.sql)
- [reports/db_audit/tables.tsv](/Users/watcharathatsrithanesiganon/Documents/GitHub/ns-scrap-erp/reports/db_audit/tables.tsv)
- [docs/notes/2026-05-16-project-decisions.md](/Users/watcharathatsrithanesiganon/Documents/GitHub/ns-scrap-erp/docs/notes/2026-05-16-project-decisions.md)

## Document Set

0. [00-doc-index.md](/Users/watcharathatsrithanesiganon/Documents/GitHub/ns-scrap-erp/docs/migration/00-doc-index.md)
0. [00-current-work.md](/Users/watcharathatsrithanesiganon/Documents/GitHub/ns-scrap-erp/docs/migration/00-current-work.md)
1. [01-current-state.md](/Users/watcharathatsrithanesiganon/Documents/GitHub/ns-scrap-erp/docs/migration/01-current-state.md)
2. [02-master-plan.md](/Users/watcharathatsrithanesiganon/Documents/GitHub/ns-scrap-erp/docs/migration/02-master-plan.md)
3. [03-target-architecture.md](/Users/watcharathatsrithanesiganon/Documents/GitHub/ns-scrap-erp/docs/migration/03-target-architecture.md)
4. [04-master-data-definition.md](/Users/watcharathatsrithanesiganon/Documents/GitHub/ns-scrap-erp/docs/migration/04-master-data-definition.md)
5. [05-schema-mapping.md](/Users/watcharathatsrithanesiganon/Documents/GitHub/ns-scrap-erp/docs/migration/05-schema-mapping.md)
6. [06-module-rollout.md](/Users/watcharathatsrithanesiganon/Documents/GitHub/ns-scrap-erp/docs/migration/06-module-rollout.md)
7. [07-reconciliation-plan.md](/Users/watcharathatsrithanesiganon/Documents/GitHub/ns-scrap-erp/docs/migration/07-reconciliation-plan.md)
8. [08-cutover-plan.md](/Users/watcharathatsrithanesiganon/Documents/GitHub/ns-scrap-erp/docs/migration/08-cutover-plan.md)
9. [09-implementation-tasklist.md](/Users/watcharathatsrithanesiganon/Documents/GitHub/ns-scrap-erp/docs/migration/09-implementation-tasklist.md)
10. [10-environment-status.md](/Users/watcharathatsrithanesiganon/Documents/GitHub/ns-scrap-erp/docs/migration/10-environment-status.md)
11. [13-next-master-data-progress.md](/Users/watcharathatsrithanesiganon/Documents/GitHub/ns-scrap-erp/docs/migration/13-next-master-data-progress.md)
12. [14-auth-permission-batch-plan.md](/Users/watcharathatsrithanesiganon/Documents/GitHub/ns-scrap-erp/docs/migration/14-auth-permission-batch-plan.md)
13. [15-next-daily-transactions-progress.md](/Users/watcharathatsrithanesiganon/Documents/GitHub/ns-scrap-erp/docs/migration/15-next-daily-transactions-progress.md)
14. [16-next-production-progress.md](/Users/watcharathatsrithanesiganon/Documents/GitHub/ns-scrap-erp/docs/migration/16-next-production-progress.md)
15. [17-next-remaining-modules-progress.md](/Users/watcharathatsrithanesiganon/Documents/GitHub/ns-scrap-erp/docs/migration/17-next-remaining-modules-progress.md)
16. [20-legacy-page-inventory.md](/Users/watcharathatsrithanesiganon/Documents/GitHub/ns-scrap-erp/docs/migration/20-legacy-page-inventory.md)
17. [21-db-first-identifier-cutover.md](/Users/watcharathatsrithanesiganon/Documents/GitHub/ns-scrap-erp/docs/migration/21-db-first-identifier-cutover.md)
18. [22-next-design-audit-plan.md](/Users/watcharathatsrithanesiganon/Documents/GitHub/ns-scrap-erp/docs/migration/22-next-design-audit-plan.md)

## Recommended Order

0. อ่าน `00-doc-index` เพื่อรู้ว่าเอกสารไหนเป็น canonical source
0. อ่าน `00-current-work` เพื่อรู้สถานะล่าสุดและ next task
1. อ่าน `01-current-state`
2. ยืนยัน scope และ phase ใน `02-master-plan`
3. ใช้ `03-target-architecture` ตัดสินโครงสร้าง code และ DB เป้าหมาย
4. ปิด `04-master-data-definition` ก่อนแตะ transaction
5. ลงรายละเอียด migration จริงใน `05-schema-mapping`
6. ใช้ `06-module-rollout` คุมลำดับ implementation
7. ใช้ `07-reconciliation-plan` ตรวจตัวเลขและความถูกต้อง
8. ใช้ `08-cutover-plan` ตอนเตรียมขึ้นใช้งานจริง
9. ใช้ `09-implementation-tasklist` แตกงานลงมือจริงราย phase
10. ใช้ `10-environment-status` เช็ก dev/prod Supabase, MCP และ env ก่อนเริ่ม session ใหม่
11. ใช้ `13-next-master-data-progress` ติดตามการ port กลุ่มข้อมูลหลักใน Next เป็น batch และบันทึกผล validation เป็นระยะ
12. ใช้ `14-auth-permission-batch-plan` ติดตาม login, reset password, users, roles, permissions, API guards และ RLS
13. ใช้ `15-next-daily-transactions-progress` ติดตามการ port กลุ่มรายการประจำวันใน Next พร้อม API/DB/permission/reconciliation
14. ใช้ `16-next-production-progress` ติดตามการ port กลุ่มผลิตจาก legacy รวม production orders, inputs, outputs, output categories, stock ledger, cost/yield reports และ reconciliation
15. ใช้ `17-next-remaining-modules-progress` ติดตามงานที่เหลือทุกหมวด พร้อม batch ย่อย, task ย่อย, action/modal checklist, validation และ checkpoint rule
16. ใช้ `20-legacy-page-inventory` เป็น baseline จำนวนหน้า legacy และ view ID สำหรับเทียบ route/page migration
