---
title: Cost Pool
aliases:
  - Dual Costing Cost Pool
  - ต้นทุนรอจับคู่ดีล
  - Cost Pool / Deal Costing
tags:
  - ns-scrap-erp
  - dual-costing
  - purchase
  - business-flow
  - decision
status: draft
created: 2026-06-07
updated: 2026-06-11
---

# Cost Pool / ต้นทุนสำหรับ Cost Allocator

เอกสารนี้เป็น source of truth ของกติกา Cost Pool ในระบบเป้าหมาย แยกออกจาก [[Purchase Flow]] เพื่อไม่ให้กติกา dual costing ปนกับ stock, purchase bill, หรือ payment flow

## คำจำกัดความ

Cost Pool คือแหล่งต้นทุนที่ Cost Allocator ใช้ตัด/จัดสรรต้นทุนให้ดีลขายใน Dual Costing เท่านั้น ไม่ใช่ stock จริง และไม่ใช่ WAC ของ stock ledger

| เรื่อง | กติกา |
|---|---|
| ใช้ทำอะไร | เก็บต้นทุน lot/source ที่ยัง available เพื่อให้ Cost Allocator ตัดต้นทุนกับ PO Sell หรือดีลขาย |
| ไม่ใช่อะไร | ไม่ใช่ Stock On Hand, ไม่ใช่ WAC, ไม่ใช่ GL/statutory cost |
| สินค้าที่เข้าได้ | เฉพาะสินค้ากลุ่มทองแดง/ทองเหลือง |
| ตัวตัดสินสินค้า | `products.metal_group` หรือ field equivalent |
| eligible keywords | `ทองแดง`, `ทองเหลือง`, `copper`, `brass` |
| owner flow | Cost Allocator / Dual Costing |

## Eligibility ของสินค้า

Cost Pool ต้องรับเฉพาะสินค้า eligible กลุ่มทองแดง/ทองเหลือง:

- `products.metal_group` มีคำว่า `ทองแดง`
- `products.metal_group` มีคำว่า `ทองเหลือง`
- `products.metal_group` มีคำว่า `copper`
- `products.metal_group` มีคำว่า `brass`

กติกานี้ต้องบังคับใน backend/service/API ที่สร้างหรืออ่าน Cost Pool ไม่ใช่แค่ซ่อนใน UI

สินค้ากลุ่มอื่นยังซื้อเข้า stock ได้ตามปกติ แต่ต้องไม่เข้า Cost Pool และต้องไม่ถูกส่งไปให้ Cost Allocator

## Legacy Evidence

Legacy กำหนด scope ของ Dual Costing ไว้เฉพาะทองแดง/ทองเหลือง:

```text
DUAL_COSTING_GROUPS: ['ทองแดง', 'ทองเหลือง']
isDualCostingProduct(productId) => products.metalGroup อยู่ใน DUAL_COSTING_GROUPS
```

หน้า legacy ที่ยืนยันกติกานี้:

- `view-costPool` filter `erp.buildCostPool()` ด้วย `erp.isDualCostingProduct(product_id)`
- `view-costAllocator` จำกัดทั้ง `PO_SELL` และ `SPOT_SELL` ให้เลือกเฉพาะสินค้า dual-costing
- `view-waitingAllocations` แสดง queue สินค้าทองแดง/ทองเหลืองที่ยังค้าง allocate
- เมนู legacy ใช้ label `Cost Allocator (ทอง/เหลือง)`

ดังนั้น target ต้องถือว่า eligibility เป็น business rule ไม่ใช่ UI preference

## Source Types

Source ที่เข้า Cost Pool ใน target scope ปัจจุบันมีแค่ 2 ประเภท:

| Source type | เข้า Cost Pool เมื่อไหร่ | Qty/Cost ที่ใช้ | เงื่อนไขตัดออก |
|---|---|---|---|
| `PO_Buy` | เมื่อสร้าง PO Buy ของสินค้า eligible | ยอด PO ที่ยัง available ตาม line/product | PO cancelled, `cost_deducted=true`, short-close remaining, หรือถูก allocate/match แล้ว |
| `Spot_Buy` | เมื่อบันทึกบิลรับซื้อ Stock แบบไม่มี PO / No PO ของสินค้า eligible | ยอด line ของ PB ที่เป็น Spot Buy ก่อนส่วนลดท้ายใบ | PB cancelled/reversed หรือถูก allocate/match แล้ว |

