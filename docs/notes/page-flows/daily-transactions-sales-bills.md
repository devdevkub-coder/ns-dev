---
title: บิลขาย Page Flow
tags:
  - page-flow
  - menu
status: accepted-baseline
updated: 2026-06-14
route: /sales/bills
---

# บิลขาย Page Flow

## Scope

| Field | Value |
|---|---|
| Menu section | Daily Transactions |
| Route | `/sales/bills` |
| Page | บิลขาย |
| Current Next | accepted code baseline |

## Canonical References

[[Sales Bills Page Flow]], [[Sales Flow]], [[Payment Flow]], [[Stock Ledger and Stock Balance]]

## Flow Baseline

SB ตั้งลูกหนี้, consume WTO hold, ตัด stock สำหรับ stock sale และตัด POS allocation

## Page Responsibilities

- สร้าง `SB` จาก WTO, PSALE, Trading PB, manual Trading Cost Source หรือขายตรงตาม target mode
- สำหรับ WTO: 1 WTO ต่อ 1 SB และต้องตัด WTO ครบใน SB เดียว
- allocate เข้า PO Sell ได้หลาย PO ต่อ SB และส่วนเกินเป็น Spot Sale
- สำหรับ Trading: PO Sell เป็น optional; ถ้าผูก PO Sell ต้องตัด PO Sell remaining/commitment ระดับ line แต่ไม่เขียน stock ledger
- ตั้ง AR/payable receivable balance และเป็น source ให้ receipt
- สำหรับ stock sale line เท่านั้น: consume hold แล้วเขียน stock-out ledger ตอน save SB
- แสดง detail/source/timeline/print และ receipt status

## Non-Responsibilities

- ไม่รับเงินเอง; receipt อยู่ `/sales/receipts`
- ไม่ตัด stock ซ้ำเมื่อ source เป็น PSALE ที่ตัด stock ไปแล้ว
- ไม่ให้ WTO เดียวถูกใช้หลาย SB
- ไม่แก้ master data ระหว่างสร้างบิล

## Lifecycle / Operation Flow

| Step | User action | System result |
|---|---|---|
| 1 | เปิดหน้า | GET list/filter/source |
| 2 | เลือก source | WTO/PSALE/Trading PB/manual Trading Cost Source/direct stock ตาม mode |
| 3 | allocate | เลือก POS ต่อ line หรือ Spot Sale |
| 4 | บันทึก SB | POST ตั้ง AR, source usage, stock ledger/hold consume ตาม mode |
| 5 | รับเงิน | RCP ลด AR |
| 6 | cancel/correction | reverse AR/source usage/ledger หรือ reopen hold ตาม policy; direct edit ยังไม่เปิดใช้ |

## API / Data Contract

### Current API

- `GET /api/sales/bills - list/source data`
- `POST /api/sales/bills - create SB`
- `GET /api/sales/bills/[id] - detail/read model`
- `PATCH /api/sales/bills/[id] - action cancel for SB reversal`
- no current `PUT/DELETE /api/sales/bills/[id]`; edit button remains disabled in the UI; cancel UI is enabled and browser-QA validated for WTO-backed Stock SB

### Data Contract

- UI ใช้ outward business document/code เป็นหลัก และให้ server resolve internal id
- list/detail/print/export ต้องอ่าน source contract เดียวกันเพื่อลด drift
- transaction write ต้องทำใน server transaction และ append timeline/status/audit ตาม document policy
- ถ้า field เป็น money/qty/date/business code ให้ validate ตาม `docs/design.md` และ server-side ซ้ำ

## Validation / Status Rules

- WTO ต้อง active, same branch/customer context, not billed, allocate ครบใน SB เดียว
- POS allocation ต้อง product/unit match และไม่เกิน remaining
- stock sale ต้อง validate available/hold ใน transaction
- Trading SB ต้องไม่ตัด stock และไม่สร้าง stock ledger แม้เป็นทองเหลือง/ทองแดงหรือผูก PO Sell
- Trading SB ต้องเลือก row-level Trading Cost Source ก่อนบันทึก โดย source เป็นได้ทั้ง `PB:<docNo>:<lineNo>` จาก Trading PB หรือ `SRC:<sourceNo>:1` จาก `trading_cost_sources`
- PSALE source ห้ามตัด stock ซ้ำ
- SB ที่มาจาก PSALE เมื่อ cancel ต้อง reverse `PSALE` ด้วย `PSALE-CANCEL`; ห้ามสร้าง `SB-CANCEL` stock row เพราะ SB ไม่ได้เป็น owner ของ stock-out
- receipt active แล้วต้อง lock cancel/edit field การเงิน ทั้ง legacy `receipts` และ new `customer_receipt_allocations` ที่ parent `customer_receipts` ยัง active

## Side Effects

- ตั้ง AR/source receivable
- เขียน `stock_ledger.ref_type = SB` สำหรับ stock-out ที่ SB เป็น movement owner
- Trading SB ไม่เป็น stock movement owner; ผลต่อ stock เป็นศูนย์ และมีผลต่อ Trading Matching / PO Sell allocation เท่านั้น
- เขียน `stock_ledger.ref_type = SB-CANCEL` เมื่อ cancel SB เพื่อคืน stock แบบ append-only reversal
- สำหรับ SB จาก PSALE ให้ cancel ผ่าน `PSALE-CANCEL` และ reopen WTO hold แทนการเขียน `SB-CANCEL`
- consume WTO hold หรือใช้ PSALE stock-out fact ตาม source
- update/reopen WTO hold และ update WTO/PSALE/POS usage/status
- ส่งต่อไป `/sales/receipts` สำหรับรับเงิน

## Current Code Baseline

