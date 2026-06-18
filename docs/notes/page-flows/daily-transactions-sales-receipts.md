---
title: รับเงิน Customer Page Flow
tags:
  - page-flow
  - menu
status: accepted-baseline
updated: 2026-06-18
route: /sales/receipts
---

# รับเงิน Customer Page Flow

## Scope

| Field | Value |
|---|---|
| Menu section | Daily Transactions |
| Route | `/sales/receipts` |
| Page | รับเงิน Customer |
| Current Next | accepted code baseline |

## Canonical References

[[Sales Flow]], [[Payment Flow]]

## Flow Baseline

Customer Receipt ใช้บันทึกรับชำระเงินจากลูกค้า (`Customer`) สำหรับบิลขาย (`Sales Bill` / `SB`) ที่ยังมียอดค้างรับ และสร้างเอกสาร `Receipt Voucher` / `RCP` เพื่อบันทึกประวัติการรับเงินเข้าสู่ระบบ

RCP รับเงินจาก SB/customer advance และเขียน bank statement เงินเข้า

## Purpose

ใช้บันทึกรับชำระเงินจากลูกค้าสำหรับบิลขายที่ยังมียอดค้างรับ โดย `RCP` เป็นเอกสารหลักของเหตุการณ์รับเงิน ส่วน `bank_statement` เป็นผลกระทบเงินเข้า และ AR/SB balance ต้องถูกคำนวณใหม่จาก receipt facts ที่ active

## Features

- รับชำระเงินจากลูกค้า
- รองรับการรับเงินหลายบิลใน 1 Receipt Voucher
- รองรับการรับเงินบางส่วน (Partial Receipt)
- คำนวณยอดคงเหลืออัตโนมัติ
- รองรับส่วนลด (Discount)
- รองรับค่าธรรมเนียมธนาคาร (Bank Fee)
- รองรับภาษีหัก ณ ที่จ่าย (WHT)
- แสดงยอดรับสุทธิ (Net Cash In)
- บันทึกประวัติ Receipt Voucher
- ค้นหาและติดตามสถานะการรับเงิน
- แก้ไข Receipt Voucher
- ยกเลิก Receipt Voucher

## Page Responsibilities

- แสดงคิวบิลขายค้างรับและประวัติรับเงิน
- สร้าง `RCP` เพื่อรับเงินจาก Customer
- รองรับรับหลาย SB ใน RCP เดียวตาม customer/payment account rule
- เขียน bank statement เงินเข้าและ recalc AR/SB paid status
- รองรับส่วนลด ค่าธรรมเนียม WHT/ภาษีหัก ณ ที่จ่าย ตาม target

## Non-Responsibilities

- ไม่สร้าง SB/POS/WTO
- ไม่ตัด stock
- ไม่แก้ยอดบิลขายเดิมนอกจาก payment status/paid amount
- ไม่ใช้ payment supplier PMT แทน receipt

## Lifecycle / Operation Flow

| Step | User action | System result |
|---|---|---|
| 1 | เปิดคิว | GET outstanding SB/customer receivable |
| 2 | เลือกบิล | validate customer และยอดค้าง |
| 3 | บันทึกรับเงิน | POST RCP + bank statement |
| 4 | ประวัติ | แสดง RCP เสร็จสิ้น/ยกเลิก |
| 5 | edit | ยกเลิก RCP เดิมและออก RCP ใหม่ใน transaction เดียว |
| 6 | cancel | reverse receipt/bank facts และ recalc SB |

## Detailed User Flow / Manual Test Script

> Flow นี้เป็นรายละเอียดการใช้งานหน้า `รับเงิน Customer` ตามรูปแบบ UAT ปัจจุบัน: ระบบสร้างใบรับเงิน `RCP` จากบิลขายที่ยังค้างรับให้อัตโนมัติ ผู้ใช้ทำหน้าที่ตรวจสอบ/รับเงิน/เลือกบัญชีรับเงิน/ยืนยันยอด ไม่ต้องเริ่มจากการสร้างเอกสารเปล่าเองเป็นหลัก

### 1. เงื่อนไขก่อนเข้า Flow

