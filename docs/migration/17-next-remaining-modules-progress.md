# 17 Next Remaining Modules Progress

## Objective

แตกงานที่เหลือหลัง master data, daily transaction baseline และ production read baseline เพื่อ port ทุกหมวดใน Next.js ให้ครบแบบมี API/DB/UI/action/modal/validation/reconciliation ตามลำดับที่ไม่ทำให้ stock/finance พัง

## Continuous Work Rule

- ก่อนเริ่มหมวดใหม่ ต้องใช้ legacy explorer ตรวจหน้าเดิมว่ามี field, filter, button, modal, action, export และ side effect อะไร
- Batch ต้องแบ่ง 3 ระดับเสมอ:
  - Module batch เช่น `Batch S: Stock`
  - Page batch เช่น `S1: Stock Balance`
  - Task batch เช่น `S1.1 Legacy/API`, `S1.2 UI`, `S1.3 Actions/Modal`, `S1.4 QA`
- ทุก batch ย่อยต้องอัปเดตเอกสารนี้ทันทีหลังจบงานหรือเมื่อเปลี่ยน schema/API contract
- หลังแต่ละ batch ย่อยต้องรัน:
  - `npm run type-check --workspace @ns-scrap-erp/next`
  - `npm run lint --workspace @ns-scrap-erp/next`
  - `npm run build --workspace @ns-scrap-erp/next`
- QA ของแต่ละ page batch ต้องใช้ Playwright browser smoke ด้วย ยกเว้น task เป็น docs-only:
  - เปิด route ที่ทำ
  - เช็ก console error/network failure
  - เช็ก filter/pagination/sort
  - เช็กปุ่มหลัก
  - เช็ก modal เปิด/ปิด
  - เช็ก desktop และ mobile viewport
- หลัง validation ผ่าน ต้อง commit และ push เป็น checkpoint
- ถ้า batch ใช้เวลานาน ให้เช็กเอกสารนี้เป็น checkpoint ทุกประมาณ 10 นาที แล้วทำ task ถัดไปต่อทันที
- ใช้ subagent แบบช่วยตรวจ ไม่ใช่ตัวตัดสินใจหลัก:
  - `legacy explorer`: สำรวจ legacy field/action/modal/flow
  - `QA checker`: ตรวจหลัง batch ว่าปุ่ม/modal/filter/export/page/API ขาดอะไร
- `reports/` เป็น local/untracked report area ไม่ commit เว้นแต่มีคำสั่งชัดเจนให้ commit sanitized output

## Definition of Done Per Page

ทุกหน้าที่ port ต้องเช็ก checklist นี้:

- [ ] Route เปิดได้ใน Next
- [ ] API route มีจริงและ guard สิทธิ์ถูกหมวด
- [ ] อ่านจาก DB จริงหรือ documented fixture เฉพาะกรณีที่ยังไม่มี DB เป้าหมาย
- [ ] มี filter/search ตาม legacy หรือปรับให้เหมาะกับข้อมูลจริง
- [ ] มี pagination สำหรับ transaction/large data
- [ ] มี sort สำหรับ table หลัก
- [ ] ปุ่มจาก legacy ถูกตรวจครบ
- [ ] ปุ่มที่ยังไม่พร้อม write ต้อง disabled หรือเปิด read-only modal โดยไม่หลอกว่า save แล้ว
- [ ] Modal/form มี field สำคัญจาก legacy ก่อนตัดออกภายหลัง
- [ ] API/form write ใช้ Zod/syntax validation เมื่อมี mutation
- [ ] Export เป็น `.xlsx` สำหรับ business export ใหม่; CSV ได้เฉพาะ legacy/read baseline ชั่วคราวที่ระบุไว้
- [ ] Error/loading/empty states มีข้อความผู้ใช้เข้าใจได้
- [ ] Playwright smoke ผ่านสำหรับ route นี้
  - [ ] desktop viewport
  - [ ] mobile viewport
  - [ ] no console error
  - [ ] no failed API request
  - [ ] buttons/modal interaction checked
- [ ] เอกสาร tracker อัปเดต
- [ ] type-check/lint/build ผ่าน
- [ ] commit/push checkpoint

## Task Execution Log Template

ทุก task ย่อยที่เป็น code/DB/UI ต้องบันทึก log สั้น ๆ ใน section ของ batch นั้นก่อน commit:

