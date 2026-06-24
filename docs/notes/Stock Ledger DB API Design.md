---
title: Stock Ledger DB API Design
aliases:
  - Stock Ledger Database and API Design
  - Stock Reversal Contract
tags:
  - ns-scrap-erp
  - stock
  - db-design
  - api-design
  - ledger
status: draft
created: 2026-06-12
updated: 2026-06-23
---

# Stock Ledger DB API Design

เอกสารนี้เป็น design contract สำหรับ stock ledger / pending_out / reversal API ของ active Next app (`apps/next`) หลังเริ่ม runtime hardening รอบ 2026-06-12

## Design Goals

- `stock_ledger` เป็น movement source of truth และต้อง trace กลับเอกสารต้นทางได้
- `stock_holds` เป็น technical table ของ business state `pending_out / รอออก` สำหรับ outbound stock ก่อนเกิด movement จริง
- cancellation/reversal ต้องไม่ลบ movement row เดิม ถ้าเป็น flow ที่ออกจากระบบแล้ว เช่น `SB`
- business document ที่มีเลขเอกสารต้องมี status/timeline log แยกจาก current-state header table
- API write ที่กระทบ stock ต้องทำใน database transaction เดียวกับ source status/allocation update

## Core Tables

| Table | Role | Notes |
|---|---|---|
| `stock_ledger` | movement fact | ใช้ aggregate เป็น stock balance; row เดิมไม่ควรถูกแก้จากหน้า ledger |
| `stock_holds` | pending_out reservation fact | `WTO` สร้าง active pending_out, `SB` consume pending_out, `SB cancel` reopen pending_out |
| `weight_ticket_status_logs` | WTI/WTO lifecycle | บันทึก created/edited/cancelled/usage status change |
| `weight_ticket_usage_logs` | WTI/WTO usage fact | บันทึก `WTI -> PB` และ `WTO -> SB` allocation/release |
| `sales_bill_status_logs` | SB lifecycle | เพิ่มใน migration `20260612120000_add_sales_bill_status_logs.sql`; บันทึก create/cancel/status sync |

## Ledger Ref Types

| Ref Type | Owner | Direction | Reversal |
|---|---|---|---|
| `PB` | Purchase Bill Stock | stock in | `PB-CANCEL`, `PB-EDIT-REV` |
| `PB-CANCEL` | Purchase Bill cancel / supplier swap void | stock out | append-only reversal ของ PB net movement; ห้ามลบ `PB` row เดิม |
| `PB-EDIT-REV` | Purchase Bill edit | stock out | reverse current PB net movement ก่อน append `PB` state ใหม่ |
| `SB` | Sales Bill Stock | stock out | `SB-CANCEL` |
| `SB-CANCEL` | Sales Bill cancel | stock in | สร้าง row ใหม่เพื่อคืน stock; ห้ามลบ `SB` row เดิม |
| `ST` | Stock transfer | paired out/in | future cancel ต้อง paired reversal |
| `SC` | Status convert | paired out/in | `SC-REV` |
| `SC-REV` | Status convert reverse | paired out/in | append-only reverse rows; `ref_id` points to original `SC.ref_no` |
| `GA` | Grade adjustment | paired out/in | future cancel ต้อง paired reversal |
| `ADJ` | Stock adjustment | one-sided gain/loss | future correction ต้องเป็น adjustment/reversal row ใหม่ |
| `PSALE` | Legacy pending sale / stock issue | legacy only | no new target write |
| `PSALE-CANCEL` | Legacy pending sale reversal | legacy only | no new target write |
| `PI`, `PI-REV`, `PO2`, `PO2-REV` | Production | production input/output/reverse | append-only production movement/reversal; WIP-side rows use production order product bucket |

## Pending Out / Stock Hold Contract

`stock_holds` เป็นชื่อ technical table ส่วน business contract ให้เรียกว่า `pending_out / รอออก`. ปัจจุบัน runtime ใช้กับ `WTO`: สร้างเมื่อ WTO ถูกบันทึก, consume เมื่อสร้าง SB, และ reopen เมื่อ cancel SB

| Source | Meaning | Ledger timing |
|---|---|---|
| `WTO` | ใบส่งของ/ชั่งออกสร้าง pending_out ไว้ก่อนเปิด SB | ledger เขียนตอน SB |

Availability rule:

```text
available = onHandFromStockLedger - activePendingOut
```

