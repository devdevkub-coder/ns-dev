---
title: รายการรอขาย Page Flow
tags:
  - page-flow
  - menu
status: accepted-baseline
updated: 2026-06-11
route: /pending-sales
---

# รายการรอขาย Page Flow

## Scope

| Field | Value |
|---|---|
| Menu section | Main Dashboard / Reports |
| Route | `/pending-sales` |
| Page | รายการรอขาย |
| Current Next | accepted code baseline |

## Canonical References

[[Sales Flow]], [[Pending Sale Page Flow]], [[Cost Pool]]

## Flow Baseline

read model รวมสินค้าที่รอขาย/พร้อมขาย/ถูกจองจาก stock, cost pool, PO Sell, PSALE/WTO

## Page Responsibilities

- แสดงยอดสินค้ารอขายและ readiness จาก stock/cost/PO Sell context
- ช่วย Owner/Sales เห็น pending sales pipeline และ aging
- drilldown ไป source เช่น POS/WTO/SB/cost pool ตามข้อมูลที่มี; PSALE เป็น legacy reference เท่านั้น
- แยก on hand, hold, pending sale, cost pool quantity ไม่ปนกัน

## Non-Responsibilities

- ไม่สร้างเอกสารขาย
- ไม่ตัด stock
- ไม่รับเงิน
- ไม่ใช้เป็น source of truth ของ balance แทน stock ledger/hold

## Lifecycle / Operation Flow

| Step | User action | System result |
|---|---|---|
| 1 | เปิดหน้า | GET report/read model |
| 2 | filter | ค้นหา product/customer/branch/date/status |
| 3 | drilldown | เปิด source doc ที่เกี่ยวข้อง |
| 4 | export/report | ใช้ข้อมูลตาม filter |

## API / Data Contract

### Current API

- `GET /api/pending-sales - pending sale report/read model`

### Data Contract

- UI ใช้ outward business document/code เป็นหลัก และให้ server resolve internal id
- list/detail/print/export ต้องอ่าน source contract เดียวกันเพื่อลด drift
- transaction write ต้องทำใน server transaction และ append timeline/status/audit ตาม document policy
- ถ้า field เป็น money/qty/date/business code ให้ validate ตาม `docs/design.md` และ server-side ซ้ำ

## Validation / Status Rules

- ตัวเลขต้องระบุ source/definition ชัด เช่น on hand/hold/PSALE/POS
- aging ต้องใช้ created/document date ตาม policy
- ไม่รวมหน่วยต่างกันเป็นยอดเดียว

## Side Effects

- read-only ไม่มี side effect
- drilldown ไม่ mutate source

## Current Code Baseline

- Current `apps/next` page/API code is accepted as the P2 proof baseline as of 2026-06-11.
- This page is a read-model/report surface; current APIs are `GET`-oriented and protected by report/finance permissions.
- No transaction, stock ledger, bank statement, AP/AR settlement, or source document status side effect is expected from this page.
- Future changes should reconcile formula/source/cutoff details here before changing runtime behavior.

## Current Gap

ต้อง reconcile กับ pending_out และ cost pool หลัง implement reservation layer

## Implementation Checklist

- [ ] Verify current Next page/component against this page-flow
- [ ] Verify API route handlers match Current API and status rules above
- [ ] Verify legacy behavior for any gap before implementing runtime change
- [ ] Add/adjust tests or browser QA checklist before changing runtime
- [ ] Update this file and canonical reference if contract changes
