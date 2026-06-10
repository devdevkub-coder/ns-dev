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
updated: 2026-06-10
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
| 2 | User | เลือกสาขาและ Customer | ใช้กรอง `WTO` ที่ยังออกบิลไม่ครบและ `PO Sell` ที่ยังมี remaining |
| 3 | User | เลือก `WTO` หนึ่งใบหรือหลายใบที่เป็น Customer/สาขาเดียวกัน | ระบบล็อก source สำคัญจาก `WTO` และดึงรายการสินค้า/น้ำหนักจากเอกสารส่งของ |
| 4 | System | แสดงรายการสินค้าจาก `WTO` | line ต้องมาจาก snapshot ของ `WTO` เท่านั้น; ผู้ใช้ไม่กรอกสินค้าเองใน `STOCK` |
| 5 | User | เลือก/ยืนยัน `PO Sell` ต่อ line ถ้ามียอด PO ที่ต้องตัด | ระบบแสดงยอดคงเหลือของ PO Sell ที่ตรง Customer/สาขา/สินค้า |
| 6 | System/User | แยกยอดเกิน PO Sell เป็น `Spot Sale` | ห้ามตัด PO Sell เกิน remaining; ส่วนเกินต้องเป็น Spot Sale แยก line/source |
| 7 | User | กรอกราคาขาย, ส่วนลด, VAT, เครดิตเทอม, หมายเหตุ, และมัดจำที่จะหัก | totals ใช้ pattern เดียวกับ PB |
| 8 | System | บันทึก `SB` | สร้าง `SB...`, AR, usage/allocation logs, PO Sell billed qty, Customer advance allocation ถ้ามี |
| 9 | System | อัปเดตสถานะ source | `WTO` เป็น `ออกบิลบางส่วน` หรือ `ออกบิลแล้ว`; `PO Sell` เป็น `ออกบิลบางส่วน` หรือ `ออกบิลแล้ว` ตามยอดจริง |

## Fields To Show

### ข้อมูลเอกสาร

ส่วนนี้ต้องมี `วันที่เอกสาร` และ `วันที่กำหนดส่ง/วันครบกำหนด` อยู่ใน section เดียวกันกับข้อมูลเอกสาร ไม่แยกไป header ลอย

| Field | จำเป็น | หมายเหตุ |
|---|---:|---|
| เลขเอกสาร `SB` | ระบบ | ไม่ให้ผู้ใช้กรอก; generate เมื่อบันทึก |
| วันที่เอกสาร | ใช่ | default วันนี้ แต่ผู้ใช้แก้ได้ตามสิทธิ์ |
| วันที่ครบกำหนด/กำหนดชำระ | ไม่ | คำนวณจาก credit term ได้ แต่แสดงให้แก้/ตรวจตาม business rule |
| สาขา | ใช่ | ใช้กรอง `WTO`, `PO Sell`, Customer advance และหัวกระดาษ |
| Customer | ใช่ | ใช้ search dropdown; ค้นหาได้จากรหัส/ชื่อลูกค้า และใช้กรอง `WTO`, `PO Sell`, Customer advance และ AR |
| เครดิตเทอม | ไม่ | ดึงจาก Customer ได้ แต่ snapshot ลงบิล |
| หมายเหตุ | ไม่ | ข้อมูลประกอบเอกสาร |

### Source Documents

| Field | จำเป็น | หมายเหตุ |
|---|---:|---|
| `WTO` ใบส่งของ | ใช่ | เลือกเฉพาะ `WTO` ที่ยังออกบิลไม่ครบ, สาขา/Customer ตรงกัน, ไม่ยกเลิก |
| รายการสินค้า WTO | ระบบ | แสดงจาก `WTO` snapshot; ไม่ให้ผู้ใช้พิมพ์สินค้าใหม่, เพิ่มรายการเอง, หรือลบรายการเองใน `STOCK` |
| `PO Sell` allocation | เฉพาะ line ที่มี PO | เลือกต่อ line; option ต้องกรองตาม Customer/สาขา/สินค้า/remaining |
| `Spot Sale` line/source | ระบบ/ผู้ใช้ยืนยัน | ใช้กับยอดที่ไม่มี PO หรือเกินยอด PO Sell remaining |

