---
title: Payment Flow
aliases:
  - Flow จ่ายเงิน
  - Approval and Payment Flow
  - Supplier Payment Flow
  - อนุมัติจ่ายเงิน
tags:
  - ns-scrap-erp
  - payment
  - approval
  - finance
  - business-flow
status: draft
created: 2026-05-28
updated: 2026-05-30
---

# Payment Flow / Flow จ่ายเงิน

เอกสารนี้เป็น canonical flow สำหรับ `อนุมัติจ่ายเงิน`, `รอจ่าย`, `ทำจ่าย`, `จ่ายเงินล่วงหน้า / มัดจำ`, `ประวัติการจ่ายเงิน`, และ `คืนเงินมัดจำ/คืนเงินล่วงหน้า` ฝั่ง Supplier

เอกสารที่เกี่ยวข้อง:

- [[Purchase Flow]] สำหรับต้นน้ำฝั่งซื้อ เช่น `PO Buy`, `WTI`, `Purchase Bill`, และ allocation มัดจำเข้าบิล
- [[Supplier Advance Payment Flow]] สำหรับ source document `ADV`, การจ่ายเงินล่วงหน้า Supplier, และการ allocate ADV เข้าบิลรับซื้อ
- [[Sales Flow]] สำหรับฝั่งรับเงิน/ลูกค้า

## ขอบเขตของเอกสารนี้

flow นี้ต้องรองรับ source document อย่างน้อย:

- `บิลรับซื้อ`
- `จ่ายเงินล่วงหน้า / มัดจำ`
- `ค่าใช้จ่าย`

queue กลางของงานนี้ใน target system ต้องใช้ชื่อ `อนุมัติจ่ายเงิน`

## เอกสารหลัก

| เอกสาร | ใช้ทำอะไร | เลขเอกสาร |
|---|---|---|
| `PMA` | approval snapshot ของรายการจ่าย | `PMA{branchCode}{YYMM}-NNNN` |
| `PMT` | payment snapshot / ใบจ่ายเงินจริง | `PMT{branchCode}{YYMM}-NNNN` |
| `ADV` | จ่ายเงินล่วงหน้า / มัดจำ | `ADV{branchCode}{YYMM}-NNNN` หรือเลขที่จะกำหนดต่อ |

กติกา:

- `payment_approvals` เป็น snapshot table
- `1 approval cycle = 1 PMA ใหม่`
- `PMA` ที่ถูกอนุมัติแล้วถือว่า committed/final
- ถ้าจะอนุมัติรอบใหม่สำหรับ source เดิม ต้องสร้าง `PMA` ใหม่ ไม่ reuse เลขเดิม
- คำว่า `ยกเลิก` ไม่ใช้กับ `PMA` หลังอนุมัติแล้ว
- ถ้า `PMT` ถูกยกเลิก ให้ถือว่า payment cycle เดิมจบแล้ว; การจ่ายใหม่ต้องกลับไปอนุมัติใหม่และสร้าง `PMA` ใหม่ก่อนออก `PMT` ใหม่

## Lifecycle ของรายการจ่าย

รายการจ่ายต้องถูกมองเป็น lifecycle เดียว แต่ต้องแยกให้ชัดระหว่าง `source pending`, `PMA`, และ `PMT`

source / approval lifecycle ขั้นต่ำ:

1. `ยังไม่อนุมัติ`
2. `รอจ่าย`
3. `เสร็จสิ้น`
4. `ยกเลิกแล้ว`

ความหมาย:

- `ยังไม่อนุมัติ`
  - อยู่ใน queue `/daily/payment-approval`
  - ยังเป็น live data จาก source document
  - ผู้ใช้ยังเปลี่ยนใจ, ปิด modal, หรือไม่อนุมัติได้
- `รอจ่าย`
  - มี `payment_approvals.status='approved'`
  - อยู่ใน `/purchase/payments`
  - `PMA` ในสถานะนี้ห้ามย้อนกลับเป็น `ยกเลิกแล้ว`
