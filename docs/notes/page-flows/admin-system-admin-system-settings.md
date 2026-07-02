---
title: ตั้งค่าระบบ Page Flow
tags:
  - page-flow
  - menu
  - admin-system
status: accepted-baseline
updated: 2026-07-02
route: /admin/system-settings
---

# ตั้งค่าระบบ Page Flow

## Scope

| Field | Value |
|---|---|
| Menu section | Admin / System |
| Route | `/admin/system-settings` |
| Page | ตั้งค่าระบบ |
| Current Next | accepted code baseline |

## Canonical References

[[System Supporting Flows]], [[Menu Page Flow Catalog]]

## Flow Baseline

system settings page for VAT/WHT settings, backed by current master-data tax setting APIs

## Page Responsibilities

- จัดการค่า VAT และ WHT ที่ current code เปิดใช้
- โหลด/บันทึกผ่าน master-data tax setting APIs
- ใช้ current code เป็น proof baseline ของหน้านี้
- แยก setting support ออกจาก business transaction flow

## Non-Responsibilities

- ไม่สร้าง PB/SB/EXP/PMT/RCP
- ไม่เขียน bank_statement หรือ stock_ledger
- ไม่แก้ tax snapshot ในเอกสารเก่าโดยตรง

## Lifecycle / Support Flow

| Step | User action | System result |
|---|---|---|
| 1 | เปิดหน้า | โหลด VAT/WHT settings จาก master-data APIs |
| 2 | แก้ percent | validate percent input ใน client และ API |
| 3 | บันทึก | saveMasterDataRecord ไป VAT/WHT setting API |
| 4 | นำไปใช้ | transaction pages อ่าน active/default setting ตาม current code |

## API / Data Contract

### Current API

- `GET/POST /api/master-data/vat-settings - VAT setting list/save`
- `GET/POST /api/master-data/wht-settings - WHT setting list/save`
- `No page-specific /api/admin/system-settings route in current code`

### Data Contract

- user identity ต้องมาจาก authenticated context ไม่รับ actor จาก form
- admin/support action ต้อง enforce permission ที่ API ระบุ
- admin/support pages ต้องไม่เขียน business transaction facts
- current code ใน `apps/next` เป็น proof baseline ของ P3 admin/system ณ 2026-06-11

## Validation / Status Rules

- percent ต้องเป็นตัวเลขที่ API รับได้
- setting ที่ถูกใช้ใน transaction ต้อง snapshot ลงเอกสารปลายทางตาม flow นั้น
- current code เป็น accepted baseline สำหรับหน้านี้

## Side Effects

- เขียน master-data tax setting rows เท่านั้น
- ไม่มี business transaction side effect

## Current Design Checkpoint

- 2026-07-02: WHT list presentation now follows the active table baseline with sortable/resizable headers, persisted widths, reset-width control, fixed table layout, and mobile cards from the same sorted row set.
- VAT/WHT save APIs, default WHT behavior, permission boundary, and transaction snapshot behavior were not changed.

## Current Gap

P3 proof completed from current code. Remaining work only if user changes target behavior.

## Implementation Checklist

- [x] Verify current page/component API calls
- [x] Verify current API route methods and permission boundary
- [x] Keep business transaction side effects out of this page
- [x] Update this file if admin/system code changes