### รายการสินค้าในหน้า Create/Edit

`STOCK` sales bill ต้องทำเหมือน pattern ของบิลซื้อฝั่ง `STOCK`:

- ถ้ายังไม่เลือก `WTO` ให้แสดง empty state ว่าให้เลือกใบส่งของก่อน ไม่แสดงแถวกรอกสินค้าเปล่า
- เมื่อเลือก `WTO` แล้ว ระบบเติมรายการสินค้าจาก `WTO` product summary/snapshot อัตโนมัติ
- Product/source fields ในรายการที่มาจาก `WTO` เป็น read-only trace; ผู้ใช้แก้ได้เฉพาะค่าธุรกิจของบิล เช่น จำนวนที่จะตัดบิล, ราคา, ส่วนลด, VAT/totals ตาม rule
- ไม่แสดงปุ่ม `+ เพิ่มรายการ` และไม่แสดงปุ่ม `ลบ` สำหรับรายการ `STOCK` ที่มาจาก `WTO`
- การเพิ่ม/split line ในอนาคตต้องเกิดจาก allocation rule (`PO Sell`/`Spot Sale`) หรือ remaining source logic ไม่ใช่ manual product row
- `TRADING` เป็นคนละ flow และยังอนุญาต manual line ตาม Trading sales-bill design follow-up ได้

### Fields ที่ต้องตัดออกจากหน้า SB

- ไม่แสดงช่อง `เลขที่อ้างอิง` แบบ free-text ใน create/edit `SB`; เอกสารอ้างอิงต้อง derive จาก `WTO` และ allocation ไป `PO Sell`
- ไม่แสดงช่อง `ทะเบียนรถ` ใน create/edit `SB`; ทะเบียนรถเป็นข้อมูลของ `WTO` และอ่านได้จาก detail/print trace เท่านั้น
- ถ้าต้องแสดงทะเบียนรถเพื่อ audit ให้แสดงแบบ read-only ใน source summary ของ `WTO` ไม่ใช่ field ของบิลขาย

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
- `WTO` หลายใบใน `SB` เดียวต้องเป็น Customer/สาขาเดียวกัน
- ห้ามเลือก `WTO` ที่ยกเลิกหรือออกบิลครบแล้ว
- ถ้า `WTO` ถูกออกบิลบางส่วน ต้องแสดงเฉพาะ remaining ที่ยังไม่ถูกใช้ใน SB ก่อนหน้า

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
- แหล่งสินค้าแสดง `WTO`, `PO Sell`, และ `Spot Sale`
- ทะเบียนรถถ้ามีให้มาจาก source `WTO` แบบ read-only trace ไม่ใช่ field ของ `SB`

## Implementation Follow-up

- Implemented: UI create `/sales/bills` เริ่มจากเลือก `WTO`; `STOCK` แสดง product lines จาก `WTO` เท่านั้น ไม่เปิดแถวกรอกสินค้าเองก่อนเลือก source
- ช่องเลือก Customer ต้องเป็น search dropdown ตาม pattern เดียวกับคู่ค้าในเอกสาร transaction อื่น ไม่ใช้ native select ธรรมดา
- เพิ่ม line-level allocation UI สำหรับ `PO Sell` และ `Spot Sale`
- เพิ่ม Customer advance selector/allocation section
- ตัดช่อง `เลขที่อ้างอิง` และ `ทะเบียนรถ` ออกจาก form `SB`
- ปรับ API ให้บันทึก `WTO -> SB`, `SB -> PO Sell`, `Spot Sale`, และ Customer advance allocation ใน transaction เดียว
- เพิ่ม usage/allocation logs สำหรับ `WTO`, `PO Sell`, `SB`, และ Customer advance
- Hardening print `SB` หลัง write flow ทำ line-level allocation ครบ: แสดง `PO Sell`/`Spot Sale` ต่อ line จาก allocation facts แทนการอ่านจาก header-level `po_sell_id`
