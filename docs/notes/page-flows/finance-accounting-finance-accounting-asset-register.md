---
title: Fixed Assets Page Flow
tags:
  - page-flow
  - menu
  - finance-accounting
  - fixed-assets
status: accepted-baseline
updated: 2026-06-16
route: /finance-accounting/asset-register
---

# Fixed Assets Page Flow

## Scope

| Field | Value |
|---|---|
| Menu section | Finance Accounting |
| Route | `/finance-accounting/asset-register` |
| Page | Fixed Assets / ทรัพย์สิน |
| Current Next | asset lifecycle write baseline |

## Canonical References

[[Finance Accounting Flow]], [[Menu Page Flow Catalog]]

## Flow Baseline

ทะเบียนทรัพย์สินเป็นจุดเริ่มของ asset lifecycle. ผู้ใช้สร้าง master ของทรัพย์สินก่อน แล้วข้อมูล `cost / salvage / useful life / depreciation method / status` จะถูกใช้ต่อโดยหน้า `ค่าเสื่อมราคา` และ `จำหน่ายทรัพย์สิน`.

## Page Responsibilities

- สร้าง/แก้ไขทะเบียนทรัพย์สิน เช่น code, name, category, branch, supplier, purchase date, cost, VAT, net asset cost, salvage value, useful life, depreciation method, location, responsible person, serial/vehicle fields, notes
- นำเข้า CSV/TSV ผ่าน preview ก่อน commit
- ส่งออก CSV และดาวน์โหลด template
- คำนวณ NBV, accumulated depreciation, monthly depreciation จาก `assets` + active `depreciations`
- ปิดใช้งานทรัพย์สินแบบ non-destructive ด้วย status `Inactive` แทน legacy hard delete
- ส่งต่อข้อมูลทรัพย์สิน Active ไปให้ depreciation/disposal flows

## Non-Responsibilities

- ไม่ hard-delete asset และไม่ cascade delete depreciation แบบ legacy
- ไม่เขียน `stock_ledger` หรือ `bank_statement`
- ไม่ post GL acquisition journal ใน dev-scope batch นี้
- ไม่สร้าง AP/payment จากการซื้อทรัพย์สิน

## Lifecycle / Flow

| Step | User action | System result |
|---|---|---|
| 1 | เปิดหน้า | โหลด asset rows, filters, branch/supplier/options, summary NBV |
| 2 | กด `+ เพิ่มทรัพย์สิน` | เปิด form asset master |
| 3 | บันทึก | validate code/name/cost/VAT/net cost/salvage/useful life และ create/update `assets` |
| 4 | Import | parse CSV/TSV ฝั่ง client, preview duplicate/error ฝั่ง API, แล้ว commit เมื่อไม่มี error |
| 5 | แก้ไข | โหลด row snapshot เข้าฟอร์ม แล้ว update asset master |
| 6 | ปิดใช้งาน | เปลี่ยน `asset_status = Inactive` โดยไม่ลบ history |

## API / Data Contract

- `GET /api/finance-accounting/asset-register`
- `GET /api/finance-accounting/asset-register?template=csv`
- `GET /api/finance-accounting/asset-register?format=csv`
- `POST /api/finance-accounting/asset-register`
- `POST action=previewImport|commitImport`
- `PATCH action=deactivate`

Source tables:

- `assets`
- `depreciations`
- `branches`
- `suppliers`

## Validation / Status Rules

- `code`, `name`, `originalCost`, `netAssetCost` จำเป็น
- `vatAmount` ต้องไม่เกิน `originalCost`
- `salvageValue` ต้องไม่เกิน `netAssetCost`
- `Straight Line` ต้องมี `usefulLifeMonths > 0`
- `code` ต้อง unique ทั้งสร้าง/แก้/import
- status ที่ใช้ใน lifecycle หลัก: `Active`, `Inactive`, `Fully Depreciated`, `Sold`, `Disposed`, `Lost`

## Side Effects

- Create/update/import mutate `assets`
- Deactivate mutate เฉพาะ `assets.asset_status`
- ไม่มี GL/bank/stock side effect ใน batch นี้

## Legacy Comparison

- Legacy `view-assetRegister` รองรับ add/edit/delete/import/export และ hard-delete จะลบ depreciation ที่เกี่ยวข้อง
- Target Next clone เปิด add/edit/import/export/deactivate แล้ว แต่เปลี่ยน delete เป็น deactivate เพื่อรักษา audit/history

## Implementation Checklist

- [x] Verify legacy asset register actions and fields
- [x] Enable create/edit/import/export/deactivate UI
- [x] Add server validation and duplicate-code protection
- [x] Keep destructive delete excluded
- [ ] Add acquisition GL posting only after FA5 posting/period contract is approved

## UI Checkpoint 2026-07-12

- บนมือถือย้าย action `+ เพิ่มทรัพย์สิน` เข้า filter/action card เดียวกับ search และตัวกรอง แทน FAB วงกลมลอย
- ปุ่ม filter, import, export, และยืนยันใน MobileFilterSheet ใช้น้ำหนักตัวอักษรปกติตาม baseline; desktop ยังใช้ filter สองแถวและ action row เดิม
- เหตุผล: action ต้องอยู่ใกล้กับ data surface ที่ควบคุมและไม่ทับรายการ/แถบนำทางบนหน้าจอเล็ก
