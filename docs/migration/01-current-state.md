# 01 Current State

## Objective

สรุปสภาพปัจจุบันของระบบเดิม เพื่อใช้เป็น baseline ก่อน refactor และ migration

## Current Application State

- frontend เดิมเป็น Vue app แบบ single-file และถูก archive ไว้ที่ [old-apps/legacy/index.html](/Users/watcharathatsrithanesiganon/Documents/GitHub/ns-scrap-erp/old-apps/legacy/index.html)
- business logic, state, menu, views, config และบาง seed/master data ปะปนกันในไฟล์เดียว
- deploy model ปัจจุบันเป็น static frontend + Supabase
- ใช้งานได้จริงหลายโมดูล แต่โครงสร้างไม่เหมาะกับการดูแลระยะยาว

## Current Database State

อ้างอิงจาก [reports/db_audit/tables.tsv](/Users/watcharathatsrithanesiganon/Documents/GitHub/ns-scrap-erp/reports/db_audit/tables.tsv)

- `public` schema ประมาณ 47 ตาราง
- มีข้อมูลจริงใน transaction หลักแล้ว
- ตารางที่มีข้อมูลเด่น:
  - `suppliers` ~ 8,235
  - `stock_ledger` ~ 1,762
  - `po_buys` ~ 478
  - `purchase_bills` ~ 393
  - `bank_statement` ~ 377
  - `payments` ~ 304
  - `sales_bills` ~ 51
  - `customers` ~ 50

## Current Structural Problems

### Code

- UI, state, business logic และ data access ยังไม่แยกชั้น
- component structure ยังไม่เป็น module-based
- hardcoded data/config บางส่วนยังอยู่ใน code
- ทดสอบ logic ได้ยาก

### Database

- line items หลายระบบอยู่ใน `jsonb` ของตาราง header
- user/role model ซ้ำกันหลายชั้น
- ledger ใช้แนว generic reference มากเกินไป
- config / opening balance ยัง normalize ไม่พอ
- sync/deletion metadata ปนอยู่ใน domain model

## Keep / Refactor / Rebuild

### Keep with cleanup

- branches
- warehouses
- currencies
- customers
- suppliers
- products
- accounts
- expense_categories
- purchase_channels
- sales_channels

### Refactor heavily

- purchase_bills
- sales_bills
- payments
- receipts
- stock_ledger
- po_buys
- po_sells
- production tables
- bank_statement

### Rebuild or replace

- public.users
- roles / roles_config
- opening_balance structure
- deletion_log / deletion_tombstones model
- document counter and business config structure

## Main Conclusion

ระบบเดิม `ยังมีคุณค่าทั้งในเชิง flow และข้อมูลจริง` แต่ควรถูกมองเป็น:
- baseline ของธุรกิจ
- migration source ของข้อมูล
- reference สำหรับ preserve workflow

ไม่ควรถูกนำไปใช้เป็น target architecture ตรง ๆ
