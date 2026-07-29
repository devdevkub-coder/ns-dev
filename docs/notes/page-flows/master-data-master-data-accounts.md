---
title: บัญชีเงินบริษัท Page Flow
tags:
  - page-flow
  - menu
  - master-data
status: accepted-baseline
updated: 2026-07-27
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

## Implementation Checklist

- [x] Current code accepted as master-data baseline
- [ ] Verify future form changes against docs/design.md Field Input Decision Matrix
- [ ] Verify required fields and server validation
- [ ] Verify active/inactive behavior in downstream transaction pages
- [x] ตารางบัญชีกรองตามสาขาได้ทั้ง desktop และ mobile
- [ ] Verify import/export if present
- [ ] Update this page-flow when master schema changes

## 2026-07-12 Table consistency checkpoint

`/master-data/accounts` now defines explicit width/minimum-width values for every account column, uses canonical `p-3` body cells through the shared master-data table, and lets the final edit column auto-stretch. What is what: the table remains the existing account master list and the modal remains the account editor. Why it stays this way: account labels and balances must scan cleanly without changing form validation, real-balance calculation, APIs, permissions, database schema, or DB state.
