---
title: Cost Allocator Page Flow
tags:
  - page-flow
  - menu
  - dual-costing
status: accepted-baseline
updated: 2026-07-27
route: /dual-costing/cost-allocator
---

# Cost Allocator Page Flow

## Scope

| Field | Value |
|---|---|
| Menu section | Dual Costing |
| Route | `/dual-costing/cost-allocator` |
| Page | Cost Allocator (ทอง/เหลือง) |
| Current Next | active allocation flow with confirm |

## Canonical References

[[Dual Costing Flow]], [[Cost Pool]], [[PO Sell Flow]], [[Sales Bills Page Flow]]

## Legacy Baseline

Legacy view `view-costAllocator` เป็น match engine สำหรับสินค้า dual-costing เท่านั้น โดย flow หลักคือ:

1. เลือกแหล่งขาย: `PO_SELL` หรือ `SPOT_SELL`
2. เลือกสินค้า eligible
3. เลือก PO Sell หรือ Sales Bill item ที่ยังค้าง allocate
4. เลือก allocation mode: `FIFO`, `Cheap`, `Expensive`, `Manual`
5. ระบบ preview lot จาก Cost Pool
6. User ปรับ qty ได้
7. กดยืนยันเพื่อสร้าง `matchLogs`

Legacy มี manual target-cost algorithm ที่พยายามผสม lot แพง/ถูกให้ weighted average ใกล้ราคาต้นทุนเป้าหมาย และมี guard ไม่ให้ allocate เกิน remaining need

Decision 2026-06-23: target flow ใหม่ตัด match บางส่วนออก จึงต้อง allocate เต็มจำนวน target row เท่านั้น

## Target Flow

Cost Allocator เป็นหน้าตัดสินใจจับคู่ต้นทุนกับดีลขาย ไม่ใช่หน้าบันทึก stock หรือ P&L

Target write behavior เมื่อ implement จริง:

- allocate ได้เฉพาะ Cost Pool rows ที่ eligible และ available
- target คือ `PO Sell` หรือ `Spot Sell` ของสินค้า eligible
- allocation must equal target required qty
- allocation must not exceed pool available qty
- ถ้า Cost Pool available qty ไม่พอครบ target required qty ต้องห้าม Confirm
- confirm ต้องสร้าง durable allocation/match log แบบ append-only
- edit/delete ต้องเป็น reverse + recreate ไม่แก้/ลบ history ตรง ๆ

## Page Responsibilities

- แสดง product list เฉพาะทองแดง/ทองเหลืองที่มี target หรือ pool
- แสดง Cost Pool summary ของสินค้าที่เลือก
- แสดง target sale rows ที่ยังค้าง allocate
- preview lots ตาม allocation mode
- แสดง expected revenue, total cost, expected margin
- เปิดทางให้ confirm allocation จาก preview ปัจจุบัน
- validate ว่า preview รวมครบ target qty ก่อนเปิดให้ Confirm

## Non-Responsibilities

- ไม่สร้าง/แก้ Sales Bill หรือ PO Sell
- ไม่สร้าง stock ledger
- ไม่คำนวณ WAC
- ไม่แก้ GL/P&L
- ไม่ reverse allocation แบบแก้ history ตรง ๆ

## Lifecycle / Read Flow

| Step | User action | System result |
|---|---|---|
| 1 | เปิดหน้า | โหลด Cost Pool + PO Sell/SB target candidates |
| 2 | เลือกสินค้า | แสดง pool summary และ target list ของสินค้านั้น |
| 3 | เลือก target | คำนวณ target qty ที่ต้อง allocate เต็มจำนวน |
| 4 | เลือก mode | ระบบคำนวณ preview lots จาก Cost Pool |
| 5 | Preview | ระบบต้องเลือก Cost Pool lots ให้ครบ target qty; โหมดอัตโนมัติเปิด preview ทันทีหลังเลือก target ส่วน `Manual` ต้องกดคำนวณก่อน |
| 6 | ถ้า Cost Pool ไม่พอ | disable Confirm และแจ้งว่า Cost Pool ไม่เพียงพอ |
| 7 | Confirm | write durable allocation log แบบ full match |

## API / Data Contract

### Current API

- `GET /api/dual-costing/cost-allocator`
- `POST /api/dual-costing/cost-allocator`

Current query params:

- `sourceType` (`spot-sell` default, or `po-sell`)
- `productId`
- `poSellId` (target id; for `spot-sell` this is `SB_DOC_NO:lineNo`)
- `mode`

Current source:

- reads `GET /api/dual-costing/cost-pool?availableOnly=true`
- reads `sales_bills` + `sales_bill_lines` for Spot Sell/no-PO targets
- reads `po_sells` for legacy PO Sell target mode
- reads `trading_deals`, `products`

