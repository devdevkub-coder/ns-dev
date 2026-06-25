---
title: Sales Bills Page Flow
aliases:
  - Flow หน้าบิลขาย
  - Sales Bills Page Flow
  - SB from WTO Flow
tags:
  - ns-scrap-erp
  - sales
  - sales-bills
  - page-flow
status: draft
created: 2026-06-10
updated: 2026-06-25
---

# Sales Bills Page Flow / Flow หน้า `/sales/bills`

เอกสารนี้แยก flow เฉพาะหน้า `/sales/bills` ออกจาก [[Sales Flow]] เพื่อให้ behavior ระดับหน้า, modal, validation, allocation, totals, และ side effects อ่านได้จบก่อนเริ่มแก้โค้ด

## Scope

หน้า `/sales/bills` รับผิดชอบ:

- สร้าง `SB` จาก `WTO` เป็น flow หลักของการออกบิลขาย
- แสดงรายการสินค้าจาก `WTO` ที่เลือก แล้วให้ผู้ใช้จัดสรรยอดขายเข้ากับ `PO Sell` รายบรรทัด
- แยกยอดที่ส่งเกินยอดคงเหลือของ `PO Sell` เป็น `Spot Sale` รายบรรทัด
- คำนวณ VAT, ส่วนลด, ยอดรวม, มัดจำ/เงินล่วงหน้า Customer, และยอดลูกหนี้สุทธิด้วย pattern เดียวกับบิลรับซื้อ
- สร้างลูกหนี้/AR และ usage/allocation facts ของ `WTO -> SB`, `SB -> PO Sell`, และ `Customer advance -> SB`
- พิมพ์บิลขายรายใบ โดยใช้ corporate A4 portrait และ multi-page baseline เดียวกับ `PB`

หน้า `/sales/bills` ไม่รับผิดชอบ:

- การสร้าง `PO Sell`; ใช้ `/sales/po-sell`
- การสร้าง `WTO`; ใช้ `ชั่งสินค้า / รับ-ส่งของ` และรายการที่ `/daily/weight-ticket-list`
- การรับเงิน Customer; ใช้ `/sales/receipts`
- การแก้ `WTO` หลังถูกใช้แล้ว; ต้องใช้ reversal/status/usage policy ของเอกสารต้นทาง

## Current Runtime Assessment