- ต้องมี `Sales Bill` / `SB` ที่ยังมียอด `ค้างรับ` มากกว่า 0
- บิลขายต้องไม่ถูกยกเลิก (`cancelled` / `canceled`)
- ลูกค้าในบิลขายต้องมีอยู่ใน master Customer
- ต้องมีบัญชีรับเงินของบริษัทที่ active อย่างน้อย 1 บัญชี
- ต้องมีวิธีรับเงิน / วิธีชำระเงินที่ active อย่างน้อย 1 รายการ

### 2. ระบบสร้างใบรับเงินรอดำเนินการ

เมื่อเปิดหน้า `/sales/receipts` ระบบจะตรวจบิลขายที่ยังค้างรับ และสร้าง `RCP` สถานะ `pending` ให้โดยอัตโนมัติ ถ้าบิลขายนั้นยังไม่มีใบรับเงินรอดำเนินการผูกอยู่

ข้อมูลที่ระบบสร้างให้:

| ข้อมูล | รายละเอียด |
|---|---|
| เลขที่ใบรับเงิน | ออกเลข `RCP` ทันที เช่น `RCP2606-0007` ไม่ใช้ข้อความรอออกเลข |
| ลูกค้า | ดึงจาก `Sales Bill` |
| บิลขายอ้างอิง | ดึงเลข `SB` ที่ยังค้างรับ |
| วันที่ | ใช้วันที่ของบิลขาย/วันที่สร้างตาม logic ระบบ |
| ยอดรวม | ยอดค้างรับของบิลขาย ณ ตอนสร้าง RCP |
| รับแล้ว | เริ่มต้น 0.00 |
| ค้างรับ | เท่ากับยอดค้างรับของบิลขาย |
| สถานะ | `pending` / รอรับเงิน |

ถ้าบิลขาย 1 ใบมี `RCP pending` อยู่แล้ว ระบบต้องไม่สร้างซ้ำ

### 3. Tab `รับเงิน Customer`

ใช้สำหรับดูใบรับเงินที่ยังรอดำเนินการ ไม่ใช่ตารางบิลขายโดยตรง ถึงข้อมูลต้นทางจะมาจากบิลขายก็ตาม

ข้อมูลที่ต้องเห็นในตาราง:

| คอลัมน์ | รายละเอียด |
|---|---|
| เลขที่ใบรับเงิน | เลข `RCP` ที่ระบบออกไว้แล้ว |
| วันที่สร้างเอกสาร | วันที่ของเอกสารรับเงิน |
| ลูกค้า | ชื่อลูกค้าจากบิลขาย |
| บิลขายอ้างอิง | เลข `SB` ที่ RCP นี้ผูกอยู่ |
| ยอดรวม | ยอดที่ต้องรับของ RCP |
| รับแล้ว | ยอดที่รับแล้วของ RCP |
| ค้างรับ | ยอดที่ยังเหลือค้างรับ |
| จัดการ | ปุ่มทำงานกับใบรับเงิน |

ปุ่มในคอลัมน์ `จัดการ`:

| ปุ่ม | ใช้ทำอะไร |
|---|---|
| รับเงิน | เปิดหน้าต่างบันทึกรับเงินของ RCP นั้น |
| แก้ไข | แก้ไขข้อมูล RCP ที่ยังรอดำเนินการ โดยลูกค้าที่ผูกจากบิลขายแล้วไม่ควรเปลี่ยนได้ |
| ยกเลิก | ยกเลิกเฉพาะใบรับเงิน RCP ไม่ยกเลิกบิลขาย |

ข้อกำหนดสำคัญ:

- Click ที่แถวควรเป็นการดูภาพรวม/รายละเอียด ไม่ใช่เข้าสู่โหมดแก้ไขทันที
- การแก้ไขต้องกดปุ่ม `แก้ไข`
- การยกเลิกใน tab นี้ต้องคืนสถานะให้บิลขายกลับไปค้างรับได้ตามยอดเดิม แต่ไม่ยกเลิก `SB`

### 4. เปิดหน้าต่าง `รับเงิน Customer`

เมื่อกด `รับเงิน` ระบบเปิด modal `รับเงิน Customer / Receipt Voucher`

#### Section: ข้อมูลใบรับเงิน

