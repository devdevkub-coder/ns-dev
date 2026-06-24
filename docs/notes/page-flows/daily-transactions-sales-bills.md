---
title: บิลขาย Page Flow
tags:
  - page-flow
  - menu
status: accepted-baseline
updated: 2026-06-22
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

SB ตั้งลูกหนี้, consume WTO `pending_out`, ตัด stock สำหรับ stock sale และตัด POS allocation

## Page Responsibilities

- สร้าง `SB` จาก WTO, Trading PB หรือ mixed-source Trading ที่พ่วง WTO ในบิลเดียวกันตาม target mode
- สำหรับ WTO: 1 WTO ต่อ 1 SB และต้องตัด WTO ครบใน SB เดียว
- allocate เข้า PO Sell ได้หลาย PO ต่อ SB และส่วนเกินเป็น Spot Sale
- สำหรับ Trading: Step 3 เป็นแหล่งสินค้าและรายการ โดยค้นหา/เลือก PB Trading ใน combobox และมี selector `ใบส่งของ WTO พ่วงในบิล` อยู่ใน section เดียวกัน; dropdown PB แสดง PB หนึ่งใบเป็นหนึ่ง option ไม่ซ้ำตามสินค้า และแสดงจำนวนรายการสินค้าแทนชื่อสินค้า; label ของ option และค่าที่เลือกแล้วต้องแสดง Supplier ของ PB ด้วยเพื่อให้รู้ว่าซื้อมาจากใคร; เมื่อเลือกแล้ว auto รายการขายจากทุก line ของ PB ที่เลือกทันที; ห้ามใช้ flow หลักแบบเลือก/ดึงสินค้าจาก PB ทีละรายการหรือเพิ่มสินค้า manual, ปุ่มเพิ่มบิลซื้อใช้เพิ่มช่องเลือก PB ถัดไป, PO Sell เป็น optional ต่อ line, ถ้าเลือก PO Sell ต้อง auto ราคาและ lock ราคา, ถ้า PO Sell remaining ไม่พอต้อง auto split ส่วนเกินเป็น Spot Sale, และเลือก WTO พ่วงได้ถ้าต้องมี stock line ใน SB ใบเดียว
- ตั้ง AR/payable receivable balance และเป็น source ให้ receipt
- สำหรับ stock sale line เท่านั้น: consume `pending_out` แล้วเขียน stock-out ledger ตอน save SB และใช้ `value_out` จาก stock ledger เป็น COGS เพื่อคำนวณ GP; ถ้าเป็น mixed-source Trading ให้รวม COGS จาก PB Trading allocation กับ WTO stock COGS ใน header เดียวกัน
- แสดง detail/source/timeline/print และ receipt status

## Non-Responsibilities

- ไม่รับเงินเอง; receipt อยู่ `/sales/receipts`
- WTO `pending_out` เป็น source โดยตรงสำหรับ stock sale line
- ไม่ให้ WTO เดียวถูกใช้หลาย SB
- ไม่แก้ master data ระหว่างสร้างบิล

## Lifecycle / Operation Flow

