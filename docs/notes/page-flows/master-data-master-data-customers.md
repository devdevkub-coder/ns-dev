---
title: ลูกค้า Page Flow
tags:
  - page-flow
  - menu
  - master-data
status: accepted-baseline
updated: 2026-06-24
route: /master-data/customers
---

# ลูกค้า Page Flow

## Scope

| Field | Value |
|---|---|
| Menu section | Master Data |
| Route | `/master-data/customers` |
| Page | ลูกค้า |
| Current Next | accepted code baseline |

## Canonical References

[[Menu Page Flow Catalog]]

## Flow Baseline

customer master used by POS/WTO/SB/RCP/AR

## Page Responsibilities

- ดูแล master data ของ ลูกค้า
- รองรับ list/search/filter/sort/resize/export/import เฉพาะที่ API ของหน้านี้เปิดไว้
- ใช้ code/name/status เป็น outward UI identity และให้ server resolve internal id
- แสดง created date/status และใช้งาน active-only ใน transaction pages
- เก็บ `market_scope` เป็น `ในประเทศ` หรือ `ต่างประเทศ` เพื่อให้ PO Sell และ Sales Bill auto ตั้ง `ช่องทางขาย` ตามลูกค้าได้ โดยไม่ต้องให้ผู้ใช้เลือกซ้ำทุกครั้ง
- เก็บ `legal_entity_type` สำหรับลูกค้า `นิติบุคคล` เช่น บจก./หจก./บมจ. แยกจาก `type` และ `market_scope`; กระทบเฉพาะตารางลูกค้า, modal รายละเอียด, import และ export ของ master ลูกค้า
- เก็บสิทธิ์สาขาที่ลูกค้ารายนั้นใช้ได้ผ่าน `customer_branches` ไม่ใช่ field สาขาเดียวบน `customers`; ลูกค้า 1 รายผูกได้หลายสาขา และต้องมี primary branch เพื่อบอกสาขาหลักที่รับผิดชอบ
- เก็บ snapshot ลง business documents เมื่อ master ถูกนำไปใช้ในเอกสารที่ต้องรักษาประวัติ

## Non-Responsibilities

- ไม่สร้าง business transaction เช่น PB/SB/PMT/RCP/ST
- ไม่แก้เอกสารย้อนหลังเมื่อ master ถูกเปลี่ยน เว้นแต่มี migration/audit rule
- ไม่ทำ runtime fallback เพื่อรับ legacy bad data; ถ้าข้อมูลผิดต้องแก้ที่ data/migration/source process

## Lifecycle / Master Data Flow

| Step | User action | System result |
|---|---|---|
| 1 | เปิดหน้า | โหลด list จาก Current API |
| 2 | สร้าง/แก้ไข | validate code/name/type/status และ required fields |
| 3 | บันทึก | เขียน master row และ audit/updated timestamp |
| 4 | ตั้งค่าสาขา | เขียน/แก้ active branch mapping และ primary branch ใน `customer_branches` |
| 5 | ปิดใช้งาน | active=false/status inactive หรือ inactive mapping เพื่อกันเลือกในเอกสารใหม่ |
| 6 | นำไปใช้ | transaction pages เลือกเฉพาะ active customer ที่ผูกกับสาขาเอกสาร และ snapshot ค่าที่ต้อง trace |

## API / Data Contract

### Current API

- `GET/POST /api/master-data/customers`
- `GET/POST /api/master-data/customers; status/export/import APIs exist`

### Data Contract

- UI ใช้ business code/name เป็นหลัก ไม่ expose internal id เป็นเลขธุรกิจ
- create/update ต้อง validate server-side ตาม field type matrix ใน `docs/design.md`
- active/inactive ต้องใช้เป็น selection eligibility ใน transaction pages
- response ของ list/detail/options ต้องมีสาขาที่ผูกใช้งานได้และ primary branch เพื่อให้ table, detail modal, import/export และ transaction selector ใช้ contract เดียวกัน
- transaction selectors ต้องกรองจาก `customer_branches.active = true` ตาม `branch_id` ของเอกสาร และ API ต้อง validate ซ้ำก่อนบันทึกทุกครั้ง
- customer ที่ไม่มี active branch mapping ต้องไม่ถูกเสนอเป็น option ในเอกสารใหม่; ห้าม fallback ให้เห็นทุกสาขา
- import/export ถ้ามี ต้องใช้ validation ชุดเดียวกับ form/API

## Validation / Status Rules

- required fields ต้องชัดตามหน้าและไม่พึ่ง placeholder เป็น validation
- code/business id ต้อง unique ตาม scope ที่กำหนด
- inactive row ต้องยังแสดงในประวัติเอกสารเก่า แต่ห้ามเลือกในเอกสารใหม่
- active customer ต้องมีอย่างน้อย 1 active branch mapping ก่อนนำไปใช้ใน transaction ใหม่
- ต้องมี primary branch active ได้เพียง 1 รายการต่อ customer
- การย้าย/ปิด branch mapping ไม่แก้ snapshot ในเอกสารเก่า แต่มีผลกับการเลือกในเอกสารใหม่ทันที
- ห้าม normalize/merge ข้อมูล legacy แบบ silent ใน runtime path

## Side Effects

- เขียนเฉพาะ master data table ของหน้านี้และ audit/updated timestamp
- ไม่มี stock/payment/accounting side effect โดยตรง
- downstream business documents ต้อง snapshot ค่า master ที่จำเป็นเอง

## Current Code Baseline

- Current `apps/next` code is accepted as the source of truth for this master-data page.
- Legacy behavior does not override this page unless user requests a page-specific change.
- Future work is doc sync when current code changes, not legacy proof.
- Downstream transaction pages must consume this master data through active rows and snapshot values as required by their own flow.

## Current Gap

Current code is accepted baseline. Remaining work is to keep documentation in sync with future code changes and verify downstream transaction consumption when those transaction pages are proofed.

## Implementation Checklist

- [x] Current code accepted as master-data baseline
- [ ] Verify future form changes against docs/design.md Field Input Decision Matrix
- [ ] Verify required fields and server validation
- [ ] Verify active/inactive behavior in downstream transaction pages
- [ ] Verify import/export if present
- [ ] Add `customer_branches` mapping UI/API/import/export and strict downstream transaction validation
- [ ] Update this page-flow when master schema changes
