---
title: บัญชีเงินบริษัท Page Flow
tags:
  - page-flow
  - menu
  - master-data
status: accepted-baseline
updated: 2026-07-29
route: /master-data/accounts
---

# บัญชีเงินบริษัท Page Flow

## Scope

| Field | Value |
|---|---|
| Menu section | Master Data |
| Route | `/master-data/accounts` |
| Page | บัญชีเงินบริษัท |
| Current Next | accepted code baseline |

## Canonical References

[[Menu Page Flow Catalog]]

## Flow Baseline

company cash/bank account master used by TRF/PMT/RCP/PRET/bank statement

## Canonical Account Model

บัญชีเงินบริษัทเป็น “บัญชีทรัพย์สินที่ใช้รับ/จ่ายเงินจริง” ไม่ใช่วิธีจ่าย/รับเงิน วิธีจ่าย/รับเงินยังอยู่ใน master แยกต่างหาก เพราะใช้ร่วมกับลูกค้าและ supplier เป็นตัวกรองของ use case ก่อนเลือกบัญชีปลายทาง

| Field | Meaning | Rule |
|---|---|---|
| `account_group` | ประเภทบัญชี | `cash` เงินสด, `bank` บัญชีธนาคาร หรือ `virtual` บัญชีเจ้าหนี้เงินทดรองจ่าย |
| `bank_account_type` | ประเภทบัญชีธนาคาร | ใช้เฉพาะ `bank`: `savings` ออมทรัพย์ หรือ `current` กระแสรายวัน |
| `is_fcd` | บัญชีธนาคารเป็น FCD หรือไม่ | เลือกผ่าน dropdown; ใช้เฉพาะบัญชีธนาคาร และทุกกรณีต้องเลือกสกุลเงินจาก Currency Master โดย FCD ต้องเลือกสกุลเงินต่างประเทศ |
| `currency` | สกุลเงิน legacy/หลักของบัญชี | ใช้เป็นค่า compatibility ระหว่าง migration; บัญชีธนาคารใช้ `account_currency_balances` เป็น source ของชุดสกุลเงินและยอดแยก |
| `account_currency_balances` | ชุดสกุลเงินและยอดตั้งต้นของบัญชี | บัญชี FCD ต้องมี THB และเลือกสกุลเงินต่างประเทศเพิ่มได้หลายรายการ โดยแต่ละรายการมียอดตั้งต้นแยกกัน |
| `od_limit` | วงเงิน OD | ใช้ได้เฉพาะบัญชีกระแสรายวันและไม่ใช่ FCD |
| `branch_id` | สาขาบริษัทเจ้าของบัญชี | ใช้ scope บัญชีในรายการรับ/จ่ายและรายงาน |
| `bank_branch` | สาขาของธนาคาร | เป็นข้อมูลธนาคาร ไม่ใช่สาขาบริษัท |

บัญชีเจ้าหนี้เงินทดรองจ่ายเป็นบัญชีเสมือนสำหรับกรณีบุคคลออกค่าใช้จ่ายแทนบริษัทก่อน ไม่ใช่เงินสดหรือบัญชีธนาคารจริง ยอด ledger สามารถติดลบเพื่อแสดงว่าบริษัทค้างคืนผู้ทดรอง แต่หน้ารับเงินลูกค้าและหน้ารายการเดินบัญชีธนาคารจะไม่แสดงบัญชีประเภทนี้

### Create Account Steps

1. เลือก `ประเภทบัญชี`: เงินสด, บัญชีธนาคาร หรือ บัญชีเจ้าหนี้เงินทดรองจ่าย
2. เลือกสาขาบริษัท ชื่อบัญชี และสกุลเงินจาก Currency Master
3. ถ้าเป็นบัญชีเจ้าหนี้เงินทดรองจ่าย ให้กำหนดเป็นบัญชีเสมือนกลางของบริษัท ไม่ต้องเลือกผู้ทดรองจ่าย และไม่ต้องกรอกข้อมูลธนาคาร ผู้ที่ออกเงินแทนจะผูกในหน้าเงินกู้กรรมการภายหลัง
4. ถ้าเป็นบัญชีธนาคาร ให้เลือกประเภทบัญชีธนาคารก่อน: ออมทรัพย์ หรือ กระแสรายวัน
5. ถ้าเป็นบัญชีธนาคาร ให้เลือก FCD ผ่าน dropdown; non-FCD เลือก THB รายการเดียว ส่วน FCD ต้องเลือก THB และสกุลเงินต่างประเทศเพิ่มอย่างน้อย 1 รายการ พร้อมยอดตั้งต้นแยกแต่ละสกุล
6. ถ้าเป็นกระแสรายวัน จึงกำหนดวงเงิน OD ได้
7. ถ้าเป็นบัญชีธนาคาร จึงกรอกธนาคาร สาขาธนาคาร และเลขที่บัญชี

เหตุผลของลำดับนี้คือให้ผู้ใช้เลือก “สิ่งที่บัญชีเป็น” ก่อน “ความสามารถของบัญชี” และทำให้หน้ารับเงิน/จ่ายเงินใช้ account master เป็นตัวกรองได้โดยไม่ผูก payment method เข้ากับบัญชีถาวร

## Page Responsibilities