| Step | User action | System result |
|---|---|---|
| 1 | เปิดหน้า | GET list/filter/source |
| 2 | เลือก source | STOCK เลือก WTO; TRADING ค้นหา/เลือก PB Trading ใน combobox แล้ว auto รายการทุก line ของ PB นั้นทันที ปุ่มเพิ่มบิลซื้อคือเพิ่มช่องเลือก PB ใหม่ และเลือก WTO เพิ่มได้ถ้าต้องพ่วง stock line |
| 3 | allocate | เลือก POS ต่อ line หรือ Spot Sale; PB Trading line ใช้ Trading allocation, WTO line ใช้ stock allocation |
| 4 | บันทึก SB | POST ตั้ง AR, source usage, Trading facts, stock ledger และ consume `pending_out` เฉพาะ line ที่มาจาก WTO |
| 5 | รับเงิน | RCP ลด AR |
| 6 | cancel/correction | reverse AR/source usage/ledger หรือคืน `pending_out` ตาม policy; direct edit ยังไม่เปิดใช้ |

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
- stock sale ต้อง validate available/pending_out ใน transaction
- Stock SB ต้องตั้ง `total_cost`/`cogs_amount` จากต้นทุนเฉลี่ย stock ของสินค้าที่ตัดออก (`stock_ledger.value_out`) และตั้ง `gross_profit = total_amount - COGS`; ถ้า Trading SB มี WTO line พ่วง ให้ตั้ง COGS รวมจาก `trading_allocation_facts.matched_cogs + stock_ledger.value_out`
- Trading PB line ต้องไม่ตัด stock และไม่สร้าง stock ledger แม้เป็นทองเหลือง/ทองแดงหรือผูก PO Sell
- Trading SB ต้องเลือก PB Trading source ก่อนบันทึกเฉพาะทุก PB-derived row โดย source เป็น `PB:<docNo>:<lineNo>` จาก Trading PB; WTO-derived rows ใน mixed-source Trading ไม่ต้องมี Trading PB/Cost Source เพราะใช้ pending_out/ledger ของ WTO แทน; manual `SRC:<sourceNo>:1` ยังเป็น backend-supported source แต่ไม่ใช่ primary create UX รอบนี้
- Trading SB mixed-source ที่เลือก WTO ต้อง validate WTO active/same branch/customer/not billed/fully allocated เหมือน Stock SB และ stock side effect ต้องเกิดเฉพาะ WTO-derived rows
- รายการจาก PB Trading auto จากน้ำหนักคงเหลือซื้อเข้า `น้ำหนักที่ขาย`; ผู้ใช้กรอก `หัก` เอง และระบบคำนวณ `น้ำหนักสุทธิขาย = น้ำหนักที่ขาย - หัก` เป็น read-only; column `อ้างอิง` ใช้เลือก Spot Sale หรือ PO Sell ต่อ line; `ราคา/หน่วย` เริ่มว่างเมื่อเป็น Spot Sale, ถ้าเลือก PO Sell ต้อง auto ราคาจาก PO Sell และ lock ไม่ให้แก้ไข, ไม่มีหมายเหตุรายสินค้า, ไม่มีส่วนลดรายบรรทัดใน Trading item table, และยอดรายการเป็นค่าคำนวณจาก `น้ำหนักสุทธิขาย x ราคา/หน่วย`
- รายการจาก PB Trading ที่เลือก PO Sell ต้องตัด PO Sell ไม่เกิน remaining; ถ้าน้ำหนักรายการมากกว่า remaining ระบบต้องแทรกแถว Spot Sale ถัดจากแถวเดิมสำหรับน้ำหนักส่วนที่เหลือ โดยยังอ้าง source PB line เดิมเพื่อคุม cost/source allocation
- ใน item table ถ้าหลายแถวต่อกันเป็นสินค้าเดียวกันจากบิลซื้อเดียวกัน ให้แสดงเป็นกลุ่มเดียว ไม่ใส่เส้นคั่นหนักระหว่างแถวในกลุ่ม และไม่แสดงชื่อสินค้า/แหล่งสินค้าซ้ำ; column แหล่งสินค้าต้องแสดงเลข PB, น้ำหนักจากบิลซื้อ, และ supplier ของ source นั้น; ถ้าเป็นบิลซื้อคนละใบหรือคนละสินค้าให้เริ่มกลุ่มใหม่และคั่นรายการตามปกติ
- รายการที่ระบบดึงจาก source เอกสารจริง (`PB Trading` หรือ `WTO`) ห้ามลบรายแถวจาก item table; ต้องลบผ่าน selector/source owner เท่านั้น และถ้าเปลี่ยนแถวที่ผูก PO Sell กลับเป็น Spot Sale ต้อง reset ราคาเป็นว่าง/0 พร้อมรวม child Spot Sale ที่ระบบเคย split กลับเข้ารายการเดิม
- Sales Bill contracts must use direct WTO source allocation for stock sale lines
- receipt active แล้วต้อง lock cancel/edit field การเงิน ทั้ง legacy `receipts` และ new `customer_receipt_allocations` ที่ parent `customer_receipts` ยัง active