```text
#### Execution Log

- Task:
- Legacy refs:
- Files changed:
- DB/API changes:
- Buttons/actions checked:
- Modal/form checked:
- Validation added:
- Playwright smoke:
- Commands:
- Result:
- Commit:
```

กติกา:

- `Legacy refs` ต้องใส่ path/line เมื่อมีการอ้างอิงระบบเก่า
- `Files changed` ใส่เฉพาะไฟล์สำคัญ ไม่ต้อง list generated output
- `DB/API changes` ระบุ migration/table/API route
- `Buttons/actions checked` ระบุปุ่มที่มีจริง และปุ่มที่ intentionally disabled
- `Playwright smoke` ระบุ desktop/mobile และผล console/network
- `Commands` ระบุ type-check/lint/build และ test/browser command ที่รัน
- `Commit` เติม hash หลัง commit/push แล้ว

## Current Known Carry-over Work

- Production:
  - [ ] Batch P3 ยังเหลือ write flow: create/edit production order, input, output, process cost, reverse, close/lock cost, stock ledger, cost allocation
- Purchase:
  - [ ] void/reversal
  - [ ] PO remaining qty reconciliation
  - [ ] header/line table refactor จาก `items` JSON เป็น relational lines
- Sales:
  - [ ] create/edit/post
  - [ ] FIFO/COGS
  - [ ] receipt allocation reconciliation
- Stock transfer:
  - [ ] cancel/void
  - [ ] cost source/WAC/lot rule
- Payment approval:
  - [ ] approval document persistence/printing
- Auth/permission:
  - [ ] branch-scope enforcement
  - [ ] migrate role matrix เดิมเต็มรูปแบบ
- Testing:
  - [ ] automated smoke test สำหรับ master/data transaction routes
  - [ ] browser QA authenticated route walk

## Batch S: Stock

Priority: สูง เพราะเป็นฐานของ purchase, sales, production, costing และ finance reports

### S0: Legacy Inventory and DB Mapping

- [ ] สำรวจ legacy pages:
  - `/stock/balance`
  - `/stock/ledger`
  - `/stock/status-convert`
  - `/stock/convert`
  - `/stock/adjust`
  - `/stock/customer-return`
- [ ] สรุป field/filter/button/modal/action ต่อหน้า
- [ ] map DB tables/columns ที่มีใน dev-target
- [ ] ระบุ movement types/ref types ที่ใช้จริง
- [ ] ระบุจุดที่ต้องเขียน stock ledger

### S1: Stock Balance

#### S1.1 Legacy/API

- [ ] ตรวจ legacy field/filter/button/modal/action ของ Stock Balance
- [ ] API `/api/stock/balance`
- [ ] backend aggregation จาก `stock_ledger`
- [ ] define query params: product, branch, warehouse, status/category/lot/date

#### S1.2 UI

- [ ] Page `/stock/balance`
- [ ] filter bar
- [ ] table: product, branch, warehouse, qty, value, avg cost, available/not available
- [ ] summary cards

#### S1.3 Actions/Modal/Export

- [ ] action buttons: refresh/export/detail
- [ ] detail modal: movement drilldown
- [ ] export `.xlsx`

#### S1.4 QA

- [ ] API smoke
- [ ] browser smoke
- [ ] docs/type/lint/build/commit/push

### S2: Stock Ledger Polish

#### S2.1 Legacy/API

- [ ] ตรวจ legacy stock ledger field/action
- [ ] เพิ่ม query params/ref type/product/date/branch/warehouse
- [ ] pagination backend
- [ ] ตรวจ running balance calculation

#### S2.2 UI

- [ ] ปรับ `/stock/ledger`
- [ ] filter bar
- [ ] sort/pagination
- [ ] summary cards

#### S2.3 Actions/Modal/Export

- [ ] row detail modal
- [ ] export `.xlsx`
- [ ] refresh button

#### S2.4 QA

- [ ] API smoke
- [ ] browser smoke
- [ ] docs/type/lint/build/commit/push

### S3: Status Convert

#### S3.1 Legacy/API/DB

- [ ] ตรวจ legacy status convert flow
- [ ] API `/api/stock/status-convert`
- [ ] schema/table decision ถ้าต้องมี header table
- [ ] stock ledger movement mapping

#### S3.2 UI

