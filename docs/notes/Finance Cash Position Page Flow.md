---
title: Finance Cash Position Page Flow
aliases:
  - Cash Position Page
  - Flow หน้า Cash Position
  - หน้า Finance Cash Position
tags:
  - ns-scrap-erp
  - finance
  - debt
  - cash-position
  - page-flow
status: draft
created: 2026-06-11
updated: 2026-07-30
---

# Finance Cash Position Page Flow / Flow หน้า Cash Position

## Scope

- Route: `/finance/cash-position`
- API: `GET /api/finance/cash-position`
- Owner: Finance & Debt
- Page type: read-only liquidity dashboard

หน้านี้ใช้ตอบคำถามว่า "เงินสด/ธนาคารตอนนี้เหลือเท่าไร และหลังหักเจ้าหนี้/รวมลูกหนี้แล้วสถานะเป็นอย่างไร" ไม่ใช่หน้าบันทึกเงินเข้า/ออก

## Source Of Truth

| Data | Source | Rule |
|---|---|---|
| Account balances | currency-aware Bank/FCD ledger projection | คำนวณต่อ `account + currency` ณ as-of; ห้ามใช้ `accounts.opening_balance` เป็นยอดยกมา |
| AR exposure | `sales_bills.receivable_balance` | THB snapshot ของยอดค้างรับ active; receipt facts ใช้ drilldown เท่านั้น |
| AP exposure | `purchase_bills.payable_balance` | THB snapshot ของยอดค้างจ่าย active; payment facts ใช้ drilldown เท่านั้น |
| Near due | derived | จาก due date/aging ของ AR/AP |
| FCD carrying value | FCD ledger projection | ใช้ carrying THB เป็นยอดรวมหลัก; native balance อยู่ใน FCD drilldown/หน้าแลกเงิน |

## Page Meaning

ใช้สำหรับ:

- ดู net cash/bank ทั้งบริษัท
- แยกยอดตาม account type เช่น Cash, Bank, OD, FCD
- ดู AR/AP exposure ที่กระทบ liquidity
- ดู near due AR/AP
- ดู Top accounts ตาม balance

ไม่ใช้สำหรับ:

- สร้าง bank statement
- โอนเงิน
- รับเงิน/จ่ายเงิน
- ปรับ AR/AP balance

## Main UI Contract

### Summary / KPI

ควรแสดง:

- Account balance รวมเป็น THB comparable value
- จำนวนบัญชี active
- Net exposure = AR - AP
- Net after AP = cash/bank - AP
- AR total/overdue/upcoming
- AP total/overdue/upcoming

### Panels

ควรมี:

- liquid composition
- AR/AP bars
- Top accounts
- Net cash position strip
- account table

### Table Columns

คอลัมน์เป้าหมาย:

- Account code
- Account name
- Account no
- Bank
- Branch
- Type
- Currency/FCD indicator
- Book balance (THB)
- OD limit/used/available ตาม currency contract

หน้านี้เป็น aggregate/dashboard จึงไม่มี `created_at` ของ row aggregate แต่ drilldown/link ไป Bank/AP/AR ต้องแสดง `วันที่สร้างรายการ` ที่ source page

## API Contract

`GET /api/finance/cash-position` ปัจจุบันไม่มี query หลัก. Target ต้องรองรับ `asOf`, branch และ account group และส่ง:

- `accounts`
- `byType`
- `exposure.ar`
- `exposure.ap`
- `nearDue.ar`
- `nearDue.ap`
- `summary`

## Business Rules

- Cash Position ต้องอ่านจาก source facts เท่านั้น ไม่บันทึกค่า snapshot เป็น source of truth
- Cancelled PB/SB/payment/receipt ต้องไม่ถูกนับใน exposure active
- Account ids ที่ส่งออกต้องเป็น `accounts.code`
- ถ้าต้องทำ snapshot รายวันในอนาคต ต้อง rebuild/reconcile จาก source facts ได้
- ห้ามรวม native USD หรือสกุลอื่นเข้ากับ THB โดยตรง
- KPI, Top Accounts, composition และ net liquidity ต้องใช้ book/carrying THB เท่านั้น
- native balance, rate และ unrealized valuation อยู่ใน FCD ledger/dashboard หรือหน้าแลกเงิน ไม่ขยาย Cash Position ให้เป็น multi-currency ledger
- AR/AP ใน Cash Position เป็น THB เท่านั้น

## Current Implementation / Gap

- Current API อ่านเงินสด/ธนาคารจาก Bank Statement book THB และ FCD native projection แยกออกจากยอดหลักแล้ว; ไม่มี runtime currency fallback และไม่ใช้ยอดยกมาต่อสกุลเงินจาก Account Master เป็น ledger
- Current API อ่าน AR/AP จาก `sales_bills.receivable_balance` และ `purchase_bills.payable_balance` โดยตรงภายใต้ branch scope เดียวกับบัญชีเงิน; ไม่ derive ซ้ำจาก legacy receipt/payment maps
- ยังไม่มี as-of date support
- ต้องเพิ่ม drilldown links ไป `/finance/bank`, `/finance/ar`, `/finance/ap`
- ยังต้องเพิ่ม branch/account/as-of filters และ export ตาม [[FCD Foreign Receipt Implementation Task List]]

## Related Notes

- [[Finance Bank Statement Page Flow]]
- [[Finance AR Page Flow]]
- [[Finance AP Page Flow]]
- [[Document Aging Policy]]
