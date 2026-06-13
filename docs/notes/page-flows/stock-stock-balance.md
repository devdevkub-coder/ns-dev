---
title: สต๊อกคงเหลือ Page Flow
tags:
  - page-flow
  - menu
status: accepted-baseline
updated: 2026-06-12
route: /stock/balance
---

# สต๊อกคงเหลือ Page Flow

## Scope

| Field | Value |
|---|---|
| Menu section | Stock |
| Route | `/stock/balance` |
| Page | สต๊อกคงเหลือ |
| Current Next | accepted code baseline |

## Canonical References

[[Stock Balance Page Flow]], [[Stock Ledger and Stock Balance]]

## Flow Baseline

derived balance จาก stock_ledger + stock hold/reservation

## Page Responsibilities

- แสดง stock balance ตาม product/branch/warehouse/lot/status/output category
- แสดง `คงเหลือจริง`, `จองไว้`, `พร้อมใช้/พร้อมส่ง` ตาม target hold model
- หน้า UI ใช้คำว่า `คลัง` สำหรับกลุ่ม `RM/WIP/FG` จาก technical field `status/output_category`; `On Hold` เป็น badge ประกอบของยอดจองในคอลัมน์เดียวกัน
- `สาขา/คลัง` ยังหมายถึง branch + warehouse จัดเก็บจริง
- drilldown ไป stock ledger และ hold/source documents
- รองรับ filter/search/sort/export ตาม report baseline

## Non-Responsibilities

- ไม่เป็น fact table ของ movement
- ไม่แก้ stock โดยตรง
- ไม่แสดง hold เป็น ledger row
- ไม่คำนวณยอดจาก PB/SB line โดยตรง

## Lifecycle / Operation Flow

| Step | User action | System result |
|---|---|---|
| 1 | เปิดหน้า | GET aggregated balance |
| 2 | filter/group | product search combobox, branch, warehouse, คลัง(RM/WIP/FG), lot; filter `On Hold` ใช้ `stock_holds` active หลังคำนวณ balance |
| 3 | drilldown | ไป ledger/hold/source document |
| 4 | export | ส่งออกตาม filter |

## API / Data Contract

### Current API

- `GET /api/stock/balance - aggregate จาก stock_ledger ผ่าน server stock helper`
- `GET /api/stock/balance?onHold=1 - แสดงเฉพาะ row ที่มี active hold; ใช้กับ filter/export On Hold`

### Data Contract

- UI ใช้ outward business document/code เป็นหลัก และให้ server resolve internal id
- list/detail/print/export ต้องอ่าน source contract เดียวกันเพื่อลด drift
- transaction write ต้องทำใน server transaction และ append timeline/status/audit ตาม document policy
- ถ้า field เป็น money/qty/date/business code ให้ validate ตาม `docs/design.md` และ server-side ซ้ำ

## Validation / Status Rules

- balance ต้อง derive จาก ledger ไม่ใช้ cached stale header
- available = on_hand - active hold
- technical `status` หลักของ row ยังเป็น `RM/WIP/FG`; แต่ label ในหน้าใช้คำว่า `คลัง`
- ถ้า `onHoldQty > 0` UI แสดง badge `On Hold` เพิ่มในคอลัมน์ `คลัง`
- แยกหน่วยสินค้าและ warehouse เสมอ
- as-of/cutoff ต้องระบุถ้ามี report ย้อนหลัง

## Side Effects

- read-only ไม่มี side effect
- export/print ไม่ mutate stock

## Current Code Baseline

- Current `apps/next` page/API code is accepted as the P0 implementation baseline as of 2026-06-11.
- This page belongs to the transaction/stock/payment risk group; accepted baseline means proofed against current code, not target-complete.
- Runtime changes must preserve documented status, allocation, ledger, payment, lock, and reversal boundaries, or update this page-flow and the canonical flow first.
- See [[P0 Transaction Stock Payment Current Code Baseline]] for API/permission/side-effect proof notes and open critical gaps.

## Current Gap

- hold-aware drilldown ทำแล้ว: detail modal แสดง active WTO hold และ movement ล่าสุดของ bucket ที่เลือก
- export รองรับ filter `On Hold` ผ่าน `onHold=1`
- remaining: logged-in browser QA กับข้อมูลจริงหลาย bucket/source link

## Implementation Checklist

- [x] Verify current Next page/component against this page-flow
- [x] Verify API route handlers match Current API and status rules above
- [ ] Verify legacy behavior for any gap before implementing runtime change
- [ ] Add/adjust tests or browser QA checklist before changing runtime
- [ ] Update this file and canonical reference if contract changes