การปรับปรุงเพิ่มเติม ณ 2026-06-16:
- **ปรับปรุงโครงสร้างคอลัมน์ A4 Print:** ในไฟล์ [sales-bill-print.ts](file:///c:/new-ns-scrap-erp/apps/next/src/lib/sales-bill-print.ts) ได้ทำการลบคอลัมน์ Gross, หัก และจำนวนเดิมออก เปลี่ยนชื่อหัวตารางเป็น "จำนวนสุทธิ" (แสดงเฉพาะตัวเลขน้ำหนักสุทธิไม่มีหน่วยวัด) ซ่อนรหัสสินค้า SKU, ซ่อนข้อความ Spot Sale, Matched COGS และคำอื่นๆ โดยแสดงเฉพาะ Trading Allocation (เช่น `Trading PB PB012606-0010:1`) ตามที่ผู้ใช้สั่งการ
- **ปรับปรุงปุ่มปฏิบัติการ:** ในไฟล์ [TransactionBillsPageClient.tsx](file:///c:/new-ns-scrap-erp/apps/next/src/components/daily/TransactionBillsPageClient.tsx) เปลี่ยนปุ่ม "แก้ต้นทุน" (เฉพาะประเภท TRADING) ให้เป็นปุ่ม "แก้ไข" ดีไซน์ขอบ Slate-300 และแสดงปุ่มแก้ไข (แบบ disabled) ใน Mobile viewport เสมอ เพื่อการจัดเรียง 3 ปุ่มที่สวยงาม
- **ตรวจสอบสิทธิ์และคุณภาพ:** ผ่านการรัน `npm run type-check` และ `lint` สำเร็จ 100%

ตรวจจาก current code ณ 2026-06-14:

- `GET /api/sales/bills` โหลด list/source options และส่ง `WTO` source เฉพาะสถานะ `delivered` สำหรับบิลขาย STOCK ใหม่
- `POST /api/sales/bills` create path ทำงานครบสำหรับ `STOCK` baseline: สร้าง `SB`, consume active `WTO` pending_out ตาม `stockIssueQty`, เขียน `stock_ledger.ref_type = SB`, append `weight_ticket_usage_logs`, update `WTO` เป็น `billed` เฉพาะเมื่อ pending_out หมดทั้งใบ ไม่งั้นเป็น `partially_billed / ออกบิลแล้วบางส่วน` เพื่อรอ `รับของคืน`, และ update `PO Sell` remaining/status
- Stock SB COGS ใช้ต้นทุนเฉลี่ย ณ เวลาขาย: ตอน consume WTO pending_out ระบบ snapshot ต้นทุนลง `stock_ledger.unit_cost/value_out` ของ `SB`; detail/report ต้องอ่าน COGS จาก SB ledger ที่ posted แล้ว ไม่คำนวณใหม่จาก WAC ปัจจุบัน
- `GET /api/sales/bills/[id]` เป็น detail/read model ของบิลขายเท่านั้น ไม่แสดงฟอร์มรับของคืน; action รับคืนต้องเริ่มจาก detail ของ `WTO` เพื่อให้ user เห็นว่าเป็นการปิด remaining `pending_out` ของใบส่งของ
- Business language ของ source ค้างส่งคือ `pending_out / รอออก` เท่านั้น; `stock_holds` เป็นชื่อ technical table ใน DB ไม่ใช่คำที่ UI/API business contract ควรใช้
- `POST /api/sales/bills/[id]/stock-return` ปิด remaining `pending_out` จาก SB partial billing: ถ้ารับคืนครบให้ release pending_out กลับเป็น available โดยไม่เขียน ledger; ถ้ารับคืนจริงน้อยกว่า pending_out ต้องบังคับเหตุผล, release เฉพาะน้ำหนักที่คืน, ปิดส่วนต่างเป็น `lost`, และเขียน `stock_ledger.ref_type = WTO-RETURN-LOSS` เป็น qty_out/value_out
- `GET /api/daily/weight-tickets/[id]/stock-returns` เป็น read model สำหรับปุ่ม `รับของคืน` บน `WTO`: ต้องคืนรายการเฉพาะเมื่อ WTO ถูกนำไปออก `SB` แล้วบางส่วนและยังมี active `pending_out` เหลืออยู่; ถ้าออกบิลครบ, ยังไม่ถูกออกบิล, หรือรับคืนแล้ว ต้องไม่แสดงปุ่ม
- `PATCH /api/sales/bills/[id]` action `cancel` สำหรับ `STOCK` SB ที่ยังไม่มี active receipt: block active `RCP`, append `stock_ledger.ref_type = SB-CANCEL` ด้วย unit cost/value เดิมของ `SB` โดยไม่ลบ `SB`, append `released_from_sales_bill`, append `po_sell_allocation_logs.released_from_sales_bill`, reverse `PO Sell` usage, mark `SB` เป็น `cancelled`, และ append `sales_bill_status_logs`; ถ้า WTO ยังไม่เคยรับของคืนให้ reopen consumed `WTO` pending_out กลับเป็น `pending_out`, แต่ถ้าเคยรับของคืนแล้วห้าม reopen pending_out ซ้ำและให้ `SB-CANCEL` คืน stock ตรง
- Cancel-after-return rule เป็น strict fact check: ถ้ามี `weight_ticket_usage_logs.action in (returned_from_sales_bill, loss_from_sales_bill)` ของ SB นั้นแล้ว cancel ห้าม append `released_from_sales_bill` หรือ increment `weight_ticket_product_summaries.remaining_weight` ซ้ำ
- หลัง `SB-CANCEL` หรือรับคืนแบบมี loss WAC ปัจจุบันอาจเปลี่ยนจาก ledger ที่ posted จริง: `SB-CANCEL` คืน stock ด้วย cost snapshot เดิมของ SB, ส่วน `WTO-RETURN-LOSS` ตัด value ออกจาก stock ด้วย WAC ของ bucket ณ เวลาปิดรับคืน
- หลังสร้างหรือแก้ไข `SB` สำเร็จ หน้า list ต้อง reload ด้วย search/filter/page context เดิมของผู้ใช้เท่านั้น ห้าม auto ใส่เลข `SB` ที่เพิ่งบันทึกลง search box เพราะจะทำให้ตารางถูก filter เหลือแค่บิลนั้นโดยไม่ตั้งใจ
- ถ้าเลือก `ออกใบกำกับภาษีแล้ว` ใน `SB` form ต้องบังคับกรอกทั้ง `เลขที่ใบกำกับภาษี` และ `วันที่ใบกำกับภาษี`; UI ต้อง mark เป็น required และ API ต้อง reject payload ที่ขาด field ใด field หนึ่ง
- UI ปุ่มยกเลิกของบิลขายเปิดใช้แล้วสำหรับ row ที่ server ส่ง `canCancel = true`; browser QA ผ่านสำหรับ WTO-backed Stock SB cancel และ PO Sell outstanding reversal
- `TRADING` SB มี row-level Trading Cost Source, `trading_allocation_facts`, allocation-only correction API/UI, และ browser QA ผ่านแล้วสำหรับ multi-line source correction โดยไม่เขียน stock ledger
- new SB create/cancel write-path now records dedicated allocation facts for `SB line`, `WTO -> SB`, `SB -> PO Sell/Spot Sale`, and `Customer advance -> SB`; Stock SB detail/print/list item-count reads durable line/source/PO facts first, while legacy SBs without facts show a reconciliation warning instead of inventing allocation data from JSON
- `Pending Sale / PSALE / เบิกออกรอบิล` ถูกถอดออกจาก target runtime แล้ว: `POST /api/sales/bills` ไม่ query/update `stock_issues`, ไม่สร้าง `source_type = PSALE`, และ stock sale ใหม่ต้องเปิดจาก `WTO` เท่านั้น
- ห้ามทำ runtime fallback จาก `sales_bills.items` หรือชื่อ concept เก่าเพื่อเดา source/correction ถ้า allocation fact หรือ pending_out fact ขาด ต้องแสดง reconciliation gap หรือ reject write
- Customer selector/source validation ต้องอิง active `customer_branches` ของสาขาเอกสาร: Stock SB รับ customer/branch จาก WTO แล้ว validate mapping ก่อน save, Trading SB เลือก branch ก่อนแล้วกรอง customer ตาม mapping; ไม่มี mapping ต้อง reject โดยไม่ fallback เป็นทุกสาขา

## Target Durable Allocation Contract

เป้าหมายก่อนเปิด full edit/correction ของ `STOCK` SB คือแยก fact ที่อ่านซ้ำได้จาก `sales_bills.items` JSON ออกมาเป็น table ชัดเจน โดยไม่ทำ runtime fallback จาก JSON เพื่อเดา allocation ถ้า fact ขาด ต้อง reject write หรือแสดง reconciliation gap ให้แก้ data/write path. Migration/write-path และ read-model สำหรับบิลใหม่มีแล้ว; reconciliation/backfill สำหรับบิลเก่ายังเป็นงานถัดไป

### Owner Boundary

| Area | Owner table | Rule |
|---|---|---|
| SB header / AR | `sales_bills` | เก็บ doc no, customer, branch, totals, receipt balance, status |
| SB line snapshot | `sales_bill_lines` target | 1 row ต่อ business line; เก็บ product, gross/deduct/net/billed qty, unit price, discount, VAT basis, line total |
| Physical stock-out | `stock_ledger` + `stock_holds` technical table | `WTO` สร้าง `pending_out / รอออก` โดยไม่เข้า ledger; `SB` เป็น movement owner ที่ consume pending_out และเขียน `stock_ledger.ref_type = SB` |
| WTO source usage | `sales_bill_source_allocations` target + `weight_ticket_usage_logs` audit | ระบุว่า SB line ใช้ WTO summary/line ไหน จำนวนเท่าไร และ reversal status |
| PO Sell commitment | `sales_bill_po_sell_allocations` target + `po_sell_allocation_logs` audit | ระบุ SB line -> PO Sell line หรือ `SPOT_SALE`; ใช้คืน remaining ตอน cancel และ log allocate/release สำหรับ timeline |
| Customer advance | `sales_bill_customer_advance_allocations` target | ระบุ SB -> customer advance fact; ใช้ release/recalculate ตอน cancel/correction |
| Trading cost | `trading_allocation_facts` | มีแล้วสำหรับ Trading PB/manual Cost Source; ใช้แทน Stock allocation tables |

### Target Tables

| Table | Key columns | Required rule |
|---|---|---|
| `sales_bill_lines` | `sales_bill_id`, `line_no`, `product_id`, `qty`, `gross_weight`, `deduct_weight`, `net_weight`, `unit_price`, `discount_amount`, `line_amount`, `vat_amount`, `status` | เป็น source หลักของ detail/print/export; `sales_bills.items` คงได้เฉพาะ compatibility snapshot ระหว่าง migration |
| `sales_bill_source_allocations` | `sales_bill_id`, `sales_line_no`, `source_type`, `source_doc_no`, `source_line_no`, `product_id`, `allocated_qty`, `movement_owner`, `stock_ledger_ref_type`, `status` | target source type สำหรับ stock sale คือ `WTO`; `movement_owner` = `SALES_BILL`; cancel ต้อง mark `cancelled/reversed` ไม่ลบ |
| `sales_bill_po_sell_allocations` | `sales_bill_id`, `sales_line_no`, `po_sell_id`, `po_sell_line_no`, `allocation_type`, `product_id`, `allocated_qty`, `unit_price`, `allocated_amount`, `status` | `allocation_type` = `PO_SELL` หรือ `SPOT_SALE`; `PO_SELL` ต้อง validate customer/branch/product/remaining ใน transaction |
| `po_sell_allocation_logs` | `po_sell_id`, `sales_bill_id`, `sales_bill_line_no`, `action`, `allocated_qty`, `allocated_amount`, `from_remaining_qty`, `to_remaining_qty` | append-only audit สำหรับ `allocated_to_sales_bill` และ `released_from_sales_bill`; detail/timeline อ่าน log นี้ก่อน allocation fact |
| `sales_bill_customer_advance_allocations` | `sales_bill_id`, `customer_advance_doc_no`, `customer_id`, `allocated_amount`, `outstanding_before`, `outstanding_after`, `status` | ต้อง block over-allocation จาก active allocation facts และ release แบบ append/update status ใน transaction เดียวกับ SB cancel/correction |

Index minimum:

- `sales_bill_lines(sales_bill_id, line_no)` unique
- `sales_bill_source_allocations(sales_bill_id, sales_line_no, status)`
- `sales_bill_source_allocations(source_type, source_doc_no, status)`
- `sales_bill_po_sell_allocations(po_sell_id, status)`
- `sales_bill_po_sell_allocations(sales_bill_id, sales_line_no, status)`
- `po_sell_allocation_logs(po_sell_id, created_at desc)`
- `po_sell_allocation_logs(sales_bill_id)`
- `sales_bill_customer_advance_allocations(customer_advance_doc_no, status)`
- `sales_bill_customer_advance_allocations(sales_bill_id, customer_advance_doc_no) where status = active` unique

### API Rules

`POST /api/sales/bills`:

- Validate source facts first: `STOCK` ต้องใช้ `WTO` source เท่านั้น; `PSALE`, direct stock, และ Trading mode ห้ามปนกันแบบเงียบ ๆ.
- Validate Customer branch eligibility from `customer_branches` in the same transaction as SB create/cancel-sensitive source resolution.
- Create header, line facts, source allocations, PO Sell/Spot allocations, customer advance allocations, stock ledger/pending_out changes, and status logs in one transaction.
- For `STOCK`, allow partial source allocation when Customer buys less than sent quantity. The remaining source quantity stays as active `pending_out` and must be closed by the explicit `รับของคืน` action; do not silently reuse it in another SB.
- For `TRADING`, continue using `trading_allocation_facts`; do not write stock allocation or stock ledger.

`GET /api/sales/bills` and `GET /api/sales/bills/{docNo}`:

- Detail and print read normalized line/allocation facts for new SBs; list export currently remains list-level but counts durable line facts first. Any future line-level export, dashboard, and tracking must use the same normalized facts.
- Detail/timeline reads `sales_bill_status_logs`, `weight_ticket_usage_logs`, and `po_sell_allocation_logs` directly; it must not infer usage history from status strings alone.
- If a legacy SB has no normalized facts, show a migration/reconciliation signal; do not invent source labels, COGS, PO Sell usage, or customer advance from stale JSON.

`PATCH /api/sales/bills/{docNo}`:

- `action = cancel`: mark active allocations cancelled/reversed, append `SB-CANCEL` stock reversal, restore PO Sell/customer advance remaining, append status logs; reopen WTO pending_out เฉพาะกรณียังไม่มี return-from-WTO/SB เท่านั้น
- `action = correct_*`: allowed only after the relevant allocation facts exist; correction must be **diff-only** for quantity/price/deduct changes. Do not reverse the whole SB and repost the whole bill unless the whole source context is cancelled/replaced. Append only the delta fact/ledger rows needed to move from old posted state to new state, because stock value, COGS, WAC, PO Sell remaining, AR, VAT, and customer advance must reflect the real changed portion only.
- `PATCH /api/sales/bills` edit supports commercial correction without changing source/stock movement: keep `transactionMode`, branch, Customer, WTO source, product, line count, and `stockIssueQty` unchanged; allow changing `จำนวนที่ขายได้`, `หักสิ่งเจือปน`, derived `น้ำหนักขายสุทธิ`, line `PO Sell` reference between `Spot Sale` / `PO Sell`, line price, line discount, notes, VAT/header totals, export order, and Customer Advance allocation when no active RCP exists. This correction updates Sales Bill line/totals/AR and PO Sell/Customer Advance allocation facts, but must not touch `stock_ledger`, `WTO pending_out`, or WAC because the physical source quantity is unchanged.
- Customer Advance correction follows the Purchase Bill ADV pattern: release old active `sales_bill_customer_advance_allocations`, validate the newly selected CADV belongs to the same Customer and has enough available amount after releasing the old allocation, create a new active allocation, and recalculate `sales_bills.received_amount` / `sales_bills.receivable_balance` in the same transaction. If an active RCP exists, reject the edit instead of mixing receipt and advance correction.
- Stock/source correction is a separate future flow. Changing `stockIssueQty`, swapping WTO/source documents, changing product/line count, or editing a bill after return/loss facts exist requires a dedicated append-only stock correction policy and must not be hidden inside normal edit.
- Edit modal must keep the original business identity locked like Purchase Bill: `transactionMode`, branch, Customer, WTO source, and Trading PB/Cost Source selectors are read-only/disabled. Changing `STOCK` to `TRADING` or swapping source documents is not a normal edit; it requires cancel/reissue or a dedicated correction flow with append-only facts.

`POST /api/sales/bills/{docNo}/stock-return`:

- Action เริ่มจาก detail ของ `WTO` เท่านั้น ไม่อยู่ใน Sales Bill detail; Sales Bill API เป็น write endpoint เพื่อผูก audit กับ SB/WTO/product/warehouse
- ใช้เฉพาะ `STOCK` SB ที่เคย consume WTO และยังมี active `stock_holds.status = active` จาก WTO นั้น
- ปุ่ม `รับของคืน` ต้องแสดงบน WTO detail เมื่อ WTO มี active `pending_out` ที่ถูก SB ใช้ไปแล้วบางส่วนและยังเหลือรอปิดยอด; ถ้า WTO ยังไม่ถูกออกบิล, ออกบิลครบแล้ว, หรือปิดรับคืนแล้ว ต้องไม่แสดงปุ่ม
- Payload ต้องระบุ `pendingOutKey`, `returnedQty`, `reason`, และ `note`; `reason` บังคับเมื่อ `returnedQty < pending_out`
- ถ้า `returnedQty = pending_out`: update pending_out เป็น `released`, decrement `weight_ticket_product_summaries.remaining_weight`, append `weight_ticket_usage_logs.action = returned_from_sales_bill`, ไม่เขียน `stock_ledger` เพราะของก้อนนี้ยังไม่เคยถูก stock-out
- ถ้า `returnedQty < pending_out`: split/close pending_out เป็น returned + lost, append `returned_from_sales_bill` สำหรับน้ำหนักที่คืน, append `loss_from_sales_bill` สำหรับส่วนต่าง, และเขียน `stock_ledger.ref_type = WTO-RETURN-LOSS` ด้วย `qty_out = lossQty`
- ถ้า `returnedQty > pending_out`: reject; น้ำหนักเกินจากที่ค้างต้องไปผ่าน stock adjust/flow รับเข้าอื่น ไม่ปนกับ return ของ WTO นี้
- หลังปิด pending_out ต้องอัปเดต `WTO.status` เป็น `billed` เฉพาะเมื่อไม่มี remaining weight/active pending_out แล้ว ถ้ายังเหลือ active pending_out ให้เป็น `partially_billed`

## Canonical Create SB Flow

Flow เป้าหมายของการสร้างบิลขายรอบนี้คือ:

```text
PO Sell
-> WTO ใบส่งของ
-> Sales Bill จาก WTO
-> Receipt
```

ขั้นตอนในหน้า `/sales/bills`:

| Step | User/System | Action | Result |
|---|---|---|---|
| 1 | User | เปิด modal สร้างบิลขาย | form เริ่มที่ข้อมูลเอกสารและ Customer/สาขา |
| 2 | User | เลือกสาขาและ Customer | ใช้กรอง `WTO` ที่ยังไม่ถูกออกบิลและ `PO Sell` ที่ยังมี remaining |
| 3 | User | เลือก `WTO` 1 ใบที่เป็น Customer/สาขาเดียวกัน | ระบบล็อก source สำคัญจาก `WTO` และดึงรายการสินค้า/น้ำหนักจากเอกสารส่งของ |
| 4 | System | แสดงรายการสินค้าจาก `WTO` | line ต้องมาจาก snapshot ของ `WTO` เท่านั้น; ผู้ใช้ไม่กรอกสินค้าเองใน `STOCK` |
| 5 | User | เลือก `PO Sell` หรือ `Spot Sale` ต่อ line เหมือนช่อง `อ้างอิง PO` ของบิลซื้อ | ระบบแสดงยอดคงเหลือของ PO Sell ที่ตรง Customer/สาขา/สินค้า |
| 6 | System/User | แยกยอดเกิน PO Sell เป็น `Spot Sale` | ห้ามตัด PO Sell เกิน remaining; ส่วนเกินต้องเป็น Spot Sale แยก line/source |
| 7 | User | กรอกราคาขาย, ส่วนลด, VAT, เครดิตเทอม, หมายเหตุ, และมัดจำที่จะหัก | totals ใช้ pattern เดียวกับ PB |
| 8 | System | บันทึก `SB` | สร้าง `SB...`, AR, usage/allocation logs, PO Sell billed qty, Customer advance allocation ถ้ามี |
| 9 | System | อัปเดตสถานะ source | `WTO` เป็น `ออกบิลแล้ว` เมื่อไม่มี pending_out เหลือ; ถ้าออกบิลบางส่วนให้เป็น `ออกบิลแล้วบางส่วน` เพื่อให้ปุ่ม `รับของคืน` บน WTO ปิดยอดค้างก่อน ส่วน `PO Sell` เป็น `ออกบิลบางส่วน` หรือ `ออกบิลแล้ว` ตามยอดจริง |
| 10 | System | Reload list | กลับไปหน้า list ด้วย search/filter/page เดิม ห้าม auto filter ด้วยเลข `SB` ที่เพิ่งสร้างหรือแก้ไข |

## Fields To Show

### ข้อมูลเอกสาร

ส่วนนี้ต้องมี `วันที่เอกสาร` และ `วันที่กำหนดส่ง/วันครบกำหนด` อยู่ใน section เดียวกันกับข้อมูลเอกสาร ไม่แยกไป header ลอย

| Field | จำเป็น | หมายเหตุ |
|---|---:|---|
| เลขเอกสาร `SB` | ระบบ | ไม่ให้ผู้ใช้กรอก; generate เมื่อบันทึก |
| วันที่เอกสาร | ใช่ | default วันนี้ แต่ผู้ใช้แก้ได้ตามสิทธิ์ |
| วันที่ครบกำหนด/กำหนดชำระ | ไม่ | คำนวณจาก credit term ได้ แต่แสดงให้แก้/ตรวจตาม business rule |
| สาขา/คลัง | ใช่ | Required; ใช้กรอง `WTO`, `PO Sell`, Customer advance และหัวกระดาษ |
| Customer | ใช่ | ใช้ search dropdown; ค้นหาได้จากรหัส/ชื่อลูกค้า และใช้กรอง `WTO`, `PO Sell`, Customer advance และ AR |
| ช่องทางขาย | ใช่ | ระบบ auto ตั้งจาก `Customer.marketScope` เป็น `ในประเทศ` หรือ `ต่างประเทศ` เมื่อเลือกลูกค้า และแสดงเป็น read-only ใน modal เพื่อกันเลือกช่องทางไม่ตรงกับลูกค้า |
| เลขที่ order ส่งออก | เฉพาะต่างประเทศ | แสดงหลัง `ช่องทางขาย` เฉพาะเมื่อ Customer เป็น `ต่างประเทศ`; ต้องกรอกก่อนบันทึก และบันทึกลง `sales_bills.export_order_no`; บิลในประเทศห้ามส่งค่านี้ |
| เครดิตเทอม | ไม่ | ดึงจาก Customer ได้ แต่ snapshot ลงบิล |
| หมายเหตุ | ไม่ | ข้อมูลประกอบเอกสาร |

### Source Documents

| Field | จำเป็น | หมายเหตุ |
|---|---:|---|
| `WTO` ใบส่งของ | ใช่ | เลือกเฉพาะ `WTO` ที่ยังไม่ถูกออกบิล, สาขา/Customer ตรงกัน, ไม่ยกเลิก |
| รายการสินค้า WTO | ระบบ | แสดงจาก `WTO` snapshot; ไม่ให้ผู้ใช้พิมพ์สินค้าใหม่, เพิ่มรายการเอง, หรือลบรายการเองใน `STOCK` |
| `PO Sell` allocation | เฉพาะ line ที่มี PO | เลือกต่อ line ใน column `อ้างอิง PO Sell`; option ต้องกรองตาม Customer/สาขา/สินค้า/remaining |
| `Spot Sale` line/source | ใช่ เป็น default ต่อ line | option แรกของ column `อ้างอิง PO Sell`; ใช้กับยอดที่ไม่มี PO หรือเกินยอด PO Sell remaining |

### รายการสินค้าในหน้า Create/Edit

`STOCK` sales bill ต้องทำเหมือน pattern ของบิลซื้อฝั่ง `STOCK`:

- ถ้ายังไม่เลือก `WTO` ให้แสดง empty state ว่าให้เลือกใบส่งของก่อน ไม่แสดงแถวกรอกสินค้าเปล่า
- เมื่อเลือก `WTO` แล้ว ระบบเติมรายการสินค้าจาก `WTO` product summary/snapshot อัตโนมัติ
- Product/source fields ในรายการที่มาจาก `WTO` เป็น read-only trace; ผู้ใช้แก้ได้เฉพาะค่าธุรกิจของบิล เช่น จำนวนที่จะตัดบิล, ราคา, ส่วนลด, VAT/totals ตาม rule
- Columns หลักของ `STOCK` คือ `สินค้า`, `น้ำหนักสุทธิที่ส่ง`, `จำนวนที่ขายได้`, `หักสิ่งเจือปน`, `น้ำหนักขายสุทธิ`, `อ้างอิง PO Sell`, `ราคา/หน่วย`, `ส่วนลด`, `ยอดรวม`
- `น้ำหนักสุทธิที่ส่ง` มาจาก snapshot ของ `WTO` หลังหักภาชนะแล้ว (`remainingWeight`) และต้องแสดงเป็น read-only trace ของใบส่งของ; ไม่แสดง `Gross` ใน modal บิลขาย
- `จำนวนที่ขายได้` default จาก `น้ำหนักสุทธิที่ส่ง`; ผู้ใช้แก้ได้ตามน้ำหนักที่ Customer ชั่งหรือยอมซื้อจริง ซึ่งอาจน้อยกว่า เท่ากับ หรือมากกว่า `น้ำหนักสุทธิที่ส่ง`
- `หักสิ่งเจือปน` เป็นน้ำหนักที่ Customer ไม่รับซื้อเพราะคุณภาพ/สิ่งเจือปน และใช้เฉพาะกรณี Customer ซื้อครบหรือซื้อเกินน้ำหนักที่ส่ง; `น้ำหนักขายสุทธิ = จำนวนที่ขายได้ - หักสิ่งเจือปน`
- ถ้า `จำนวนที่ขายได้ < น้ำหนักสุทธิที่ส่ง` ถือเป็นกรณีขายไม่ครบ/ออกบิลบางส่วนของของที่ส่งออก ไม่ใช่กรณีหักสิ่งเจือปน; UI ต้องปิดหรือ clear ช่อง `หักสิ่งเจือปน` สำหรับ line นั้น และให้ process ส่วนที่เหลือผ่านปุ่ม `รับของคืน`
- ยอดขายและ AR คิดจาก `น้ำหนักขายสุทธิ`; แต่ stock consume/COGS จาก `WTO pending_out` ต้องตัดไม่เกินน้ำหนักที่ส่งออกจาก `WTO` ตาม source ไม่ใช่ตัดตามน้ำหนักชั่งปลายทางที่อาจเกิน
- แต่ละ line ต้องมี selector `อ้างอิง PO Sell` โดย option แรกคือ `Spot Sale` และ option ถัดไปคือ `PO Sell` ที่ตรง Customer/สาขา/สินค้าและยังมี remaining
- ถ้า WTO summary เดียวต้องตัดทั้ง `PO Sell` และ `Spot Sale` หรือมีมากกว่า 1 PO Sell ต้อง split เป็นหลาย row ใต้สินค้าเดียวกันแบบเดียวกับบิลซื้อ
- ระบบต้อง block save เมื่อจำนวนที่ตัดเข้า `PO Sell` เกิน remaining ต่อสินค้า แต่ต้องยอมให้บันทึกบิลขายจาก `WTO` แบบขายไม่ครบได้ โดยคงส่วนต่างไว้เป็น `pending_out` ที่รอ `รับของคืน`
- แถวที่เลือก `PO Sell` ต้องใช้ราคาจาก `PO Sell` และล็อกช่อง `ราคา/หน่วย`; แถว `Spot Sale` ยังแก้ราคาเองได้
- ไม่แสดงปุ่ม `+ เพิ่มรายการ` และไม่แสดงปุ่ม `ลบ` สำหรับรายการ `STOCK` ที่มาจาก `WTO`
- ปุ่ม `+ เพิ่มแถว` / `ลบ` ใน `STOCK` ใช้ได้เฉพาะการ split allocation ของสินค้าเดิมจาก `WTO`; ไม่ใช่การเพิ่มสินค้า manual
- `TRADING` เป็นคนละ flow และยังอนุญาต manual line ตาม Trading sales-bill design follow-up ได้

### Fields ที่ต้องตัดออกจากหน้า SB

- ไม่แสดงช่อง `เลขที่อ้างอิง` แบบ free-text ใน create/edit `SB`; เอกสารอ้างอิงต้อง derive จาก `WTO` และ allocation ไป `PO Sell`
- ไม่แสดง `ทะเบียนรถ` ใน create/edit/detail/print `SB`
- ไม่แสดงเลข `WTO` ซ้ำในรายการสินค้า เพราะเลือกและแสดงอยู่ใน section `ใบส่งของ WTO` / `ข้อมูลเอกสาร` แล้ว

## Line Allocation Rule

แต่ละ line ที่มาจาก `WTO` ต้องมี source การขาย:

| Source | ใช้เมื่อไหร่ | Rule |
|---|---|---|
| `PO_SELL` | ยอดขายตัดกับ `PO Sell` ได้ | qty/weight ที่ตัดต้องไม่เกิน remaining ของ `PO Sell` line นั้น |
| `SPOT_SALE` | ไม่มี PO Sell หรือยอดเกิน PO Sell remaining | ถือเป็นขายสด/ขายนอก PO แต่ยังมาจาก `WTO` เดียวกัน |
| `MIXED` | WTO line เดียวมีทั้ง PO และส่วนเกิน | ต้อง split เป็น line ย่อยหรือ allocation facts ที่อ่านแยก PO/Spot ได้ชัด |

ตัวอย่าง:

```text
WTO line: SKU001 1,200 กก.
PO Sell remaining: SKU001 1,000 กก.
SB allocation:
- 1,000 กก. -> PO_SELL / POS...
- 200 กก. -> SPOT_SALE
```

Validation:

- ห้ามบันทึก line ที่ไม่มี allocation source
- ห้าม allocate เข้า `PO Sell` เกิน remaining
- ห้ามเลือก `PO Sell` ที่ Customer/สาขา/สินค้าไม่ตรงกับ `WTO` line
- `SB` แบบ `STOCK` ต้องอ้างอิง `WTO` ได้เพียง 1 ใบต่อ 1 บิล
- ห้ามเลือก `WTO` ที่ยกเลิกหรือออกบิลครบแล้ว
- `WTO` อาจถูกออกบิลครบหรือออกบิลบางส่วนใน `SB` เดียว; ถ้าออกบิลบางส่วนต้องคง remaining `pending_out` ไว้ให้ action `รับของคืน` เท่านั้น ห้ามนำ remaining ไปเปิดบิลขายใบอื่นแบบเงียบ ๆ

## Return From WTO Pending Out

ใช้เมื่อ `SB` จาก `WTO` บันทึกแล้ว แต่ Customer ซื้อไม่ครบตามน้ำหนักสุทธิที่ส่งออก

กติกา:

- ระบบต้องแสดงปุ่ม `รับของคืน` เฉพาะบน detail ของ `WTO` ที่มี remaining `pending_out` หลังถูกนำไปออก `SB` บางส่วนแล้ว; ห้ามแสดงฟอร์มนี้ใน Sales Bill detail เพราะ business action คือการปิดยอดค้างของใบส่งของ
- กดปุ่มแล้วต้องเปิด modal ให้ผู้ใช้กรอก `น้ำหนักที่ชั่งกลับมาจริง` และกดยืนยัน; ห้ามคืน stock อัตโนมัติจากส่วนต่างตามเอกสารโดยไม่ชั่งจริง
- Modal ต้องแสดง `น้ำหนักค้างตามระบบ` จาก `WTO pending_out` เป็น read-only เพื่อเทียบกับน้ำหนักคืนจริง
- คืน stock เข้า available โดยการปลด `stock_holds` เฉพาะน้ำหนักที่ชั่งกลับจริง; ของก้อนนี้ยังไม่เคย stock-out ใน ledger จึงไม่ต้องเขียน stock-in ledger เมื่อคืนครบ
- ถ้าน้ำหนักคืนจริงน้อยกว่าน้ำหนักค้าง ต้องเก็บส่วนต่างเป็น loss/diff audit และบังคับเหตุผลก่อนบันทึก
- ส่วน loss ต้องปิด pending_out เป็น `lost`, append `weight_ticket_usage_logs.action = loss_from_sales_bill`, และเขียน `stock_ledger.ref_type = WTO-RETURN-LOSS` เป็น qty_out/value_out โดย link กลับไปยัง `WTO`, `SB`, product, warehouse, ผู้ยืนยันรายการ, และเหตุผล
- ต้นทุนของ `WTO-RETURN-LOSS` ใช้ WAC ของ stock bucket ณ เวลาปิดรับคืน เพราะเป็นการตัดของที่ยังอยู่ใน on-hand ledger ออกจาก stock จริง; ไม่ใช้ราคาขายและไม่ให้ผู้ใช้กรอกต้นทุนเอง
- ถ้าน้ำหนักคืนจริงมากกว่าน้ำหนักค้าง ต้อง reject; น้ำหนักเกินต้องผ่าน stock adjust หรือ flow รับเข้าอื่น ไม่ปนกับ return ของ WTO นี้
- ถ้ามีการรับของคืนจาก `WTO` แล้วภายหลัง `SB` ถูกยกเลิก ห้าม reopen/recreate `pending_out` ของ `WTO` ซ้ำ; ให้ `SB-CANCEL` คืน stock ตรงเฉพาะจำนวนที่ `SB` เคยขาย ด้วย unit cost/value เดิมจาก `SB` และคง return/diff audit เดิมไว้
- ตัวอย่าง: `WTO` ส่ง 100, `SB` ขาย 50, รับของคืนจริง 48 และบันทึก loss/diff 2; ถ้าภายหลังยกเลิก `SB` ให้คืน stock ตรง 50 ผ่าน `SB-CANCEL` ทำให้ stock คืนรวม 98 และ diff 2 ยังคงเป็น audit ไม่กลับไปสร้าง pending_out 100 ใหม่

## Totals, VAT, And Deposit

ใช้ functional และ visual baseline จาก [[Purchase Bills Page Flow]] โดยปรับชื่อฝั่งขาย:

| ลำดับ | Field | Rule |
|---:|---|---|
| 1 | ยอดเงินรวม | sum line amount ก่อนส่วนลดท้ายบิล |
| 2 | หักส่วนลด | money input pattern เดียวกับ PB |
| 3 | ยอดหลังหักส่วนลด | subtotal - discount |
| 4 | VAT | คำนวณจากยอดหลังหักส่วนลดตาม VAT config/snapshot |
| 5 | ยอดรวมทั้งสิ้น | ยอดหลังหักส่วนลด + VAT หรือ gross ตาม VAT mode |
| 6 | หักมัดจำ/เงินล่วงหน้า Customer | เลือก Customer advance ที่จ่ายแล้วและยัง available |
| 7 | ยอดลูกหนี้สุทธิ | grand total - allocated customer advance |

กติกาใบกำกับภาษี:

- ถ้าไม่ได้เลือก `ออกใบกำกับภาษีแล้ว` ให้เก็บ `vatInvoiceNo` และ `vatInvoiceDate` เป็น `null`
- ถ้าเลือก `ออกใบกำกับภาษีแล้ว` ต้องกรอก `vatInvoiceNo` และ `vatInvoiceDate` ก่อนบันทึก ทั้ง create และ edit
- `vatInvoiceDate` ต้องเป็นวันที่จริงตาม date picker และส่งเข้า API เป็น `YYYY-MM-DD`

กติกามัดจำ:

- Customer advance เป็น source เงินล่วงหน้าฝั่ง Customer แยกจาก receipt ปกติ
- เลือกได้เฉพาะ Customer/สาขาเดียวกันและยังมียอด available
- ห้าม allocate เกินยอด available และห้ามทำให้ยอดลูกหนี้สุทธิติดลบ
- ถ้าแก้หรือยกเลิก `SB` ต้อง release/recalculate customer advance allocation ใน transaction เดียวกัน
- Detail/print ต้องเห็นว่า `SB` หักมัดจำจากเอกสารใด จำนวนเท่าไร และเหลือยอดรับชำระเท่าไร

## Print Direction

Implemented 2026-06-10: `SB` print ยึด baseline เดียวกับ `PB`:

- A4 portrait
- รองรับหลายหน้าเมื่อรายการเยอะ
- repeat table header เมื่อขึ้นหน้าใหม่ และมี print footer ทุกหน้า
- ใช้ Company Profile ตามสาขาของเอกสาร
- ห้ามเกิด side effect ตอนพิมพ์
- รายการสินค้าแสดงหน่วยจริงจาก snapshot
- ยอดท้ายบิลเรียงตาม section `Totals, VAT, And Deposit`

ต่างจาก `PB`:

- หัวคู่ค้าเป็น Customer ไม่ใช่ Supplier
- แหล่งสินค้าในรายการแสดงเฉพาะ `PO Sell` หรือ `Spot Sale`; เลข `WTO` แสดงในข้อมูลเอกสารด้านบนเท่านั้น
- ไม่แสดงทะเบียนรถในเอกสาร `SB`

## Cancel / Reversal Contract

Cancel `SB` ต้องเป็น reversal ไม่ใช่ลบ movement:

| Step | Rule |
|---|---|
| 1 | รับ `PATCH /api/sales/bills/{docNo}` พร้อม `action = cancel` และ `note` |
| 2 | reject ถ้า `SB` ไม่พบ, ถูกยกเลิกแล้ว, หรือมี active `RCP` ผูกกับ `receipts.bill_id` |
| 3 | สำหรับ `STOCK` SB ต้องพบ consumed `stock_holds` และ `stock_ledger.ref_type = SB` เดิม |
| 4 | สร้าง `stock_ledger.ref_type = SB-CANCEL` เป็น stock-in reversal ด้วย unit cost/value เดิมของ `SB` โดยไม่ลบ `SB` stock-out row เดิม |
| 5 | ถ้า `WTO` ยังไม่เคยรับของคืน ให้เปลี่ยน consumed `stock_holds` กลับเป็น `active` เพื่อให้ stock กลับไปอยู่สถานะจองรอออกบิล; ถ้าเคยรับคืนแล้ว ห้าม reopen pending_out และให้ `SB-CANCEL` คืน stock ตรง |
| 6 | append `weight_ticket_usage_logs.action = released_from_sales_bill`; คืน `weight_ticket_product_summaries.remaining_weight` เฉพาะกรณี reopen pending_out ได้จริง |
| 7 | ถ้ายังไม่มี return ให้เปลี่ยน `WTO.status` จาก `billed` กลับเป็น `delivered`; ถ้ามี return แล้วให้คงสถานะ/timeline เป็นรับคืนแล้วหรือยกเลิกบิลแล้วตาม facts และ append `weight_ticket_status_logs` |
| 8 | reverse `PO Sell` usage จาก sales-bill item snapshot โดยลด `cut_amount` และเพิ่ม `remaining_qty/remaining_amount` |
| 9 | mark `sales_bills.status = cancelled`, set `cancel_note/cancelled_at/cancelled_by`, zero `receivable_balance`, และ append `sales_bill_status_logs` |

Design/API รายละเอียดอยู่ที่ [[Stock Ledger DB API Design]]

## Implementation Follow-up

### Task Breakdown

#### Batch SB-1: Create Form Parity With PB

- [x] เลือก Customer เป็น search dropdown ตาม pattern คู่ค้าในเอกสาร transaction อื่น
- [x] สาขา/คลังเป็น required field
- [x] เลือก `WTO` ด้วย search dropdown หลังเลือกสาขาและ Customer
- [x] หลังเลือก `WTO` แล้วล็อก `ประเภทบิล`, Customer, สาขา/คลัง, และช่อง `ใบส่งของ WTO` ตาม pattern บิลซื้อ
- [x] ก่อนเลือก `WTO` ให้แสดง empty state ไม่สร้างแถวสินค้าเปล่า
- [x] หลังเลือก `WTO` ให้เติม product summary/snapshot อัตโนมัติ
- [x] ตัดช่อง `เลขที่อ้างอิง` free-text ออกจาก create/edit `SB`
- [x] ไม่แสดง `ทะเบียนรถ` ใน create/edit/detail/print `SB`
- [x] ไม่แสดงเลข `WTO` ซ้ำในรายการสินค้า เพราะแสดงใน source summary/document info แล้ว
- [x] ช่องทางขายเป็น required read-only field ภายใน modal โดย auto จาก Customer market scope
- [x] เพิ่ม `เลขที่ order ส่งออก` สำหรับบิลขาย Customer ต่างประเทศ และไม่ reuse `ref_no`
- [x] รายการ `STOCK` ไม่แสดง `+ เพิ่มรายการ` หรือปุ่มลบสินค้า manual

#### Batch SB-2: Item Allocation UX

- [x] เพิ่ม column `น้ำหนักสุทธิที่ส่ง`, `จำนวนที่ขายได้`, `หักสิ่งเจือปน`, `น้ำหนักขายสุทธิ`, `อ้างอิง PO Sell`, `ราคา/หน่วย`, `ส่วนลด`, `ยอดรวม`
- [x] เพิ่ม selector `PO Sell / Spot Sale` ต่อ line โดย `Spot Sale` เป็น default
- [x] กรอง `PO Sell` ตาม Customer/สาขา/สินค้า/remaining
- [x] รองรับ split row ใต้สินค้า WTO เดิมด้วย `+ เพิ่มแถว` / `ลบ`
- [x] block save เมื่อจัดสรรน้ำหนักจาก `WTO` ไม่ครบ
- [x] block/cap จำนวนที่ตัดเข้า `PO Sell` ไม่ให้เกิน remaining
- [x] แถวที่เลือก `PO Sell` ใช้ราคา PO และล็อก `ราคา/หน่วย`
- [x] แถว `Spot Sale` ยังแก้ราคาเองได้

#### Batch SB-3: Stock Ledger And Cancel Reversal

- [x] เพิ่ม `sales_bill_status_logs` และ cancel metadata ใน `sales_bills`
- [x] สร้าง `SB` จาก `WTO` แล้ว consume active pending_out และเขียน `stock_ledger.ref_type = SB`
- [x] เพิ่ม `PATCH /api/sales/bills/[id]` action `cancel`
- [x] cancel block เมื่อมี active `RCP`
- [x] cancel เขียน `stock_ledger.ref_type = SB-CANCEL` แทนการลบ `SB` ledger row
- [x] cancel reopen consumed `WTO` pending_out กลับเป็น `active` เฉพาะกรณียังไม่มี return-from-WTO/SB
- [x] cancel append `released_from_sales_bill`; ถ้ามี return แล้วต้องไม่ reopen pending_out และต้องคืน stock ตรงด้วย `SB-CANCEL`
- [x] cancel reverse PO Sell usage จาก item snapshot
- [ ] เพิ่ม UI enablement/confirmation dialog สำหรับยกเลิก SB
- [ ] เพิ่ม browser QA สำหรับ cancel SB แล้ว `/stock/balance`, `/stock/ledger`, WTO detail และ PO outstanding ถูกต้อง

#### Batch SB-3: Totals, VAT, And Deposit

- [x] ใช้ money input pattern สำหรับ `ราคา/หน่วย`, `ส่วนลด`, และส่วนลดท้ายบิล
- [x] แสดง VAT/totals ตาม visual baseline ของ `PB`; ใน create form ใช้ checkbox `มี VAT` เป็น control เดียว ไม่แสดง selector `ไม่คิด VAT / VAT แยก / รวม VAT` ซ้ำ และวางช่องมัดจำก่อน `ส่วนลดท้ายบิล`
- [x] เพิ่ม selector `รับเงินล่วงหน้า/มัดจำ Customer`
- [x] คำนวณ `ยอดลูกหนี้สุทธิ = ยอดสุทธิ - มัดจำ Customer`
- [x] ย้าย Customer advance availability/create path ไป dedicated `sales_bill_customer_advance_allocations` fact table; legacy snapshot markers ถูก backfill ด้วย migration
- [x] เพิ่ม release/cancel Customer advance allocation เมื่อยกเลิก `SB`; full edit/recalculate ยังปิดไว้ตาม policy

#### Batch SB-4: Write Model And Allocation Facts

- [x] Runtime create `SB` บันทึก line snapshot จาก `WTO` และ line-level `poSellId`
- [x] Runtime create ตัดยอด `PO Sell` ตาม line source และถือ line ที่ไม่เลือก PO เป็น `Spot Sale`
- [x] Runtime create `SB Stock` consume active pending_out จาก `WTO` แล้วเพิ่ม stock-out ledger โดยอ้าง `WTO` และ intended warehouse; `WTO` ไม่ตัด stock เอง
- [x] ออกแบบ/เพิ่ม current allocation table สำหรับ `WTO -> SB` และเขียน facts ตอน create/cancel สำหรับบิลใหม่
- [x] ออกแบบ/เพิ่ม current allocation table สำหรับ `SB -> PO Sell`
- [x] ออกแบบ/เพิ่ม current allocation table สำหรับ `SB -> Spot Sale`
- [x] ออกแบบ/เพิ่ม current allocation table สำหรับ `Customer advance -> SB`
- [x] เพิ่ม transaction-safe cancellation ของ active line/source/PO/customer-advance allocation facts; full edit/rebuild ยัง disabled
- [x] เพิ่ม server-side read/validation pass ให้ detail/print และ list item-count ยึด allocation facts/current tables ก่อน json snapshot
- [ ] เพิ่ม line-level export/dashboard/tracking pass ให้ยึด allocation facts/current tables เมื่อเปิดใช้ surface เหล่านั้น

#### Batch SB-5: Status And Timeline Logs

- [x] ต่อ `weight_ticket_usage_logs` สำหรับ `WTO -> SB` allocate ตอน create
- [ ] ต่อ `weight_ticket_usage_logs` สำหรับ `WTO -> SB` release/reverse ตอน edit/cancel
- [x] เพิ่ม `sales_bill_status_logs` สำหรับ create/cancel และ Trading allocation correction; full edit/status transition อื่นยัง deferred
- [ ] เพิ่ม dedicated timeline logs สำหรับ `SB -> PO Sell`, `Spot Sale`, และ Customer advance นอกเหนือจาก current allocation facts
- [ ] เพิ่ม status/allocation logs ฝั่ง `PO Sell` เมื่อถูกตัดหรือ release จาก `SB`
- [ ] ให้ detail/timeline ของ `WTO`, `PO Sell`, และ `SB` อ่านจาก dedicated logs ไม่ใช้ audit log รวมเป็น source of truth

#### Batch SB-6: Detail And Print Hardening

- [x] เพิ่ม per-document print action สำหรับ `/sales/bills`
- [x] Print ใช้ Company Profile ตามสาขาเอกสาร
- [x] Print เป็น A4 portrait รองรับ multi-page, repeat table header, fixed footer
- [x] Print แสดง Customer/document panels, VAT/totals, Customer advance, receivable balance
- [x] Print ไม่แสดงทะเบียนรถ และไม่ซ้ำเลข `WTO` ในตารางรายการสินค้า
- [x] Detail/print อ่าน source ต่อ line จาก allocation facts หลัง Batch SB-4 แทนการพึ่ง snapshot/header fallback; legacy rows without facts show reconciliation warning
- [ ] เพิ่ม QA print ด้วยรายการยาวหลายหน้าและ mixed `PO Sell`/`Spot Sale`

#### Batch SB-7: Trading Sales Bill Follow-up

- [ ] แยก design flow ของ `TRADING` SB: เลือก purchase bills หลายใบก่อน
- [ ] Auto-fill sale lines จาก purchase bills ที่เลือก
- [ ] อนุญาตเพิ่ม stock manual lines เฉพาะ Trading ตาม rule
- [ ] แยก allocation rules สำหรับ `SB -> PB`, `SB -> stock`, และ `SB -> PO Sell`
- [ ] กำหนด COGS/FIFO rule และ stock-ledger side effects ของ Trading SB