| Field | วิธีกรอก / การทำงาน | Validation |
|---|---|---|
| วันที่ | วันที่รับเงิน สามารถเลือกจาก date picker | ต้องมีค่า |
| ลูกค้า | ดึงจากบิลขาย/RCP ถ้าเป็น RCP ที่สร้างจากบิลขายแล้วต้องล็อก ไม่ให้เปลี่ยนลูกค้า | ต้องตรงกับลูกค้าของบิลขายที่เลือก |
| วิธีจ่าย/รับเงิน | เลือกจาก master payment methods | ต้องเป็นรายการ active |
| หมายเหตุ | กรอกข้อความเพิ่มเติมได้ | ไม่บังคับ |

หมายเหตุเรื่อง `ลูกค้า`:

- ตอนสร้างรับเงินเองหรือกรองข้อมูล อาจค้นหาลูกค้าได้
- เมื่อ RCP ถูกผูกกับบิลขายแล้ว และเข้าโหมดแก้ไข/รับเงิน ไม่ควรให้เปลี่ยนลูกค้า เพราะจะทำให้ความสัมพันธ์ `RCP -> SB -> Customer` ผิด

#### Section: บิลขายที่รับชำระ

ตารางนี้แสดงรายการ `Sales Bill` ที่จะรับเงินใน RCP นี้

| Field | วิธีกรอก / การทำงาน | Validation |
|---|---|---|
| Sales Bill | ดึงจาก RCP หรือเลือกบิลขายที่ยังค้างรับของลูกค้าคนเดียวกัน | ต้องเป็น SB ที่ยังค้างรับและไม่ cancelled |
| ค้างรับ | ระบบแสดงยอดค้างรับของบิล | read-only |
| ยอดรับ | กรอกยอดเงินที่ลูกค้าจ่ายสำหรับบิลนี้ | ต้องไม่ติดลบ และรวมกับ WHT/ส่วนลดแล้วต้องไม่เกินค้างรับ |
| WHT | กรอกภาษีหัก ณ ที่จ่าย ถ้ามี | ต้องไม่ติดลบ |
| ส่วนลด | กรอกส่วนลดที่ตัดหนี้ให้ลูกค้า ถ้ามี | ต้องไม่ติดลบ |
| ลบ | ลบแถวบิลออกจาก RCP | ต้องเหลืออย่างน้อย 1 บิล |

สูตรการตัดค้างรับต่อบิล:

```text
ยอดตัดค้างรับของบิล = ยอดรับ + WHT + ส่วนลด
ค้างรับหลังรับเงิน = ค้างรับก่อนรับเงิน - ยอดตัดค้างรับของบิล
```

รองรับกรณี:

- รับเต็มจำนวน 1 บิล
- รับบางส่วน 1 บิล
- รับหลายบิลของลูกค้าคนเดียวกันใน RCP เดียว
- มี WHT
- มีส่วนลด
- มีค่าธรรมเนียมธนาคาร

ไม่ควรรองรับ:

- รับเงินเกินยอดค้างรับ
- รวมบิลคนละลูกค้าใน RCP เดียว
- รับเงินจากบิลขายที่ถูกยกเลิก

#### Section: บัญชีรับเงิน

ใช้ระบุบัญชีบริษัทที่เงินจริงเข้า รองรับมากกว่า 1 บัญชี

| Field | วิธีกรอก / การทำงาน | Validation |
|---|---|---|
| บัญชีรับเงิน | เลือกบัญชีบริษัทจาก master accounts | ต้องเป็นบัญชี active |
| ยอดรับเข้าบัญชี | กรอกยอดเงินที่เข้าแต่ละบัญชี | รวมทุกบัญชีต้องเท่ากับเงินเข้าสุทธิ |
| เพิ่มบัญชี | เพิ่มแถวกรณีลูกค้าโอนหลายบัญชี / รับเงินสดร่วมกับโอน | ต้องไม่ซ้ำแบบทำให้ตรวจสอบไม่ได้ |
| ลบ | ลบแถวบัญชีรับเงิน | ต้องเหลืออย่างน้อย 1 บัญชี |

ตัวอย่างการ split บัญชี:

| บัญชีรับเงิน | ยอดรับเข้าบัญชี |
|---|---:|
| TTB | 15,000.00 |
| กสิกรไทย | 10,000.00 |
| รวม | 25,000.00 |

#### Section: Summary

