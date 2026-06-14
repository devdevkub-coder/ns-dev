---
title: Cost Pool Page Flow
tags:
  - page-flow
  - menu
  - dual-costing
status: accepted-baseline
updated: 2026-06-11
route: /dual-costing/cost-pool
---

# Cost Pool Page Flow

## Scope

| Field | Value |
|---|---|
| Menu section | Dual Costing |
| Route | `/dual-costing/cost-pool` |
| Page | Cost Pool |
| Current Next | accepted code baseline with target-rule gaps |

## Canonical References

[[Dual Costing Flow]], [[Cost Pool]], [[PO Buy Page Flow]], [[Purchase Bills Page Flow]]

## Legacy Baseline

Legacy view `view-costPool` อ่านจาก `erp.buildCostPool()` แล้ว filter เฉพาะ `erp.isDualCostingProduct(product_id)` ซึ่งผูกกับ `DUAL_COSTING_GROUPS = ['ทองแดง', 'ทองเหลือง']`

Legacy helper `buildCostPool()` สร้าง pool จาก:

| Source | Legacy behavior |
|---|---|
| `PO_Buy` | PO Buy ที่ไม่ cancelled เข้า pool เป็น cost candidate แม้ยังไม่ใช่ stock จริง |
| `Spot_Buy` | purchase bill items เข้า pool เป็น spot cost source |
| `matchLogs` | ใช้คำนวณ `used_qty`, `available_qty`, `available_value`, `status` |

Legacy UI มี filter `สินค้า`, `Cost Type`, `Source`, `สถานะ`, `sortMode`, และ checkbox `แสดงเฉพาะ Available`

## Target Flow

Cost Pool คือ read model ของต้นทุนที่พร้อมให้ Cost Allocator ใช้จับคู่ดีล ไม่ใช่ stock จริงและไม่ใช่ WAC

Target rule ล่าสุดหลังเทียบ legacy:

- สินค้าเข้า Cost Pool ได้เฉพาะ `ทองแดง`, `ทองเหลือง`, `copper`, `brass`
- source ที่เข้า Cost Pool ตาม legacy คือ `PO_Buy`, `Spot_Buy` จาก Purchase Bill item, `Production`, และ `Regrade`
- PB line ที่อ้าง PO ยังแสดงเป็น `Spot_Buy` ได้ตาม legacy baseline; duplicate prevention ต้องแก้ด้วย durable allocation/cost-deducted policy ไม่ใช่ตัด row เงียบ ๆ ใน read model
- `Production` และ `Regrade` แสดงเป็น cost type ของ Cost Pool ถ้ามี normalized stock cost pool entry ที่ eligible
- ส่วนลดท้ายบิลไม่ลด unit cost ใน Cost Pool
- WTI ไม่มีผลกับ Cost Pool โดยตรง; PB เป็นจุดที่ต้นทุนซื้อเกิดจริงสำหรับ Spot/No PO

## Page Responsibilities

- แสดงต้นทุน candidate เฉพาะทองแดง/ทองเหลือง
- แสดง source type, source no, counterparty, product, original qty, matched qty, available qty, unit cost, available value และ status
- แสดง summary ตาม cost/source/status ที่ filter อยู่
- export XLSX ด้วย row set เดียวกับตาราง
- ช่วย user ตรวจว่ามีต้นทุนเหลือพอสำหรับ allocation หรือไม่

## Non-Responsibilities

- ไม่สร้าง stock movement
- ไม่อนุมัติหรือจ่ายเงิน
- ไม่แก้ PO/PB/WTI โดยตรง
- ไม่คำนวณ WAC หรือปิดงบ
- ไม่เป็น source of truth ของ match history; match usage ต้องมาจาก allocation log หรือ `trading_deals`/future ledger

## Lifecycle / Read Flow

| Step | User action | System result |
|---|---|---|
| 1 | เปิดหน้า | โหลด Cost Pool rows จาก API |
| 2 | เลือก product/source/status/cost type | API/client filter เฉพาะ candidate ที่ตรง |
| 3 | toggle available only | ซ่อน `Fully Used` หรือ available qty <= 0 |
| 4 | เลือก sort | FIFO/LIFO/Cheap/Expensive |
| 5 | Export | ส่งออก XLSX ด้วย filter ปัจจุบัน |

## API / Data Contract

### Current API

- `GET /api/dual-costing/cost-pool`

Current query params:

- `q`
- `productId`
- `costType`
- `sourceType`
- `status`
- `availableOnly`
- `sort`
- `from`
- `to`
- `format=xlsx`

Current source tables/routes:

- `po_buys`
- `purchase_bills` + `purchase_bill_items`
- `stock_cost_pool_entries` สำหรับ `Production` / `Regrade`
- `trading_deals` for usage reduction
- `products`
- `branches`

### Required Row Fields

| Field | Meaning |
|---|---|
| `costPoolId` | stable row id for UI/export |
| `costType` | `Purchase`, `Production`, or `Regrade` |
| `sourceType` | `PO_Buy`, `Spot_Buy`, `Production`, or `Regrade` |
| `sourceNo` | outward document no such as `POB...` or `PB...` |
| `date` | source document date |
| `counterparty` | supplier/counterparty name snapshot/display |
| `branchName` | branch display |
| `productId` / `productName` | outward product code/name |
| `qty` | original source qty |
| `usedQty` | qty already allocated |
| `availableQty` | `qty - usedQty - releasedQty` |
| `unitCost` | cost per unit from source line |
| `availableValue` | `availableQty * unitCost` |
| `status` | `Available`, `Partially Used`, `Fully Used` |

## Validation / Status Rules

- Backend must filter eligible products by `products.metal_group`.
- Backend must not send non-copper/brass rows to UI/export.
- `availableQty` must never be negative.
- Cancelled/reversed PO/PB must be excluded from available view.
- Short-close PO must release remaining undelivered qty.
- PB Spot source follows legacy Purchase Bill item visibility; final duplicate/cost-deducted policy remains a durable allocation decision.
- Export must use exactly the same filters as the screen.

## Side Effects

Read-only. No stock, payment, AP/AR, PO/PB status, or bank statement side effects.

## Current Code Baseline

- Current API is implemented and protected by `finance.cash.view`.
- Current route returns a useful read model and XLSX export.
- 2026-06-14 runtime now enforces target eligibility for all Cost Pool rows and restores the legacy source breadth for PB/Production/Regrade read visibility.

## Current Gap

- Current usage reduction relies on `trading_deals` / normalized stock cost-pool allocated qty depending on source; durable allocation ledger is still future work.

## Implementation Checklist

- [x] Legacy flow inspected
- [x] Current API identified
- [x] Enforce copper/brass eligibility in API
- [x] Restore legacy Production/Regrade read visibility where normalized pool entries exist
- [x] Keep PB item visibility aligned with legacy Spot Buy behavior
- [ ] Add/reconcile durable allocation usage source
