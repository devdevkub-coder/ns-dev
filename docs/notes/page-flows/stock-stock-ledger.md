---
title: Stock Ledger Page Flow
tags:
  - page-flow
  - menu
status: accepted-baseline
updated: 2026-06-11
route: /stock/ledger
---

# Stock Ledger Page Flow

## Scope

| Field | Value |
|---|---|
| Menu section | Stock |
| Route | `/stock/ledger` |
| Page | Stock Ledger |
| Current Next | accepted code baseline |

## Canonical References

[[Stock Ledger Page Flow]], [[Stock Ledger and Stock Balance]]

## Flow Baseline

movement history ของ stock_ledger เท่านั้น

## Page Responsibilities

- แสดงรายการ movement เข้า/ออกพร้อม source ref
- filter ตาม date/product/branch/warehouse/ref type/status
- drilldown ไป source doc เช่น PB/SB/PSALE/ST/SC/GA/ADJ/Production
- ใช้ reconcile กับ stock balance และ audit

## Non-Responsibilities

- ไม่แสดง stock hold เป็น row
- ไม่แก้หรือสร้าง movement จากหน้า ledger
- ไม่เป็นหน้า stock balance summary หลัก

## Lifecycle / Operation Flow

| Step | User action | System result |
|---|---|---|
| 1 | เปิดหน้า | GET movement rows |
| 2 | filter/sort | ค้นหา source/product/warehouse/date |
| 3 | drilldown | เปิด source document |
| 4 | reconcile | เทียบกับ stock balance/export |

## API / Data Contract

### Current API

- `GET /api/stock/ledger - stock movement history`

### Data Contract

- UI ใช้ outward business document/code เป็นหลัก และให้ server resolve internal id
- list/detail/print/export ต้องอ่าน source contract เดียวกันเพื่อลด drift
- transaction write ต้องทำใน server transaction และ append timeline/status/audit ตาม document policy
- ถ้า field เป็น money/qty/date/business code ให้ validate ตาม `docs/design.md` และ server-side ซ้ำ

## Validation / Status Rules

- ทุก row ต้องมี source ref/movement type/product/warehouse/qty direction
- reversal ต้องแสดงเป็น movement/audit ไม่ลบประวัติแบบเงียบ
- hold/reservation ไม่ใช่ movement

## Side Effects

- read-only ไม่มี side effect

## Current Code Baseline

- Current `apps/next` page/API code is accepted as the P0 implementation baseline as of 2026-06-11.
- This page belongs to the transaction/stock/payment risk group; accepted baseline means proofed against current code, not target-complete.
- Runtime changes must preserve documented status, allocation, ledger, payment, lock, and reversal boundaries, or update this page-flow and the canonical flow first.
- See [[P0 Transaction Stock Payment Current Code Baseline]] for API/permission/side-effect proof notes and open critical gaps.

## Current Gap

- source links สำหรับ ref type หลักเพิ่มแล้วใน detail modal
- API query/pagination/running balance ปรับเป็น server-side แล้ว
- remaining: cleanup/admin tooling ยังเป็น policy แยก ไม่ใช่หน้าปกติของ ledger

## Implementation Checklist

- [x] Verify current Next page/component against this page-flow
- [x] Verify API route handlers match Current API and status rules above
- [ ] Verify legacy behavior for any gap before implementing runtime change
- [ ] Add/adjust tests or browser QA checklist before changing runtime
- [ ] Update this file and canonical reference if contract changes