ระบบแสดงยอดสรุปเพื่อให้ผู้ใช้ตรวจสอบก่อนบันทึก

| ยอด | สูตร |
|---|---|
| ยอดรับ | รวม `ยอดรับ` จากทุกบิล |
| WHT | รวม WHT จากทุกบิล |
| ตัดหนี้ AR | ยอดรับ + WHT + ส่วนลด |
| Fee / Discount | ค่าธรรมเนียมธนาคาร / ส่วนลด |
| Net / เงินเข้าสุทธิ | ยอดรับ - WHT - Bank Fee |
| รวมบัญชีรับเงิน | รวมยอดใน section บัญชีรับเงิน |
| ส่วนต่าง | รวมบัญชีรับเงิน - เงินเข้าสุทธิ |

เงื่อนไขก่อนบันทึก:

- ต้องเลือก/มีลูกค้า
- ต้องมีอย่างน้อย 1 บิลขาย
- ต้องมีอย่างน้อย 1 บัญชีรับเงิน
- ยอดรับรวมต้องมากกว่า 0
- ยอดบัญชีรับเงินรวมต้องเท่ากับ `เงินเข้าสุทธิ`
- ยอดตัดหนี้แต่ละบิลต้องไม่เกินยอดค้างรับ

### 5. กดบันทึกรับเงิน

เมื่อกด `บันทึก` ระบบต้องทำใน transaction เดียว:

1. เปลี่ยน `customer_receipts.status` จาก `pending` เป็น active/received ตาม contract ปัจจุบัน
2. บันทึก header ใน `customer_receipts`
3. บันทึกรายการบิลใน `customer_receipt_allocations`
4. สร้าง `bank_statement` เงินเข้า ตามบัญชีรับเงินแต่ละแถว
5. ปรับยอด `received_amount` และ `receivable_balance` ของ `sales_bills`
6. ปรับสถานะบิลขายเป็น partial/paid ตามยอดค้างที่เหลือ
7. เพิ่ม log ใน `customer_receipt_status_logs`
8. เพิ่ม timeline/log ของ Sales Bill ตาม document policy

หลังบันทึกสำเร็จ:

- รายการ RCP ต้องหายจาก tab `รับเงิน Customer` ถ้ารับครบ/ไม่มีค้างรับใน RCP นั้น
- รายการ RCP ต้องไปอยู่ tab `ประวัติการรับเงิน`
- Summary KPI ด้านบนต้องปรับยอดตามข้อมูลล่าสุด

### 6. Tab `ประวัติการรับเงิน`

ใช้ตรวจสอบ RCP ที่รับเงินแล้วหรือยกเลิกแล้ว

ข้อมูลที่ต้องเห็น:

| คอลัมน์ | รายละเอียด |
|---|---|
| เลขที่รายการ | เลข `RCP` |
| วันที่สร้างรายการ | วันที่สร้าง/วันที่รับเงินของ RCP |
| ลูกค้า | ลูกค้าของใบรับเงิน |
| บิลอ้างอิง | รายการ `SB` ที่รับชำระ |
| บัญชีที่รับเงิน | บัญชีบริษัทที่รับเงินเข้า รองรับหลายบัญชี |
| ยอดรับ | Gross receipt amount |
| WHT | ภาษีหัก ณ ที่จ่าย |
| Bank Fee | ค่าธรรมเนียมธนาคาร |
| สุทธิ | เงินเข้าสุทธิ |
| หมายเหตุ | หมายเหตุของ RCP |

Filter ที่ต้องมี:

| Filter | รายละเอียด |
|---|---|
| Search | ค้นหาเลข RCP, SB, ลูกค้า, บัญชี, หมายเหตุ |
| วันที่ | เลือกช่วงวันที่สร้างรายการ |
| บัญชี | กรองบัญชีรับเงิน |
| สถานะ | `ทั้งหมด`, `รับเงินแล้ว`, `ยกเลิก` |
| พิมพ์รายงานประจำวัน | พิมพ์รายงานตาม filter วันที่/บัญชี/สถานะ/search ที่เลือก |

การคลิกแถว:

- คลิกแถวเพื่อดูรายละเอียดภาพรวมของ RCP
- ไม่ควรเข้าสู่โหมดแก้ไขจากการคลิกแถว