หมายเหตุสำคัญ: `PO_Buy` เป็น reserve cost candidate ตั้งแต่สร้าง PO ไม่ใช่ stock จริง ส่วน `Spot_Buy` คือบิลรับซื้อ Stock ที่ไม่มี PO ให้ตัดยอดและเป็นต้นทุนซื้อจริงจาก PB line

Clarification 2026-06-13: กติกาในเอกสารนี้เป็น Cost Pool สำหรับ Dual Costing / Cost Allocator เท่านั้น ส่วน `/stock/convert` ใช้ตาราง operational `stock_cost_pool_entries`/`stock_cost_pool_allocations` เพื่อ trace Grade Adjustment source lot -> target regrade lot แยกจาก allocator scope นี้

Source ที่ไม่เข้า Cost Pool ใน target scope ปัจจุบัน:

- PB line ที่อ้าง `PO Buy` ไม่สร้าง Cost Pool source เพิ่ม เพราะ PO Buy เข้า pool ตั้งแต่สร้าง PO แล้ว; PB ทำหน้าที่ตัด/reconcile PO usage เท่านั้น
- `Trading + PO` และ `Trading + Spot` ไม่เข้า Cost Pool
- `Production` และ `Regrade` ไม่ใช่ source เข้า Cost Pool ในรอบ target rule นี้ เว้นแต่มี decision ใหม่แยกต่างหาก

## กติกาตาม Flow ซื้อ

| กรณี | เข้า Stock | เข้า Cost Pool | หมายเหตุ |
|---|---:|---:|---|
| PO Buy สินค้าทองแดง/ทองเหลือง | ยังไม่ใช่ stock | ใช่ | เข้า pool เป็น reserve candidate ตั้งแต่สร้าง PO |
| Stock PB แบบ Spot Buy / No PO สินค้าทองแดง/ทองเหลือง | ใช่ | ใช่ | เข้า pool จากบิลรับซื้อที่ไม่มี PO |
| Stock PB ที่อ้าง PO Buy | ใช่ | ไม่สร้าง source ใหม่ | ตัด/reconcile PO Buy candidate เดิม |
| Stock สินค้าอื่น | ใช่ | ไม่ | เข้า stock ledger/WAC เท่านั้น |
| Trading + PO | ไม่ | ไม่ | ใช้ Trading Matching ไม่ผ่าน stock/cost pool |
| Trading + Spot | ไม่ | ไม่ | ใช้ Trading Matching ไม่ผ่าน stock/cost pool |

## Availability และสถานะ

Cost Pool availability ต้องคำนวณจาก source rows ที่ยัง active เท่านั้น:

```text
available_qty = original_qty - allocated_qty - released_qty
available_value = available_qty * unit_cost
```

สถานะที่อ่านได้:

| สถานะ | ความหมาย |
|---|---|
| `Available` | ยังไม่ถูกใช้ |
| `Partially Used` | ถูก match/allocate ไปบางส่วน |
| `Fully Used` | ถูกใช้ครบแล้ว |
| `Released` | ถูกตัดออกจาก pool เช่น short-close remaining หรือ source ถูก reverse |
| `Cancelled` | source document ถูกยกเลิก |

รายการที่ `Released` หรือ `Cancelled` ไม่ควรถูกเสนอให้ Cost Allocator ใช้งาน แม้อาจเก็บไว้ใน history/report ได้

## ผลของเอกสารต้นทาง

| เหตุการณ์ | ผลต่อ Cost Pool |
|---|---|
| สร้าง PO Buy eligible | เพิ่ม `PO_Buy` candidate ตามยอด PO |
| แก้ PO Buy ก่อนรับของ | ปรับ candidate ตาม line/product ล่าสุด |
| ยกเลิก PO Buy ที่ยังไม่รับ | เอา candidate ออกจาก available |
| ปิด PO แบบ `ปิดรับไม่ครบ` | release เฉพาะ remaining qty/amount ที่ยังไม่ได้รับของสินค้า eligible |
| บันทึก WTI | ไม่มีผลต่อ Cost Pool โดยตรง เพราะ WTI คือรับของจริง ยังไม่ใช่ต้นทุน invoice |
| บันทึก PB Stock + Spot Buy / No PO eligible | เพิ่ม `Spot_Buy` source จาก PB line |
| บันทึก PB Stock + PO eligible | ตัด/reconcile PO usage; ไม่เพิ่ม Cost Pool source ใหม่ |
| ยกเลิก PB Spot Buy / No PO | reverse `Spot_Buy` source และ recalc WTI usage จาก active allocation |
| ยกเลิก PB ที่อ้าง PO | คืน/recalc PO usage จาก active allocation; ไม่สร้าง PB source ใหม่ |
| ส่วนลดท้ายบิล | ห้ามลดต้นทุนสินค้า, WAC, stock ledger, หรือ Cost Pool |
| PMA/PMT payment | ไม่มีผลต่อ Cost Pool โดยตรง; ใช้ lock/cancel guard ของ PB เท่านั้น |

