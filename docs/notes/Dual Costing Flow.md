---
title: Dual Costing Flow
aliases:
  - Dual Costing Module Flow
  - Cost Allocator Flow
  - ระบบจองดีลทองแดงทองเหลือง
tags:
  - ns-scrap-erp
  - dual-costing
  - business-flow
  - legacy-baseline
status: draft
created: 2026-06-11
updated: 2026-06-11
---

# Dual Costing Flow

เอกสารนี้เป็นภาพรวมหมวด `Dual Costing (จองดีล)` ของระบบใหม่ โดยอ่านจาก legacy เป็น baseline และผูกกลับกับเมนู active ใน Next เท่านั้น

## Scope ของหมวด

Dual Costing คือระบบจัดสรรต้นทุนจริงจาก lot/source ซื้อไปจับคู่กับดีลขาย เพื่อดู margin แบบ deal-by-deal สำหรับผู้บริหาร โดยเฉพาะสินค้า `ทองแดง` และ `ทองเหลือง`

Legacy ระบุ core rule ชัดเจน:

```text
DUAL_COSTING_GROUPS = ['ทองแดง', 'ทองเหลือง']
isDualCostingProduct(productId) => products.metalGroup อยู่ใน DUAL_COSTING_GROUPS
```

ดังนั้นทุกหน้าในหมวดนี้ต้องถือว่า product eligibility คือ `ทองแดง / ทองเหลือง / copper / brass` เท่านั้น และต้อง enforce ที่ backend ไม่ใช่แค่ซ่อนใน UI

## ไม่ใช่อะไร

- ไม่ใช่ `stock on hand`
- ไม่ใช่ `stock_ledger`
- ไม่ใช่ WAC หรือ COGS สำหรับปิดงบ
- ไม่ใช่ GL/statutory accounting
- ไม่ควรแก้ stock, bank statement, AP/AR หรือสถานะเอกสารซื้อขายโดยตรง

Legacy ย้ำหลายหน้าว่า `P&L / งบกำไรขาดทุน ใช้ WAC เสมอ` ส่วน Dual Costing เป็น management view สำหรับดูต้นทุนดีล

## Menu Scope ใน Next

| Route | Menu | Detailed file |
|---|---|---|
| `/dual-costing/cost-pool` | Cost Pool | [[page-flows/dual-costing-dual-costing-cost-pool|Cost Pool Page Flow]] |
| `/dual-costing/cost-allocator` | Cost Allocator (ทอง/เหลือง) | [[page-flows/dual-costing-dual-costing-cost-allocator|Cost Allocator Page Flow]] |
| `/dual-costing/waiting-allocations` | Waiting Allocations | [[page-flows/dual-costing-dual-costing-waiting-allocations|Waiting Allocations Page Flow]] |
| `/dual-costing/cost-allocation-ledger` | Allocation Ledger | [[page-flows/dual-costing-dual-costing-cost-allocation-ledger|Allocation Ledger Page Flow]] |
| `/dual-costing/report` | Dual Costing Report | [[page-flows/dual-costing-dual-costing-report|Dual Costing Report Page Flow]] |
| `/dual-costing/match-log` | Match Log | [[page-flows/dual-costing-dual-costing-match-log|Match Log Page Flow]] |
| `/dual-costing/deal-margin` | Deal Margin Report | [[page-flows/dual-costing-dual-costing-deal-margin|Deal Margin Page Flow]] |
| `/dual-costing/compare-margin` | Compare Deal vs Stock | [[page-flows/dual-costing-dual-costing-compare-margin|Compare Margin Page Flow]] |

Legacy มี `PO Buy` และ `PO Sell` อยู่ในหมวด Dual Costing ด้วย แต่ Next ย้ายไปอยู่หมวด `รายการประจำวัน`; flow รายหน้าถูกแยกไว้ที่ [[PO Buy Page Flow]] และ [[PO Sell Flow]]

## Core Data Flow

```mermaid
flowchart LR
  POB["PO Buy eligible\nทองแดง/ทองเหลือง"] --> CP["Cost Pool"]
  SPOT["Stock PB Spot / No PO eligible"] --> CP
  CP --> CA["Cost Allocator"]
  POS["PO Sell eligible"] --> CA
  SBSPOT["Spot Sales Bill eligible"] --> WA["Waiting Allocations"]
  WA --> CA
  CA --> ML["Match Log"]
  ML --> LEDGER["Allocation Ledger"]
  LEDGER --> DCR["Dual Costing Report"]
  LEDGER --> DM["Deal Margin"]
  DCR --> CMP["Compare Deal vs Stock"]
  SBWAC["Sales Bill WAC/COGS"] --> CMP
```

## Target Cost Pool Source Decision