- `เสร็จสิ้น`
  - มี `PMT`
  - อยู่ใน `/purchase/payment-history`
- `ยกเลิกแล้ว`
  - ใช้กับ payment snapshot / voucher lifecycle หรือ source document ที่ถูกยกเลิกก่อนเข้าคิว
  - ไม่ใช้เป็นสถานะย้อนกลับของ `PMA` ที่อนุมัติแล้ว
  - อยู่ใน `/purchase/payment-history`

## Superseding Decision 2026-05-30

decision นี้ override สมมติฐานเดิมบางส่วนที่เคยอนุญาต `voided PMA`

- `PMA approved แล้วห้ามยกเลิก`
- ปุ่ม `ยกเลิก` ต้องไม่อยู่ใน queue `/purchase/payments`
- การ `ไม่อนุมัติ` หรือ `ยกเลิกการจัด split` ใช้ได้เฉพาะก่อนกดอนุมัติใน modal เท่านั้น
- ถ้า split ที่อนุมัติไปแล้วไม่ต้องการใช้ต่อ ถือว่าเป็นการออกแบบ approval ผิดรอบนั้น ไม่ใช่เหตุให้ rollback PMA
- ถ้ายังมียอดคงเหลือของ source ที่ไม่เคยถูก approve มาก่อน จึงค่อยสร้าง `PMA ใหม่`

## PMT Pending Decision 2026-05-30

เพื่อไม่ให้ approval stage ปนกับ payment execution stage:

- `/purchase/payments` ต้องถูกมองเป็น `PMT pending queue`
- `approved PMA` เป็นเพียงต้นทางที่ feed queue นี้
- เมื่ออนุมัติแล้ว รายการต้องไปปรากฏในหน้า `จ่ายเงิน Supplier` ในฐานะ `รายการรอออก PMT`
- สถานะ `success / cancelled` ต้องเป็นสถานะของ `PMT` หรือ payment voucher lifecycle
- `PMA` ควรเก็บเฉพาะสถานะฝั่ง approval เช่น `approved`, `paid/consumed`
- ห้ามใช้ `cancelled/voided` เป็นสถานะ rollback ของ `PMA`

## Queue และหน้าจอ

| หน้า | หน้าที่ | ลักษณะข้อมูล |
|---|---|---|
| `/daily/payment-approval` | queue `อนุมัติจ่ายเงิน` | live pending rows + approved snapshot rows |
| `/purchase/payments` | queue `รอจ่าย` | `PMT pending` queue fed by approved PMA items |
| `/purchase/payment-history` | ประวัติการจ่ายเงิน | read-only snapshot |

กติกา:

- `/daily/payment-approval`
  - pending rows ต้องอ่านจาก source document ปัจจุบัน
  - approved rows ต้องอ่านจาก snapshot
  - action `ยกเลิก/ไม่อนุมัติ` หมายถึงทิ้ง draft split ใน modal ก่อนสร้าง PMA เท่านั้น
- `/purchase/payments`
  - ต้องรับรายการจาก `payment_approvals.status='approved'`
  - แต่หน้าจอ/business meaning ต้องเป็น `PMT pending`
  - ต้องทำงานระดับ `approval item`
  - ไม่มี action `ยกเลิกรายการรอจ่าย`
- `/purchase/payment-history`
  - read-only
  - แสดงอย่างน้อย `เสร็จสิ้น` และ `ยกเลิกแล้ว`
  - downstream accounting/report/bank posting ใช้เฉพาะ `เสร็จสิ้น`

## Approval Item Model

approval ต้องไม่ยึด `1 เอกสาร = 1 แถว` อย่างเดียวอีกต่อไป

ต้องรองรับ `split approval`

ตัวอย่าง:

- บิล 1,000,000
- มีมัดจำแล้ว 800,000
- เหลือยอดค้าง 200,000
- ผู้อนุมัติ split เป็น:
  - เงินสด 50,000
  - เงินโอนบัญชี A 100,000
  - เงินโอนบัญชี B 50,000

ผลลัพธ์:

- เกิด `payment_approvals` 3 rows
- `/purchase/payments` เห็น 3 `PMT pending` rows
- bill/source document ถูก lock ตราบใดที่ยังมี split item ใด `approved`
- ถ้าทั้ง 3 rows ถูกอนุมัติแล้ว จะไม่สามารถลบหรือ void บาง row ย้อนหลังได้

ขั้นต่ำของ snapshot ต่อ split:

- `source_type`
- `source_id`
- `source_doc_no_snapshot`
- `party_id`
- `party_name_snapshot`
- `approved_amount`
- `destination_payment_method_snapshot`
- `destination_bank_account_id_snapshot`
- `destination_bank_name_snapshot`
- `destination_account_no_snapshot`
- `approved_at`
- `approved_by`

## กติกา lock / unlock

### Purchase Bill

- ถ้ายัง `ยังไม่อนุมัติ`
  - แก้ไขบิลได้
  - ยกเลิกบิลได้
- ถ้ามี active `approved` item อย่างน้อย 1 row
  - lock บิล
  - ห้ามแก้ไข
  - ห้ามยกเลิกบิล
- lock จะถูกปลดเมื่อ approval item ทั้งหมดของบิลนั้นออกจากคิวด้วยการ `ทำจ่าย` หรือมี flow ทางบัญชี/ธุรกิจที่รองรับการ reverse จริงเท่านั้น
- ไม่มี rollback โดยตรงจาก `approved PMA` กลับไป `pending`

### Source อื่น

- advance payment และ expense ต้องใช้หลักเดียวกัน
- source document ต้องถูก lock เมื่อมี active approved item
- ไม่มีการ unlock ด้วย `ยกเลิกรายการรอจ่าย` ของ PMA ที่อนุมัติแล้ว

## ไม่อนุมัติ / ยกเลิกการจัดรายการ

คำว่า `ยกเลิก` ในรอบนี้ใช้เฉพาะก่อนสร้าง `PMA`

ตัวอย่าง:

1. ผู้ใช้เปิด modal ของ `PB`
2. ลองแตก split หลายบรรทัด
3. เปลี่ยนใจ กด `ปิด` หรือ `ล้าง`
4. ระบบไม่สร้าง `PMA`
5. source document ยังคงอยู่ใน `ยังไม่อนุมัติ`

ดังนั้น `ยกเลิก` ในที่นี้ไม่ใช่การเปลี่ยนสถานะของ approval snapshot ที่สร้างแล้ว

## ทำจ่าย

`ทำจ่าย` ใน `/purchase/payments` ทำงานระดับ approval item

ผลที่ต้องเกิด:

1. สร้างหรือ commit `PMT`
2. `payments.payment_approval_id` ต้องชี้กลับ approval row นั้น
3. approval row เปลี่ยนเป็น `paid` เมื่อ settle ครบ
4. history ต้องเห็น `เสร็จสิ้น`

การตีความที่ถูก:

- แถวใน `/purchase/payments` ไม่ควรถูกสื่อว่าเป็น `PMA` ที่ยังแก้/ยกเลิกได้
- แถวใน `/purchase/payments` คือ `รายการรอจ่าย` ที่จะกลายเป็น `PMT success` หรือ `PMT cancelled`
- `PMA` เป็น approval evidence ด้านหลังเท่านั้น

กติกายอด:

- `cash amount + withholding tax + discount` ต้องไม่เกิน `approved_amount`

## ประวัติการจ่ายเงิน

หน้า `/purchase/payment-history` เป็น snapshot/read-only

ต้องแสดง:

- `เลขเอกสาร`
- `ประเภทเอกสาร`
- `คู่ค้า`
- `ยอด`
- `สถานะ`
- `วันที่/เวลา`

สถานะที่ต้องมีอย่างน้อย:

- `เสร็จสิ้น`
- `ยกเลิกแล้ว`

หมายเหตุ:

- `ยกเลิกแล้ว` ใน history ควรผูกกับ `PMT` หรือ payment-voucher lifecycle เป็นหลัก
- ไม่ควร fabricate `voided PMA` history เพิ่มหลังจาก policy นี้มีผล

