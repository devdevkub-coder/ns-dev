---
title: พนักงานขาย Page Flow
tags:
  - page-flow
  - menu
  - master-data
status: accepted-baseline
updated: 2026-06-29
route: /master-data/salespersons
---

# พนักงานขาย Page Flow

## Scope

| Field | Value |
|---|---|
| Menu section | Master Data |
| Route | `/master-data/salespersons` |
| Page | พนักงานขาย |
| Current Next | accepted code baseline |

## Canonical References

[[Menu Page Flow Catalog]]

## Flow Baseline

salesperson master used by sales documents and commission

## Page Responsibilities

- ดูแล master data ของ พนักงานขาย
- กำหนดว่าพนักงานขายแต่ละคนมีสิทธิ์คิดค่าคอมมิชชั่นหรือไม่
- รองรับ list/search/filter/sort/resize/export/import เฉพาะที่ API ของหน้านี้เปิดไว้
- ใช้ code/name/status เป็น outward UI identity และให้ server resolve internal id
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
| 2 | สร้าง/แก้ไข | validate code/name/status, commission enabled flag และ required fields |
| 3 | บันทึก | เขียน master row และ audit/updated timestamp |
| 4 | ปิดใช้งาน | active=false/status inactive เพื่อกันเลือกในเอกสารใหม่ |
| 5 | นำไปใช้ | transaction pages เลือกเฉพาะ active และ snapshot ค่าที่ต้อง trace |

## API / Data Contract

### Current API

- `GET/POST /api/master-data/salespersons`
- `PATCH /api/master-data/salespersons/[id]`
- `GET/POST /api/master-data/salespersons; item API PATCH/PUT may exist by id`

### Data Contract

- UI ใช้ business code/name เป็นหลัก ไม่ expose internal id เป็นเลขธุรกิจ
- `commissionEnabled` เป็น boolean UI/API field ที่ map กับ `salespersons.commission_eligible`
- create/update ต้อง validate server-side ตาม field type matrix ใน `docs/design.md`
- active/inactive ต้องใช้เป็น selection eligibility ใน transaction pages
- import/export ถ้ามี ต้องใช้ validation ชุดเดียวกับ form/API

## Validation / Status Rules

- required fields ต้องชัดตามหน้าและไม่พึ่ง placeholder เป็น validation
- code/business id ต้อง unique ตาม scope ที่กำหนด
- inactive row ต้องยังแสดงในประวัติเอกสารเก่า แต่ห้ามเลือกในเอกสารใหม่
- sales ที่ `commissionEnabled=false` ต้องไม่ถูกคิดค่าคอมมิชชั่นใน downstream commission flow แม้จะมี transaction ยอดขาย/ซื้อ
- สูตรคำนวณรายงาน Sales Commission ต้องอ้างอิง flow ของรายงานนั้นแยกต่างหาก
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

- 2026-06-29: Added salesperson commission eligibility toggle in master data first.
- Sales Commission report calculation is not changed in this batch and must be updated separately to consume this master policy.

## Implementation Checklist

- [x] Current code accepted as master-data baseline
- [ ] Verify future form changes against docs/design.md Field Input Decision Matrix
- [x] Verify required fields and server validation for salesperson commission enabled flag
- [ ] Verify active/inactive behavior in downstream transaction pages
- [ ] Verify Sales Commission report consumes `commissionEnabled`
- [ ] Verify import/export if present
- [ ] Update this page-flow when master schema changes