### 7. รายงานประจำวัน

ปุ่ม `พิมพ์รายงานประจำวัน` ใน tab `ประวัติการรับเงิน` ใช้พิมพ์รายงานจาก RCP history เท่านั้น

ข้อมูลในรายงาน:

| Field | รายละเอียด |
|---|---|
| หัวรายงาน | `รายงานประวัติการรับเงินประจำวัน` |
| วันที่รายงาน | ตามช่วงวันที่ filter |
| รายการ RCP ทั้งหมด | จำนวน RCP ตาม filter |
| รับเงินแล้ว | จำนวน/ยอด RCP ที่ไม่ cancelled |
| ยกเลิก | จำนวน/ยอด RCP ที่ cancelled |
| ยอดรับแล้วก่อน fee | ยอด gross ของ RCP active |
| Bank Fee | รวม bank fee ของ RCP active |
| เงินเข้าสุทธิ | รวม net cash in ของ RCP active |
| ตารางรายการ | RCP, วันที่, ลูกค้า, เอกสารอ้างอิง, บัญชีที่รับเงิน, ยอดรับ, Bank Fee, เงินเข้าสุทธิ, สถานะ, หมายเหตุ |

รายงานไม่รวมบิลขายที่ยังไม่เกิด RCP

### 8. การยกเลิกใบรับเงิน

การยกเลิกต้องยกเลิกเฉพาะ RCP ไม่ยกเลิก Sales Bill

เงื่อนไข:

- ต้องระบุเหตุผลการยกเลิก
- RCP ที่ถูกยกเลิกแล้วไม่ควรยกเลิกซ้ำ
- ต้องเก็บ audit/log ไม่ลบข้อมูลเดิม

ผลจากการยกเลิก:

1. `customer_receipts.status = cancelled`
2. allocation ของ RCP เป็น `cancelled`
3. compatibility receipt fact เป็น `cancelled`
4. สร้าง reversing `bank_statement` เงินออก หรือ fact กลับรายการตาม contract
5. คืนยอดรับของบิลขายกลับเป็นค้างรับ
6. คำนวณสถานะบิลขายใหม่
7. บันทึก status log ของ RCP และ SB
8. RCP ยังแสดงใน tab `ประวัติการรับเงิน` เมื่อเลือกสถานะ `ยกเลิก`

### 9. การแก้ไขใบรับเงิน

Policy การแก้ไขคือ cancel-and-reissue:

1. ผู้ใช้กด `แก้ไข`
2. ระบบเปิดข้อมูล RCP เดิม
3. Field ลูกค้าที่ผูกกับบิลขายแล้วต้องไม่สามารถเปลี่ยนได้
4. ผู้ใช้แก้ยอดรับ, WHT, fee, discount, บัญชีรับเงิน หรือหมายเหตุ
5. เมื่อบันทึก ระบบยกเลิก RCP เดิม และออก RCP ใหม่ใน transaction เดียว
6. ต้อง link เอกสารใหม่กับเอกสารเดิมเพื่อ audit

ไม่ควรแก้ไขแบบ silent in-place เพราะจะทำให้ประวัติเงินเข้า/AR/bank statement ตรวจสอบย้อนหลังยาก

### 10. Error / Blocking Cases ที่ต้องทดสอบ

| Case | Expected result |
|---|---|
| ไม่เลือกบัญชีรับเงิน | บันทึกไม่ได้ |
| รวมบัญชีรับเงินไม่เท่ากับเงินเข้าสุทธิ | บันทึกไม่ได้ |
| ยอดรับเกินยอดค้างรับ | บันทึกไม่ได้ |
| เลือกบิลคนละลูกค้า | บันทึกไม่ได้ |
| ลบทุกบิลออกจาก RCP | บันทึกไม่ได้ |
| ลบทุกบัญชีรับเงิน | บันทึกไม่ได้ |
| ใส่ยอดติดลบ | บันทึกไม่ได้ |
| ยกเลิกโดยไม่ใส่เหตุผล | ยกเลิกไม่ได้ |
| RCP cancelled แล้วกดแก้ไข | ไม่ควรแก้ไขได้ |
| RCP cancelled แล้วกดยกเลิกซ้ำ | ไม่ควรยกเลิกซ้ำ |

