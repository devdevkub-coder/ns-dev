---
title: Customer Advance Page Flow
aliases:
  - Finance Customer Advance Page
  - Flow หน้ารับล่วงหน้าจาก Customer
  - หน้า Customer Advance
tags:
  - ns-scrap-erp
  - finance
  - debt
  - customer-advance
  - page-flow
status: retired
created: 2026-06-11
updated: 2026-07-06
---

# Customer Advance Page Flow / Flow หน้ารับล่วงหน้าจาก Customer

> Retired 2026-07-06: หน้า `/finance/customer-advance` ถูกลบออกจาก active app เพราะซ้ำกับ flow รับเงินลูกค้าที่ `/sales/receipts`. การรับเงิน/เงินรับล่วงหน้าฝั่ง Customer ให้ดูและทำงานผ่าน `/sales/receipts`; `GET /api/finance/customer-advance` อาจยังเหลือเป็น read source ภายในจนกว่าจะย้าย CADV/allocation source เข้ากับ sales receipt model ครบ.

## Scope

- Route: retired; use `/sales/receipts`
- API: `GET /api/finance/customer-advance`
- Owner: Finance & Debt
- Page type: current read baseline for customer advance/deposit
- Current source: `bank_statement.ref_type = 'CADV'`

หน้านี้ใช้ดูเงินรับล่วงหน้าจากลูกค้าที่รอเอาไปหักกับบิลขาย ไม่ใช่หน้า allocation จริงระยะยาวจนกว่าจะมี dedicated customer advance tables

## Current Source Of Truth

| Data | Current Source | Target Source |
|---|---|---|
| Advance row | `bank_statement` with `ref_type = CADV` | `customer_advances` |
| Customer | `bank_statement.ref_id` maps to `customers.code` | FK/business code in `customer_advances` |
| Used amount | currently 0 / interim snapshot outside this page | `customer_advance_allocations` |
| Remaining amount | amount - used | derived from allocation facts |
| Account | `bank_statement.account_id` | cash/bank receipt fact |

## Page Meaning

ใช้สำหรับ:

- ดูยอดรับล่วงหน้าจากลูกค้า
- ดูยอดคงเหลือที่ยังเอาไปหักบิลขายได้
- filter ตามลูกค้า/สถานะ/วันที่
- export เป็น `.xlsx`

ไม่ใช้สำหรับ:

- สร้าง `CADV` ใหม่ ถ้ายังไม่มี write flow ที่ออกแบบครบ
- allocate เข้า SB โดยตรงจากหน้านี้
- ยกเลิกเงินรับล่วงหน้าโดยแก้ bank statement row

## Main UI Contract

### Summary / KPI

ควรแสดง:

- ยอดรับล่วงหน้ารวม
- ยอดใช้แล้ว
- ยอดคงเหลือ
- จำนวนรายการ active
- จำนวน source rows

### Filters

ควรรองรับ:

- ค้นหา doc no / customer code / customer name / account / description
- Customer
- Status: `Open`, `Partially Used`, `Fully Used`, `Cancelled`
- วันที่จาก-ถึง
- sort direction

### Table Columns

คอลัมน์เป้าหมาย:

- เลขเอกสาร
- วันที่รับเงิน
- วันที่สร้างรายการ
- Customer code/name
- Account
- Bank/account no
- Currency
- FX rate
- Amount
- Used
- Remaining
- Status
- Source
- Description

ต้องแยก `วันที่รับเงิน` ออกจาก `วันที่สร้างรายการ`

## Allocation Rule

Target allocation:

- Customer advance ต้องถูกใช้ผ่าน Sales Bill/Receipt flow ที่มี allocation fact
- 1 advance ใช้ได้หลาย SB ถ้ามี remaining
- 1 SB ใช้ได้หลาย advance ถ้าต้องรองรับในอนาคต
- Cancel SB หรือ cancel allocation ต้อง release remaining กลับมา
- ห้ามคำนวณ used amount จาก free-text description หรือ snapshot ในระยะยาว

## API Contract

`GET /api/finance/customer-advance` รับ query:

- `q`
- `customerId`
- `status`
- `from`
- `to`
- `page`
- `pageSize`
- `sortDirection`
- `format=json|xlsx`

Response ควรรวม:

- `rows`
- `summary`
- `filters.customers`
- `filters.statuses`
- `schemaState`
- `pagination`

## Business Rules

- Current page ต้องเปิดเผยว่า source ยังเป็น `bank_statement` ไม่ใช่ dedicated advance table
- Customer matching ต้องใช้ `customers.code` เท่านั้น ไม่ fallback fuzzy name matching
- Used/remaining target ต้องมาจาก allocation facts
- Cancel/reverse ต้องทำผ่าน source money flow ไม่ใช่แก้ row ใน report page

## Current Implementation / Gap

- มี read/export baseline จาก `bank_statement.ref_type = CADV`
- API ระบุ `schemaState.allocationSource = missing_table`
- `usedAmount` ยังเป็น 0 เพราะ dedicated allocation table ยังไม่มี
- ต้องออกแบบ `customer_advances` และ `customer_advance_allocations`
- ต้องเชื่อมกับ `/sales/bills` deposit allocation และ `/sales/receipts`
- ต้องเพิ่ม created-date display ใน list/detail/export

## Related Notes

- [[Finance AR Page Flow]]
- [[Sales Bills Page Flow]]
- [[Finance Bank Statement Page Flow]]
- [[Daily Cash Flow]]