- [ ] Page `/stock/status-convert`
- [ ] list/filter/sort/pagination
- [ ] summary cards

#### S3.3 Modal/Form/Validation

- [ ] modal/form ปรับสถานะ RM/WIP/FG
- [ ] validate product, branch, warehouse, qty, status from/to, reason
- [ ] field-level validation errors

#### S3.4 Write/Reconcile/QA

- [ ] write stock ledger แบบ traceable
- [ ] reconciliation: qty out/in ต้อง balance
- [ ] docs/type/lint/build/commit/push

### S4: Grade Adjustment / Convert

#### S4.1 Legacy/API/DB

- [ ] ตรวจ legacy grade adjustment/convert flow
- [ ] API `/api/stock/convert`
- [ ] cost rule documented ก่อน write
- [ ] stock ledger out/in mapping

#### S4.2 UI

- [ ] Page `/stock/convert`
- [ ] list/filter/sort/pagination

#### S4.3 Modal/Form/Validation

- [ ] modal/form ปรับเกรด/แปลงสินค้า
- [ ] validate source/destination product, qty, lot, reason

#### S4.4 Write/Reconcile/QA

- [ ] stock ledger out/in
- [ ] reconciliation query
- [ ] docs/type/lint/build/commit/push

### S5: Stock Count Adjust

#### S5.1 Legacy/API/DB

- [ ] ตรวจ legacy stock adjust flow
- [ ] API `/api/stock/adjust`
- [ ] header/detail table decision
- [ ] adjustment movement mapping

#### S5.2 UI

- [ ] Page `/stock/adjust`
- [ ] list/filter/sort/pagination

#### S5.3 Modal/Form/Validation

- [ ] modal/form นับสต๊อก/ปรับยอด
- [ ] validate counted qty, system qty, adjustment reason
- [ ] require audit note

#### S5.4 Write/Reconcile/QA

- [ ] write adjustment movement
- [ ] reconciliation query
- [ ] docs/type/lint/build/commit/push

### S6: Customer Return

#### S6.1 Legacy/API/DB

- [ ] ตรวจ legacy customer return flow
- [ ] API `/api/stock/customer-return`
- [ ] source sale/customer link rule
- [ ] not-available-for-sale rule

#### S6.2 UI

- [ ] Page `/stock/customer-return`
- [ ] list/filter/sort/pagination

#### S6.3 Modal/Form/Validation

- [ ] modal/form รับคืนลูกค้า
- [ ] validate customer, product, qty, reason, warehouse

#### S6.4 Write/Reconcile/QA

- [ ] stock ledger with `not_available_for_sale` where applicable
- [ ] link to sales/customer if source exists
- [ ] docs/type/lint/build/commit/push

### S7: Stock QA Batch

- [ ] QA checker ตรวจทุก stock page
- [ ] Browser smoke desktop/mobile
- [ ] API smoke 200
- [ ] docs update
- [ ] type/lint/build
- [ ] commit/push

## Batch F: Finance and Debt

Priority: สูง เพราะผูกกับ AP/AR/payment/receipt/bank statement

### F0: Legacy Inventory and DB Mapping

- [ ] สำรวจ legacy: AR, AP, bank statement, cash position, supplier advance, customer advance
- [ ] map payment/receipt/bank_statement/accounts/purchase_bills/sales_bills
- [ ] ระบุ write flows ที่กระทบเงิน

### F1: AR

- [ ] API `/api/finance/ar`
- [ ] Page `/finance/ar`
- [ ] read from `sales_bills` + `receipts`
- [ ] aging buckets
- [ ] filters: customer/date/status/branch
- [ ] row detail modal
- [ ] export `.xlsx`

### F2: AP Polish

- [ ] ตรวจ `/finance/ap` ที่มีแล้ว
- [ ] เพิ่ม filter/sort/pagination/export/detail modal ตาม legacy
- [ ] reconcile paid/payable from `payments`

### F3: Bank Statement

- [ ] API `/api/finance/bank`
- [ ] Page `/finance/bank`
- [ ] read `bank_statement`
- [ ] filters: account/date/ref type/type
- [ ] running balance
- [ ] detail modal
- [ ] export `.xlsx`

### F4: Cash Position

- [ ] API `/api/finance/cash-position`
- [ ] Page `/finance/cash-position`
- [ ] aggregate cash/bank balances
- [ ] upcoming receivable/payable summary
- [ ] account group cards

