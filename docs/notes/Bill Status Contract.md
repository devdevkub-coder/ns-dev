---
title: Bill Status Contract
status: active
---

# Bill Status Contract

`purchase_bills.status` และ `sales_bills.status` เป็น L5 business fact จาก database จึงห้าม cache, ห้าม default ค่า และห้ามตีความ alias ของสถานะใน runtime

## Purchase Bill (PB)

| Canonical status | ความหมาย |
| --- | --- |
| `unpaid` | ยังไม่ชำระเงิน |
| `partial` | ชำระเงินบางส่วน |
| `paid` | ชำระครบแล้ว |
| `cancelled` | ยกเลิก |
| `cancelled_supplier_swap` | ยกเลิกเพื่อเปลี่ยนผู้ขาย |

สถานะ active คือทุกสถานะยกเว้น `cancelled` และ `cancelled_supplier_swap` โดยต้องใช้ `requirePurchaseBillStatus`, `isPurchaseBillCancelledStatus` หรือ `isPurchaseBillActiveStatus` จาก `src/lib/purchase-bill-status.ts`.

## Sales Bill (SB)

| Canonical status | ความหมาย |
| --- | --- |
| `unreceived` | ยังไม่รับเงิน |
| `partial` | รับเงินบางส่วน |
| `received` | รับเงินครบแล้ว |
| `cancelled` | ยกเลิก |

สถานะ active คือทุกสถานะยกเว้น `cancelled` โดยต้องใช้ helper ใน `src/lib/server/sales-bill-history.ts`.

## Reader and selector rule

- Read model, export, edit/cancel guard และ allocation ต้อง validate status ผ่าน helper ก่อนใช้ข้อมูล; `null`, `open`, `closed`, `paid`, `void` และ alias อื่นต้อง error เพื่อแก้ข้อมูลที่ source ไม่ใช่ถูกตีความเป็น active.
- Query ที่ต้องการเอกสาร active ระบุ canonical active status แบบ `in` เท่านั้น ห้ามใช้ `notIn` ของ legacy status list.
- Customer receipt มี lifecycle ของตัวเอง จึงยังใช้ contract ของ `customer_receipts.status` แยกจาก SB; ไม่ให้ใช้ status receipt มาตีความสถานะของ SB.

## Write boundary

การสร้าง/แก้ไข/ยกเลิก PB และ SB ต้องเขียนเฉพาะ canonical status จาก contract นี้ แล้ว reader จะอ่าน database ตรงด้วย `Cache-Control: private, no-store` สำหรับ API ที่เป็นข้อมูลธุรกรรม.