Target scope ล่าสุดใช้ source เข้า Cost Pool เฉพาะ:

| Source | เข้า Cost Pool | หมายเหตุ |
|---|---:|---|
| `PO_Buy` eligible | ใช่ | เป็น reserve cost candidate ตั้งแต่สร้าง PO |
| `Stock PB Spot / No PO` eligible | ใช่ | เป็นต้นทุนซื้อจริงจาก PB line ที่ไม่มี PO |
| PB line ที่อ้าง PO | ไม่สร้าง source ใหม่ | ใช้/reconcile `PO_Buy` candidate เดิม |
| Trading purchase | ไม่ | ใช้ trading/matching flow แยก |
| Production | ไม่ใน target รอบนี้ | legacy เคยมี cost type/report queue แต่ต้องมี decision ใหม่ก่อนนำกลับ |
| Regrade / Grade Adjustment | ไม่ใน target รอบนี้ | legacy เคยมี cost type/report queue แต่ต้องมี decision ใหม่ก่อนนำกลับ |

หมายเหตุ: legacy UI บางหน้าแสดง `Production` และ `Regrade` เป็น cost type หรือ waiting queue แต่ target ล่าสุดของเอกสาร [[Cost Pool]] จำกัด source ที่เข้า pool ไว้ที่ `PO_Buy` และ `Spot_Buy / No PO PB` เพื่อไม่ให้ต้นทุนผลิต/ปรับเกรดปนกับรอบจองดีลก่อน policy ชัด

Clarification 2026-06-13: `stock_cost_pool_entries` ที่ใช้โดย `/stock/convert` เป็น operational Grade Adjustment cost pool สำหรับ trace source lot -> target regrade lot ภายใน stock convert เท่านั้น ไม่ได้เปลี่ยน scope ของ Dual Costing Cost Allocator ซึ่งยังจำกัด source ตามตารางนี้จนกว่าจะมี decision แยก

## Allocation Status

| Status | Meaning |
|---|---|
| `Available` | Cost Pool row ยังไม่ถูกใช้ |
| `Partially Used` | ถูก match ไปบางส่วน |
| `Fully Used` | ถูกใช้ครบ |
| `pending_allocation` | รายการขาย eligible ยังไม่ถูก allocate ต้นทุน |
| `partially_allocated` | รายการขายถูก allocate บางส่วน |
| `approved` | match/allocation active |
| `reversed` | match ถูก reverse และต้องคืน available qty |

## Current Next API Map

| Route | Current API | Current source |
|---|---|---|
| `/dual-costing/cost-pool` | `GET /api/dual-costing/cost-pool` | `po_buys`, `purchase_bills`, currently also `production_outputs`, `grade_adjustments`, `trading_deals` |
| `/dual-costing/cost-allocator` | `GET /api/dual-costing/cost-allocator` | `Cost Pool API`, `po_sells`, `sales_bills`, `trading_deals`, `products` |
| `/dual-costing/waiting-allocations` | `GET /api/dual-costing/waiting-allocations` | shared `buildDualCostingManagement()` from `sales_bills`, `trading_deals`, `products` |
| `/dual-costing/cost-allocation-ledger` | `GET /api/dual-costing/cost-allocation-ledger` | shared `buildDualCostingManagement()` from `trading_deals` |
| `/dual-costing/report` | `GET /api/dual-costing/report` | shared `buildDualCostingManagement()` |
| `/dual-costing/match-log` | `GET /api/dual-costing/match-log` | `trading_deals` as current read baseline |
| `/dual-costing/deal-margin` | `GET /api/dual-costing/deal-margin` | `trading_deals` |
| `/dual-costing/compare-margin` | `GET /api/dual-costing/compare-margin` | deal side `trading_deals`, stock side trading/PO-linked `sales_bills` |

## Implementation Gaps To Keep Visible

- `/api/dual-costing/cost-pool` must filter product eligibility by `products.metal_group`.
- `/api/dual-costing/cost-pool` must stop counting non-PO PB lines unless they are truly `Spot_Buy / No PO`.
- `/api/dual-costing/cost-pool` must exclude `Production` and `Regrade` from target Cost Pool until a new decision exists.
- Current `Cost Allocator` is read-only simulation; no durable allocation write API exists yet.
- Current `Match Log` and `Allocation Ledger` read from `trading_deals`; target needs a durable allocation ledger/match log when allocator write is implemented.
- Reverse/edit rules must be append-only or reverse-based; no physical delete of allocation history.
- Report formulas must always label whether they use Deal Cost or WAC.

## Related Docs

- [[Cost Pool]]
- [[PO Buy Page Flow]]
- [[PO Sell Flow]]
- [[Sales Bills Page Flow]]
- [[Stock Ledger and Stock Balance]]
- [[Document History Table Design]]
