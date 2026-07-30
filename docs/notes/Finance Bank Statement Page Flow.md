---
title: Finance Bank Statement Page Flow
aliases:
  - Bank Statement Page
  - Cash Bank Statement Page
  - Flow หน้า Bank Statement
  - หน้า Finance Bank
tags:
  - ns-scrap-erp
  - finance
  - cash-bank
  - bank-statement
  - page-flow
status: draft
created: 2026-06-11
updated: 2026-07-30
---

# Finance Bank Statement Page Flow / Flow หน้า Cash / Bank Statement

## Scope

- Route: `/finance/bank`
- API: `GET /api/finance/bank`
- Owner: Finance & Debt
- Page type: read-only cash/bank ledger and reconciliation surface
- Related central flow: [[Daily Cash Flow]]

หน้านี้ใช้ดู statement ของบัญชีเงินสด/ธนาคารทั้งหมดจาก `bank_statement` ไม่ใช่หน้าสร้าง transaction โดยตรง

## Source Of Truth

| Data | Source | Rule |
|---|---|---|
| Statement rows | `bank_statement` | ทุกเงินเข้า/ออกต้องมี `doc_no` เป็น outward key |
| Account metadata | `accounts` | filter ใช้ `accounts.code` |
| Running balance | `bank_statement` | ถ้ามี `row.balance` ให้ใช้ row balance; ถ้าไม่มี derive จากรายการ statement ก่อนหน้าและ movement |

## Foreign Movement Contract

Bank Statement ใช้ `book amount THB` เป็นจำนวนหลักสำหรับตาราง, running balance, KPI, chart และ export ทางธุรกิจ. สำหรับรายการ FCD ต้องเก็บ `currency`, `native amount`, `rate snapshot` และ `carrying THB` เพิ่มเป็น transaction audit/subledger แต่ห้ามนำ native USD ไปบวกกับ THB.

- ตารางหลักแสดงเงินเข้า/ออก/running balance เป็น THB
- row detail ของ foreign movement แสดง native amount, currency, rate และ source RCP/conversion
- native balance ต่อ account+currency อ่านจาก FCD ledger/projection ไม่ derive จากคอลัมน์ THB เพียงอย่างเดียว
- ตอน conversion ใช้ native balance และ carrying THB จาก FCD projection ไม่ย้อนกลับไปเลือก Sales Bill

## Statement Ref Types

ตัวอย่าง source ที่ควรเห็นใน statement:

- `TRF` จากโอนเงินระหว่างบัญชี
- `PMT` จากจ่ายเงิน Supplier/expense direct payment
- `RCP` จากรับเงิน Customer
- `PRET` จากคืนเงินสำรองจ่าย
- `CADV` จากรับเงินล่วงหน้าจาก Customer
- cash/bank source อื่นตาม finance write flow

## Main UI Contract

### Summary / KPI

ควรแสดง:

- ยอดเข้า
- ยอดออก
- net movement
- จำนวนบัญชี
- จำนวน rows
- balance ตาม account

### Filters

ควรรองรับ:

- Account
- วันที่จาก-ถึง
- ref type
- type
- search จากบัญชี เลขอ้างอิง description note
- sort direction
- page/page size

### Table Columns

คอลัมน์เป้าหมาย:

- วันที่เอกสาร
- วันที่สร้างรายการ
- เลข BST
- Ref type
- Ref no
- Account code/name/no
- Bank
- Branch
- Description
- Type
- Cash flow category
- เข้า
- ออก
- Running balance
- Note

ต้องแยก `วันที่เอกสาร` ออกจาก `วันที่สร้างรายการ` เพราะมีรายการย้อนหลังได้

## Row Detail

กด row ควรเปิด read-only detail:

- statement row
- account detail
- source ref type/ref no
- source document link ถ้ามี route รองรับ
- created by / created at
- cash flow category
- foreign audit fields เฉพาะเมื่อ row มี native currency: currency, native amount, rate และ carrying THB

ไม่ควรแก้หรือลบ statement row จาก detail นี้ ถ้าต้อง reverse ให้ทำผ่าน source document หรือ admin reconciliation flow

## API Contract

`GET /api/finance/bank` รับ query:

- `accountId`
- `from`
- `to`
- `refType`
- `type`
- `q`
- `page`
- `pageSize`
- `sortDirection`
- `format=json|xlsx`

Response ควรรวม:

- `rows`
- `byAccount`
- `summary`
- `filters.accounts`
- `filters.refTypes`
- `filters.types`
- `pagination`

## Business Rules

- Statement page เป็น read-only ledger
- ทุก bank statement row ต้องมี outward `doc_no`
- filter account ต้องใช้ `accounts.code`, ไม่เปิด internal account id
- duplicate/orphan cleanup ถ้ามี ต้องเป็น admin-only พร้อม backup, audit, rollback และ permission แยก
- Transfer ต้องสร้าง paired statement rows ผ่าน source flow ไม่ใช่สร้างมือในหน้านี้
- Summary/running balance ต้องรวมจาก book THB เท่านั้น

## Current Implementation / Gap

- มี read/export baseline จาก `bank_statement` และ `accounts`
- running balance ใช้ statement row ก่อนหน้า + movement หรือ row balance
- ต้องเพิ่ม/ยืนยัน created-date display ใน list/detail/export
- source document links ยังต้องทำให้ครบทุก ref type
- duplicate cleanup ยังควร disabled จนกว่าจะมี reviewed admin flow
- schema ปัจจุบันยังไม่มี currency/native/book/rate contract ครบ จึงยังใช้ Bank Statement เป็น FCD source ที่ถูกต้องไม่ได้จนกว่าจะทำ migration/posting service

## Related Notes

- [[Daily Cash Flow]]
- [[Finance Cash Position Page Flow]]
- [[Finance AP Page Flow]]
- [[Finance AR Page Flow]]
- [[Customer Advance Page Flow]]
- [[Petty Advance Page Flow]]
