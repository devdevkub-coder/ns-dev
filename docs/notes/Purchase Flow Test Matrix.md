---
title: Purchase Flow Test Matrix
aliases:
  - Purchase UAT Matrix
  - Purchase Flow QA Matrix
  - Test Matrix ซื้อ
tags:
  - ns-scrap-erp
  - purchase
  - test
  - qa
status: draft
created: 2026-05-27
updated: 2026-05-27
---

# Purchase Flow Test Matrix

เอกสารนี้ใช้เป็น execution checklist สำหรับทดสอบ Purchase Flow ของ active Next app แยกจาก [[Purchase Flow]] ที่เป็น business flow และ decision doc

## Scope

ครอบคลุมเส้นหลักและเงื่อนไขย่อยของ flow ซื้อ:

- `PO Buy`
- `ใบรับของ / WTI`
- `บิลรับซื้อ / Purchase Bill`
- `อนุมัติโอนเงิน`
- `จ่ายเงิน Supplier`
- `ประวัติการจ่ายเงิน`
- `stock_ledger / stock balance`

## Status Legend

| Status | ความหมาย |
|---|---|
| `Not Run` | ยังไม่เริ่มทดสอบ |
| `Pass` | ทดสอบผ่านตาม expected |
| `Fail` | ทดสอบแล้วไม่ตรง expected |
| `Blocked` | ติด dependency หรือยังไม่มีเส้นทางให้ทดสอบ |

## Priority Pack

ชุดที่ควรรันก่อนเพื่อปิด risk หลักของ Purchase Flow:

1. `UC-PUR-01` Spot Buy happy path
2. `UC-PUR-02` PO happy path
3. `UC-PUR-07` WTI ที่เลือกใน PB ต้องจัดสรรครบก่อนบันทึก
4. `UC-PUR-10` approval snapshot lock
5. `UC-PUR-13` จ่ายหลายบิลพร้อมกัน
6. `UC-PUR-14` จ่ายหลายบัญชี
7. `UC-PUR-18` ยกเลิกการจ่ายเงิน
8. `UC-PUR-21` STOCK เข้า stock
9. `UC-PUR-23` ยกเลิกบิลรับซื้อแล้ว reverse stock

## Summary Matrix

| UC ID | หมวด | Use Case | หน้า/API หลัก | Priority | Status |
|---|---|---|---|---|---|
| `UC-PUR-01` | Core | Spot Buy เต็ม flow | `WTI -> /purchase/bills -> /daily/payment-approval -> /purchase/payments -> /purchase/payment-history` | High | `Not Run` |
| `UC-PUR-02` | Core | PO Buy เต็ม flow | `PO Buy -> WTI -> PB -> Approval -> Payment` | High | `Not Run` |
| `UC-PUR-03` | PO | PO รับของบางส่วน | `/purchase/po-buy`, `/purchase/bills` | Medium | `Not Run` |
| `UC-PUR-04` | PO | PO ใช้ครบ | `/purchase/po-buy`, `/purchase/bills` | Medium | `Not Run` |
| `UC-PUR-05` | PO | ปิดรับไม่ครบ | `/purchase/po-buy` | Medium | `Not Run` |
| `UC-PUR-06` | WTI | WTI สินค้าเดียวหลาย lot | `/daily/weight-ticket-list/[id]`, `/purchase/bills` | Medium | `Not Run` |
| `UC-PUR-07` | WTI | WTI ที่เลือกใน PB ต้องจัดสรรครบก่อนบันทึก | `/purchase/bills`, `/daily/weight-ticket-list` | High | `Not Run` |
| `UC-PUR-08` | Allocation | 1 summary แตกหลายแถวใน PB | `/purchase/bills` | High | `Not Run` |
| `UC-PUR-09` | Approval | PB ต้องไปโผล่หน้าอนุมัติโอนเงิน | `/daily/payment-approval` | High | `Not Run` |
| `UC-PUR-10` | Approval | approval snapshot lock | `/daily/payment-approval`, `payment_approvals` | High | `Not Run` |
| `UC-PUR-11` | Approval | อนุมัติยอดเกินไม่ได้ | `/daily/payment-approval` | Medium | `Not Run` |
| `UC-PUR-12` | Payment | จ่าย 1 บิล 1 บัญชี | `/purchase/payments`, `/purchase/payment-history` | Medium | `Not Run` |
| `UC-PUR-13` | Payment | จ่ายหลายบิลพร้อมกัน | `/purchase/payments`, `/purchase/payment-history` | High | `Not Run` |
| `UC-PUR-14` | Payment | จ่ายหลายบัญชี | `/purchase/payments`, `/purchase/payment-history` | High | `Not Run` |
| `UC-PUR-15` | Payment | หลายบิล + หลายบัญชี + WHT | `/purchase/payments`, `/purchase/payment-history` | High | `Not Run` |
| `UC-PUR-16` | Guard | approved แล้ว cancel bill ไม่ได้ | `/purchase/bills`, `/api/purchase/bills` | High | `Not Run` |
| `UC-PUR-17` | Guard | paid แล้ว cancel bill ไม่ได้ | `/purchase/bills`, `/api/purchase/bills` | High | `Not Run` |
| `UC-PUR-18` | Reversal | ยกเลิกการจ่ายเงิน | `/purchase/payment-history`, `/api/purchase/payment-history` | High | `Not Run` |
| `UC-PUR-19` | Reversal | cancel payment แล้วแก้บิล + อนุมัติใหม่ได้ | `/purchase/payment-history`, `/purchase/bills`, `/daily/payment-approval` | High | `Not Run` |
| `UC-PUR-20` | Reversal | cancel payment แล้วค่อย cancel bill | `/purchase/payment-history`, `/purchase/bills` | Medium | `Not Run` |
| `UC-PUR-21` | Stock | STOCK bill ต้องเข้า stock | `/purchase/bills`, `/stock/ledger`, `/stock/balance` | High | `Not Run` |
| `UC-PUR-22` | Stock | TRADING bill ต้องไม่เข้า stock แบบ STOCK | `/purchase/bills`, `/stock/ledger`, `/stock/balance` | Medium | `Not Run` |
| `UC-PUR-23` | Stock | cancel PB ต้อง reverse stock | `/purchase/bills`, `/stock/ledger`, `/stock/balance` | High | `Not Run` |