## Side Effects

- ตั้ง AR/source receivable
- เขียน `stock_ledger.ref_type = SB` สำหรับ stock-out ที่ SB เป็น movement owner
- Trading SB เป็น mixed-source ได้: PB Trading lines ไม่เป็น stock movement owner และมีผลต่อ Trading Matching / PO Sell allocation เท่านั้น; WTO lines เป็น stock movement owner ผ่าน Sales Stock flow
- เขียน `stock_ledger.ref_type = SB-CANCEL` เมื่อ cancel SB เพื่อคืน stock แบบ append-only reversal
- consume WTO `pending_out` when SB is saved; restore WTO `pending_out` when SB is cancelled
- update/restore WTO `pending_out` and update WTO/PO Sell usage/status
- ส่งต่อไป `/sales/receipts` สำหรับรับเงิน

## Current Code Baseline

- Current `apps/next` page/API code is accepted as the P0 implementation baseline as of 2026-06-11.
- This page belongs to the transaction/stock/payment risk group; accepted baseline means proofed against current code, not target-complete.
- Runtime changes must preserve documented status, allocation, ledger, payment, lock, and reversal boundaries, or update this page-flow and the canonical flow first.
- See [[P0 Transaction Stock Payment Current Code Baseline]] for API/permission/side-effect proof notes and open critical gaps.

## Current Gap