ทุก write path ที่สร้าง pending_out หรือ stock-out จาก stock ปกติต้อง validate ด้วย branch + warehouse + product เดียวกัน เพื่อป้องกัน over selling

## Stock Balance Read Model

`/api/stock/balance` ต้องอ่าน `stock_ledger` เป็น bucket aggregate ใน DB ไม่โหลด movement rows ทั้งหมดมากลุ่มใน Node

Bucket key:

```text
product_id + branch_id + warehouse_id + output_category + lot_no + not_available_for_sale
```

Read policy:

- on-hand/value มาจาก `stock_ledger` aggregate ต่อ bucket
- active pending_out overlay มาจาก `stock_holds.status = active` aggregate ต่อ bucket เดียวกัน
- ready qty = positive on-hand - active pending_out เฉพาะ bucket ที่ขายได้
- detail drilldown จำกัด latest movement/active pending_out rows ต่อ bucket

Supporting indexes:

- `idx_stock_ledger_balance_bucket`
- `idx_stock_ledger_bucket_detail`
- `idx_stock_holds_active_bucket_detail`

## WTO Pending Out Contract

`WTO` ไม่เขียน `stock_ledger` เอง แต่ต้องสร้าง `stock_holds.status = active` ซึ่ง user-facing คือ `pending_out / รอออก`

Lifecycle:

| Event | `stock_holds` / pending_out | `stock_ledger` | WTI/WTO status |
|---|---|---|---|
| Create WTO | create `active` pending_out | no row | `delivered` |
| Edit unused WTO | old pending_out `released`, new pending_out `active` | no row | stays `delivered` |
| Cancel unused WTO | active pending_out `cancelled` | no row | `cancelled` |
| Create SB from WTO | pending_out `consumed` | create `SB` stock-out row | `billed` |
| Cancel SB from WTO | consumed pending_out reopened to `active` | create `SB-CANCEL` stock-in row | `delivered` |

## Removed PSALE Issue Contract

`Pending Sale Release / เบิกออกรอบิล` ถูกถอดออกจาก target runtime แล้ว หลังตัดสินใจใช้ `WTO -> pending_out -> SB` เป็น flow เดียวสำหรับ stock sale

Removed runtime API route:

```http
/api/sales/stock-issue -> deleted from active app routing
```

Target behavior:

- New stock sale writes must select WTO in Sales Bill.
- Sales Bill form schema no longer exposes `pendingStockIssueId/fromPsale...`; `POST /api/sales/bills` still rejects those legacy keys at the API boundary with `410 Gone`.
- No new `stock_ledger.ref_type = PSALE` or `PSALE-CANCEL` rows should be written.
- Stock Ledger no longer links legacy `PSALE` / `PSALE-CANCEL` rows to `/sales/stock-issue`.
- Existing legacy PSALE rows must be handled by data repair/legacy migration, not normal runtime.

## SB Cancel API Contract

Endpoint:

```http
PATCH /api/sales/bills/{docNo}
Content-Type: application/json

{
  "action": "cancel",
  "note": "เหตุผลการยกเลิก"
}
```

Validation:

- `note` required, max 500 chars, no control characters
- target `SB` must exist by `doc_no`
- target `SB` must not already be cancelled/void/reversed
- active receipt linked to the SB must not exist, including legacy `receipts.bill_id = sales_bills.id` and active `customer_receipt_allocations.sales_bill_id` whose parent `customer_receipts` is not cancelled
- for direct WTO-backed `STOCK` SB, consumed `stock_holds` and existing `stock_ledger.ref_type = SB` must exist
- PSALE-backed `STOCK` SB is legacy only and not a target runtime cancel path
- duplicate `stock_ledger.ref_type = SB-CANCEL` for same direct-WTO `SB` is rejected

Transactional side effects:

Direct WTO-backed SB:

1. Reopen consumed pending_out rows (`stock_holds`) for the `SB` back to `active`
2. Create `stock_ledger.ref_type = SB-CANCEL` rows that reverse the original `SB` stock-out rows
3. Append `weight_ticket_usage_logs.action = released_from_sales_bill`
4. Increment `weight_ticket_product_summaries.remaining_weight` and decrement `billed_weight`
5. Update `WTO.status` back to `delivered`
6. Append `weight_ticket_status_logs.action = usage_status_changed`
7. Reverse PO Sell usage from sales bill item snapshot: decrease `cut_amount`, increase header `remaining_qty/remaining_amount`, restore `items[].remainingQty`, and reopen status when needed
8. Mark `sales_bills.status = cancelled`, set `cancel_note`, `cancelled_at`, `cancelled_by`, and zero `receivable_balance`
9. Append `sales_bill_status_logs.action = cancelled`

