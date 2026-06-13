---
title: โอนสินค้าระหว่างสาขา Page Flow
tags:
  - page-flow
  - menu
status: accepted-baseline
updated: 2026-06-13
route: /stock/transfer
---

# โอนสินค้าระหว่างสาขา Page Flow

## Scope

| Field | Value |
|---|---|
| Menu section | Stock |
| Route | `/stock/transfer` |
| Page | โอนสินค้าระหว่างสาขา |
| Current Next | accepted code baseline |

## Canonical References

[[Stock Transfer Page Flow]], [[Stock Ledger and Stock Balance]]

## Flow Baseline

ST สร้าง paired stock-out/stock-in ระหว่าง warehouse/branch

## Requirement Update 2026-06-13

Requirement จาก customer screenshots:

- ใช้โอน stock ระหว่างคลัง/สาขาเท่านั้น และต้องไม่กระทบ revenue
- ก่อนโอนต้องเห็น stock available และมูลค่า/kg ของ stock ต้นทาง
- เมื่อส่งแล้วระบบต้องตัด stock ต้นทาง, รับเข้า stock ปลายทาง, และเขียน Stock Ledger
- Filter หน้า list ใช้เฉพาะเลขที่, วันที่, และน้ำหนักรวม
- List ต้องแสดงแก้ไขล่าสุดโดย/เวลา และมูลค่ารวม
- มูลค่ารวม = `sum(source unit cost/kg * qty)`
- Modal ไม่ต้องมีผู้ส่ง, ผู้รับ, หรือ Lot
- Modal ไม่ต้องแสดงเลขที่เอกสาร/วันที่ เพราะระบบออกเลขและวันที่อัตโนมัติ
- คลังต้องเลือกไม่ได้จนกว่าจะเลือกสาขาก่อน
- รายการสินค้าต้องใช้ searchable combobox
- แก้ไข/ยกเลิกได้เฉพาะรายการที่ยังไม่ส่งเข้าตัด stock; หลังส่งแล้วแก้ไม่ได้

## Page Responsibilities

- สร้าง `ST` เพื่อโอนสินค้าออกจากคลังต้นทางเข้า destination warehouse
- validate available stock ก่อนโอน
- แสดง source available และ source unit cost/kg ก่อนบันทึก
- เขียน ledger 2 ฝั่งใน transaction เดียว
- แสดง history/detail/source movement และ outstanding transfer ถ้ามี transit model

## Non-Responsibilities

- ไม่ขายสินค้าและไม่ตั้ง AR/AP
- ไม่กระทบ revenue
- ไม่เปลี่ยนสินค้า/grade/status; งานนั้นอยู่ convert/status-convert
- ไม่ใช้ถ้าของถูก hold เกิน available
- ไม่เปิดให้ user กรอก Lot manual ใน target modal

## Lifecycle / Operation Flow

| Step | User action | System result |
|---|---|---|
| 1 | เปิดหน้า | GET transfer list/options |
| 2 | เลือก source/destination | เลือก product, source warehouse, destination warehouse, qty และเห็น source available + source unit cost/kg |
| 3 | บันทึกแบบยังไม่ส่ง ถ้ามี draft mode | บันทึก draft ที่แก้ไข/ยกเลิกได้และยังไม่เขียน ledger |
| 4 | ส่ง/posted | POST/commit ST + paired ledger out/in |
| 5 | แก้ไข/ยกเลิก | ทำได้เฉพาะ draft/ยังไม่ส่ง; posted แล้วห้ามแก้ไข |
| 6 | แก้ผลหลัง posted | สร้าง transfer ใหม่กลับทิศทางด้วยเลขที่ใหม่; ไม่ cancel/reverse เอกสาร posted เดิม |

## API / Data Contract

### Current API

- `GET /api/stock/transfer - list/options`
- `POST /api/stock/transfer - create stock transfer`
- Target follow-up ถ้ารองรับ draft: create draft, update draft, cancel draft, post draft

### Data Contract

- UI ใช้ outward business document/code เป็นหลัก และให้ server resolve internal id
- list/detail/print/export ต้องอ่าน source contract เดียวกันเพื่อลด drift
- transaction write ต้องทำใน server transaction และ append timeline/status/audit ตาม document policy
- ถ้า field เป็น money/qty/date/business code ให้ validate ตาม `docs/design.md` และ server-side ซ้ำ
- server ต้อง resolve source available, source unit cost/kg, total value, and ledger value จาก stock source of truth; ห้ามเชื่อ client cost/value
- list response ต้องมี `updatedByName`, `updatedAt`, `totalQty`, `totalValue`
- list filters เป้าหมายคือ `docNo`, `dateFrom`, `dateTo`, `totalQtyFrom`, `totalQtyTo`

