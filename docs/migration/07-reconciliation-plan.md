# 07 Reconciliation Plan

## Objective

ทำให้มั่นใจว่าหลัง refactor/migration แล้ว ตัวเลขหลักยังตรงกับระบบเดิมในขอบเขตที่กำหนด

## Reconciliation Areas

### Master Data

- row count
- required fields completeness
- duplicate keys

### Purchase

- bill count
- total amount
- paid amount
- payable balance
- Stock purchase quantities/weights from `ใบรับของ` to purchase bill
- PO cut quantities/weights for both Stock + PO and Trading + PO
- Trading purchase bills must not create stock movements
- Cost Pool must include only copper/brass eligible products (`ทองแดง`, `ทองเหลือง`, `copper`, `brass`)
- PO Buy rows closed as `ปิดรับไม่ครบ` must not leave remaining undelivered quantity in Cost Pool candidate/available quantity

### Sales

- bill count
- total amount
- received amount
- receivable balance

### Inventory

- stock movement count
- stock quantity by product/warehouse
- opening stock
- transaction traceability

### Cash and Bank

- payment count
- receipt count
- transfer count
- bank statement totals

### User and Access

- active user count
- role count
- branch access mapping

## Validation Methods

- source vs target aggregate queries
- sample document trace checks
- cross-table consistency checks
- business user sign-off on selected scenarios

## Acceptance Rule

แต่ละ phase ต้องนิยาม:
- tolerated variance
- non-negotiable fields
- must-match documents
- owner ที่ sign-off ได้