### F5: Supplier Advance

- [ ] API `/api/finance/supplier-advance`
- [ ] Page `/finance/supplier-advance`
- [ ] read baseline first
- [ ] modal/form only after allocation rule clear

### F6: Customer Advance

- [ ] API `/api/finance/customer-advance`
- [ ] Page `/finance/customer-advance`
- [ ] read baseline first
- [ ] modal/form only after allocation rule clear

### F7: Finance QA Batch

- [ ] QA checker ตรวจทุก finance page
- [ ] AP/AR/bank reconciliation smoke
- [ ] type/lint/build
- [ ] commit/push

## Batch T: Tracking 360

### T1: Customer Tracking

- [ ] API `/api/tracking/customer`
- [ ] Page `/tracking/customer`
- [ ] customer profile, sales, receipts, outstanding, product trend
- [ ] filters: year/month/customer/salesperson
- [ ] detail modal/export

### T2: Supplier Tracking Polish

- [ ] ตรวจ `/tracking/supplier` ที่มีแล้ว
- [ ] เพิ่ม product breakdown/detail drilldown/export
- [ ] filter salesperson/branch/category where relevant

### T3: Product Tracking

- [ ] API `/api/tracking/product`
- [ ] Page `/tracking/product`
- [ ] purchase/sales/stock/production trend
- [ ] product detail modal
- [ ] export

### T4: Tracking QA Batch

- [ ] QA checker
- [ ] type/lint/build
- [ ] commit/push

## Batch D: Dual Costing / Trading / PO

### D0: Legacy Inventory and DB Mapping

- [ ] สำรวจ PO Sell, Cost Pool, Cost Allocator, Match Log, Deal Margin, Compare Margin, Trading Dashboard
- [ ] map `po_buys`, `po_sells`, `trading_deals`, cost pool source

### D1: PO Sell

- [ ] API `/api/sales/po-sell`
- [ ] Page `/sales/po-sell`
- [ ] filter/sort/pagination
- [ ] modal baseline
- [ ] export

### D2: PO Buy Polish

- [ ] ตรวจ `/purchase/po-buy` ที่มีแล้ว
- [ ] เพิ่ม buttons/modal/export ให้ครบ legacy
- [ ] write flow เฉพาะเมื่อ PO cut/reconciliation ชัด

### D3: Trading Dashboard

- [ ] API `/api/trading/dashboard`
- [ ] Page `/trading/dashboard`
- [ ] summary cards/trend/deal status

### D4: Trading Matching Polish

- [ ] ตรวจ `/trading/matching` ที่มีแล้ว
- [ ] add matching action modal when rules clear
- [ ] export/detail

### D5: Cost Pool

- [ ] API `/api/dual-costing/cost-pool`
- [ ] Page `/dual-costing/cost-pool`
- [ ] source/allocated/unallocated summary

### D6: Cost Allocator

- [ ] API `/api/dual-costing/cost-allocator`
- [ ] Page `/dual-costing/cost-allocator`
- [ ] allocation simulation first
- [ ] write only after reconciliation design

### D7: Match Log / Deal Margin / Compare Margin

- [ ] `/dual-costing/match-log`
- [ ] `/dual-costing/deal-margin`
- [ ] `/dual-costing/compare-margin`
- [ ] read baseline, filters, detail, export

### D8: Dual Costing QA Batch

- [ ] QA checker
- [ ] type/lint/build
- [ ] commit/push

## Batch FF: Foreign Finance

### FF1: FX Rate

- [ ] API `/api/finance/foreign/fx-rate`
- [ ] Page `/finance/foreign/fx-rate`
- [ ] CRUD/modal/validation

### FF2: International Transfer

- [ ] API `/api/finance/foreign/intl-transfer`
- [ ] Page `/finance/foreign/intl-transfer`
- [ ] modal/form, beneficiaries, accounts, remittance purposes
- [ ] bank statement side effect only when rule clear

### FF3: Overseas Receipt

- [ ] API `/api/finance/foreign/overseas-receipt`
- [ ] Page `/finance/foreign/overseas-receipt`
- [ ] modal/form and bank statement side effect

### FF4: FCD Ledger

- [ ] API `/api/finance/foreign/fcd-ledger`
- [ ] Page `/finance/foreign/fcd-ledger`
- [ ] running balance by currency/account