- ดูแล master data ของ บัญชีเงินบริษัท
- รองรับ list/search/filter/sort/resize/export/import เฉพาะที่ API ของหน้านี้เปิดไว้
- ใช้ `ACC<รหัสสาขา>-<ลำดับ 3 หลัก>` เป็น business code เช่น `ACC01-001`; server เป็นผู้สร้างและเป็น source of truth
- `account_no` คือเลขบัญชีธนาคารตัวเลขล้วน ไม่ใช่ business code และไม่รวมรหัสสาขา
- ตารางบัญชีมีตัวกรอง `สาขา` แยกจากการค้นหาและสถานะ; ค่าเริ่มต้นคือ `ทุกสาขา` และเมื่อเลือกสาขาจะเหลือเฉพาะบัญชีของสาขานั้น
- downstream ที่ต้องเลือกบัญชีรับ/จ่ายต้องส่ง business code เท่านั้น; ห้ามส่ง internal id เป็นทางเลือกสำรอง
- แสดง created date/status และใช้งาน active-only ใน transaction pages
- เก็บ snapshot ลง business documents เมื่อ master ถูกนำไปใช้ในเอกสารที่ต้องรักษาประวัติ

## Non-Responsibilities

- ไม่สร้าง business transaction เช่น PB/SB/PMT/RCP/ST
- ไม่แก้เอกสารย้อนหลังเมื่อ master ถูกเปลี่ยน เว้นแต่มี migration/audit rule
- ไม่ทำ runtime fallback เพื่อรับ legacy bad data; ถ้าข้อมูลผิดต้องแก้ที่ data/migration/source process

## Lifecycle / Master Data Flow

| Step | User action | System result |
|---|---|---|
| 1 | เปิดหน้า | โหลด list จาก Current API |
| 2 | สร้าง/แก้ไข | validate name/type/branch/status และ required fields; server สร้างหรือคง code ตาม branch |
| 3 | บันทึก | เขียน master row และ audit/updated timestamp |
| 4 | ปิดใช้งาน | active=false/status inactive เพื่อกันเลือกในเอกสารใหม่ |
| 5 | นำไปใช้ | transaction pages เลือกเฉพาะ active และ snapshot ค่าที่ต้อง trace |

## API / Data Contract

### Current API

- `GET/POST /api/master-data/accounts`
- `PATCH /api/master-data/accounts/[id]`
- `GET/POST /api/master-data/accounts; item API by id exists`

### Data Contract

- UI ใช้ business code/name เป็นหลัก ไม่ expose internal id เป็นเลขธุรกิจ
- create/update ต้อง validate server-side ตาม field type matrix ใน `docs/design.md`
- เงินสดต้องไม่มีประเภทบัญชีธนาคาร, FCD หรือ OD
- บัญชีเจ้าหนี้เงินทดรองจ่ายเป็นบัญชีเสมือนกลาง ไม่ผูกผู้ทดรองจ่ายใน master บัญชี และไม่มีข้อมูลธนาคาร, FCD หรือ OD
- FCD ต้องมีสกุลเงินต่างประเทศ; non-FCD ใช้ THB ตามโครงสร้างปัจจุบัน
- OD เปิดให้เลือกเฉพาะบัญชีกระแสรายวัน
- active/inactive ต้องใช้เป็น selection eligibility ใน transaction pages
- import/export ถ้ามี ต้องใช้ validation ชุดเดียวกับ form/API

## Validation / Status Rules

- required fields ต้องชัดตามหน้าและไม่พึ่ง placeholder เป็น validation
- account code ต้อง unique และอยู่ในรูปแบบ `ACC<รหัสสาขา>-<ลำดับ 3 หลัก>`
- การปรับข้อมูลเดิมใช้ migration ที่จัดลำดับตาม `branch_id, id`; ถ้าขาดสาขาหรือรหัสสาขาผิดรูปแบบต้องหยุด migration
- inactive row ต้องยังแสดงในประวัติเอกสารเก่า แต่ห้ามเลือกในเอกสารใหม่
- ห้าม normalize/merge ข้อมูล legacy แบบ silent ใน runtime path

## Side Effects

- เขียนเฉพาะ master data table ของหน้านี้และ audit/updated timestamp
- bank statement ยังผูกด้วย `bank_statement.account_id -> accounts.id`; การเปลี่ยน outward account code จึงไม่ย้ายรายการเดินบัญชี
- ไม่มี stock/payment/accounting side effect โดยตรง
- downstream business documents ต้อง snapshot ค่า master ที่จำเป็นเอง

## Current Code Baseline

- Current `apps/next` code is accepted as the source of truth for this master-data page.
- Legacy behavior does not override this page unless user requests a page-specific change.
- Future work is doc sync when current code changes, not legacy proof.
- Downstream transaction pages must consume this master data through active rows and snapshot values as required by their own flow.

## Current Gap

Current code uses branch-scoped account business codes. Bank statement and transaction flows resolve this code to the internal account FK; an unknown or numeric internal id is rejected rather than treated as an unfiltered request.

การปรับโครงสร้างรอบนี้เพิ่ม canonical fields สำหรับแยกเงินสด/ธนาคาร, ประเภทบัญชีธนาคาร, FCD และความสามารถเช็ค โดยคง `payment_methods` เป็น master กลางของช่องทางรับ/จ่ายต่อไป ไม่ได้ทำให้ FCD transaction, FX rate หรือยอดเงินหลายสกุลเงินใน bank statement เสร็จใน batch นี้

## Implementation Checklist

- [x] Current code accepted as master-data baseline
- [x] Verify future form changes against docs/design.md Field Input Decision Matrix
- [x] Verify required fields and server validation
- [ ] Verify active/inactive behavior in downstream transaction pages
- [x] ตารางบัญชีกรองตามสาขาได้ทั้ง desktop และ mobile
- [ ] Verify import/export if present
- [x] Update this page-flow when master schema changes

## 2026-07-12 Table consistency checkpoint

`/master-data/accounts` now defines explicit width/minimum-width values for every account column, uses canonical `p-3` body cells through the shared master-data table, and lets the final edit column auto-stretch. What is what: the table remains the existing account master list and the modal remains the account editor. Why it stays this way: account labels and balances must scan cleanly without changing form validation, real-balance calculation, APIs, permissions, database schema, or DB state.