## Detailed Use Cases

### `UC-PUR-01` Spot Buy เต็ม flow

- Precondition:
  - มี supplier, branch, warehouse, product พร้อมใช้งาน
  - ไม่อ้าง `PO Buy`
- Steps:
  1. สร้าง `WTI`
  2. ออก `Purchase Bill` แบบ `STOCK + Spot Buy`
  3. ตรวจว่าบิลไปโผล่ที่ `/daily/payment-approval`
  4. อนุมัติยอด
  5. ตรวจว่ารายการไปโผล่ที่ `/purchase/payments`
  6. ทำจ่าย
  7. ตรวจว่ารายการไปโผล่ที่ `/purchase/payment-history`
- Expected:
  - `WTI` status เปลี่ยนตาม usage
  - `Purchase Bill` status เดิน `unpaid -> paid/partial`
  - มี approval snapshot และ payment snapshot

### `UC-PUR-02` PO Buy เต็ม flow

- Precondition:
  - มี `PO Buy` เปิดอยู่
  - สินค้าและ supplier ตรงกันกับเอกสารที่จะรับของ
- Steps:
  1. สร้าง `PO Buy`
  2. สร้าง `WTI`
  3. ออก `Purchase Bill` แบบ `STOCK + PO`
  4. เลือก PO ให้ตัดยอด
  5. อนุมัติยอด
  6. ทำจ่าย
  7. ตรวจประวัติการจ่ายเงิน
- Expected:
  - `PO remaining` ลดลงถูก
  - `PO status` เปลี่ยน `Open -> Partially Received / Received`
  - `WTI` ถูกใช้งานตามจริง

### `UC-PUR-03` PO รับของบางส่วน

- Steps:
  1. สร้าง PO qty 100
  2. รับของและออกบิลแค่ 40
  3. เปิดดู PO detail/list
- Expected:
  - `remaining_qty = 60`
  - status = `Partially Received`
  - ยังใช้ PO ต่อได้

### `UC-PUR-04` PO ใช้ครบ

- Steps:
  1. ใช้ PO เดิมออกบิลเพิ่มจนยอดครบ
  2. ตรวจ PO อีกครั้ง
- Expected:
  - `remaining_qty = 0`
  - status = `Received`
  - PO ไม่กลับมาเป็นตัวเลือกใน `/purchase/bills`

### `UC-PUR-05` ปิดรับไม่ครบ

