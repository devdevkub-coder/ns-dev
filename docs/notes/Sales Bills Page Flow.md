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
updated: 2026-06-23
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
- `POST /api/sales/bills` create path ทำงานครบสำหรับ `STOCK` baseline: สร้าง `SB`, consume active `WTO` hold, เขียน `stock_ledger.ref_type = SB`, append `weight_ticket_usage_logs`, update `WTO` เป็น `billed`, และ update `PO Sell` remaining/status
- `GET /api/sales/bills/[id]` เป็น detail/read model เท่านั้น
- `PATCH /api/sales/bills/[id]` action `cancel` สำหรับ `STOCK` SB ที่ยังไม่มี active receipt: block active `RCP`, reopen consumed `WTO` hold, append `stock_ledger.ref_type = SB-CANCEL` โดยไม่ลบ `SB`, append `released_from_sales_bill`, คืน `WTO` เป็น `delivered`, reverse `PO Sell` usage, mark `SB` เป็น `cancelled`, และ append `sales_bill_status_logs`
- UI ปุ่มยกเลิกของบิลขายเปิดใช้แล้วสำหรับ row ที่ server ส่ง `canCancel = true`; browser QA ผ่านสำหรับ WTO-backed Stock SB cancel และ PO Sell outstanding reversal
- `TRADING` SB มี row-level Trading Cost Source, `trading_allocation_facts`, allocation-only correction API/UI, และ browser QA ผ่านแล้วสำหรับ multi-line source correction โดยไม่เขียน stock ledger
- new SB create/cancel write-path now records dedicated allocation facts for `SB line`, `WTO -> SB`, `SB -> PO Sell/Spot Sale`, and `Customer advance -> SB`; Stock SB detail/print/list item-count reads durable line/source/PO facts first, while legacy SBs without facts show a reconciliation warning instead of inventing allocation data from JSON
- `Pending Sale / PSALE / เบิกออกรอบิล` ถูกถอดออกจาก target runtime แล้ว: `POST /api/sales/bills` ไม่ query/update `stock_issues`, ไม่สร้าง `source_type = PSALE`, และ stock sale ใหม่ต้องเปิดจาก `WTO` เท่านั้น

## Target Durable Allocation Contract

เป้าหมายก่อนเปิด full edit/correction ของ `STOCK` SB คือแยก fact ที่อ่านซ้ำได้จาก `sales_bills.items` JSON ออกมาเป็น table ชัดเจน โดยไม่ทำ runtime fallback จาก JSON เพื่อเดา allocation ถ้า fact ขาด ต้อง reject write หรือแสดง reconciliation gap ให้แก้ data/write path. Migration/write-path และ read-model สำหรับบิลใหม่มีแล้ว; reconciliation/backfill สำหรับบิลเก่ายังเป็นงานถัดไป

### Owner Boundary

| Area | Owner table | Rule |
|---|---|---|
| SB header / AR | `sales_bills` | เก็บ doc no, customer, branch, totals, receipt balance, status |
| SB line snapshot | `sales_bill_lines` target | 1 row ต่อ business line; เก็บ product, gross/deduct/net/billed qty, unit price, discount, VAT basis, line total |
| Physical stock-out | `stock_ledger` + `stock_holds` | `WTO` สร้าง pending_out โดยไม่เข้า ledger; `SB` เป็น movement owner ที่ consume pending_out และเขียน `stock_ledger.ref_type = SB` |
| WTO source usage | `sales_bill_source_allocations` target + `weight_ticket_usage_logs` audit | ระบุว่า SB line ใช้ WTO summary/line ไหน จำนวนเท่าไร และ reversal status |
| PO Sell commitment | `sales_bill_po_sell_allocations` target | ระบุ SB line -> PO Sell line หรือ `SPOT_SALE`; ใช้คืน remaining ตอน cancel |
| Customer advance | `sales_bill_customer_advance_allocations` target | ระบุ SB -> customer advance fact; ใช้ release/recalculate ตอน cancel/correction |
| Trading cost | `trading_allocation_facts` | มีแล้วสำหรับ Trading PB/manual Cost Source; ใช้แทน Stock allocation tables |

### Target Tables