## ยกเลิก PMT แล้วเริ่มใหม่

เมื่อ `PMT` ที่จ่ายเงินจริงแล้วถูกยกเลิก:

1. `PMT` เดิมต้องยังอยู่ใน history เป็น `ยกเลิกแล้ว`
2. ต้อง reverse หรือ mark cancelled ผลกระทบเงินออก เช่น bank statement และ payment allocation
3. source document เช่น `PB`, `ADV`, หรือ expense ต้องกลับไปอยู่สถานะ `ยังไม่อนุมัติ`
4. `PMA` เดิมถือว่าเป็นหลักฐานของ cycle เดิมเท่านั้น ห้ามนำกลับมาใช้จ่ายใหม่
5. ถ้าจะจ่ายใหม่ ต้องสร้าง `PMA` ใหม่จาก source document ปัจจุบัน แล้วค่อยสร้าง `PMT` ใหม่

เหตุผล: ลูกค้าถือว่าการยกเลิก PMT คือเริ่มกระบวนการใหม่ทั้งรอบ ไม่ใช่การแก้ voucher เดิมหรือ reuse approval เดิม

## จ่ายเงินล่วงหน้า / มัดจำ

advance payment เป็น source document ของ flow นี้เช่นกัน

ขั้นต่ำของข้อมูล:

- `Supplier`
- `สาขา`
- `วันที่จ่าย`
- `วิธีจ่าย`
- `บัญชีที่จ่าย`
- `ยอดจ่ายล่วงหน้า`
- large-scale source fields ตามที่กำหนดใน [[Purchase Flow]]

หลังบันทึก:

1. advance payment เข้า queue `อนุมัติจ่ายเงิน`
2. ผู้อนุมัติ split ได้เช่นเดียวกับ source อื่น
3. จ่ายจริงแล้วจึงเกิด payment snapshot

## คืนเงินมัดจำ / คืนเงินล่วงหน้า

ถ้า `advance > final bill amount`

- ห้าม carry forward เป็นเครดิต supplier อัตโนมัติในระบบตอนนี้
- ต้องเข้าฝั่ง `คืนเงินมัดจำ / คืนเงินล่วงหน้า`
- เป็น flow ฝั่ง `Supplier`
- ไม่ reuse เมนูคืนเงินฝั่ง `Customer`

## State Matrix ย่อ

| สถานะ | queue/page | source edit | history |
|---|---|---|---|
| `ยังไม่อนุมัติ` | `/daily/payment-approval` | ได้ | ไม่อยู่ใน history |
| `รอจ่าย` | `/purchase/payments` | lock | ไม่อยู่ใน history |
| `เสร็จสิ้น` | `/purchase/payment-history` | lock | อยู่ |
| `ยกเลิกแล้ว` | `/purchase/payment-history` | ใช้กับ PMT / voucher cancellation, ไม่ใช่ PMA rollback | อยู่ |

## Open Implementation Batch

1. ลบ/ปิดการใช้ `voided PMA` ใน read/write paths ของ active app
2. เปลี่ยน `/purchase/payments` จาก approval-item wording ไปเป็น `PMT pending` wording/model
3. เอาปุ่ม `ยกเลิก` ออกจาก `/purchase/payments`
4. ตัด filter/row `ยกเลิกแล้ว` ออกจาก `/daily/payment-approval`
5. เปลี่ยน modal approval ให้ `ยกเลิก/ปิด` หมายถึง discard draft split ก่อนสร้าง PMA เท่านั้น
6. ตรวจ flow lock/unlock ใหม่ให้สอดคล้องกับ rule `approved PMA is final`
7. แยกให้ชัดว่า partial payment ของ `Purchase Bill` ใช้ `PB -> PMA -> PMT`, ส่วน `ADV` ใช้เฉพาะ advance payment จริง
8. เพิ่ม browser smoke:
   - split approve one bill -> PMA items appear in `/purchase/payments`
   - no cancel action after PMA approved
   - payment cancel affects `PMT/history` only, not rollback PMA to pending