Legacy PSALE-backed SB:

- Not part of the target runtime path.
- If legacy data exists, handle through explicit data repair/migration before normal cancellation.

Response:

```json
{
  "docNo": "SB...",
  "id": "SB..."
}
```

Browser QA checkpoint:

- `SB2606-0003` cancelled through the `/sales/bills` UI cancel dialog in dev-target on 2026-06-12.
- Verified DB side effects:
  - `stock_ledger` has both `SB` (`qty_out = 10`) and `SB-CANCEL` (`qty_in = 10`) for the document.
  - `WTO012606-0005` returned to `delivered`.
  - Related pending_out row (`stock_holds`) returned to `active` with no consumed-by reference.
  - `POS6906-0009` returned to `Open`, `remaining_qty = 10`, `remaining_amount = 10`, `cut_amount = 0`, and `items[].remainingQty = 10`.
  - `/api/stock/reconciliation` returned HTTP 200.

Runtime bug fixes from QA:

- Applied existing migration `20260612120000_add_sales_bill_status_logs.sql` to dev-target because `sales_bills.cancel_note/cancelled_at/cancelled_by` existed in Prisma schema but not in the database yet.
- `POST /api/sales/bills` now only validates `customerAdvance.ref_type = CADV` when a Customer Advance was actually selected; creating an SB without Customer Advance must not be rejected.
- `PATCH /api/sales/bills/{docNo}` PO Sell reversal now reads `unitPrice` from the SB item snapshot when `price` is absent and restores PO Sell JSON item outstanding as well as header totals.

## PB Append/Reversal API Contract

`PATCH /api/purchase/bills` ต้องไม่ลบหรือ rebuild `stock_ledger` ของ `PB` อีกต่อไป

Write policy:

- create Stock PB: append `stock_ledger.ref_type = PB`
- cancel Stock PB: append `stock_ledger.ref_type = PB-CANCEL` จาก net movement ของ doc นั้น
- supplier swap: mark PB เดิมเป็น `cancelled_supplier_swap`, append `PB-CANCEL` ให้ PB เดิม, แล้วสร้าง PB ใหม่พร้อม `PB` rows ใหม่
- edit Stock PB: reject การเปลี่ยน `transactionMode` ข้าม `STOCK/TRADING`; append `PB-EDIT-REV` จาก net movement ปัจจุบัน แล้ว append `PB` rows ของ state ใหม่
- duplicate `PB-CANCEL` สำหรับ doc เดิมต้องถูก reject ก่อนเขียน
- ถ้า ledger dimension ของ PB ไม่ครบ (`branch_id`, `warehouse_id`, `product_id`) หรือ net movement ผิดรูป ต้อง reject แทน fallback/coerce

Allocation/item lifecycle policy:

- `purchase_bill_items` เป็น document line snapshot และต้องไม่ถูก delete/rebuild ระหว่าง edit
- current editable/read-model lines ใช้ `item_status = active`
- edit PB ต้อง mark line version เดิมเป็น `item_status = superseded` พร้อม `superseded_at/by/reason` แล้ว create active item version ใหม่ด้วย `item_version` ถัดไป
- DB ใช้ partial unique `uq_purchase_bill_items_active_bill_line` เพื่อบังคับ line no ไม่ซ้ำเฉพาะ active rows; superseded rows เก็บ line no เดิมเพื่อ audit ได้
- `purchase_bill_receipt_allocations` และ `purchase_bill_po_allocations` ต้องไม่ถูก delete ระหว่าง edit/cancel/supplier-swap
- current WTI/PO availability/reconciliation ใช้เฉพาะ `allocation_status = active`
- edit/cancel/supplier-swap ต้อง mark allocation เดิมเป็น `allocation_status = released` พร้อม `released_at/by/reason`; rows เหล่านี้เป็น audit history และห้ามถูกนับซ้ำในยอดคงเหลือ
- PB detail/print ต้องอ่าน active item rows เป็น default; historical source ของเอกสารยกเลิกยังอยู่จาก line snapshot และ released allocation rows
- downstream read-model ที่ใช้ยอด PB items เช่น dashboard/report/tracking/receipt voucher/PO reconciliation ต้อง filter `purchase_bill_items.item_status = active` เสมอ เพื่อไม่ให้ superseded history ถูกนับซ้ำ

