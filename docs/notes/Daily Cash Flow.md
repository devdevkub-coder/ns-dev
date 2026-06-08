---
title: Daily Cash Flow
aliases:
  - Daily Cash Flow
  - Daily Transfer Flow
  - โอนเงินระหว่างบัญชี
tags:
  - ns-scrap-erp
  - daily
  - cash-bank
  - business-flow
status: draft
created: 2026-06-08
updated: 2026-06-08
---

# Daily Cash Flow / เงินสดธนาคารรายวัน

เอกสารนี้เป็น target flow สำหรับรายการเงินสด/ธนาคารที่อยู่ในกลุ่ม `รายการประจำวัน` และมีผลต่อ `bank_statement` โดยตรง เช่น โอนเงินระหว่างบัญชี, ค่าใช้จ่าย, เงินสำรองจ่าย, และรายการคืนเงินสำรองจ่าย

## ขอบเขตปัจจุบัน

| Flow | Route | สถานะ |
|---|---|---|
| โอนเงินระหว่างบัญชี | `/daily/transfer` | implemented partial write |
| ค่าใช้จ่าย | `/daily/expense` | implemented with approval/payment flow integration |
| เงินสำรองจ่าย | `/daily/petty-advance` | implemented baseline |

## Flow โอนเงินระหว่างบัญชี

ใช้เมื่อย้ายเงินภายในบริษัทจากบัญชีหนึ่งไปอีกบัญชีหนึ่ง เช่น เงินสดเข้าธนาคาร, ธนาคารหนึ่งไปอีกธนาคารหนึ่ง, หรือย้ายเงินระหว่างบัญชีบริษัท

### Business Objective

หน้า `/daily/transfer` เป็นหน้าบันทึก movement ระหว่างบัญชีเงินภายในบริษัท ไม่ใช่หน้าอนุมัติจ่ายเงินและไม่ใช่หน้ารับ/จ่ายจากคู่ค้า ผู้ใช้จึงต้องเลือกเฉพาะบัญชีต้นทาง, บัญชีปลายทาง, จำนวนเงิน, ค่าธรรมเนียม และหมายเหตุ ส่วนเลขเอกสาร วันที่ระบบ และผู้ทำรายการเป็นข้อมูลที่ระบบควบคุมเพื่อให้ audit trail สม่ำเสมอ

เอกสารหลักของรายการโอนคือ `TRF` ส่วนผลกระทบต่อสมุดบัญชีธนาคาร/เงินสดจะถูกบันทึกเป็น `BST` 2 รายการเสมอ:

- `TRF` = transfer document ที่ผู้ใช้เห็นเป็นเลขรายการโอน
- `BST` แถวที่ 1 = เงินออกจากบัญชีต้นทาง รวมค่าธรรมเนียม
- `BST` แถวที่ 2 = เงินเข้าบัญชีปลายทาง เฉพาะยอดเงินโอน

### Page Entry And List Behavior

เมื่อเปิดหน้า `/daily/transfer` ระบบต้องโหลดข้อมูล 2 ชุด:

- รายการบัญชีเงินที่ใช้งานได้จาก master `accounts`
- รายการโอนเงินล่าสุดจาก `transfers` พร้อมชื่อบัญชีต้นทาง/ปลายทาง

หน้า list ต้องรองรับ:

- ค้นหาจากเลขที่เอกสารและหมายเหตุ
- filter วันที่จาก/ถึง
- filter บัญชีต้นทาง
- filter บัญชีปลายทาง
- shortcut ช่วงเวลา `ทั้งหมด`, `วันนี้`, `7 วัน`, `เดือนนี้`
- count, page size, pagination ตาม list design baseline
- แสดงยอดรวมของรายการที่ผ่าน filter ปัจจุบัน
- กด row ในตารางเพื่อเปิดรายละเอียดรายการโอน
- ปุ่ม action ใน row เช่น `แก้ไข` ต้องไม่เปิดรายละเอียดซ้อนเมื่อกดปุ่มโดยตรง

