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
updated: 2026-06-09
---

# Daily Cash Flow / เงินสดธนาคารรายวัน

เอกสารนี้เป็น target flow สำหรับรายการเงินสด/ธนาคารที่อยู่ในกลุ่ม `รายการประจำวัน` เช่น โอนเงินระหว่างบัญชี, ค่าใช้จ่าย, เอกสารยืมเงิน/เงินสำรองจ่าย, และรายการคืนเงินสำรองจ่าย โดยต้องแยกให้ชัดว่าเอกสารใดเป็นเอกสารตั้งต้น และจังหวะใดจึงกระทบ `bank_statement`

## ขอบเขตปัจจุบัน

| Flow | Route | สถานะ |
|---|---|---|
| โอนเงินระหว่างบัญชี | `/daily/transfer` | implemented partial write |
| ค่าใช้จ่าย | `/daily/expense` | implemented with approval mode and direct-payment mode |
| เงินสำรองจ่าย | `/daily/petty-advance` | implemented baseline |

## Flow ค่าใช้จ่าย

หน้า `/daily/expense` ใช้สร้างเอกสาร `EXP` และต้องให้ผู้ใช้เลือก mode ก่อนบันทึก:

- `ส่งอนุมัติ`: สร้าง `EXP` เป็น `pending_approval` แล้วส่งเข้า `/daily/payment-approval`; ยังไม่เกิดผลต่อ `bank_statement` จนกว่าจะออก `PMT`
- `จ่ายเลย`: สร้าง `EXP` และ `PMT` ทันทีโดยไม่สร้าง `PMA`; ต้องเลือกช่องทางรับเงินของ Supplier, บัญชีที่จ่ายของบริษัท, Discount, และ Bank fee ใน modal

ผลกระทบของ mode `จ่ายเลย`:

- สร้าง `payments` เป็น `PMT...` และเก็บ source snapshot ใน `payments.lines` ด้วย `sourceType = expense` / `sourceDocNo = EXP...`
- สร้าง `bank_statement` เงินออกด้วย `ref_type = PMT`
- สร้าง `payment_account_splits` และ `payment_status_logs` เพื่อให้ประวัติการจ่ายเงินอ่าน audit trail ได้
- แสดงรายการใน `/purchase/payments?tab=history` แม้ไม่มี `PMA` และไม่มี `payment_allocations`
- ถ้ายกเลิกการจ่าย ต้อง cancel `PMT`, reverse/delete bank statement/payment split facts, และ set `EXP` เป็น `cancelled` เพราะไม่มี `PMA` ให้ย้อนกลับไปเป็นคิวรอจ่าย

## Flow เงินสำรองจ่าย / กู้กรรมการ

หน้า `/daily/petty-advance` ใช้สร้างเอกสาร `PADV` สำหรับรายการยืมเงิน/เงินสำรองจ่าย/กู้กรรมการ โดย `PADV` เป็นเอกสารตั้งต้นของยอดค้าง ไม่สร้าง `BST` ตอนสร้างหรือแก้ไขรายการ:

