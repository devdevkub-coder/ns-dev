# Migration Documents

ไฟล์นี้เป็น entrypoint สั้นของชุด `docs/migration/` เท่านั้น

หน้าที่ของไฟล์นี้มี 2 อย่าง:

1. บอกว่าเริ่มอ่านตรงไหน
2. บอกว่าเอกสาร migration แบ่งเป็นหมวดอะไร

ไม่ใช้ไฟล์นี้เป็น handoff งาน active และไม่ใช้เป็น catalog รายละเอียดทุก note ในระบบ

## Start Here

เริ่มตามลำดับนี้:

1. [AGENTS.md](/Users/watcharathatsrithanesiganon/Documents/GitHub/ns-scrap-erp/AGENTS.md)
2. [00-current-work.md](/Users/watcharathatsrithanesiganon/Documents/GitHub/ns-scrap-erp/docs/migration/00-current-work.md)
3. [00-doc-index.md](/Users/watcharathatsrithanesiganon/Documents/GitHub/ns-scrap-erp/docs/migration/00-doc-index.md)

ถ้าต้องการ requirement หรือ business flow ให้ต่อไปที่:

- [REQUIREMENTS_TARGET_SYSTEM.md](/Users/watcharathatsrithanesiganon/Documents/GitHub/ns-scrap-erp/REQUIREMENTS_TARGET_SYSTEM.md)
- [docs/notes/README.md](/Users/watcharathatsrithanesiganon/Documents/GitHub/ns-scrap-erp/docs/notes/README.md)

## Migration Document Groups

### Active routing and handoff

- [00-current-work.md](/Users/watcharathatsrithanesiganon/Documents/GitHub/ns-scrap-erp/docs/migration/00-current-work.md) - งาน active ตอนนี้, next task, validation ที่ยังต้องรัน
- [00-doc-index.md](/Users/watcharathatsrithanesiganon/Documents/GitHub/ns-scrap-erp/docs/migration/00-doc-index.md) - router กลางว่าหัวข้อไหนควรไปอ่านไฟล์ไหน

### Baseline and architecture

- [01-current-state.md](/Users/watcharathatsrithanesiganon/Documents/GitHub/ns-scrap-erp/docs/migration/01-current-state.md)
- [02-master-plan.md](/Users/watcharathatsrithanesiganon/Documents/GitHub/ns-scrap-erp/docs/migration/02-master-plan.md)
- [03-target-architecture.md](/Users/watcharathatsrithanesiganon/Documents/GitHub/ns-scrap-erp/docs/migration/03-target-architecture.md)
- [04-master-data-definition.md](/Users/watcharathatsrithanesiganon/Documents/GitHub/ns-scrap-erp/docs/migration/04-master-data-definition.md)
- [05-schema-mapping.md](/Users/watcharathatsrithanesiganon/Documents/GitHub/ns-scrap-erp/docs/migration/05-schema-mapping.md)

### Rollout and operational planning

- [06-module-rollout.md](/Users/watcharathatsrithanesiganon/Documents/GitHub/ns-scrap-erp/docs/migration/06-module-rollout.md)
- [07-reconciliation-plan.md](/Users/watcharathatsrithanesiganon/Documents/GitHub/ns-scrap-erp/docs/migration/07-reconciliation-plan.md)
- [08-cutover-plan.md](/Users/watcharathatsrithanesiganon/Documents/GitHub/ns-scrap-erp/docs/migration/08-cutover-plan.md)
- [09-implementation-tasklist.md](/Users/watcharathatsrithanesiganon/Documents/GitHub/ns-scrap-erp/docs/migration/09-implementation-tasklist.md)
- [10-environment-status.md](/Users/watcharathatsrithanesiganon/Documents/GitHub/ns-scrap-erp/docs/migration/10-environment-status.md)

### Progress trackers

- [13-next-master-data-progress.md](/Users/watcharathatsrithanesiganon/Documents/GitHub/ns-scrap-erp/docs/migration/13-next-master-data-progress.md)
- [14-auth-permission-batch-plan.md](/Users/watcharathatsrithanesiganon/Documents/GitHub/ns-scrap-erp/docs/migration/14-auth-permission-batch-plan.md)
- [15-next-daily-transactions-progress.md](/Users/watcharathatsrithanesiganon/Documents/GitHub/ns-scrap-erp/docs/migration/15-next-daily-transactions-progress.md)
- [16-next-production-progress.md](/Users/watcharathatsrithanesiganon/Documents/GitHub/ns-scrap-erp/docs/migration/16-next-production-progress.md)
- [17-next-remaining-modules-progress.md](/Users/watcharathatsrithanesiganon/Documents/GitHub/ns-scrap-erp/docs/migration/17-next-remaining-modules-progress.md)

### Supporting inventories and audits

- [18-next-system-sitemap.md](/Users/watcharathatsrithanesiganon/Documents/GitHub/ns-scrap-erp/docs/migration/18-next-system-sitemap.md)
- [20-legacy-page-inventory.md](/Users/watcharathatsrithanesiganon/Documents/GitHub/ns-scrap-erp/docs/migration/20-legacy-page-inventory.md)
- [21-db-first-identifier-cutover.md](/Users/watcharathatsrithanesiganon/Documents/GitHub/ns-scrap-erp/docs/migration/21-db-first-identifier-cutover.md)
- [22-next-design-audit-plan.md](/Users/watcharathatsrithanesiganon/Documents/GitHub/ns-scrap-erp/docs/migration/22-next-design-audit-plan.md)

### Archive

- `docs/migration/archive/` - checkpoint/history ที่ปิดแล้ว

## Reading Rule

- ถ้าต้องเริ่มงานใหม่: อ่าน `AGENTS.md` -> `00-current-work.md` -> `00-doc-index.md`
- ถ้าต้องหากติกา business flow: ไป `docs/notes/README.md`
- ถ้าต้องหาสถานะ implementation: ไป tracker ของหมวดนั้น
- ถ้าต้องหาประวัติงานเก่า: ไป `docs/migration/archive/`