## Validation / Status Rules

- source/destination warehouse ต้อง active และไม่ซ้ำกัน
- ต้องเลือก source/destination branch ก่อนจึงเลือก warehouse ของฝั่งนั้นได้
- qty > 0 และไม่เกิน available_qty
- ห้ามโอน stock ที่ถูก hold active
- destination product/status rule ต้องชัดถ้ามี lot/status
- posted ST immutable; edit/cancel เปิดได้เฉพาะ draft หรือสถานะ equivalent ที่ยังไม่เขียน ledger
- ถ้าต้องแก้ stock หลัง posted ให้สร้าง ST ใหม่กลับทิศ ไม่ทำ `ST-REV` หรือ posted cancel flow
- source unit cost/kg ต้องมีค่าตาม stock cost policy ก่อน post

## Side Effects

- เขียน `stock_ledger` out จาก source และ in เข้า destination
- recalc balance จาก ledger อัตโนมัติ
- ไม่สร้าง revenue, AR/AP, sales bill, หรือ payment side effect

## Current Code Baseline

- Current `apps/next` page/API code is accepted as the P0 implementation baseline as of 2026-06-11.
- This page belongs to the transaction/stock/payment risk group; accepted baseline means proofed against current code, not target-complete.
- Runtime changes must preserve documented status, allocation, ledger, payment, lock, and reversal boundaries, or update this page-flow and the canonical flow first.
- See [[P0 Transaction Stock Payment Current Code Baseline]] for API/permission/side-effect proof notes and open critical gaps.

## Current Gap

- ทำแล้ว: runtime มี source document tables `stock_transfers` / `stock_transfer_items`
- ทำแล้ว: draft แก้ไข/ยกเลิกได้, posted immutable และเขียน paired `ST` ledger
- ทำแล้ว: API/list รองรับ server-side pagination, doc/date/total-weight filters, updated metadata, total qty/value
- ทำแล้ว: UI ปรับ filters, columns, modal fields, source available preview, และ source unit cost/kg
- ทำแล้ว: modal ซ่อนเลขที่เอกสาร/วันที่, ล็อกคลังจนกว่าจะเลือกสาขา, และใช้สินค้าเป็น searchable combobox
- ทำแล้ว: hold-aware validation ก่อน post ด้วย ready stock
- ทำแล้ว: server-side source bucket allocation สำหรับ posted ledger โดย preserve `lot_no`, status/output category, unit cost, และ value จากต้นทาง
- ทำแล้ว: DB/API optimize ด้วย source document indexes, ST ledger lookup indexes, และ prefix index สำหรับ `doc_no`
- ทำแล้ว: logged-in browser QA สำหรับ source preview, draft create/edit/cancel, posted create, ledger pair, immutable posted block, และ append-only QA cleanup
- ทำแล้ว: posted cancel/reversal ไม่เปิดตาม business policy; correction ใช้ transfer ใหม่กลับทิศทางเท่านั้น

## Implementation Checklist

- [x] Verify current Next page/component against this page-flow
- [x] Verify API route handlers match Current API and status rules above
- [x] Verify legacy behavior for stock-out/stock-in paired ST before runtime change
- [x] Add DB/API/UI implementation for updated 2026-06-13 requirement
- [x] Update this file and canonical reference if contract changes
- [x] Logged-in browser QA for draft/edit/cancel/post

## QA Evidence 2026-06-13

- Browser QA passed locally on `/stock/transfer` using a temporary authenticated admin session
- Created/edited/cancelled draft `ST2606-0013` and verified draft did not write `ST` ledger
- Posted `ST2606-0014`; DB verification found 4 `ST` rows, 60 kg out/in, 7,000 value out/in, two source lots, and positive source unit cost
- Posted edit/cancel negative tests returned `400`
- QA stock setup and posted test movement were offset by append-only `QA-STOCK-CLEANUP`; no QA balance residue remained after the run
- API fix from QA: ST doc-number advisory lock uses `$executeRaw` so PostgreSQL `void` lock result is not deserialized by Prisma