- create path for `STOCK` SB already consumes active WTO `pending_out`, writes `stock_ledger.ref_type = SB`, logs `WTO -> SB` usage, updates `WTO` to `billed`, and updates PO Sell remaining/status
- target create path for `TRADING` SB now changes from manual row-level cost source entry to PB-first mixed-source entry: user searches/selects a Trading PB in a combobox and all PB-derived lines from that PB are auto-filled immediately; the add button adds another PB selector row, users can optionally select one WTO to append stock-derived lines in a separate section, and still use the same PO Sell remaining reduction path when a row is linked
- PB-derived Trading rows write active `trading_allocation_facts`; WTO-derived rows write `sales_bill_source_allocations`, consume WTO `pending_out`, write `stock_ledger.ref_type = SB`, usage/status logs, and do not create Trading cost facts
- durable allocation fact tables exist for `SB line`, `WTO -> SB`, `SB -> PO Sell/Spot Sale`, and `Customer advance -> SB`; new create/cancel writes them and read surfaces use them before legacy JSON snapshots
- cancel write path exists for WTO-backed Stock SB: blocks active RCP, rejects legacy PSALE-backed SB as data repair, restores consumed WTO `pending_out`, appends `SB-CANCEL` without deleting the original `SB` ledger, appends `released_from_sales_bill`, returns WTO to `delivered`, reverses PO Sell usage, and appends `sales_bill_status_logs`
- Runtime cleanup removed intermediate stock-issue create/cancel entry points: new Sales Bill writes reject PSALE fields with `410`, do not query/update `stock_issues`, do not create `source_type = PSALE`, and require WTO direct for stock sale
- UI list action opens SB cancel dialog and calls `PATCH /api/sales/bills/{docNo}`; server remains the source of truth for receipt-lock and reversal validation through `canCancel`/`lockedReason` from `GET /api/sales/bills`
- QA sample `SB2606-0003` confirmed `SB` + `SB-CANCEL` ledger net zero, WTO `WTO012606-0005` returned to `delivered`, `pending_out` returned, and PO Sell `POS6906-0009` header plus `items[].remainingQty` returned to outstanding
- Browser QA sample `SB2606-0004` confirmed row-level cancel dialog works, PATCH returns 200, the row changes to cancelled, the cancel button becomes disabled, `SB` + `SB-CANCEL` ledger nets to zero, WTO `WTO012606-0003` returned to `delivered`, `pending_out` returned, and PO Sell `POS6906-0003` returned to outstanding
- Historical intermediate stock-issue QA samples are retained only as legacy proof; they are not part of the target Sales Bill flow
- edit write path still does not exist by policy; Trading SB has allocation-only correction through audited fact reversal/recreate, while other SB correction remains cancel/recreate after receipt-lock validation
- Trading SB source allocation to Trading PB and manual non-PB Trading Cost Source now has a durable create/cancel path through `trading_allocation_facts`; SB detail and print read active line facts for Trading source labels and matched COGS
- Trading SB allocation-only correction exists in the list/detail UI and API as `PATCH /api/sales/bills/{docNo}` with `action = correct_trading_allocations`; the list exposes `แก้ต้นทุน` for Trading rows, the detail modal uses searchable line-level Trading Cost Source selection, and the API reverses prior active facts, appends corrected active facts, updates SB total cost/gross profit, and does not touch stock/WTO/warehouse state
- Trading PB cost source ids use `PB:<docNo>:<lineNo>` and must resolve only active `purchase_bill_items`; superseded purchase bill item rows are audit/history and must not appear in Sales Bill source options, create validation, or allocation correction source resolution
- Mixed-source Trading SB browser/API QA exists as `npm run qa:sales-bill-mixed-trading-browser --workspace @ns-scrap-erp/next`: it seeds PB Trading + WTO data, verifies the create modal controls, saves one Trading SB with PB-derived and WTO-derived lines, verifies `trading_allocation_facts` only for PB lines, verifies stock allocation/ledger/pending_out/WTO billed side effects only for WTO lines, cancels the SB, verifies `released_from_sales_bill`, `SB-CANCEL`, WTO pending_out restored, WTO `delivered`, and cancelled allocation facts, and verifies license plate plus header Trading semantics
- Sales Bill detail modal and `/sales/bills/[docNo]` now expose status timeline from `sales_bill_status_logs` plus source usage facts from `weight_ticket_usage_logs`, `sales_bill_po_sell_allocations`, `trading_allocation_facts`, and `sales_bill_customer_advance_allocations`. This keeps detail/timeline grounded in write-path facts instead of deriving downstream usage from the header status string.
- customer advance availability/create/cancel now uses `sales_bill_customer_advance_allocations`; `/finance/customer-advance` still needs its own dedicated `customer_advances` header table in a later finance batch
- receipt relation/lock is enforced by shared server policy; automated edge-case tests for legacy receipt/RCP lock are still needed
- durable allocation tables/write-path for `sales_bill_lines`, `sales_bill_source_allocations`, `sales_bill_po_sell_allocations`, and `sales_bill_customer_advance_allocations` exists for new SB create/cancel; Stock SB detail/print/list item counts now read new line/source/PO allocation facts first and show a warning instead of inventing allocation data for legacy SBs that have no durable facts
- New Stock/Trading COGS verification should use WTO-backed SB and mixed Trading+WTO only. Legacy intermediate stock-issue verification is historical only because `/sales/stock-issue` runtime entry points are removed.
- Sales Bill list drilldown and owner route rendering are covered by `npm run qa:sales-bill-mixed-trading-browser --workspace @ns-scrap-erp/next`: the QA searches the created SB in `/sales/bills`, clicks the table row to verify the detail dialog, and opens `/sales/bills/[docNo]` directly to verify source-link navigation.
- Sales Bill branch-scope enforcement is covered by `npm run qa:sales-bill-mixed-trading-browser --workspace @ns-scrap-erp/next`: a non-admin app user with access to one branch can list/detail/create/cancel only within that branch; other-branch SB rows, Trading PB sources, WTO sources, branches, and detail/cancel targets are hidden or rejected without mutation.
- Sales Bill list VAT column is a compact tax-document indicator: when a VAT invoice is issued, show only `vatInvoiceNo`; when it is not issued, show the pending badge `ยังไม่ออก`. Detail surfaces can still show the full issued/not-issued wording.

