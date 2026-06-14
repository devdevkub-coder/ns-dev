---
title: Trading Matching Page Flow
tags:
  - page-flow
  - menu
  - trading
status: accepted-baseline
updated: 2026-06-13
route: /trading/matching
---

# Trading Matching Page Flow

## Scope

| Field | Value |
|---|---|
| Menu section | Trading / PO Reports |
| Route | `/trading/matching` |
| Page | Trading Matching |
| Current Next | accepted code baseline |
| Canonical overview | [[Trading Flow]] |

## Canonical References

- [[Trading Flow]]
- [[Purchase Flow]]
- [[Sales Flow]]
- [[Document Timeline Policy]]
- [[Document History Table Design]]
- [[Menu Page Flow Catalog]]

## Updated Requirement Baseline

Update 2026-06-13: Trading Matching is not a standalone matching workbench anymore. The user must choose the Trading purchase/cost source while creating the Trading Sales Bill. This page is the allocation and margin read surface after that enforced match exists.

Source flow:

- Buy side: `PO Buy` / Trading purchase bill / cost source.
- Sell side: `PO Sell` -> Pending Sale -> Trading Sales Bill.
- User decision point: choose which cost lot/source is applied to which Trading sales bill before the sales bill reaches this page.
- System dimensions produced from that decision: allocation, expected GP, remaining quantity/cost, and exposure tracking.
- Downstream views: Allocation Ledger, Deal Margin, Waiting Allocation.
- Important business rule: a wrong Trading match makes margin wrong across the downstream system.

Legacy actions that must not be shown on this page:

- `ตรวจ Dup`
- `Pull จาก Cloud`
- `Recalc Cost`
- `+ จับคู่ใหม่`
- row-level `Reverse`

Reverse/correction must happen through the source Purchase Bill / Sales Bill correction flow, not from this report page.

## Page Responsibilities

- แสดง allocation rows ที่เกิดจาก Trading Sales Bill ซึ่งผูกกับ Trading cost source แล้ว
- ใช้ Sales Bill เป็น primary business reference; ไม่ใช้ `Deal No` เป็นคอลัมน์หลัก เพราะขั้นตอน match อ้างอิงบิลขาย
- แสดง Cost, Sales Amount, Expected GP, และ GP% (`GP / Sale Amount`)
- แสดง Trading purchase/cost source ที่ยังมี remaining cost ให้ตรวจต่อ
- แสดงทางไป Allocation Ledger, Deal Margin, และ Waiting Allocation
- Export allocation rows เป็น `.xlsx`

## Non-Responsibilities

- ไม่เขียน stock ledger หรือ WAC
- ไม่สร้าง bank statement, receipt, payment, PMA/PMT
- ไม่เปลี่ยน AP/AR/payment status ของ PB/SB
- ไม่ cleanup duplicate แบบ silent ใน read API
- ไม่เลือก allocation ใหม่จากหน้านี้
- ไม่ reverse allocation จากหน้านี้

## Current API

### `GET /api/trading/matching`

Permission: `finance.cash.view`

Query:

| Query | Meaning |
|---|---|
| `q` | ค้นหา PB no, SB no, supplier, customer, product |
| `status` | legacy-compatible query; current UI does not expose status filter |
| `from` | วันที่เริ่มต้น |
| `to` | วันที่สิ้นสุด |
| `format=xlsx` | export deal rows เป็น workbook |

Source tables:

- `purchase_bills` where `transaction_mode = 'TRADING'` and not `cancelled`
- `sales_bills` where `transaction_mode = 'TRADING'` and not `cancelled`
- `trading_allocation_facts` where `status = active`

Response:

| Field | Meaning |
|---|---|
| `purchases` | Trading purchase/cost source rows with `totalAmount`, `matchedAmount`, `remainingAmount`, `supplierName` |
| `sales` | Trading sales rows retained for API compatibility; current UI does not render a separate unmatched sales pane |
| `deals` | allocation rows with composite `id`, PB/SB refs, matched amounts, GP, GP%, and source snapshots |
| `summary` | active allocation count, gross profit, purchase/sales total and remaining |
| `filters.statuses` | legacy-compatible status list; current UI does not render status |

