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
updated: 2026-06-13
---

# Stock Ledger DB API Design

เอกสารนี้เป็น design contract สำหรับ stock ledger / stock hold / reversal API ของ active Next app (`apps/next`) หลังเริ่ม runtime hardening รอบ 2026-06-12

## Design Goals

- `stock_ledger` เป็น movement source of truth และต้อง trace กลับเอกสารต้นทางได้
- `stock_holds` เป็น reservation source of truth สำหรับ outbound stock ก่อนเกิด movement จริง
- cancellation/reversal ต้องไม่ลบ movement row เดิม ถ้าเป็น flow ที่ออกจากระบบแล้ว เช่น `SB`
- business document ที่มีเลขเอกสารต้องมี status/timeline log แยกจาก current-state header table
- API write ที่กระทบ stock ต้องทำใน database transaction เดียวกับ source status/allocation update

## Core Tables

| Table | Role | Notes |
|---|---|---|
| `stock_ledger` | movement fact | ใช้ aggregate เป็น stock balance; row เดิมไม่ควรถูกแก้จากหน้า ledger |
| `stock_holds` | reservation fact | `WTO` สร้าง active hold, `SB` consume hold, `SB cancel` reopen hold |
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
| `PSALE` | Pending sale / stock issue after outbound weighing | stock out | `PSALE-CANCEL` |
| `PSALE-CANCEL` | Pending sale cancel or SB-from-PSALE cancel | stock in | append-only reversal ของ `PSALE`; ห้ามลบ `PSALE` row เดิม |
| `PI`, `PI-REV`, `PO2`, `PO2-REV` | Production | production input/output/reverse | append-only production movement/reversal; WIP-side rows use production order product bucket |

## Stock Hold Contract

`stock_holds` เป็น reservation fact กลางสำหรับ stock ที่ถูกกันไว้แต่ยังไม่เกิด movement จริง ปัจจุบัน runtime ใช้กับ `WTO`. สำหรับ flow เบิกออกรอบิล target ล่าสุดให้ PSALE เกิดหลังมี WTO/ใบชั่ง OUT และต้องตัด stock ทันที ดังนั้น PSALE ไม่สร้าง reservation hold ของตัวเอง

| Source | Meaning | Ledger timing |
|---|---|---|
| `WTO` | ใบส่งของ/ชั่งออกกัน stock ไว้ก่อนเปิด SB | ledger เขียนตอน SB |

Availability rule:

```text
available = onHandFromStockLedger - activeStockHolds
```

ทุก write path ที่สร้าง hold หรือ stock-out จาก stock ปกติต้อง validate ด้วย branch + warehouse + product เดียวกัน เพื่อป้องกัน over selling

## Stock Balance Read Model

`/api/stock/balance` ต้องอ่าน `stock_ledger` เป็น bucket aggregate ใน DB ไม่โหลด movement rows ทั้งหมดมากลุ่มใน Node

Bucket key:

```text
product_id + branch_id + warehouse_id + output_category + lot_no + not_available_for_sale
```

Read policy:

- on-hand/value มาจาก `stock_ledger` aggregate ต่อ bucket
- active hold overlay มาจาก `stock_holds.status = active` aggregate ต่อ bucket เดียวกัน
- ready qty = positive on-hand - active hold เฉพาะ bucket ที่ขายได้
- detail drilldown จำกัด latest movement/active hold rows ต่อ bucket

Supporting indexes:

- `idx_stock_ledger_balance_bucket`
- `idx_stock_ledger_bucket_detail`
- `idx_stock_holds_active_bucket_detail`

## WTO Hold Contract

`WTO` ไม่เขียน `stock_ledger` เอง แต่ต้องสร้าง `stock_holds.status = active`

Lifecycle:

| Event | `stock_holds` | `stock_ledger` | WTI/WTO status |
|---|---|---|---|
| Create WTO | create `active` hold | no row | `delivered` |
| Edit unused WTO | old hold `released`, new hold `active` | no row | stays `delivered` |
| Cancel unused WTO | active hold `cancelled` | no row | `cancelled` |
| Create SB from WTO | hold `consumed` | create `SB` stock-out row | `billed` |
| Cancel SB from WTO | consumed hold reopened to `active` | create `SB-CANCEL` stock-in row | `delivered` |

## PSALE Issue Contract

`Pending Sale Release / เบิกออกรอบิล` ใช้เมื่อมีใบชั่งขาออกแล้วและต้องเบิกของจาก Stock ให้ลูกค้าก่อนสร้างบิลขายจริง

| State | `stock_holds` | `stock_ledger` | Convert to SB |
|---|---|---|---|
| `pending` | WTO hold must be consumed/released by PSALE policy to avoid double reservation | `PSALE` stock-out | create SB without duplicate stock-out |
| `converted` | no active hold for the same stock | existing `PSALE` movement linked | locked |
| `cancelled` before SB | WTO hold reopened to `active` | append `PSALE-CANCEL` reversal | not allowed |
| `cancelled` after SB | WTO hold reopened to `active`; SB remains cancelled | append `PSALE-CANCEL` reversal of the original PSALE movement; no `SB-CANCEL` stock row | not allowed |