- Steps:
  1. สร้าง PO
  2. รับจริงบางส่วน
  3. ใช้ action `ปิดรับไม่ครบ`
- Expected:
  - status = `Short Closed`
  - `remaining_qty = 0`
  - มี status log และเหตุผล

### `UC-PUR-06` WTI สินค้าเดียวหลาย lot

- Steps:
  1. สร้าง WTI ที่มีสินค้าเดียวกันหลาย lot
  2. เปิดหน้า detail ของ WTI
  3. ใช้ WTI ใบนี้ไปออก Purchase Bill
- Expected:
  - หน้า detail เห็นทั้ง raw lot และ summary ต่อสินค้า
  - Purchase Bill ใช้ยอดจาก summary ต่อสินค้า ไม่ดึง raw line 1:1

### `UC-PUR-07` WTI ที่เลือกใน PB ต้องจัดสรรครบก่อนบันทึก

- Steps:
  1. สร้าง WTI
  2. เปิด PB แล้วเลือก WTI
  3. เลือก PO ที่เหลือยอดน้อยกว่าน้ำหนัก WTI
  4. พยายามบันทึกโดยยังไม่เพิ่มแถวสำหรับยอดคงเหลือ
  5. เพิ่มแถวใต้ WTI summary เดิมแล้วเลือก `Spot Buy` หรือ PO อื่นให้ครบยอด
  6. บันทึก PB อีกครั้ง
- Expected:
  - รอบที่ยังจัดสรรไม่ครบต้องบันทึกไม่ได้
  - ยอดที่ PO ไม่ครอบคลุมต้องถูกบันทึกเป็น `Spot Buy` หรือ PO อื่นอย่างชัดเจน
  - หลังบันทึกสำเร็จ ผลรวม allocation ของ WTI summary ที่เลือกต้องเท่ากับยอด remaining ตอน save
  - หน้า WTI detail/list ต้องเห็น active usage และยอดคงเหลือถูกต้อง

### `UC-PUR-08` 1 summary แตกหลายแถวใน PB

- Steps:
  1. เลือก WTI summary
  2. ตัด PO ใบแรกบางส่วน
  3. เพิ่มแถวไปตัด PO ใบอื่นหรือ Spot Buy
- Expected:
  - หลาย row อ้าง summary เดียวกันได้
  - ยอดรวมที่ตัดต้องเท่ากับ summary remaining ของ summary ที่เลือกก่อน save
  - ถ้ายอดรวมต่ำกว่า summary remaining ต้องบันทึกไม่ได้ และต้องให้เพิ่ม PO อื่นหรือ Spot Buy
  - line ที่อ้าง PO ใช้ราคาจาก PO และล็อกแก้ราคา
  - line ที่เป็น Spot Buy กรอกราคาเองได้

### `UC-PUR-09` PB ต้องไปโผล่หน้าอนุมัติโอนเงิน

- Steps:
  1. สร้าง PB ที่ยังค้างจ่าย
  2. เปิด `/daily/payment-approval`
- Expected:
  - บิลต้องอยู่ใน segmented filter `ยังไม่อนุมัติ`

### `UC-PUR-10` approval snapshot lock

- Steps:
  1. เลือกแถวใน `/daily/payment-approval`
  2. เลือกบัญชีปลายทาง
  3. กรอกยอดและกดอนุมัติ
- Expected:
  - สร้าง `payment_approvals`
  - แถว approved อ่านจาก snapshot
  - แก้ยอด/เปลี่ยนบัญชีจากหน้าเดิมไม่ได้

### `UC-PUR-11` อนุมัติยอดเกินไม่ได้

- Steps:
  1. กรอกยอดเกินยอดคงเหลือ
  2. พยายามกดอนุมัติ
- Expected:
  - field error ใต้ช่อง
  - action ไม่ผ่าน
  - ยอด invalid ไม่ถูกรวมใน selected total

### `UC-PUR-12` จ่าย 1 บิล 1 บัญชี

- Steps:
  1. เลือกรายการ approved 1 รายการ
  2. ทำจ่ายจาก 1 บัญชี
- Expected:
  - สร้าง payment row
  - สร้าง bank statement row
  - voucher ไปหน้า history

### `UC-PUR-13` จ่ายหลายบิลพร้อมกัน

- Steps:
  1. อนุมัติหลายบิล
  2. ทำจ่ายพร้อมกันใน voucher เดียว