| ขั้นตอน | ผู้ใช้ทำอะไร | ผู้ใช้กรอกอะไร | ระบบออก/บันทึกอะไร | ผลกระทบ |
|---|---|---|---|---|
| 1 | เปิดหน้าโอนเงิน | ค้นหา/กรองรายการเดิมถ้าต้องการ | ไม่มี | แสดงรายการโอนพร้อมบัญชีต้นทาง/ปลายทาง, ยอด, ค่าธรรมเนียม, ผู้ทำรายการ |
| 2 | กด `+ โอนใหม่` | ไม่มี | เปิด modal สร้างรายการ | modal ไม่แสดง field ที่ระบบจัดการเอง |
| 3 | กรอกข้อมูลการโอน | `บัญชีต้นทาง`, `บัญชีปลายทาง`, `จำนวนเงิน`, `ค่าธรรมเนียม`, `หมายเหตุ` | ยังไม่บันทึก | client validate field required/money/account pair; ตัวเลือกบัญชีต้นทาง/ปลายทางใน modal แสดงยอดคงเหลือปัจจุบันใน label; ช่องเงินใช้ money input pattern และ `หมายเหตุ` ใช้ textarea |
| 4 | บันทึก | ไม่มีเพิ่มเติม | สร้าง `TRF{YYMM}-NNNN` ผ่าน transaction client เดียวกับการบันทึก | สร้างแถว `transfers` |
| 5 | ระบบลง bank statement | ไม่มี | สร้าง `BST...` 2 แถวผ่าน transaction client เดียวกัน: เงินออกจากบัญชีต้นทาง และเงินเข้าบัญชีปลายทาง | cash/bank ledger เห็น movement ทั้งสองฝั่ง |
| 6 | ผู้ใช้ดูรายการ | filter/search/pagination ในหน้า list | ไม่มี | table แสดง `เลขที่`, `วันที่`, `จาก`, `เข้า`, `จำนวน`, `ค่าธรรมเนียม`, `ผู้ทำรายการ` |
| 7 | ผู้ใช้กด row ในตาราง | ไม่มี | เปิด detail modal จาก row ที่เลือก | เห็นข้อมูลสรุป, บัญชีต้นทาง/ปลายทาง, หมายเหตุ, และผลกระทบ Bank Statement |

### Create Modal Flow

เมื่อกด `+ โอนใหม่`:

- เปิด modal ขนาดกลางตาม design baseline
- ตั้งวันที่ใน form state เป็นวันที่ปัจจุบันโดยอัตโนมัติ แต่ไม่แสดงช่องวันที่
- ตั้ง `ผู้ทำรายการ` จาก authenticated actor ตอน API save ไม่รับจาก form
- ไม่แสดงช่อง `เลขที่` เพราะระบบออกเลข `TRF` ตอนบันทึก
- ตัวเลือก `บัญชีต้นทาง` และ `บัญชีปลายทาง` แสดงเฉพาะบัญชี active
- label ของบัญชีใน modal แสดงยอดคงเหลือเพื่อช่วยตัดสินใจก่อนโอน
- ช่องเงินต้องพิมพ์ง่าย: ระหว่าง focus เป็น draft text, ตอน blur จึง format เป็นเงิน

### Edit Modal Flow

เมื่อกดแก้ไขรายการเดิม:

- modal ใช้ field ชุดเดียวกับ create
- อ้างอิงรายการเดิมด้วย outward `doc_no`
- คง `doc_no` เดิม ไม่ออกเลขใหม่ถ้าเป็นการแก้ไขรายการเดิม
- ลบ paired `bank_statement` เดิมของ `ref_type = TRF` และ `ref_id = transfers.id` ใน transaction เดียวกันก่อนสร้าง paired rows ใหม่
- วันที่เดิมยังอยู่ใน payload state เพื่อคงเดือนเลขเอกสาร/วันที่รายการตามข้อมูลเดิม แต่ยังไม่เปิดให้ผู้ใช้แก้ใน modal ตามกติกาปัจจุบัน

### Detail Modal Flow

เมื่อกด row ในตาราง:

- เปิด modal รายละเอียดรายการโอนเงินจากข้อมูล row ปัจจุบัน
- แสดงเลขเอกสาร `TRF`, วันที่, ผู้ทำรายการ, บัญชีต้นทาง, บัญชีปลายทาง, จำนวนเงิน, ค่าธรรมเนียม, ยอดออกจากบัญชีต้นทาง และหมายเหตุ
- แสดง summary ผลกระทบต่อ Bank Statement เป็น 2 ฝั่ง: เงินออกจากบัญชีต้นทาง และเงินเข้าบัญชีปลายทาง
- มีปุ่ม `ปิด` เพื่อกลับไปหน้า list
- มีปุ่ม `แก้ไข` เพื่อเข้า edit modal ของรายการเดียวกัน
- ปุ่ม `ยกเลิก` ใน row เป็น action name เป้าหมายแทน `ลบ`; ยังไม่เปิดใช้งานจนกว่าจะมี cancel/reversal flow ที่ reviewed แล้ว

## System-Managed Fields

กติกาหน้า `/daily/transfer`:

- `เลขที่` เป็น system-generated document number ไม่แสดงเป็นช่องกรอกใน modal
- `วันที่` เป็น auto date ใน payload/write path ปัจจุบัน ไม่ให้ผู้ใช้แก้ใน modal
- `ผู้ทำรายการ` มาจาก authenticated actor และบันทึกใน `transfers.created_by`
- `ผู้ทำรายการ` ที่แสดงในตารางต้องอ่านจากข้อมูลที่ระบบบันทึกไว้ ไม่รับค่าจาก form
- การแก้ไขรายการเดิมยังคงอ้างเอกสารด้วย outward `doc_no` ตาม DB-first identifier contract

## Validation Rules