## Implementation Checklist

- [x] Verify current Next page/component against this page-flow
- [x] Verify API route handlers match Current API and status rules above
- [x] Sync current create-path side effects with [[Sales Bills Page Flow]]
- [x] Add cancel/reversal API for WTO-backed Stock SB
- [x] Supersede converted stock-issue cancel policy with direct WTO-backed SB cancel/reversal target
- [x] Design durable allocation tables before enabling SB edit/runtime change
- [x] Expose optional row-level PO Sell selector for Trading SB and harden API so Trading SB cannot carry stock-source/warehouse fields
- [x] Require row-level Trading PB cost source for Trading SB create, write `trading_allocation_facts`, and cancel those facts without writing stock ledger
- [x] Add first-class manual non-PB Trading Cost Source support for Trading SB create without stock ledger side effects
- [x] Read Trading SB detail source labels and matched COGS from active `trading_allocation_facts`
- [x] Sales Bill print source labels use the same `getSalesBillDetail()` allocation-fact read model as detail
- [x] Add allocation-only Trading SB correction API with audited fact reversal/recreate
- [x] Add UI action for allocation-only Trading SB correction; Sales Bill full document edit remains disabled
- [x] Add rollback-based automated verification for Trading SB allocation correction success, capacity guard, product mismatch guard, corrected COGS/GP, and no stock ledger side effect
- [x] Browser QA Stock SB cancel happy path with PO Sell outstanding reversal
- [x] Browser QA Trading SB allocation correction with multi-line source changes and corrected Matched COGS/GP
- [x] API smoke durable Sales Bill allocation write-path for Trading SB create facts/no-stock-side-effect
- [x] Implement mixed-source Trading SB create UX: searchable Trading PB combobox that auto-fills every line from the selected PB, add button for another PB selector row, optional WTO section, editable net selling weight, blank price, line-level PO Sell
- [x] Harden API for mixed-source Trading SB so stock-source side effects are derived by line source, not header mode alone
- [x] Browser/API smoke mixed-source Trading SB create with seeded PB+WTO source data
- [x] Mark intermediate stock-issue browser QA as legacy-only after target flow moved to direct WTO-backed SB
- [x] Normalize Stock SB detail/print/list item-count reads to durable allocation facts for new SBs and expose no-fallback warning for legacy SBs without facts
- [x] Mark intermediate stock-issue rollback verification as legacy-only after target flow moved to direct WTO-backed SB
- [x] Design any future line-level SB export from durable allocation facts only
- [x] Decide legacy SB reconciliation/backfill policy before removing the legacy snapshot display path entirely
- [x] Add automated tests for SB cancel edge cases before enabling broader edit/runtime change
- [x] Browser QA Sales Bill list row click opens the detail dialog and `/sales/bills/[docNo]` renders by document number
- [x] Sales Bill detail/timeline surfaces downstream usage facts from dedicated logs/fact tables
- [x] Enforce branch scope for Sales Bill list/export/options/detail/create/cancel and Trading allocation correction

2026-06-14 update:
- Legacy/test Sales Bills without durable allocation facts do not need a backfill. Test data can be removed later; new reporting/export work must not add more runtime compatibility for malformed legacy snapshots.
- `/api/sales/bills?format=xlsx` exports Sales Bill rows at line level from `sales_bill_lines`, `sales_bill_source_allocations`, `sales_bill_po_sell_allocations`, and `trading_allocation_facts` instead of exporting header rows from `sales_bills.items`.
- Customer/Product Tracking and main dashboard sales qty/product breakdowns read Sales Bill line facts through the shared sales-line read model. Header-level AR/total/GP fields remain on `sales_bills`.
- Cancel edge-case automation is covered by `npm run verify:sales-bill-cancel-edge-cases --workspace @ns-scrap-erp/next`, including active RCP lock detection, PO Sell restore, customer advance allocation release, and Trading allocation fact cancellation.
- [ ] Update this file and canonical reference if contract changes
