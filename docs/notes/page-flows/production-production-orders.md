---
title: ใบสั่งผลิต Page Flow
tags:
  - page-flow
  - menu
status: accepted-baseline
updated: 2026-06-12
route: /production/orders
---

# ใบสั่งผลิต Page Flow

## Scope

| Field | Value |
|---|---|
| Menu section | Production |
| Route | `/production/orders` |
| Page | ใบสั่งผลิต |
| Current Next | accepted code baseline |

## Canonical References

[[Production Flow]], [[Production Order DB API Design]], [[Stock Ledger and Stock Balance]]

## Flow Baseline

production order เป็น owner ของ input/WIP/output lifecycle target. MVP write flow ไม่ใช้ approval/process cost/cost allocation/customer return.

## Page Responsibilities

- แสดง/target สร้าง production order
- กำหนด branch, source warehouse, WIP warehouse, destination warehouse, target/intended product, machine/line optional
- target issue input เป็น PI และ receive output เป็น PO2
- แสดง status, WIP, yield/loss, RM cost และ timeline

## Non-Responsibilities

- ไม่ใช้ stock convert แทน production order
- ไม่รับซื้อ/ขาย/จ่ายเงิน
- ไม่เขียน stock โดยไม่มี production transaction
- ไม่ทำ approval flow ใน MVP
- ไม่ทำ process cost/cost allocation ใน MVP
- ไม่รับ customer return ผ่าน production output ใน MVP

## Lifecycle / Operation Flow

| Step | User action | System result |
|---|---|---|
| 1 | เปิดหน้า | GET order list/read model |
| 2 | สร้าง order target | status `Open`, no stock side effect |
| 3 | issue input | PI stock-out/input to WIP |
| 4 | receive output | PO2 output FG/RM/loss |
| 5 | complete | allowed only when WIP = 0 |

## API / Data Contract

### Current API

- `GET /api/production/orders - production order read/list`
- `POST /api/production/orders` - create order as `Open`, no stock ledger
- `PATCH /api/production/orders/[docNo]` - update header/cancel/complete actions
- `POST /api/production/orders/[docNo]/inputs` - create `PI`
- `POST /api/production/orders/[docNo]/inputs/[inputDocNo]/reverse` - create `PI-REV`
- `POST /api/production/orders/[docNo]/inputs/reverse` - create `PI-REV` with `inputDocNo` in body
- `POST /api/production/orders/[docNo]/outputs` - create `PO2`
- `POST /api/production/orders/[docNo]/outputs/[outputDocNo]/reverse` - create `PO2-REV`
- `POST /api/production/orders/[docNo]/outputs/reverse` - create `PO2-REV` with `outputDocNo` in body
- `GET /api/production/orders/options` - create/input/output form reference data
- `GET /api/production/orders/product-stock` - selected target product stock preview source
- `GET /api/production/orders/[docNo]/wip` - active WIP summary
- `GET /api/production/reconciliation` - production document/ledger mismatch report

### Data Contract

- UI ใช้ outward business document/code เป็นหลัก และให้ server resolve internal id
- list/detail/print/export ต้องอ่าน source contract เดียวกันเพื่อลด drift
- transaction write ต้องทำใน server transaction และ append timeline/status/audit ตาม document policy
- ถ้า field เป็น money/qty/date/business code ให้ validate ตาม `docs/design.md` และ server-side ซ้ำ
- ห้าม fallback จาก business code/doc no ไป internal id ที่ UI/API boundary

## Validation / Status Rules

- input/output product active
- create order WIP warehouse must be active, belong to the selected branch, and have warehouse type `WIP`
- create modal locks WIP warehouse when the selected branch has exactly one active WIP warehouse; otherwise it blocks missing setup or requires explicit WIP selection
- issue qty ไม่เกิน available
- missing WAC ต้อง reject ไม่ fallback เป็น 0
- output/yield/loss ต้อง reconcile กับ active input/WIP
- WIP-side stock ledger rows must use the production order target product as the WIP product bucket; input/output source and destination stock rows keep their line product
- complete ต้อง WIP = 0
- status MVP: `Open`, `In Production`, `Partially Completed`, `Completed`, `Cancelled`

## Side Effects

- target writes stock ledger refs `PI`/`PO2` และ WIP/yield facts
- current read baseline ไม่มี write side effect
- reverse writes append-only `PI-REV`/`PO2-REV`; no hard delete/rewrite ledger

## Current Code Baseline

- Current `apps/next` page/API code is accepted as the P1 proof baseline as of 2026-06-11.
- This page belongs to the finance/production/report baseline group and must keep source facts traceable before formula or write-flow changes.
- Transaction side effects are limited to the current API contract documented above; report pages remain read-model surfaces.
- Future changes should reconcile source table, cutoff, status, and downstream side-effect details here before changing runtime behavior.

## Current Gap

- create/input/output/reverse write services and APIs are implemented for MVP.
- ใบสั่งผลิตใหม่ modal now uses explicit required placeholders; `สินค้าที่ผลิต` uses the shared searchable combobox and searches by product code/name.
- `คลัง WIP` now derives from the selected branch: one active WIP warehouse is auto-filled and locked, no active WIP warehouse blocks save, and multiple WIP warehouses require explicit selection.
- Selected target product stock preview in the create modal is implemented for explicit `สาขา + สินค้าที่ผลิต + คลังรับผลผลิต`.
- Input and Output modal product fields now use searchable comboboxes over active product master code/name.
- Logged-in browser QA passed on 2026-06-12 for full UI click flow: create -> input round 1 -> input round 2 in the same modal -> output round 1 -> output round 2 with loss/complete -> reverse-block -> reconciliation. Result doc: `PO2606-0021`.
- Stock reconciliation follow-up on 2026-06-12 repaired the WIP-side product dimension for active production ledger rows and hardened runtime WIP-side PI/PO2 writes to use `production_orders.product_id`; source/destination rows remain line-product specific.
- Legacy parity confirmed: input/output are multi-round by repeated one-document modal saves from the order detail, not an in-modal editable multi-line grid.
- Production reconciliation is now surfaced in `/production/reconciliation` as a read-only report over active `PI/PO2` facts and stock ledger checks.

## Implementation Checklist

- [x] Verify current Next page/component against this page-flow
- [x] Verify API route handlers match Current API and status rules above
- [x] Verify legacy behavior for simplified MVP write flow before implementing runtime change
- [x] Follow [[Production Order DB API Design]] before enabling write APIs
- [x] Add/adjust tests or browser QA checklist before claiming end-to-end production write completion
- [x] Update this file and canonical reference if contract changes