- Current `apps/next` page/API code is accepted as the P0 implementation baseline as of 2026-06-11.
- This page belongs to the transaction/stock/payment risk group; accepted baseline means proofed against current code, not target-complete.
- Runtime changes must preserve documented status, allocation, ledger, payment, lock, and reversal boundaries, or update this page-flow and the canonical flow first.
- See [[P0 Transaction Stock Payment Current Code Baseline]] for API/permission/side-effect proof notes and open critical gaps.

## Current Gap

- create path for `STOCK` SB already consumes active `WTO` hold, writes `stock_ledger.ref_type = SB`, logs `WTO -> SB` usage, updates `WTO` to `billed`, and updates PO Sell remaining/status
- create path for `TRADING` SB now exposes optional row-level `PO Sell` selection plus required row-level Trading cost source selection in the modal, rejects stale stock-source payload fields server-side, persists no warehouse/WTO/PSALE source, writes active `trading_allocation_facts` for the selected Trading PB line or manual non-PB Trading Cost Source, and still uses the same PO Sell remaining reduction path when a row is linked
- durable allocation fact tables are still missing for `WTO -> SB`, `SB -> PO Sell`, `SB -> Spot Sale`, and `Customer advance -> SB`; current implementation still stores most line/source facts in sales-bill item JSON plus usage logs
- cancel write path exists for WTO-backed Stock SB: blocks active RCP, reopens consumed WTO hold, writes `SB-CANCEL`, appends `released_from_sales_bill`, returns WTO to `delivered`, reverses PO Sell usage, and appends `sales_bill_status_logs`
- cancel write path also handles SB created from converted PSALE: it appends `PSALE-CANCEL` against the original PSALE movement, reopens the WTO hold to `active`, returns WTO to `delivered`, marks the linked PSALE `cancelled`, and does not write duplicate `SB/SB-CANCEL` stock ledger rows
- UI list action opens SB cancel dialog and calls `PATCH /api/sales/bills/{docNo}`; server remains the source of truth for receipt-lock and reversal validation through `canCancel`/`lockedReason` from `GET /api/sales/bills`
- QA sample `SB2606-0003` confirmed `SB` + `SB-CANCEL` ledger net zero, WTO `WTO012606-0005` returned to `delivered`, stock hold returned to `active`, and PO Sell `POS6906-0009` header plus `items[].remainingQty` returned to outstanding
- Browser QA sample `SB2606-0004` confirmed row-level cancel dialog works, PATCH returns 200, the row changes to cancelled, the cancel button becomes disabled, `SB` + `SB-CANCEL` ledger nets to zero, WTO `WTO012606-0003` returned to `delivered`, stock hold returned to `active`, and PO Sell `POS6906-0003` returned to outstanding
- direct dev-target helper QA sample `SB2606-0005` from `PSALE2606-0002` confirmed PSALE-backed cancel has `PSALE` + `PSALE-CANCEL` net zero, WTO hold active again, linked PSALE cancelled, and no SB stock ledger rows
- edit write path still does not exist by policy; Trading SB has allocation-only correction through audited fact reversal/recreate, while other SB correction remains cancel/recreate after receipt-lock validation
- Trading SB source allocation to Trading PB and manual non-PB Trading Cost Source now has a durable create/cancel path through `trading_allocation_facts`; SB detail and print read active line facts for Trading source labels and matched COGS
- Trading SB allocation-only correction exists in the list/detail UI and API as `PATCH /api/sales/bills/{docNo}` with `action = correct_trading_allocations`; the list exposes `แก้ต้นทุน` for Trading rows, the detail modal uses searchable line-level Trading Cost Source selection, and the API reverses prior active facts, appends corrected active facts, updates SB total cost/gross profit, and does not touch stock/WTO/PSALE/warehouse state
- customer advance durable allocation release is still a target gap because current implementation stores most advance facts in `sales_bills.items`
- receipt relation/lock is enforced by shared server policy; automated edge-case tests for legacy receipt/RCP lock are still needed

## Implementation Checklist

- [x] Verify current Next page/component against this page-flow
- [x] Verify API route handlers match Current API and status rules above
- [x] Sync current create-path side effects with [[Sales Bills Page Flow]]
- [x] Add cancel/reversal API for WTO-backed Stock SB
- [x] Add cancel/reversal policy for SB created from converted PSALE
- [ ] Design durable allocation tables before enabling SB edit/runtime change
- [x] Expose optional row-level PO Sell selector for Trading SB and harden API so Trading SB cannot carry stock-source/warehouse fields
- [x] Require row-level Trading PB cost source for Trading SB create, write `trading_allocation_facts`, and cancel those facts without writing stock ledger
- [x] Add first-class manual non-PB Trading Cost Source support for Trading SB create without stock ledger side effects
- [x] Read Trading SB detail source labels and matched COGS from active `trading_allocation_facts`
- [x] Sales Bill print source labels use the same `getSalesBillDetail()` allocation-fact read model as detail
- [x] Add allocation-only Trading SB correction API with audited fact reversal/recreate
- [x] Add UI action for allocation-only Trading SB correction; Sales Bill full document edit remains disabled
- [x] Add rollback-based automated verification for Trading SB allocation correction success, capacity guard, product mismatch guard, corrected COGS/GP, and no stock ledger side effect
- [x] Browser QA Stock SB cancel happy path with PO Sell outstanding reversal
- [ ] Browser QA Trading SB allocation correction with multi-line source changes and corrected Matched COGS/GP
- [ ] Browser QA PSALE create/cancel/convert and SB-from-PSALE cancel once local dev server is stable
- [ ] Add automated tests for SB cancel edge cases before enabling broader edit/runtime change
- [ ] Update this file and canonical reference if contract changes