Export:

- `format=xlsx` returns `trading_matching.xlsx`
- Export rows use the same filtered allocation rows as JSON response
- Export columns intentionally omit `DealNo` and `Status`; Sales Bill is the primary reference

## Calculation Rules

- Purchase/cost remaining = PB ex-VAT total - active fact `matched_cogs`.
- Sales remaining = SB ex-VAT total - active fact `sales_amount`.
- Active matched amount excludes facts with `cancelled` / `reversed`.
- Expected GP = `matchedSalesAmount - matchedPurchaseAmount`.
- GP% = `Expected GP / matchedSalesAmount`.
- Deal row `id` is a deterministic composite to avoid duplicate React keys while the visible business reference is Sales Bill.
- Summary GP excludes cancelled deals in `grossProfit`.

## Status Rules

- Current page must not show a status donut, match-rate card, completed card, partial card, or status column.
- Normal rows that reach this page are already matched by the Trading Sales Bill flow and are treated as completed allocation facts for display.
- Cancelled/reversed facts are excluded from visible allocation totals.
- Corrections belong to the source Purchase Bill / Sales Bill flow and the audit ledger, not to inline reverse buttons on this page.

## Lifecycle / Read Flow

| Step | User action | System result |
|---|---|---|
| 1 | เปิดหน้า | โหลด allocation rows และ Trading purchase/cost source remaining |
| 2 | กรองวันที่/search | UI filters allocation rows, purchase remaining, and export consistently |
| 3 | ตรวจ margin | User sees Sales Amount, Cost, Expected GP, and GP% by Sales Bill |
| 4 | ตรวจ remaining cost | User sees only buy-side/cost-source rows still not fully matched |
| 5 | ไปหน้าต่อ | User opens Allocation Ledger, Deal Margin, or Waiting Allocation for audit/margin/pending views |
| 6 | Export | Export current filtered allocation rows only |

## Validation Rules

- PB/SB ต้องเป็น `transaction_mode = TRADING`
- PB/SB ที่ cancelled ต้องไม่ถูกนำเข้า active allocation totals
- Match amount จาก source flow ต้องไม่เกิน remaining active amount ของแต่ละฝั่ง
- Duplicate active `(purchase_bill_id, sales_bill_id)` ต้องถูกป้องกันหรือ update ตาม rule ที่กำหนดใน source write flow
- Reverse/correction ต้องไม่ hard-delete match fact และต้องถูก audit ผ่าน source bill/ledger flow

## Side Effects

- Current API: read-only/export only
- Source Sales Bill/Purchase Bill correction flow owns match write/reverse behavior
- ห้ามเขียน stock ledger, bank statement, payment/receipt, AP/AR settlement

## Current Gap

- Current API reads `trading_allocation_facts` as the normalized read model, with current legacy/current `trading_deals` backfilled by migration.
- Trading SB create now writes allocation facts directly for row-level Trading PB cost sources, and Trading SB cancel marks active facts cancelled.
- Source edit/correction flow still needs to update/cancel/recreate allocation facts without hard delete, and first-class non-PB Cost Pool sources still need a normalized source model.
- Current UI has no source Sales Bill/Purchase Bill edit drilldown.
- Need to define durable uniqueness when one Sales Bill can allocate against multiple cost sources.
- Need to reconcile whether Trading uses current `purchase_bills` source only or also a normalized Cost Pool source in the future data model.

## Implementation Checklist

- [x] Verify current GET/export API response shape
- [x] Record updated requirement: match enforced before this page via Trading Sales Bill flow
- [x] Remove legacy write/recalc/reverse controls from visible page requirements
- [x] Mark stock/bank/AP/AR side-effect boundaries
- [ ] Add source row links to PB/SB detail
- [x] Define and use normalized allocation fact read model for Trading PB-backed SB allocations
- [ ] Define duplicate/multi-source allocation model