- modal ไม่แสดงช่อง `เลขที่`; server ออกเลข `PADV...` ตอนบันทึกเท่านั้น และ edit รายการเดิมต้องคงเลขเดิม
- `วันที่` เอกสารระบบ/เวลา save เป็นข้อมูลระบบ ส่วนช่องที่ผู้ใช้เลือกใน modal คือ `วันที่จ่าย` และใช้เป็น `petty_advances.date`
- `ผู้รับเงิน` ต้องเลือกจากข้อมูลหลักบุคคลบริษัท `director_employees` เฉพาะประเภท `กรรมการ` หรือ `พนักงาน` ที่ active และมีบัญชีรับเงินครบ
- ระบบ snapshot `recipient_person_code`, ชื่อผู้รับเงิน, ธนาคาร, ชื่อบัญชี, เลขบัญชี, และสาขา ลงใน `petty_advances` เพื่อให้ประวัติไม่เปลี่ยนตาม master ภายหลัง
- `บัญชีรับเงิน` ใน modal เป็นข้อมูล read-only จากบุคคลที่เลือก ไม่ใช่ช่องให้พิมพ์เอง และ create/edit modal ไม่มี field บัญชีบริษัท
- `หมายเหตุ` ใช้ textarea และ validate เป็นข้อความทั่วไปตาม `docs/design.md`
- filter หน้า list ใช้ segmented/fragment filter สำหรับ `ประเภท` และ `สถานะ` ตาม list-page design baseline โดย `สถานะ` แยกเป็นอีกบรรทัดเพื่อให้อ่านง่าย
- ปุ่ม `คืนเงิน` ต้องเห็นได้จาก row action และ detail modal เฉพาะรายการที่ยัง active และมียอดคงค้าง
- เมื่อบันทึกคืนเงิน ระบบสร้าง `PRET...`, เพิ่ม `petty_advance_returns`, ปรับยอดคืน/สถานะของ `PADV`, และสร้าง `BST...` เงินเข้า โดย `BST` เกิดเฉพาะจังหวะคืนเงินเท่านั้น

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

## Overdraft (OD) Limit Rules / กฎการใช้วงเงิน OD สำหรับบัญชีกระแสรายวัน

เพื่อให้ธุรกิจรองรับการเบิกเงินเกินบัญชีของบริษัท มีข้อกำหนดในการนำวงเงิน OD มาใช้ดังนี้:

1. **สิทธิ์การใช้วงเงิน OD (Current Accounts Only):**
   - เฉพาะบัญชีบริษัทประเภทกระแสรายวัน (`subtype = 'current'`) เท่านั้นที่สามารถตั้งค่าวงเงิน OD (`od_limit > 0`) ได้
   - บัญชีประเภทอื่น (ออมทรัพย์ `savings`, บัญชีเงินสด `cash`, บัญชีต่างประเทศ `fcd`) ห้ามตั้งวงเงิน OD โดยระบบจะปรับค่าเป็น `0` หรือ `null` โดยอัตโนมัติ

2. **ยอดเงินที่จ่ายได้จริง (Available to Pay):**
   - คำนวณจาก: `Available to Pay = ยอดคงเหลือจริง (จาก Bank Statement) + วงเงิน OD คงเหลือ`
   - ลำดับการตัดเงิน: ระบบจะใช้ยอดเงินคงเหลือจริงก่อน และเมื่อยอดเงินคงเหลือไม่พอ จึงไปตัดจากวงเงิน OD
   - การแสดงผลทาง UI: หน้าตัวเลือกและหน้าข้อมูลหลักจะคำนวณและแสดงค่า live ยอดคงเหลือจริง, OD ใช้ไป, OD คงเหลือ, และยอดใช้ได้รวม เพื่อช่วยในการตัดสินใจ

3. **การตรวจสอบและป้องกันเงินไม่พอ (Available to Pay Validation):**
   - **ฝั่งโอนเงินระหว่างบัญชี (`/daily/transfer`):** ยอดโอน + ค่าธรรมเนียม (`amount + fee`) ต้องไม่เกิน Available to Pay ของบัญชีต้นทาง
   - **ฝั่งจ่ายเงินผู้รับเงิน (`/purchase/payments`):** ยอดจ่ายแยกตามบัญชี (Splits Amount) แต่ละส่วนต้องไม่เกิน Available to Pay ของบัญชีจ่ายนั้นๆ
   - หากตรวจพบว่ายอดเกิน ระบบจะแสดงข้อความเตือนและบล็อกการบันทึก: `"ยอดจ่ายเกินยอดเงินคงเหลือและวงเงิน OD ที่ใช้ได้ กรุณาลดจำนวนหรือเพิ่มบัญชีจ่าย"`

## Related Notes

- [[Petty Advance Page Flow]]
- [[Finance Bank Statement Page Flow]]
- [[Customer Advance Page Flow]]