Required payload groups:

| Group | Meaning |
|---|---|
| `products` | eligible product options |
| `salesRows` | Spot Sell/no-PO or PO Sell target candidates, depending on `sourceType` |
| `poolRows` | available Cost Pool rows |
| `candidates` | preview rows with `qtyToUse` / cost |
| `summary` | pool qty/value, target remaining, expected margin |

Current behavior 2026-07-08:

- `FIFO`, `LIFO`, `Cheap`, `Expensive` เป็น auto-preview mode; เมื่อเลือก target แล้ว preview และปุ่ม `ยืนยันการจับคู่` ต้องแสดงอัตโนมัติ
- `Manual` เป็น explicit-preview mode; ผู้ใช้ต้องกรอกราคาต้นทุนเป้าหมายและกด `คำนวณ Match อัตโนมัติ` ก่อนจึงจะเห็น preview/confirm
- การกด Confirm จะส่ง candidate rows ที่ preview อยู่ไปยัง `POST /api/dual-costing/cost-allocator`

## Validation / Status Rules

- Product must be eligible by metal group.
- Candidate pool rows must come from filtered Cost Pool API.
- `qtyToUse` cannot exceed pool row `availableQty`.
- total `qtyToUse` must equal target required qty before Confirm.
- mode must be one of `FIFO`, `LIFO`, `Cheap`, `Expensive`, `Manual`.
- auto modes must expose preview/confirm immediately after target selection; `Manual` must require explicit calculate first.
- Confirm write must be idempotent and create an auditable `matchId`.
- If multiple Cost Pool rows have equal priority in the selected mode, tie-break by oldest incoming row/doc first.
- One Confirm creates one shared `matchId` for every selected lot; each fact keeps a unique allocation number and the exact Cost Pool entry ID used.
- The server reads product/source/lot unit cost from Cost Pool inside the transaction. Client-preview cost is display-only and cannot decide posted cost.
- The server serializes Match ID creation and rejects a Cost Pool row from a different product or an unauthorized branch.
- The server validates the exact current target quantity after taking the allocation lock. Candidate quantities must equal the target's latest unallocated quantity; stale previews, product mismatches, completed production orders, and unavailable/released Cost Pool quantity are rejected before any write.
- New PO Sell facts persist `target_ref_id` with the exact `po_sell_id-line_id` used by the target selector. This is the only reference used when Allocation Ledger opens `แก้ไข`.

## Side Effects

Current Next confirm:

- create allocation/match log rows
- reduce available qty in derived Cost Pool through allocation facts
- update report/read models
- mark/exclude target from Waiting Allocations because target allocation is complete
- do not touch stock ledger or WAC

## Current Code Baseline

- Current API/page supports confirm allocation and is protected by `finance.cash.view`.
- Current API delegates pool eligibility to Cost Pool API, so Cost Pool hardening is prerequisite.
- 2026-06-14 runtime opens `spot-sell` read targets from Sales Bill lines with no active PO allocation and non-Trading transaction mode. This is the default mode per latest requirement.
- 2026-07-08 runtime behavior: non-Manual modes (`FIFO`, `LIFO`, `Cheap`, `Expensive`) auto-open preview when a target is selected so the confirm action is visible without extra user input; `Manual` still requires explicit calculation first.
- 2026-07-27 NSERP-159: confirmation writes `cost_pool_entry_id` to each `trading_allocation_facts` row and stores the same Match ID on all related deals. This preserves an exact reverse path without guessing from document number/line.
- 2026-07-27 NSERP-159 hardening: confirmation uses one shared L5 advisory lock with reverse, validates current target/product/production status inside the transaction, and derives source document, supplier snapshot, source type, and unit cost from the persisted Cost Pool row only.
- Cost Allocator responses are `private, no-store` because pool availability and allocation facts are L5 business data.

## Current Gap

- None for confirm visibility flow. Match Confirmation and stable FIFO sorting tie-breakers are implemented; non-Manual modes now show preview/confirm automatically.
- Partial target allocation is intentionally out of scope for the latest flow.

## Implementation Checklist

- [x] Legacy allocator flow inspected
- [x] Current simulation API identified
- [x] Open Spot Sell/no-PO target read path
- [x] Implement durable allocation table/log (using `trading_deals` and `trading_allocation_facts`)
- [x] Add confirm allocation endpoint (`POST /api/dual-costing/cost-allocator`)
- [x] Add reverse/recreate edit policy
- [x] Revisit manual target-cost mode and sort pool lots correctly when mode is selected
- [x] Make non-Manual modes show preview and confirm action automatically after target selection
- [x] Confirm target policy: full match only, no partial target allocation