## Source of Truth

| เรื่อง | Source of truth |
|---|---|
| Product eligibility | `products.metal_group` |
| PO candidate | `po_buys` + `po_buy_status_logs` + `po_buy_allocation_logs` |
| Spot Buy purchase lines | `purchase_bills` + `purchase_bill_items` ตาม legacy visibility; duplicate/cost-deducted policy ต้องอยู่ใน durable allocation decision |
| Production/Regrade cost rows | `stock_cost_pool_entries` ที่มี source เป็น `Production` หรือ `Regrade` และ product eligible |
| PB -> WTI usage | `purchase_bill_receipt_allocations` + `weight_ticket_usage_logs` |
| PB -> PO usage | `purchase_bill_po_allocations` + `po_buy_allocation_logs` |
| Stock actual movement | `stock_ledger` |
| Match/allocation usage | `trading_deals` หรือ allocation table เฉพาะ Dual Costing |
| Document history | history table แยกตาม [[Document History Table Design]] |

## UI/API Contract

- `/dual-costing/cost-pool` ต้องแสดงเฉพาะสินค้า eligible
- `/api/dual-costing/cost-pool` ต้อง filter eligible ใน backend ก่อนคำนวณ summary, filters, export, และ rows
- `/api/dual-costing/cost-pool` แสดง PB purchase item visibility ตาม legacy `Spot_Buy`; ห้ามตัด row เงียบ ๆ จาก `po_buy_id` โดยไม่มี durable allocation policy
- `/dual-costing/cost-allocator` ต้องรับ candidate จาก Cost Pool ที่ถูก filter แล้วเท่านั้น
- Product filter ในหน้า Cost Pool ต้องมีเฉพาะ product eligible ที่มี source rows
- Export Excel ต้องใช้ row set เดียวกับหน้าจอ ไม่ export สินค้านอกกลุ่ม
- หน้า PO Buy ยังสร้าง PO สินค้ากลุ่มอื่นได้ แต่สินค้าเหล่านั้นต้องไม่ถูกนับใน Cost Pool

## Runtime Status

สถานะตรวจล่าสุด 2026-06-14:

- `/api/dual-costing/cost-pool` enforce `products.metal_group` eligibility แล้ว โดยรับเฉพาะ `ทองแดง`, `ทองเหลือง`, `copper`, `brass`
- `/api/dual-costing/cost-pool` ส่ง `Production` และ `Regrade` จาก normalized `stock_cost_pool_entries` เมื่อ product eligible
- `/api/dual-costing/cost-pool` แสดง `Spot_Buy` จาก PB items ตาม legacy visibility
- `/dual-costing/cost-pool` และ export XLSX ใช้ row set เดียวกันจาก API

Remaining gap: usage reduction ยังอิง `trading_deals`; durable allocation ledger ยังเป็นงานอนาคต

## Acceptance Criteria

- สร้าง PO Buy สินค้าทองแดง/ทองเหลืองแล้วเห็น candidate ใน Cost Pool
- สร้าง PO Buy สินค้าอื่นแล้วไม่เห็นใน Cost Pool
- บันทึก PB Stock + Spot Buy / No PO สินค้าทองแดง/ทองเหลืองแล้วเข้า Cost Pool
- บันทึก PB Stock + Spot Buy / No PO สินค้าอื่นแล้วเข้า stock/WAC แต่ไม่เข้า Cost Pool
- บันทึก PB Stock ที่อ้าง PO Buy แล้วยังเห็น PB item ตาม legacy visibility จนกว่าจะมี durable duplicate/cost-deducted policy
- Cost Allocator ไม่เสนอสินค้านอกทองแดง/ทองเหลือง
- ปิด PO แบบส่งของไม่ครบต้อง release remaining eligible qty ออกจาก Cost Pool
- ยกเลิก PB ต้อง reverse/recalc Cost Pool usage โดยไม่ rewrite history
- ส่วนลดท้ายบิลไม่เปลี่ยน Cost Pool unit cost