Implementation owner:

- `apps/next/src/lib/server/stock-ledger-reversal.ts`
- `apps/next/src/app/api/purchase/bills/route.ts`
- migration `supabase/migrations/20260612153000_stock_ledger_append_reversal_indexes.sql`
- migration `supabase/migrations/20260612231500_harden_purchase_bill_allocation_lifecycle.sql`

## Stock Reconciliation Removal

`/stock/reconciliation`, `GET /api/stock/reconciliation`, และ shared helper `stock-reconciliation.ts` ถูกถอดออกจาก active app แล้วตาม requirement ล่าสุด เพราะระบบตรวจความถูกต้องของ stock ผ่าน cross-check ใน flow ยกเลิก/แก้ไขของแต่ละเอกสารอยู่แล้ว

ผลของ decision นี้:

- ไม่มีหน้า read-only stock reconciliation สำหรับ user/admin แล้ว
- ไม่มี API กลางที่ scan orphan/missing ledger รวมทั้งระบบ
- การตรวจ stock ต้องอยู่ใน write/cancel/edit flow ของ source document เช่น PB, SB, SC, ST, ADJ และ production movement
- contract automation ที่เหลือควรตรวจเฉพาะ flow ที่เป็นเจ้าของ side effect นั้น ไม่พึ่ง helper กลาง

Automation:

- Legacy PSALE verification scripts were removed from the target type-check surface on 2026-06-24; historical behavior remains documented only in [[Pending Sale Page Flow]].
- `npm run qa:stock-ledger-write-paths --workspace @ns-scrap-erp/next` no longer creates/cancels PSALE in target QA; it must not be used to prove Pending Sale runtime.

Production reversal doc-number policy:

- `PI` / `PO2` document numbers are group keys stored in `production_inputs.doc_no` and `production_outputs.doc_no`; multiple line rows can share one document number.
- `PI-REV` / `PO2-REV` document numbers are group keys stored in `reversal_doc_no`, not new `doc_no` rows.
- Runtime generation must scan `reversal_doc_no` for `*-REV` prefixes. Scanning `doc_no` would silently reuse reversal numbers.
- Migration `20260612233500_repair_duplicate_production_reversal_doc_numbers.sql` repairs duplicate reversal groups generically by renumbering later source-document groups and updating matching `stock_ledger.ref_no` plus status-log metadata.

## Current Implementation Files

| Concern | File |
|---|---|
| SB create/cancel API | `apps/next/src/app/api/sales/bills/route.ts`, `apps/next/src/app/api/sales/bills/[id]/route.ts` |
| removed PSALE runtime entry | `apps/next/src/app/api/sales/stock-issue/route.ts` deleted from active app routing |
| PB append/reversal helper | `apps/next/src/lib/server/stock-ledger-reversal.ts` |
| legacy PSALE rollback automation | removed from target type-check surface; historical reference only in docs |
| stock write-path QA automation | `apps/next/scripts/qa-stock-ledger-write-paths.ts` |
| production movement/reversal service | `apps/next/src/lib/server/production-orders.ts` |
| production reconciliation helper/API | `apps/next/src/lib/server/production-reconciliation.ts`, `apps/next/src/app/api/production/reconciliation/route.ts` |
| pending_out availability/consume/reopen | `apps/next/src/lib/server/stock-holds.ts` |
| stock balance aggregate | `apps/next/src/lib/server/stock.ts` |
| SB status timeline helper | `apps/next/src/lib/server/sales-bill-history.ts` |
| WTI/WTO status timeline helper | `apps/next/src/lib/server/weight-ticket-status-history.ts` |
| WTI/WTO usage timeline helper | `apps/next/src/lib/server/weight-ticket-usage-history.ts` |
| DB migration | `supabase/migrations/20260612120000_add_sales_bill_status_logs.sql` |

## Remaining Design Gaps

- Dedicated durable allocation tables for `SB -> PO Sell`, `SB -> Spot Sale`, and `Customer advance -> SB` are still future work; current runtime uses `sales_bills.items` snapshot plus usage logs.
- PB edit/cancel/supplier-swap still needs logged-in browser QA even though the API has been hardened to append/reversal policy.
- Add WTO-backed SB create/cancel QA to cover `WTO -> pending_out -> SB -> SB-CANCEL` without PSALE.
- Production order create/input/output/reverse has prior browser QA coverage, but the new stock write-path QA script is service-level; rerun logged-in browser QA if UI evidence is required for this exact batch.