Target APIs:

```http
POST /api/sales/stock-issue
PATCH /api/sales/stock-issue/{docNo}
POST /api/sales/stock-issue/{docNo}/convert-to-sales-bill
```

Required behavior:

- create requires a WTO / outbound weighing source
- create validates `available`, snapshots WAC, creates `stock_issues.status = pending`, and writes `stock_ledger.ref_type = PSALE`
- create must consume/release the related WTO hold in the same transaction so the same quantity is not counted as both reserved and issued
- edit is allowed only while `stock_issues.status = pending` and `converted_to_bill_id` is empty
- edit keeps the same PSALE doc no and same WTO source; changing WTO source requires cancel/recreate
- edit must append `PSALE-CANCEL` for the currently unreversed `PSALE` movement, reopen the WTO hold, then append a new `PSALE` movement and consume the hold again in the same transaction
- repeated edit must reverse only unreversed `PSALE` ledger rows by source `ledger_key`; it must not reverse historical rows that already have a `PSALE-CANCEL` row
- edit appends `stock_issue_status_logs.action = edited`
- convert creates SB with `from_p_sale_no/from_p_sale_id`, updates stock issue status to `converted`, and must not write duplicate `SB` stock-out for PSALE-sourced lines
- cancel before SB appends `PSALE-CANCEL`, reopens the consumed WTO hold to `active`, returns the WTO to `delivered`, and updates stock issue status to `cancelled`
- cancel SB from converted PSALE must reverse the original `PSALE` movement with `PSALE-CANCEL`; it must not invent `SB-CANCEL` stock rows because the SB did not own the stock-out movement
- every state-changing action appends a dedicated PSALE status/timeline log

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
- for PSALE-backed `STOCK` SB, converted `stock_issues` and existing `stock_ledger.ref_type = PSALE` must exist; `SB` stock ledger rows must not be required
- duplicate `stock_ledger.ref_type = SB-CANCEL` for same direct-WTO `SB` is rejected
- duplicate `stock_ledger.ref_type = PSALE-CANCEL` for the converted PSALE is rejected

Transactional side effects:

Direct WTO-backed SB:

1. Reopen consumed `stock_holds` for the `SB` back to `active`
2. Create `stock_ledger.ref_type = SB-CANCEL` rows that reverse the original `SB` stock-out rows
3. Append `weight_ticket_usage_logs.action = released_from_sales_bill`
4. Increment `weight_ticket_product_summaries.remaining_weight` and decrement `billed_weight`
5. Update `WTO.status` back to `delivered`
6. Append `weight_ticket_status_logs.action = usage_status_changed`
7. Reverse PO Sell usage from sales bill item snapshot: decrease `cut_amount`, increase header `remaining_qty/remaining_amount`, restore `items[].remainingQty`, and reopen status when needed
8. Mark `sales_bills.status = cancelled`, set `cancel_note`, `cancelled_at`, `cancelled_by`, and zero `receivable_balance`
9. Append `sales_bill_status_logs.action = cancelled`

PSALE-backed SB:

1. Append `stock_ledger.ref_type = PSALE-CANCEL` rows that reverse the original `PSALE` stock-out rows
2. Reopen the original WTO hold to `active`
3. Update the original WTO status to `delivered` and append status logs
4. Mark the converted `stock_issues` row as `cancelled` and append stock-issue status log
5. Mark `sales_bills.status = cancelled`, set `cancel_note`, `cancelled_at`, `cancelled_by`, and zero `receivable_balance`
6. Append `sales_bill_status_logs.action = cancelled`

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
  - Related `stock_holds` row returned to `active` with no consumed-by reference.
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

## Reconciliation API Contract

Endpoint:

```http
GET /api/stock/reconciliation
```

Permission: `stock.ledger.view`

Report groups:

- `orphanLedger`: ledger refs ที่ไม่มี source document (`PB/PB-CANCEL/PB-EDIT-REV`, `SB/SB-CANCEL`, `PSALE`, `PI/PI-REV`, `PO2/PO2-REV`)
- `missingSourceLedger`: source docs ที่ควรมี ledger แต่ไม่มี rows ตาม ref contract
- `cancelledDocumentNet`: cancelled PB/SB ที่ net ledger ไม่กลับศูนย์
- `cancelledSalesHolds`: `stock_holds` ที่ยัง `consumed` โดย SB ที่ถูก cancel แล้ว
- `pendingSaleIntegrity`: PSALE ที่ missing reversal, duplicate SB stock-out, converted-without-SB, cancelled hold ยัง consumed, หรือ active PSALE ไม่มี consumed hold
- `statusConvertIntegrity`: `SC`/`SC-REV` ต้องเป็น paired rows และ net เป็นศูนย์; `SC-REV` ต้องชี้กลับ source `SC`
- `stockAdjustmentIntegrity`: `ADJ` header ต้องมี ledger ที่ net qty ตรงกับ `diff_qty` และ ledger value ต้องเป็นศูนย์ตาม `NOTE_ONLY`
- `negativeStockBalance`: aggregate `available = stock_ledger - active stock_holds` ตาม full stock bucket ที่ติดลบ