### FF5: FX Gain/Loss

- [ ] API `/api/finance/foreign/fx-gain-loss-report`
- [ ] Page `/finance/foreign/fx-gain-loss-report`
- [ ] realized/unrealized baseline

### FF6: Bank Reconciliation

- [ ] API `/api/finance/foreign/bank-reconciliation`
- [ ] Page `/finance/foreign/bank-reconciliation`
- [ ] statement matching baseline

### FF7: Foreign Finance QA Batch

- [ ] QA checker
- [ ] type/lint/build
- [ ] commit/push

## Batch A: Finance / Accounting

### A1: Financial Dashboard

- [ ] API/page financial dashboard
- [ ] cards: revenue, purchase, AP/AR, cash, stock value

### A2: Cash Flow Analysis and Forecast Calendar

- [ ] `/finance-accounting/cash-flow-analysis`
- [ ] `/finance-accounting/cf-forecast-calendar`
- [ ] AP/AR/payment schedule source

### A3: Working Capital and Stock Finance

- [ ] `/finance-accounting/working-capital`
- [ ] `/finance-accounting/stock-finance`

### A4: Tax / VAT / WHT

- [ ] `/finance-accounting/tax-vat-wht`
- [ ] VAT/WHT source mapping

### A5: Financial Statements

- [ ] `/finance-accounting/pl-statement`
- [ ] `/finance-accounting/balance-sheet`
- [ ] `/finance-accounting/cash-flow-statement`
- [ ] read baseline first; no GL posting until accounting design is clear

### A6: Fixed Assets

- [ ] `/finance-accounting/asset-register`
- [ ] `/finance-accounting/depreciation`
- [ ] `/finance-accounting/asset-disposal`

### A7: Loans / Equity / Opening / Historical

- [ ] `/finance-accounting/loan-contracts`
- [ ] `/finance-accounting/loan-dashboard`
- [ ] `/finance-accounting/equity-maint`
- [ ] `/finance-accounting/opening-balance`
- [ ] `/finance-accounting/historical-data`

### A8: Accounting QA Batch

- [ ] QA checker
- [ ] type/lint/build
- [ ] commit/push

## Batch M: Main Dashboards and Operational Control

### M1: Dashboard and Owner Daily

- [ ] `/dashboard`
- [ ] `/owner-daily`
- [ ] `/daily-report`
- [ ] summary from purchase/sales/stock/finance/production

### M2: Profit and Cost

- [ ] `/profit-cost-analysis`
- [ ] source mapping: purchase/sales/COGS/production/trading

### M3: Pending Sales and Sales Plan

- [ ] `/pending-sales`
- [ ] `/sales-plan`
- [ ] `/sales-commission`

### M4: Calendars

- [ ] `/cash-flow-calendar`
- [ ] `/business-calendar`

### M5: Cash & Others / Anomaly

- [ ] `/cash-others-summary`
- [ ] `/anomaly-detector`

### M6: Main QA Batch

- [ ] QA checker
- [ ] type/lint/build
- [ ] commit/push

## Batch SYS: System and Cleanup

### SYS1: Change Password

- [ ] Page `/admin/change-password`
- [ ] Supabase Auth update password flow
- [ ] validation and success/error states

### SYS2: Migration Tools

- [ ] Page `/admin/migration-tools`
- [ ] safe UI only; no destructive action without explicit confirmation

### SYS3: Audit and Users Polish

- [ ] Audit filters/detail/export
- [ ] Users & permissions role matrix polish
- [ ] branch-scope enforcement

### SYS4: Reports Index

- [ ] Page `/reports`
- [ ] link/search all report pages
- [ ] permission-aware visibility

### SYS5: Cleanup and Full Route QA

- [ ] ตรวจทุก route ใน navigation
- [ ] remove stale placeholder routes or mark intentionally deferred
- [ ] browser smoke desktop/mobile
- [ ] type/lint/build
- [ ] final docs update
- [ ] commit/push

## Current Priority Queue

1. Batch S: Stock
2. Batch F: Finance and Debt
3. Batch T: Tracking 360
4. Batch D: Dual Costing / Trading / PO
5. Batch FF: Foreign Finance
6. Batch A: Finance / Accounting
7. Batch M: Main Dashboards and Operational Control
8. Batch SYS: System and Cleanup