- Expected:
  - voucher เดียวอ้างหลาย bill
  - payment history แสดงเป็น 1 voucher
  - payable ของแต่ละ bill ลดลงถูก

### `UC-PUR-14` จ่ายหลายบัญชี

- Steps:
  1. เลือก approval ที่จะจ่าย
  2. split ยอดออกหลายบัญชี
  3. ทำจ่าย
- Expected:
  - `bank_statement` แตกหลาย row
  - history ยังแสดงเป็น voucher เดียว
  - ยอดรวม split = net payment

### `UC-PUR-15` หลายบิล + หลายบัญชี + WHT

- Steps:
  1. เลือกหลายบิล
  2. split หลายบัญชี
  3. กรอก WHT
  4. ทำจ่าย
- Expected:
  - settlement ของแต่ละ approval ไม่เกิน `approved_amount`
  - voucher summary/history ถูก
  - bill statuses ถูกทุกใบ

### `UC-PUR-16` approved แล้ว cancel bill ไม่ได้

- Steps:
  1. สร้าง PB
  2. อนุมัติโอนเงิน
  3. พยายามยกเลิกบิล
- Expected:
  - API reject
  - บิลไม่ถูก cancel

### `UC-PUR-17` paid แล้ว cancel bill ไม่ได้

- Steps:
  1. ทำจ่ายแล้ว
  2. พยายามยกเลิกบิล
- Expected:
  - API reject
  - ต้องย้อน payment ก่อน

### `UC-PUR-18` ยกเลิกการจ่ายเงิน

- Steps:
  1. ทำจ่ายแล้ว
  2. ยกเลิกการจ่ายเงินจาก `ประวัติการจ่ายเงิน`
- Expected:
  - payment row เปลี่ยนเป็น `cancelled`
  - bank statement ของ voucher ถูกย้อน
  - approval rollback
  - รายการกลับไปหน้า `อนุมัติโอนเงิน`
  - บิลยังไม่ถูกยกเลิกอัตโนมัติ

### `UC-PUR-19` cancel payment แล้วแก้บิล + อนุมัติใหม่ได้

- Steps:
  1. ยกเลิกการจ่ายเงิน
  2. แก้ Purchase Bill
  3. อนุมัติใหม่
  4. ทำจ่ายใหม่
- Expected:
  - บิลแก้ได้
  - อนุมัติใหม่ได้
  - จ่ายใหม่ได้

### `UC-PUR-20` cancel payment แล้วค่อย cancel bill

- Steps:
  1. ทำจ่าย
  2. ยกเลิกการจ่ายเงิน
  3. ยกเลิกบิล
- Expected:
  - บิล cancel ได้
  - รายการหายจากหน้าอนุมัติ
  - allocation / WTI / PO recalc ถูก

### `UC-PUR-21` STOCK bill ต้องเข้า stock

- Steps:
  1. สร้าง WTI
  2. ออก PB แบบ `STOCK`
  3. ตรวจ `stock_ledger` และ `stock balance`
- Expected:
  - มี stock ledger row
  - stock balance เพิ่มถูก
  - warehouse / item status ถูก

### `UC-PUR-22` TRADING bill ต้องไม่เข้า stock แบบ STOCK

- Steps:
  1. ออก PB แบบ `TRADING`
  2. ตรวจ `stock_ledger` และ `stock balance`
- Expected:
  - ไม่เข้า stock แบบเดียวกับ STOCK purchase
  - ไม่กระทบ stock balance เหมือน stock purchase

### `UC-PUR-23` cancel PB ต้อง reverse stock

- Steps:
  1. ออก PB แบบ `STOCK`
  2. ตรวจว่า stock เข้าแล้ว
  3. ยกเลิกบิล
  4. ตรวจ `stock_ledger` และ `stock balance`
- Expected:
  - stock ถูก reverse กลับ
  - ledger และ balance สอดคล้องกัน
  - WTI / PO / allocations ถูก recalc ตามจริง

## Execution Notes

- ให้บันทึกเลขเอกสารจริงไว้ในแต่ละรอบ เช่น `WTI`, `POB`, `PB`, `PMA`, `PMT`
- ถ้า test ผ่าน/ตก ให้เติมผลและ evidence ในเอกสารนี้หรือ export ไป sheet กลาง
- ถ้าพบ behavior ที่ขัดกับ [[Purchase Flow]] ให้แก้ flow doc หรือ implementation ให้สอดคล้องกันก่อนปิด batch