UI report:

- `/stock/reconciliation` เป็น read-only report surface ของ API นี้
- ใช้ permission family เดียวกับ stock ledger (`stock.ledger.view`)
- UI แสดง grouped count, filter/search, และ detail rows เท่านั้น; reconciliation logic อยู่ใน server helper

Automation:

- `npm run verify:stock-ledger --workspace @ns-scrap-erp/next` runs the server reconciliation helper plus additional invariant checks for PSALE reversal parity, SB-from-PSALE duplicate stock ledger rows, consumed holds after PSALE reversal, production reconciliation issues, PI/PO2 reversal parity, and duplicate production reversal doc numbers reused across different source documents.
- The command requires the active dev-target `DATABASE_URL`; it must fail on source/ledger mismatch instead of skipping rows or inventing defaults.
- `npm run qa:stock-ledger-write-paths --workspace @ns-scrap-erp/next` executes real dev-target write-path QA for PSALE create/cancel and production PI/PO2 create/reverse. The script resolves QA source data from current stock/master data and fails if a required branch/product/warehouse reference is missing.

Production reversal doc-number policy:

- `PI` / `PO2` document numbers are group keys stored in `production_inputs.doc_no` and `production_outputs.doc_no`; multiple line rows can share one document number.
- `PI-REV` / `PO2-REV` document numbers are group keys stored in `reversal_doc_no`, not new `doc_no` rows.
- Runtime generation must scan `reversal_doc_no` for `*-REV` prefixes. Scanning `doc_no` would silently reuse reversal numbers.
- Migration `20260612233500_repair_duplicate_production_reversal_doc_numbers.sql` repairs duplicate reversal groups generically by renumbering later source-document groups and updating matching `stock_ledger.ref_no` plus status-log metadata.

## Current Implementation Files

| Concern | File |
|---|---|
| SB create/cancel API | `apps/next/src/app/api/sales/bills/route.ts`, `apps/next/src/app/api/sales/bills/[id]/route.ts` |
| PSALE create/cancel/reversal helper | `apps/next/src/app/api/sales/stock-issue/route.ts`, `apps/next/src/lib/server/stock-holds.ts` |
| PB append/reversal helper | `apps/next/src/lib/server/stock-ledger-reversal.ts` |
| stock reconciliation helper/API | `apps/next/src/lib/server/stock-reconciliation.ts`, `apps/next/src/app/api/stock/reconciliation/route.ts` |
| stock reconciliation UI | `apps/next/src/app/stock/reconciliation/page.tsx`, `apps/next/src/components/stock/StockReconciliationPageClient.tsx` |
| stock reconciliation automation | `apps/next/scripts/verify-stock-ledger-contract.ts` |
| stock write-path QA automation | `apps/next/scripts/qa-stock-ledger-write-paths.ts` |
| production movement/reversal service | `apps/next/src/lib/server/production-orders.ts` |
| production reconciliation helper/API | `apps/next/src/lib/server/production-reconciliation.ts`, `apps/next/src/app/api/production/reconciliation/route.ts` |
| stock hold availability/consume/reopen | `apps/next/src/lib/server/stock-holds.ts` |
| stock balance aggregate | `apps/next/src/lib/server/stock.ts` |
| SB status timeline helper | `apps/next/src/lib/server/sales-bill-history.ts` |
| WTI/WTO status timeline helper | `apps/next/src/lib/server/weight-ticket-status-history.ts` |
| WTI/WTO usage timeline helper | `apps/next/src/lib/server/weight-ticket-usage-history.ts` |
| DB migration | `supabase/migrations/20260612120000_add_sales_bill_status_logs.sql` |

## Remaining Design Gaps

- Dedicated durable allocation tables for `SB -> PO Sell`, `SB -> Spot Sale`, and `Customer advance -> SB` are still future work; current runtime uses `sales_bills.items` snapshot plus usage logs.
- PB edit/cancel/supplier-swap still needs logged-in browser QA even though the API has been hardened to append/reversal policy.
- PSALE create/edit/cancel and production PI/PO2 create/reverse now have repeatable service-level QA against dev-target.
- PSALE create/cancel/convert and SB-from-PSALE cancel still need logged-in browser QA from the UI.
- Production order create/input/output/reverse has prior browser QA coverage, but the new stock write-path QA script is service-level; rerun logged-in browser QA if UI evidence is required for this exact batch.