| Field | Rule |
|---|---|
| `บัญชีต้นทาง` | required, ต้องเป็น active account option |
| `บัญชีปลายทาง` | required, ต้องเป็น active account option และต้องไม่ซ้ำกับบัญชีต้นทาง |
| `จำนวนเงิน` | required, มากกว่า 0; ใช้ money input pattern (`type="text"` + `inputMode="decimal"`, draft ตอน focus, format ตอน blur) |
| `ค่าธรรมเนียม` | optional, ต้องไม่ติดลบ; ใช้ money input pattern เดียวกับ `จำนวนเงิน` |
| `หมายเหตุ` | optional, ใช้ textarea ตาม Remark / Note Field Pattern และข้อความทั่วไปที่ไม่มี control characters |

หลัง submit ไม่ผ่าน ต้องแสดง field error ที่ช่องจริงและ focus ไปยัง field แรกที่ผิดตาม `docs/design.md`

### Save Payload Contract

Client ส่ง payload ผ่าน `POST /api/daily/transfers` ตาม `transferFormSchema`:

| Field | Source | หมายเหตุ |
|---|---|---|
| `id` | edit row id/doc no | optional; ใช้เมื่อต้องแก้ไขรายการเดิม |
| `docNo` | edit row doc no | optional; create เป็น `null` เพื่อให้ server ออกเลข |
| `date` | auto form state | required schema แม้ไม่แสดงใน modal |
| `fromAccountId` | modal select | outward account code |
| `toAccountId` | modal select | outward account code |
| `amount` | modal money input | ต้องมากกว่า 0 |
| `fee` | modal money input | default 0 |
| `byPerson` | hidden/system | ไม่ใช้เป็น source of truth ตอน save |
| `notes` | modal textarea | optional |

Server ต้อง map `fromAccountId` / `toAccountId` จาก outward account code กลับเป็น internal account id ก่อนเขียน `transfers` และ `bank_statement`

## Bank Statement Contract

การบันทึก transfer ต้องเกิดใน transaction เดียวกับการสร้าง paired bank statement rows:

- row เงินออก: อ้าง `ref_type = TRF`, `ref_id = transfers.id`, `doc_no = BST...`, account = บัญชีต้นทาง
- row เงินเข้า: อ้าง `ref_type = TRF`, `ref_id = transfers.id`, `doc_no = BST...`, account = บัญชีปลายทาง
- ค่าธรรมเนียมต้องสะท้อนเป็น cash-out side effect ของบัญชีต้นทางตาม `bankStatementTransferRows`
- การออกเลข `TRF` และเลข `BST` ต้องเรียกผ่าน transaction client (`tx`) เดียวกับการ insert/update เพื่อหลีกเลี่ยง constrained-pool transaction failure ใน local/dev runtime

### Ledger Example

ตัวอย่างโอนเงิน 10,000.00 บาท จาก `เงินสด` ไป `ธนาคาร A` และมีค่าธรรมเนียม 25.00 บาท:

| Document | Account | In | Out | Meaning |
|---|---:|---:|---:|---|
| `TRF2606-0001` | - | - | - | เอกสารโอนเงินหลัก |
| `BST2606-0001` | เงินสด | 0.00 | 10,025.00 | เงินออกจากบัญชีต้นทาง รวมค่าธรรมเนียม |
| `BST2606-0002` | ธนาคาร A | 10,000.00 | 0.00 | เงินเข้าบัญชีปลายทาง |

ผลรวม cash/bank ทั้งระบบลดลงเท่าค่าธรรมเนียม 25.00 บาท และ movement ระหว่างบัญชีเห็นครบทั้งสองฝั่ง

## Error And Recovery Rules

กรณีบันทึกไม่สำเร็จ:

- validation ฝั่ง client ต้องแสดง error ใน modal ไม่ใช่ error banner นอก modal
- ถ้าบัญชีต้นทาง/ปลายทางไม่ถูกต้อง API ต้อง reject และไม่สร้าง `transfers`
- ถ้าออกเลขเอกสารหรือสร้าง `bank_statement` ไม่สำเร็จ transaction ต้อง rollback ทั้งหมด
- ห้ามเกิดสถานะที่มี `transfers` แล้วแต่ไม่มี paired `BST` หรือมี `BST` บางแถวเท่านั้น
- ข้อผิดพลาดจาก constrained connection pool ต้องแก้ที่ transaction client usage ไม่ใช่เพิ่ม fallback runtime ที่ซ่อนปัญหา

## Open Follow-ups

- ยังไม่มี reviewed cancel / reversal flow สำหรับ transfer; ปุ่ม `ยกเลิก` จึงยัง disabled
- ยังขาด dedicated `transfer_status_logs` ตาม `Document Timeline Policy`
- ก่อนเปิด cancel/reversal ต้องออกแบบผลกระทบกลับ `bank_statement` แบบ append-only ไม่ลบ row เงินเดิมเงียบ ๆ