| Table | Key columns | Required rule |
|---|---|---|
| `sales_bill_lines` | `sales_bill_id`, `line_no`, `product_id`, `qty`, `gross_weight`, `deduct_weight`, `net_weight`, `unit_price`, `discount_amount`, `line_amount`, `vat_amount`, `status` | เป็น source หลักของ detail/print/export; `sales_bills.items` คงได้เฉพาะ compatibility snapshot ระหว่าง migration |
| `sales_bill_source_allocations` | `sales_bill_id`, `sales_line_no`, `source_type`, `source_doc_no`, `source_line_no`, `product_id`, `allocated_qty`, `movement_owner`, `stock_ledger_ref_type`, `status` | target source type สำหรับ stock sale คือ `WTO`; `movement_owner` = `SALES_BILL`; cancel ต้อง mark `cancelled/reversed` ไม่ลบ |
| `sales_bill_po_sell_allocations` | `sales_bill_id`, `sales_line_no`, `po_sell_id`, `po_sell_line_no`, `allocation_type`, `product_id`, `allocated_qty`, `unit_price`, `allocated_amount`, `status` | `allocation_type` = `PO_SELL` หรือ `SPOT_SALE`; `PO_SELL` ต้อง validate customer/branch/product/remaining ใน transaction |
| `sales_bill_customer_advance_allocations` | `sales_bill_id`, `customer_advance_doc_no`, `customer_id`, `allocated_amount`, `outstanding_before`, `outstanding_after`, `status` | ต้อง block over-allocation จาก active allocation facts และ release แบบ append/update status ใน transaction เดียวกับ SB cancel/correction |

Index minimum:

- `sales_bill_lines(sales_bill_id, line_no)` unique
- `sales_bill_source_allocations(sales_bill_id, sales_line_no, status)`
- `sales_bill_source_allocations(source_type, source_doc_no, status)`
- `sales_bill_po_sell_allocations(po_sell_id, status)`
- `sales_bill_po_sell_allocations(sales_bill_id, sales_line_no, status)`
- `sales_bill_customer_advance_allocations(customer_advance_doc_no, status)`
- `sales_bill_customer_advance_allocations(sales_bill_id, customer_advance_doc_no) where status = active` unique

### API Rules

`POST /api/sales/bills`:

- Validate source facts first: `STOCK` ต้องใช้ `WTO` source เท่านั้น; `PSALE`, direct stock, และ Trading mode ห้ามปนกันแบบเงียบ ๆ.
- Create header, line facts, source allocations, PO Sell/Spot allocations, customer advance allocations, stock ledger/hold changes, and status logs in one transaction.
- For `STOCK`, reject if source allocation does not cover every stock line exactly.
- For `TRADING`, continue using `trading_allocation_facts`; do not write stock allocation or stock ledger.

`GET /api/sales/bills` and `GET /api/sales/bills/{docNo}`:

- Detail and print read normalized line/allocation facts for new SBs; list export currently remains list-level but counts durable line facts first. Any future line-level export, dashboard, and tracking must use the same normalized facts.
- If a legacy SB has no normalized facts, show a migration/reconciliation signal; do not invent source labels, COGS, PO Sell usage, or customer advance from stale JSON.

`PATCH /api/sales/bills/{docNo}`:

- `action = cancel`: mark active allocations cancelled/reversed, append `SB-CANCEL` stock reversal, reopen WTO pending_out, restore PO Sell/customer advance remaining, append status logs.
- `action = correct_*`: allowed only after the relevant allocation facts exist; correction reverses old active facts and appends corrected facts.
- Full in-place edit remains disabled until the durable tables above exist and browser QA covers create -> cancel -> correction -> receipt-lock.

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
| 9 | System | อัปเดตสถานะ source | `WTO` เป็น `ออกบิลแล้ว` ทันทีเมื่อบันทึกสำเร็จ; `PO Sell` เป็น `ออกบิลบางส่วน` หรือ `ออกบิลแล้ว` ตามยอดจริง |

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
| ช่องทางขาย | ใช่ | ใช้ search dropdown และต้องเลือกก่อนบันทึก `SB` |
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
- Columns หลักของ `STOCK` ต้องตาม pattern บิลซื้อ: `สินค้า`, `Gross`, `หัก`, `น้ำหนักสุทธิ`, `จำนวนตัดบิล`, `อ้างอิง PO Sell`, `ราคา/หน่วย`, `ส่วนลด`, `ยอดรวม`
- `Gross`, `หัก`, และ `น้ำหนักสุทธิ` มาจาก snapshot ของ `WTO` และต้องแสดง/บันทึกเป็น read-only trace ของรายการ
- แต่ละ line ต้องมี selector `อ้างอิง PO Sell` โดย option แรกคือ `Spot Sale` และ option ถัดไปคือ `PO Sell` ที่ตรง Customer/สาขา/สินค้าและยังมี remaining
- ถ้า WTO summary เดียวต้องตัดทั้ง `PO Sell` และ `Spot Sale` หรือมีมากกว่า 1 PO Sell ต้อง split เป็นหลาย row ใต้สินค้าเดียวกันแบบเดียวกับบิลซื้อ
- ระบบต้อง block save ถ้าน้ำหนักคงเหลือจาก `WTO` ยังจัดสรรไม่ครบ หรือจำนวนที่ตัดเข้า `PO Sell` เกิน remaining ต่อสินค้า
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
- `WTO` ต้องถูกจัดสรรครบทั้งเอกสารใน `SB` เดียว; ถ้าจัดสรรไม่ครบต้อง block save และห้ามเกิด remaining เพื่อไปออกบิลใบอื่น

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
| 4 | สร้าง `stock_ledger.ref_type = SB-CANCEL` เป็น stock-in reversal โดยไม่ลบ `SB` stock-out row เดิม |
| 5 | เปลี่ยน consumed `stock_holds` ของ `WTO` กลับเป็น `active` เพื่อให้ stock กลับไปอยู่สถานะจองรอออกบิล |
| 6 | append `weight_ticket_usage_logs.action = released_from_sales_bill` และคืน `weight_ticket_product_summaries.remaining_weight` |
| 7 | เปลี่ยน `WTO.status` จาก `billed` กลับเป็น `delivered` และ append `weight_ticket_status_logs` |
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
- [x] ช่องทางขายเป็น required search combobox ภายใน modal ไม่ใช้ native select เพื่อไม่ให้รายการ dropdown หลุดออกจาก form
- [x] รายการ `STOCK` ไม่แสดง `+ เพิ่มรายการ` หรือปุ่มลบสินค้า manual

#### Batch SB-2: Item Allocation UX

- [x] เพิ่ม column `Gross`, `หัก`, `น้ำหนักสุทธิ`, `จำนวนตัดบิล`, `อ้างอิง PO Sell`, `ราคา/หน่วย`, `ส่วนลด`, `ยอดรวม`
- [x] เพิ่ม selector `PO Sell / Spot Sale` ต่อ line โดย `Spot Sale` เป็น default
- [x] กรอง `PO Sell` ตาม Customer/สาขา/สินค้า/remaining
- [x] รองรับ split row ใต้สินค้า WTO เดิมด้วย `+ เพิ่มแถว` / `ลบ`
- [x] block save เมื่อจัดสรรน้ำหนักจาก `WTO` ไม่ครบ
- [x] block/cap จำนวนที่ตัดเข้า `PO Sell` ไม่ให้เกิน remaining
- [x] แถวที่เลือก `PO Sell` ใช้ราคา PO และล็อก `ราคา/หน่วย`
- [x] แถว `Spot Sale` ยังแก้ราคาเองได้

#### Batch SB-3: Stock Ledger And Cancel Reversal

- [x] เพิ่ม `sales_bill_status_logs` และ cancel metadata ใน `sales_bills`
- [x] สร้าง `SB` จาก `WTO` แล้ว consume active hold และเขียน `stock_ledger.ref_type = SB`
- [x] เพิ่ม `PATCH /api/sales/bills/[id]` action `cancel`
- [x] cancel block เมื่อมี active `RCP`
- [x] cancel เขียน `stock_ledger.ref_type = SB-CANCEL` แทนการลบ `SB` ledger row
- [x] cancel reopen consumed `WTO` hold กลับเป็น `active`
- [x] cancel append `released_from_sales_bill` และ status log คืน `WTO` เป็น `delivered`
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