## API / Data Contract

### Current API

- `GET /api/sales/receipts - queue/history`
- `POST /api/sales/receipts - create receipt`
- `PATCH /api/sales/receipts - cancel/replace receipt`

### Runtime Contract Batch 2026-06-12

`RCP` write path now has an explicit header/allocation contract:

- Header: `customer_receipts`
- Per-SB allocation facts: `customer_receipt_allocations`
- Receipt timeline: `customer_receipt_status_logs`
- Compatibility cash/AR read fact for existing reports: `receipts`
- Cash/bank movement: `bank_statement`
- AR current balance/status: `sales_bills.received_amount`, `sales_bills.receivable_balance`, `sales_bills.status`
- SB timeline: `sales_bill_status_logs`

`POST /api/sales/receipts` accepts the current single-bill form payload and the target `lines[]` payload. Both are validated by the same allocation rules. The single-bill payload maps to exactly one allocation line and is not allowed to infer a bill or amount from other state.

Request contract for target multi-bill create:

```json
{
  "date": "2026-06-12",
  "customerId": "CUST001",
  "accountId": "ACC001",
  "method": "TRANSFER",
  "amount": 12000,
  "withholdingTax": 0,
  "discount": 0,
  "fee": 0,
  "notes": "optional",
  "lines": [
    {
      "salesBillDocNo": "SB2606-0001",
      "receiptAmount": 12000,
      "withholdingTaxAmount": 0,
      "discountAmount": 0
    }
  ]
}
```

`method` must resolve to an active `payment_methods.code` or active `payment_methods.name`. `customerId`, `accountId`, and `salesBillDocNo` are outward business codes/document numbers resolved server-side to internal ids.

The server computes and validates:

- `gross_amount = sum(lines.receiptAmount)`
- `discount_total = sum(lines.discountAmount)`
- `withholding_tax_total = sum(lines.withholdingTaxAmount)`
- `net_cash_in = gross_amount - bank_fee_total - withholding_tax_total`
- `allocated_ar_amount = receiptAmount + discountAmount + withholdingTaxAmount`
- `outstanding_after = outstanding_before - allocated_ar_amount`

Cancel contract:

```json
{
  "action": "cancel",
  "docNo": "RCP2606-0001",
  "reason": "reason required"
}
```

Cancel does not delete the original receipt, allocation, or bank facts. It marks `customer_receipts`, allocation rows, and compatibility `receipts` rows as `cancelled`, appends a reversing `bank_statement` money-out row with `ref_type = RCP-CANCEL`, restores `sales_bills.received_amount` / `receivable_balance`, recalculates SB status, and appends receipt/SB status logs.

Edit contract uses cancel-and-reissue, not silent in-place mutation. The UI can submit an existing `id` through `POST /api/sales/receipts`, or API callers can use:

```json
{
  "action": "replace",
  "docNo": "RCP2606-0001",
  "reason": "แก้ไขยอดรับ",
  "values": {
    "date": "2026-06-12",
    "customerId": "CUST001",
    "accountId": "ACC001",
    "method": "TRANSFER",
    "amount": 10000,
    "withholdingTax": 0,
    "discount": 0,
    "fee": 0,
    "lines": [
      {
        "salesBillDocNo": "SB2606-0001",
        "receiptAmount": 10000,
        "withholdingTaxAmount": 0,
        "discountAmount": 0
      }
    ]
  }
}
```

Replace runs in one database transaction: cancel old RCP, reverse old bank/AR effects, validate the replacement against the restored SB balances, create a new RCP number, write new bank/AR effects, and append receipt/SB status logs linking the replacement to the old doc no.

No fallback/hard-coded option policy:

- Outstanding SB selection reads only SB with positive `receivable_balance` and non-cancelled status.
- Customer must resolve by active `customers.code`.
- Account must resolve by active `accounts.code`.
- Payment method must resolve from active `payment_methods`; UI choices are master-data driven.
- Sales bill must resolve by `sales_bills.doc_no`; internal ids are not accepted as business references.
- Status writes use centralized runtime constants, not UI display labels.

### API / DB Optimization Batch 2026-06-12

`GET /api/sales/receipts` keeps the same response shape but avoids broad ORM payloads and the previous `OR` queue query:

- Sales Bill queue is split into two indexed queries: outstanding SB and active-allocation SB for edit/history context, then merged by `doc_no` server-side.
- Sales Bill and RCP history queries select only fields used by the page response; relation `include` of full Customer/Account rows is intentionally avoided.
- RCP history ordering uses `customer_receipts(date desc, created_at desc, id desc)`.
- Outstanding SB queue uses a partial index for `receivable_balance > 0` and non-cancelled statuses.
- Active allocation lookup uses a partial index on `customer_receipt_allocations(sales_bill_id)` where `status = 'active'`.

The optimization remains no-fallback/no-hardcode: master data still comes from active Customer/Account/Payment Method tables, and receipt write paths still validate business codes/doc numbers server-side.

### Data Contract

- UI ใช้ outward business document/code เป็นหลัก และให้ server resolve internal id
- list/detail/print/export ต้องอ่าน source contract เดียวกันเพื่อลด drift
- transaction write ต้องทำใน server transaction และ append timeline/status/audit ตาม document policy
- ถ้า field เป็น money/qty/date/business code ให้ validate ตาม `docs/design.md` และ server-side ซ้ำ

## Validation / Status Rules

- SB ต้องไม่ cancelled และยังมียอดค้างรับ
- receipt amount/discount/WHT ต้อง reconcile กับยอดค้าง
- บัญชีรับเงินต้อง active
- cancel ต้องไม่ลบ audit และต้อง recalc AR

## Business Rules

- รับเงินได้เฉพาะบิลขายที่มียอดค้างรับ
- ระบบสามารถเลือกหลายบิลขายใน Receipt Voucher เดียวได้
- ระบบคำนวณยอดคงเหลือหลังรับเงินอัตโนมัติ
- ยอดรับต้องไม่เกินยอดค้างรับของบิล
- การรับเงินบางส่วนจะเปลี่ยนสถานะบิลเป็น Partial
- เมื่อรับเงินครบ ระบบเปลี่ยนสถานะบิลเป็น Paid
- ระบบบันทึกประวัติการรับเงินทุกครั้ง
- สามารถระบุบัญชีรับเงินได้
- เมื่อบันทึก `RCP` ต้องสร้าง `bank_statement` เงินเข้า
- เมื่อแก้ไขหรือยกเลิก `RCP` ต้อง reverse หรือปรับผลเดิมอย่างตรวจสอบย้อนหลังได้ แล้วคำนวณยอดรับแล้ว/ยอดค้างรับของบิลใหม่

## Side Effects

- สร้าง receipt/RCP facts และ `bank_statement` เงินเข้า
- recalc SB paid/receivable status
- cancel reverse receipt/bank facts

## Current Code Baseline

- Current `apps/next` page/API code is accepted as the P0 implementation baseline as of 2026-06-11.
- This page belongs to the transaction/stock/payment risk group; accepted baseline means proofed against current code, not target-complete.
- Runtime changes must preserve documented status, allocation, ledger, payment, lock, and reversal boundaries, or update this page-flow and the canonical flow first.
- See [[P0 Transaction Stock Payment Current Code Baseline]] for API/permission/side-effect proof notes and open critical gaps.

## Current Gap

Multi-bill receipt allocation DB/API create path, UI picker, cancel/reversal path, and edit via cancel-and-reissue are implemented in the active Next app. Printed RCP detail and customer advance allocation remain future work.

## Implementation Checklist

- [x] Verify current Next page/component against this page-flow
- [x] Verify API route handlers match Current API and status rules above
- [x] Add additive DB contract for `customer_receipts`, `customer_receipt_allocations`, and `customer_receipt_status_logs`
- [x] Update create API to write RCP header, allocation facts, legacy receipt line facts, bank statement, SB balances, and status logs in one transaction
- [x] Build UI multi-bill allocation picker instead of single-bill-only modal
- [x] Add cancel API and UI flow without deleting audit facts
- [x] Add migration/backfill plan for old `receipts` history into `customer_receipts`
- [x] Implement approved edit policy as cancel-and-reissue replacement in one transaction
- [x] Optimize Customer Receipt API read payloads and DB indexes for outstanding queue, active allocation lookup, and RCP history order
- [ ] Add browser QA checklist for create partial/full/multi-bill and over-receipt blocking
