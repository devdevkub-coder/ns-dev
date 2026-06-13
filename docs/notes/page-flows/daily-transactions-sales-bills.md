---
title: บิลขาย Page Flow
tags:
  - page-flow
  - menu
status: accepted-baseline
updated: 2026-06-12
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

- สร้าง `SB` จาก WTO, PSALE, Trading PB หรือขายตรงตาม target mode
- สำหรับ WTO: 1 WTO ต่อ 1 SB และต้องตัด WTO ครบใน SB เดียว
- allocate เข้า PO Sell ได้หลาย PO ต่อ SB และส่วนเกินเป็น Spot Sale
- ตั้ง AR/payable receivable balance และเป็น source ให้ receipt
- สำหรับ stock line: consume hold แล้วเขียน stock-out ledger ตอน save SB
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
| 2 | เลือก source | WTO/PSALE/Trading PB/direct stock ตาม mode |
| 3 | allocate | เลือก POS ต่อ line หรือ Spot Sale |
| 4 | บันทึก SB | POST ตั้ง AR, source usage, stock ledger/hold consume ตาม mode |
| 5 | รับเงิน | RCP ลด AR |
| 6 | cancel/edit | reverse AR/source usage/ledger หรือ reopen hold ตาม policy |

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
- PSALE source ห้ามตัด stock ซ้ำ
- SB ที่มาจาก PSALE เมื่อ cancel ต้อง reverse `PSALE` ด้วย `PSALE-CANCEL`; ห้ามสร้าง `SB-CANCEL` stock row เพราะ SB ไม่ได้เป็น owner ของ stock-out
- receipt active แล้วต้อง lock cancel/edit field การเงิน ทั้ง legacy `receipts` และ new `customer_receipt_allocations` ที่ parent `customer_receipts` ยัง active

## Side Effects

- ตั้ง AR/source receivable
- เขียน `stock_ledger.ref_type = SB` สำหรับ stock-out ที่ SB เป็น movement owner
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
- durable allocation fact tables are still missing for `WTO -> SB`, `SB -> PO Sell`, `SB -> Spot Sale`, and `Customer advance -> SB`; current implementation still stores most line/source facts in sales-bill item JSON plus usage logs
- cancel write path exists for WTO-backed Stock SB: blocks active RCP, reopens consumed WTO hold, writes `SB-CANCEL`, appends `released_from_sales_bill`, returns WTO to `delivered`, reverses PO Sell usage, and appends `sales_bill_status_logs`
- cancel write path also handles SB created from converted PSALE: it appends `PSALE-CANCEL` against the original PSALE movement, reopens the WTO hold to `active`, returns WTO to `delivered`, marks the linked PSALE `cancelled`, and does not write duplicate `SB/SB-CANCEL` stock ledger rows
- UI list action opens SB cancel dialog and calls `PATCH /api/sales/bills/{docNo}`; server remains the source of truth for receipt-lock and reversal validation through `canCancel`/`lockedReason` from `GET /api/sales/bills`
- QA sample `SB2606-0003` confirmed `SB` + `SB-CANCEL` ledger net zero, WTO `WTO012606-0005` returned to `delivered`, stock hold returned to `active`, and PO Sell `POS6906-0009` header plus `items[].remainingQty` returned to outstanding
- Browser QA sample `SB2606-0004` confirmed row-level cancel dialog works, PATCH returns 200, the row changes to cancelled, the cancel button becomes disabled, `SB` + `SB-CANCEL` ledger nets to zero, WTO `WTO012606-0003` returned to `delivered`, stock hold returned to `active`, and PO Sell `POS6906-0003` returned to outstanding
- direct dev-target helper QA sample `SB2606-0005` from `PSALE2606-0002` confirmed PSALE-backed cancel has `PSALE` + `PSALE-CANCEL` net zero, WTO hold active again, linked PSALE cancelled, and no SB stock ledger rows
- edit write path still does not exist
- customer advance durable allocation release is still a target gap because current implementation stores most advance facts in `sales_bills.items`
- receipt relation/lock is enforced by shared server policy; automated edge-case tests for legacy receipt/RCP lock are still needed

## Implementation Checklist

- [x] Verify current Next page/component against this page-flow
- [x] Verify API route handlers match Current API and status rules above
- [x] Sync current create-path side effects with [[Sales Bills Page Flow]]
- [x] Add cancel/reversal API for WTO-backed Stock SB
- [x] Add cancel/reversal policy for SB created from converted PSALE
- [ ] Design durable allocation tables before enabling SB edit/runtime change
- [ ] Verify legacy behavior for remaining edit/reversal gaps before implementing runtime change
- [x] Browser QA Stock SB cancel happy path with PO Sell outstanding reversal
- [ ] Browser QA PSALE create/cancel/convert and SB-from-PSALE cancel once local dev server is stable
- [ ] Add automated tests for SB cancel edge cases before enabling broader edit/runtime change
- [ ] Update this file and canonical reference if contract changes
