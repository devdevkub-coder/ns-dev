# Reference Master Cache Flow

## Purpose

ไฟล์นี้อธิบาย flow และวิธีทำงานของ reference cache กลางสำหรับ master data ที่ถูกใช้ซ้ำบ่อยใน active Next app (`apps/next/`) โดยรอบนี้เลือกใช้ Redis เป็น cache backend หลัก และมี server-side cache ชั้นสั้นเป็นชั้นเสริม

## Goal

ลดการ query ซ้ำของ master data ที่เป็น option/reference ข้ามหลาย API และหลายหน้า โดยยังให้ฐานข้อมูลเป็น source of truth เสมอ พร้อมลดการแตะ Redis/DB ซ้ำใน request หรือ process เดียวกัน

## Scope

### Batch 1

- `branches`
- `warehouses`

### Batch 2

- `bank-names`
- `payment-methods`
- `currencies`
- `expense-types`
- `product-units`
- `product-types`
- `machine-types`

### Batch 3

- `customers`
- `suppliers`

สถานะเริ่มต้นแล้ว:

- shared active reference reader/invalidation สำหรับ code/id lookup ถูกเพิ่มแล้ว
- CACHE-R5 ปิดแล้ว: `/api/production/orders` และ `/api/stock/adjust` ใช้ full branch/warehouse master reader สำหรับ label ของข้อมูลย้อนหลัง แทน direct master DB read; ไม่ย้าย write-time transaction validation เข้ามาใน cache batch นี้
- `customer-reference` และ `supplier-reference` ถูกย้ายมาใช้ shared cache service แล้ว
- shared active party option cache (`customer/supplier + branchIds`) ถูกเพิ่มแล้ว
- consumer ชุดแรก `daily/weight-tickets/options`, `finance/ar`, และ `finance/ap` ถูกย้ายมาใช้ shared option cache แล้ว
- consumer active-only เพิ่มอีกชุด `finance/customer-advance`, `finance/supplier-advance`, และ `finance/foreign/overseas-receipt` ถูกย้ายมาใช้ shared customer/supplier cache แล้ว
- consumer active-only เพิ่มอีกชุด `sales/customer-advances`, `trading/dashboard`, `finance-accounting/asset-register`, และ `finance-accounting/asset-disposal` ถูกย้ายมาใช้ shared customer/supplier cache แล้ว
- consumer active-only/filter เพิ่มอีกตัว `tracking/product` ถูกย้าย filter suppliers/customers มาใช้ shared customer/supplier cache แล้ว
- consumer active-only เพิ่มอีกตัว `sales/receipts` ถูกย้าย customer selector มาใช้ shared customer cache แล้ว
- เพิ่ม historical supplier summary reader แยกจาก active cache แล้ว สำหรับ route ที่ต้อง map `supplier_id -> supplier code/name` ของข้อมูลเก่า
- consumer historical supplier ชุดแรก `purchase/payment-history` และ `daily/bill-swap-history` ถูกย้ายมาใช้ shared historical supplier reader แล้ว
- เพิ่ม shared active supplier payment-option reader (`active supplier + supplier_bank_accounts`) แล้ว
- consumer ชุดแรกของ supplier payment-option cache คือ `purchase/payments`
- `purchase/payments` ใช้ทั้ง active supplier payment-option cache สำหรับ option payload และ historical supplier summary reader สำหรับ map `supplier_id -> code/name` ของ payment/bill rows
- targeted validation ของ batch `purchase/payments` ปิดแล้ว:
  - `reference-master-cache.test.ts` ผ่าน
  - targeted typecheck ของ `reference-master-cache.ts` และ `purchase/payments/route.ts` ผ่าน
  - `git diff --check` ของไฟล์ batch นี้ผ่าน
- consumer ชุดถัดไปของ supplier payment-option / branch-option cache คือ `purchase/receipt-vouchers` และ `purchase/advance-payments`
- `purchase/receipt-vouchers` ใช้ active supplier payment-option cache สำหรับ supplier receiving accounts และใช้ active supplier summary cache สำหรับ address/phone/tax id
- `purchase/advance-payments` ใช้ active supplier branch-option cache สำหรับ supplier selector ที่ต้องผูกกับ branch eligibility
- targeted validation ของ batch `purchase/advance-payments` + `purchase/receipt-vouchers` ปิดแล้ว:
  - `reference-master-cache.test.ts` ผ่าน
  - targeted typecheck ของ `reference-master-cache.ts`, `purchase/advance-payments/route.ts`, และ `purchase/receipt-vouchers/route.ts` ผ่าน
  - `git diff --check` ของไฟล์ batch นี้ผ่าน
- consumer ชุดถัดไปของ supplier branch/payment-option cache คือ `purchase/po-buy` และ `daily/expenses`
- `purchase/po-buy` ใช้ active supplier branch-option cache สำหรับ supplier selector ใน modal/options payload ที่ต้อง respect branch eligibility โดยไม่ query `suppliers + supplier_branches` ตรงซ้ำ
- `daily/expenses` ใช้ active supplier payment-option cache สำหรับ supplier payee options ที่ต้องแสดง receiving accounts โดยไม่ query `suppliers + supplier_bank_accounts` ตรงซ้ำ
- targeted validation ของ batch `purchase/po-buy` + `daily/expenses` ปิดแล้ว:
  - `reference-master-cache.test.ts` ผ่าน
  - targeted typecheck ของ `reference-master-cache.ts`, `purchase/po-buy/route.ts`, `purchase/advance-payments/route.ts`, `purchase/receipt-vouchers/route.ts`, และ `daily/expenses/route.ts` ผ่าน
  - `git diff --check` ของไฟล์ batch นี้ผ่าน
- consumer ชุดถัดไปของ customer branch-option cache คือ `sales/po-sell`
- `sales/po-sell` ใช้ active customer branch-option cache สำหรับ customer selector/options payload แทน direct `customers + customer_branches` read และยก contract `CustomerBranchOptionRecord` ให้มี `marketScope` เพื่อคง shape เดิมของหน้า sales
- targeted validation ของ batch `sales/po-sell` ปิดแล้ว:
  - `reference-master-cache.ts` และ `sales/po-sell/route.ts` ผ่าน targeted typecheck ร่วมกับ batch ก่อนหน้า (`purchase/po-buy`, `purchase/advance-payments`, `purchase/receipt-vouchers`, `daily/expenses`)
  - `git diff --check` ของไฟล์ batch นี้ผ่าน
- consumer ชุดถัดไปของ supplier branch/payment-option cache คือ `purchase/bills`
- `purchase/bills` ใช้ `listActiveSupplierPaymentOptions()` + `listActiveSupplierBranchOptions()` + `listActiveSuppliers()` สำหรับ supplier options payload แทน direct `suppliers.findMany(...)` และ query `supplier_branches` ตรง
- รอบนี้ยก contract `SupplierPaymentBankAccountReferenceRecord` เพิ่ม `accountName`, `branchCode`, และ `code` เพื่อให้ route ที่ต้องแสดง receiving account รายตัว ใช้ cache กลางได้ครบโดยไม่ยิง DB เพิ่ม
- targeted validation ของ batch `purchase/bills` ปิดได้บางส่วน:
  - `reference-master-cache.test.ts` ผ่าน
  - `git diff --check` ของไฟล์ batch นี้ผ่าน
  - แต่ `purchase/bills/route.ts` ยังมี TypeScript debt เดิมจำนวนมากทั้งไฟล์ จึงยังปิด targeted typecheck ของ route นี้ไม่ได้ใน batch cache รอบนี้
- consumer ชุดถัดไปของ customer branch-option cache คือ `sales/bills`
- `sales/bills` ใช้ `listActiveCustomerBranchOptions()` สำหรับ customer selector/options payload และใช้ `listActiveBranchesByCodes()` สำหรับ branch scope แทน direct `customers.findMany(...customer_branches...)` และ `branches.findMany(...)`
- targeted validation ของ batch `sales/bills` ปิดได้บางส่วน:
  - `git diff --check` ของไฟล์ batch นี้ผ่าน
  - แต่ `sales/bills/route.ts` ยังมี TypeScript debt เดิมจำนวนมากทั้งไฟล์ จึงยังปิด targeted typecheck ของ route นี้ไม่ได้ใน batch cache รอบนี้
- consumer ชุดถัดไปของ cached branch scope reader คือ route detail/action ที่ไม่ได้ต้องการ contract master ใหม่:
  - `purchase/payments`
  - `purchase/payment-history`
  - `purchase/payment-history/[...id]`
  - `sales/bills/[id]`
  - `sales/bills/[id]/stock-return`
- route ชุดนี้ใช้ `listActiveBranchesByCodes()` สำหรับแปลง `allowedBranchCodes -> branch ids` แทน direct `prisma.branches.findMany(...)`
- consumer ชุดถัดไปของ active branch option cache คือ route/filter ที่อ่านเฉพาะ active branches:
  - `finance-accounting/asset-register`
  - `production/orders`
  - `sales/customer-advances`
  - `admin/users`
- route ชุดนี้ใช้ `listActiveBranches()` และ `listActiveBranchesByCodes()` สำหรับ branch options/filter แทน direct `prisma.branches.findMany(...)`
- consumer ชุดถัดไปของ active branch reader/scope ที่ยังไม่ต้องเพิ่ม contract master ใหม่:
  - `lib/server/branch-scope`
  - `purchase/po-buy` เฉพาะ `allowedBranchCodes -> branch ids`
  - `sales/po-sell` เฉพาะ `allowedBranchCodes -> branch ids`
  - `master-data/customers/import` เฉพาะ validate active branch code
  - `lib/server/finance-accounting-cashflow-planning`
  - `lib/server/finance-accounting-tax`
  - `lib/server/finance-accounting-working-capital`
  - `lib/server/finance-accounting-statements`
  - `lib/server/finance-accounting-dashboard`
- route/reader ชุดนี้ใช้ `listActiveBranches()` และ `listActiveBranchesByCodes()` แทน direct `prisma.branches.findMany(...)` เฉพาะกรณีที่อ่าน active branch list/scope ไม่ได้ใช้ map เอกสารเก่าที่อาจอ้าง inactive branch
- targeted validation ของ batch branch-scope/detail ปิดได้บางส่วน:
  - `git diff --check` ของไฟล์ batch นี้ผ่าน
  - targeted typecheck grep ของ `sales/bills/[id]/route.ts` และ `sales/bills/[id]/stock-return/route.ts` ไม่พบ error แล้ว
  - targeted typecheck grep ของ `finance-accounting/asset-register/route.ts` ไม่พบ error แล้ว
  - targeted typecheck grep ของ `purchase/payment-history/route.ts` และ `purchase/payment-history/[...id]/route.ts` ไม่พบ error แล้ว
  - targeted typecheck grep ของ `main-sales-control.ts` ไม่พบ error แล้ว
- branch cache contract ถูกยกเพิ่ม `address` และ `phone` เพื่อรองรับ route ที่เป็น active branch detail/options จริง เช่น `admin/company-profile` โดยยังไม่ขยายไปถึง master-data branch list ที่ต้องอ่าน inactive rows ด้วย
- `admin/company-profile` ใช้ `listActiveBranches()` และ `findActiveBranchReferenceByCodeOrId()` แล้ว แทน direct `branches.findMany/findFirst`
- targeted validation ของ batch `admin/company-profile` ปิดได้:
  - `git diff --check` ของ `admin/company-profile/route.ts` และ `reference-master-cache.ts` ผ่าน
  - targeted typecheck grep ของ `admin/company-profile/route.ts` และ `reference-master-cache.ts` ไม่พบ error แล้ว
- consumer ชุดถัดไปของ active warehouse / customer / supplier reader คือ service ที่อ่านเฉพาะ active option/filter โดยไม่ต้อง map historical row:
  - `lib/server/production-orders` เฉพาะ `productionOrderOptions()`
  - `lib/server/main-dashboards`
  - `lib/server/profit-cost-analysis`
  - `lib/server/main-sales-control`
  - `lib/server/stock` เฉพาะ `stockReferenceData()`
  - `lib/server/stock-holds` เฉพาะ WTO active branch / warehouse option loader
- reader ชุดนี้ใช้ `listActiveBranches()`, `listActiveWarehouses()`, `listActiveCustomers()`, และ `listActiveSuppliers()` แทน direct `prisma.*.findMany(...)` เฉพาะจุดที่ประกอบ active filter/options
- `main-sales-control` เพิ่มการใช้ `listActiveWarehousesByBranch('01')` เพื่อหา active warehouse ฝั่งสมุทรสาคร แทน direct warehouse query ที่ใช้แค่ branch-scoped active option list
- `stock.ts` ย้ายเฉพาะ `stockReferenceData()` ไปใช้ cached active branches / warehouses / customers แล้ว โดยปล่อย snapshot/history queries ที่ยังต้องอ่าน ledger/holds ตาม internal id และ historical state ไว้กับ DB ตรง
- `stock-holds.ts` ย้ายเฉพาะ `loadWtoStockOptions()` และ `resolveWtoWarehousesForLines()` ไปใช้ cached active branch + warehouse-by-branch แล้ว โดยปล่อย allocation / reversal flows ที่ทำงานบน internal warehouse ids และ stock movement จริงไว้กับ DB ตรง
- direct read ที่ยังคงไว้ เช่น `productionProductStock()` ใน `production-orders.ts` ยังเป็น intentional เพราะใช้ internal ids และอ่าน stock snapshot ที่ไม่ใช่ contract active option ธรรมดา
- targeted validation ของ batch active warehouse / customer / supplier reader ปิดได้บางส่วน:
  - `git diff --check` ของ `production-orders.ts`, `main-dashboards.ts`, และ `profit-cost-analysis.ts` ผ่าน
  - targeted typecheck grep ของ `production-orders.ts`, `main-dashboards.ts`, และ `profit-cost-analysis.ts` ไม่พบ error แล้ว
- targeted validation ของ batch `main-sales-control` ปิดได้:
  - `git diff --check` ของ `main-sales-control.ts` ผ่าน
  - targeted typecheck grep ของ `main-sales-control.ts` ไม่พบ error แล้ว
- targeted validation ของ batch `stock.ts` + `stock-holds.ts` ปิดได้:
  - `git diff --check` ของ `stock.ts` และ `stock-holds.ts` ผ่าน
  - targeted typecheck grep ของ `stock.ts` และ `stock-holds.ts` ไม่พบ error แล้ว
- search-result cache สำหรับ query-based autocomplete/search เริ่มแล้ว โดย `tracking/customer` และ `tracking/supplier` ใช้ normalized query key + TTL สั้นผ่าน shared cache service แล้ว
- route query-based อื่นยังเป็นงานคงเหลือและต้องย้ายตาม contract เดียวกัน

### Batch 4

- `products`
- `accounts`
- remaining option masters ที่ยังถูกเรียกซ้ำบ่อย

สถานะเริ่มต้นแล้ว:

- shared active account reader/invalidation ถูกเพิ่มแล้ว
- shared all-accounts reader/invalidation ถูกเพิ่มแล้ว
- shared active overseas recipient reader/invalidation ถูกเพิ่มแล้ว
- shared active overseas remittance purpose reader/invalidation ถูกเพิ่มแล้ว
- contract ของ active account cache ถูกยกเพิ่มให้รองรับ `odLimit` และ `subtype` สำหรับ read-only finance selectors แล้ว
- contract ของ account cache ถูกยกเพิ่ม `active` และแยก reader 2 แบบชัดเจน:
  - `listActiveAccounts()` สำหรับ active-only selector/filter
  - `listAllAccounts()` สำหรับ route/service ที่ต้องอ่านทั้ง active/inactive หรือ map historical account rows
- `account-reference` ถูกย้ายมาใช้ shared account cache แล้ว
- consumer foreign finance ชุด `finance/foreign/intl-transfer`, `finance/foreign/overseas-receipt`, `finance/foreign/bank-reconciliation`, และ `finance/foreign/fcd-ledger` ถูกย้ายมาใช้ shared account/beneficiary/remittance-purpose cache แล้ว
- consumer read-only ชุด `finance/bank` และ `finance/cash-position` ถูกย้ายมาใช้ shared active account cache แล้ว
- consumer ชุด `lib/server/daily.ts`, `finance-accounting/opening-balance`, และ `admin/transaction-ledger` ถูกย้ายมาใช้ shared all-accounts cache แล้ว
- consumer ชุด analytics/calendar เพิ่มอีกชุดถูกย้ายมาใช้ shared active account cache แล้ว:
  - `lib/server/main-calendars.ts`
  - `lib/server/finance-accounting-dashboard.ts`
  - `lib/server/finance-accounting-working-capital.ts`
  - `lib/server/cash-others-anomaly.ts`
- consumer ชุด finance statement/planning เพิ่มอีกชุดถูกย้ายมาใช้ shared active account cache แล้ว:
  - `lib/server/finance-accounting-cashflow-planning.ts`
  - `lib/server/finance-accounting-statements.ts`
- consumer analytics เพิ่มอีกตัวถูกย้ายมาใช้ shared active account + active party cache แล้ว:
  - `lib/server/main-dashboards.ts`
  - `lib/server/profit-cost-analysis.ts`
- invalidation ของ `master-data/accounts`, `master-data/beneficiaries`, และ `simple-master-tables` (`remittancePurposes`) ถูกผูกเข้ากับ cache keys แล้ว
- targeted validation ของ batch นี้ปิดแล้ว:
  - `reference-master-cache.test.ts` ผ่าน (`27 tests`)
  - targeted typecheck grep ของ `reference-master-cache.ts`, `reference-master-cache.test.ts`, `lib/server/daily.ts`, `finance-accounting/opening-balance/route.ts`, `admin/transaction-ledger/route.ts`, `lib/server/main-calendars.ts`, `lib/server/finance-accounting-dashboard.ts`, `lib/server/finance-accounting-working-capital.ts`, `lib/server/cash-others-anomaly.ts`, `lib/server/finance-accounting-cashflow-planning.ts`, `lib/server/finance-accounting-statements.ts`, `lib/server/main-dashboards.ts`, และ `lib/server/profit-cost-analysis.ts` ไม่พบ error
  - `git diff --check` ของไฟล์ batch นี้ผ่าน

## Why Redis

- shared cache ระหว่างทุก user และทุก app instance
- ลด DB query ซ้ำบน master option ที่ใช้บ่อย
- invalidate กลางได้จากจุดเดียว
- เป็นฐานให้ต่อยอด cache ของ `customers`, `suppliers`, `products`, และ search options ได้โดยไม่ต้องเปลี่ยน pattern ใหม่

## Why Add A Small Server Cache Layer

- ลดการอ่านซ้ำใน request เดียวหรือ process เดียวก่อนจะไปแตะ Redis
- ช่วย dedupe call ที่ route/service เดียวกันเรียก master เดิมหลายรอบ
- ใช้เป็นชั้นเบามากเท่านั้น ไม่ใช่ shared cache หลักของระบบ

server cache ชั้นนี้ต้องอายุสั้นกว่า Redis และต้องไม่มี invalidation logic แยกจาก Redis

## What Is Cached

### Full active option list

ใช้กับ master ขนาดเล็ก/ค่อนข้างนิ่ง เช่น

- `branches`
- `bank-names`
- `payment-methods`
- `currencies`
- `expense-types`
- `product-units`
- `product-types`
- `machine-types`

### Scoped option list

ใช้กับ master ที่ต้อง filter ตาม business scope เช่น

- `warehouses by branch`
- future `accounts by branch`

### Active payment-option list

ใช้กับ master ที่เป็น active option แต่ต้องพ่วง child payment destination facts เช่น

- `suppliers + supplier_bank_accounts`

รอบนี้เพิ่ม contract แยกสำหรับ supplier payment options เพราะ shape นี้ไม่เหมือน active supplier summary ปกติ และไม่ควรปะปนกับ historical supplier lookup

### Search-result cache

ใช้กับ master ขนาดใหญ่หรือ autocomplete เช่น

- `customers`
- `suppliers`
- future `products`

search-result cache ต้องมี TTL สั้นกว่า full option list
รอบนี้ตั้ง Redis TTL search ไว้สั้นกว่า full list ที่ `120s`

## Source Of Truth

- Database เป็น source of truth เสมอ
- Redis เป็น read-through cache เท่านั้น
- ห้ามเขียน master data ลง Redis โดยตรงโดยไม่ผ่าน DB

## Cache Layers

### Layer 1: server cache

- ใช้สำหรับ request memoization หรือ memory cache อายุสั้นมาก
- เหมาะกับ `branches`, `warehouses`, และ lookup master ที่ถูกเรียกซ้ำใน route/service เดียวกัน
- ไม่ใช้เป็น source of truth
- ไม่ใช้แทน Redis

### Layer 2: Redis

- เป็น shared cache หลักของระบบ
- ทุก app instance อ่าน key ชุดเดียวกัน
- invalidation ทำที่ layer นี้เป็นหลัก

### Layer 3: DB

- เป็น source of truth เสมอ
- ใช้เมื่อ cache miss หรือ Redis unavailable

## Read Flow

```text
Frontend
-> API/route handler
-> shared reference service
-> check short-lived server cache
-> hit: return cached value
-> miss: check Redis by key
-> hit: write-through/update server cache and return cached value
-> miss: query DB
-> normalize shape
-> write Redis
-> write short-lived server cache
-> return response
```

## Current Execution Snapshot

สถานะล่าสุดของ execution ตอนนี้แบ่งได้แบบนี้:

1. shared cache service กลางสำหรับ `branches`, `warehouses`, lookup masters, active customer/supplier refs, active accounts/beneficiaries/remittance purposes, search cache, historical supplier summary, และ supplier payment options ถูกเปิดใช้แล้ว
2. consumer ที่ถูก migrate แล้วใน batch ล่าสุดคือ `purchase/payments`, `purchase/advance-payments`, `purchase/receipt-vouchers`, `purchase/po-buy`, `daily/expenses`, `sales/po-sell`, `purchase/bills`, `sales/bills`, `production-orders`, `main-dashboards`, `profit-cost-analysis`, `main-sales-control`, `admin/company-profile`, `stock`, `stock-holds`, `finance/foreign/intl-transfer`, `finance/foreign/overseas-receipt`, `finance/foreign/bank-reconciliation`, และ `finance/foreign/fcd-ledger`
   - `purchase/payments` ใช้ `listActiveSupplierPaymentOptions()` สำหรับ dropdown/options ที่ต้องอ่าน `supplier_bank_accounts` และใช้ `listSupplierReferencesByIds()` สำหรับ map supplier history ของ bill/payment rows
   - `purchase/advance-payments` ใช้ `listActiveSupplierBranchOptions()` สำหรับ supplier selector แบบ active + branch scoped
   - `purchase/receipt-vouchers` ใช้ `listActiveSupplierPaymentOptions()` ร่วมกับ `listActiveSuppliers()` เพื่อประกอบ supplier receiving account payload จาก contract กลางแทน direct DB read
   - `purchase/po-buy` ใช้ `listActiveSupplierBranchOptions()` สำหรับ supplier selector ใน options payload โดยคง validation ฝั่ง `findActiveSupplierReferenceByCodeOrId()` ไว้เหมือนเดิม
   - `daily/expenses` ใช้ `listActiveSupplierPaymentOptions()` สำหรับ supplier payee option list แทน direct `suppliers.findMany`
   - `sales/po-sell` ใช้ `listActiveCustomerBranchOptions()` + `listActiveBranches()` / `listActiveBranchesByCodes()` สำหรับ options payload โดยยังปล่อย product/channel list ไว้กับ direct DB read ตามขอบเขต batch นี้
   - `purchase/bills` ใช้ shared supplier payment/branch/reference cache สำหรับ supplier options payload โดยไม่ query `suppliers + supplier_bank_accounts` หรือ `supplier_branches` ตรงอีก
   - `sales/bills` ใช้ shared customer branch-option cache สำหรับ customer options payload และ cached branch reader สำหรับ scope resolution โดยไม่ query `customers + customer_branches` หรือ `branches` ตรงใน 2 จุดนี้แล้ว
   - route detail/action ชุด `purchase/payments`, `purchase/payment-history`, `purchase/payment-history/[...id]`, `sales/bills/[id]`, และ `sales/bills/[id]/stock-return` ใช้ cached branch scope reader แล้วสำหรับ access control
   - route/filter ชุด `finance-accounting/asset-register` และ `production/orders` ใช้ cached active branch reader แล้วสำหรับ branch options
   - `productionOrderOptions()` ใช้ cached active branches + warehouses แล้ว ส่วน read ที่ต้อง map stock snapshot/detail ด้วย internal ids ยังไม่ถูกย้ายในรอบนี้
   - `main-dashboards` ใช้ cached active branches + customers + suppliers สำหรับ option/filter payload ที่เดิมอ่านซ้ำจาก DB ตรง
   - `profit-cost-analysis` ใช้ cached active branches + customers + suppliers สำหรับ branch/customer/supplier option payload แล้ว
   - `main-sales-control` ใช้ cached active customers + suppliers + branches และ warehouse-by-branch สำหรับ sales planning / commission option payload แล้ว
   - `admin/company-profile` ใช้ cached active branches สำหรับ branch option/detail lookup แล้ว และเป็นตัวแรกที่ใช้ branch cache contract ที่ขยาย `address/phone`
   - `stock` ใช้ cached active branches / warehouses / customers แล้วเฉพาะชั้น reference option
   - `stock-holds` ใช้ cached active branch / warehouse-by-branch แล้วเฉพาะชั้น WTO option validation
   - `finance/foreign/intl-transfer` ใช้ `listActiveAccounts()`, `listActiveOverseasRecipients()`, `listActiveOverseasRemittancePurposes()`, และ `listCurrencies()` สำหรับ selector payload แทน direct active master reads
   - `finance/foreign/overseas-receipt` ใช้ `listActiveAccounts()` + `listActiveCustomers()` + `listCurrencies()` สำหรับ selector payload โดยคง sales bill / fx / bank statement ไว้กับ DB ตรงตาม contract ธุรกรรม
   - `finance/foreign/bank-reconciliation` ใช้ `listActiveAccounts()` สำหรับ account filters/selector payload และปล่อย bank statement transaction rows ไว้กับ DB ตรง
   - `finance/foreign/fcd-ledger` ใช้ `listActiveAccounts()` สำหรับ FCD account selectors แล้วปล่อย ledger movement จริง (`bank_statement`, `fx_rates`) ไว้กับ DB ตรง
   - `account-reference` ใช้ `findActiveAccountReferenceByCodeOrId()` แล้ว ทำให้ helper ฝั่ง account ทั้งหมดอ่าน contract เดียวกันจาก cache layer
3. targeted validation ของ consumer batch ล่าสุดปิดได้เพิ่มสำหรับ `account-reference`, `finance/foreign/intl-transfer`, `finance/foreign/overseas-receipt`, `finance/foreign/bank-reconciliation`, `finance/foreign/fcd-ledger`, `master-data/accounts/*`, `master-data/beneficiaries/*`, และ `simple-master-tables`
4. targeted validation ของ consumer batch อื่นยังปิดได้เฉพาะบาง route; `purchase/bills/route.ts` และ `sales/bills/route.ts` ยังติด TypeScript debt เดิมทั้งไฟล์ ส่วน workspace-wide validation ก็ยังไม่ปิด เพราะ current worktree มี TypeScript error ที่ไม่เกี่ยวกับ cache migration อยู่ในหลาย route เดิม
5. งานที่ยังเหลือไม่ใช่การแก้ flow เดิมของ cache แต่เป็นการทยอยย้าย consumer route อื่นที่ยังอ่าน DB ตรง ให้เข้ามาใช้ contract กลางตามประเภทข้อมูลของมัน

สรุปคือ batch นี้ไม่ได้ค้างที่ design แล้ว แต่ขยับมาสู่ execution/migration ทีละ consumer จริงแล้ว

## Write / Invalidation Flow

```text
create/update/deactivate master
-> save DB transaction สำเร็จ
-> clear/revalidate Redis keys ที่เกี่ยวข้อง
-> request ถัดไปจึงอ่าน DB ใหม่และเติม cache กลับ
```

## Key Strategy

keys ต้องสื่อ business scope ชัดเจน

ตัวอย่าง:

- `reference:branches:active`
- `reference:warehouses:active`
- `reference:warehouses:active:branch:<branchCode>`
- `reference:customers:search:<normalizedQuery>`
- `reference:suppliers:search:<normalizedQuery>`
- `reference:accounts:active`
- `reference:overseas-recipients:active`
- `reference:overseas-remittance-purposes:active`
- `reference:suppliers:active:payment-options`

`normalizedQuery` ใช้กติกาเดียวกัน:

- trim ขอบ
- lower-case
- collapse whitespace ซ้ำให้เหลือช่องว่างเดียว

## Invalidation Rules

### Branch changes

เมื่อ create/update/deactivate `branch`

ต้องล้างอย่างน้อย:

- `reference:branches:active`
- `reference:warehouses:active`
- `reference:warehouses:active:branch:*`
- future branch-scoped account/customer/supplier keys ที่ผูก branch โดยตรง

### Warehouse changes

เมื่อ create/update/deactivate `warehouse`

ต้องล้างอย่างน้อย:

- `reference:warehouses:active`
- `reference:warehouses:active:branch:<branchCode>`

### Lookup-master changes

เช่น `bank-names`, `payment-methods`, `currencies`

ให้ล้างเฉพาะ key ของ master นั้น

### Account / beneficiary / remittance-purpose changes

เมื่อมี write ที่ `accounts`, `overseas_recipients`, หรือ `overseas_remittance_purposes`

ต้องล้างอย่างน้อย:

- `reference:accounts:active`
- `reference:overseas-recipients:active`
- `reference:overseas-remittance-purposes:active`

### Searchable-master changes

เช่น `customers`, `suppliers`, `products`

ให้ล้าง:

- active option list key ของ master นั้น
- search-result keys ของ master นั้น

รอบนี้ `invalidateCustomerReferenceCache()` และ `invalidateSupplierReferenceCache()` จะล้างทั้ง:

- active full list
- active branch option list
- search key prefix ของ master นั้น
- supplier payment-option key ของ supplier ด้วยเมื่อ route นั้นใช้ child bank-account facts จาก supplier master

เพิ่มอีกจุด:

- `invalidateBankNameReferenceCache()` ต้องล้าง `reference:suppliers:active:payment-options` ด้วย เพราะ option label ของ supplier payment account อ่านชื่อธนาคารผ่าน relation `bank_names`

## Data Shape Rule

reference cache ต้องเก็บ shape กลางที่ route หลายตัวใช้ร่วมกันได้ก่อน เช่น

### Branch option shape

- `id`
- `code`
- `name`

### Warehouse option shape

- `id`
- `code`
- `name`
- `type`
- `branchCode`

ถ้าหน้าใดต้องใช้ field เพิ่ม ให้ประเมินว่าควรขยาย shared shape หรือสร้าง key/reader เฉพาะ scope นั้น ห้ามให้แต่ละ route map คนละ shape แบบไม่มีกติกากลาง

## Reader Contract Split

cache reader รอบแรกนี้เป็น `active reference reader` เท่านั้น

เหมาะกับ:

- form options
- selector payload
- helper lookup ที่ business rule ต้องยอมรับเฉพาะ active branch / warehouse

ยังไม่ควรใช้ตรง ๆ กับ:

- master-data list ที่ต้องเห็นทั้ง active และ inactive
- audit/report หน้าแอดมินที่จงใจต้องเห็นข้อมูลปิดใช้งาน

เพราะถ้าเอา active-only cache ไปเสียบ route เหล่านี้ จะเปลี่ยน business behavior ทันที

ดังนั้น route กลุ่ม master-data list ต้องมี reader contract แยกของมันเอง เช่น

- `listAllBranchesForMasterData()`
- `listAllWarehousesForMasterData()`

หรือยังคง Prisma direct read ไปก่อน จนกว่าจะทำ cache contract แบบ active+inactive แยกชัดเจน

## Browser Role

- browser ยังเรียก API ตามปกติ
- browser cache เป็น optional extra layer เท่านั้น
- ห้ามย้ายความรับผิดชอบหลักของ reference cache ไปไว้ใน browser state

## Failure Rule

- ถ้า Redis ใช้งานไม่ได้ ระบบยังต้องอ่านจาก DB ได้
- แต่ห้ามสร้าง fallback ทางธุรกิจที่ทำให้ข้อมูล master เพี้ยน
- fallback ที่ยอมรับได้มีเฉพาะ `cache miss / Redis unavailable -> read DB`
- ถ้า server cache miss หรือใช้ไม่ได้ ให้ข้ามไป Redis/DB โดยไม่เปลี่ยน business behavior

## Implementation Direction

ควรมี shared reference service กลาง เช่น

- `listActiveBranches()`
- `listActiveWarehouses()`
- `listActiveWarehousesByBranch(branchCode)`
- `findBranchByCodeOrId()`
- `findWarehouseByCodeOrId()`

และภายหลังจึงขยายไป

- `searchCustomers(query)`
- `searchSuppliers(query)`

ทุก route ต้องเรียกผ่าน service กลางนี้ ไม่ควรเรียก Redis หรือ Prisma แบบกระจายหลาย style

service กลางต้องเป็นผู้ตัดสินใจชั้น cache ทั้งหมด:

- check server cache
- check Redis
- read DB
- write Redis
- write server cache
- invalidate Redis keys ที่เกี่ยวข้องหลัง write DB สำเร็จ

## Expected Impact

สิ่งที่จะเร็วขึ้นชัดเจน:

- dropdown/options ของ `สาขา` และ `คลัง`
- modal/form ที่ต้องแนบ reference options
- API ที่แนบ options payload เดิมซ้ำบ่อย
- purchase bill options payload
- sales bill options payload

สิ่งที่ไม่ได้เร็วขึ้นโดยตรง:

- dashboard/query หนัก
- transaction list ที่ช้าจาก join/aggregation จำนวนมาก
- report ที่ bottleneck อยู่ที่ business query หลัก

## Accepted Tradeoff

- เพิ่ม infra และ invalidation complexity เพื่อแลกกับ shared cache กลางที่ route ทั้งระบบใช้ร่วมกันได้
- ยอมให้ request แรกหลัง invalidation อ่าน DB ใหม่และ repopulate cache
- ยอมให้บาง environment ยังทำงานแบบ DB-only ได้ถ้า Redis env ยังไม่ถูกตั้งค่า โดย business behavior ต้องไม่เปลี่ยน
- รอบแรกจะยังไม่ cache master-data list หลัก ถ้า route นั้นต้องเห็น inactive rows
- ยอมให้บาง route ยังอ่าน DB ตรงไปก่อน ถ้า contract ของ list นั้นต่างจาก active option cache

## Execution Plan

### Batch 1: `branches` + `warehouses`

- [x] เพิ่ม shared reference cache service กลางใน `apps/next/src/lib/server/`
- [x] เพิ่ม short-lived server cache สำหรับ reference payload
- [x] เพิ่ม Redis read/write/invalidate adapter สำหรับ key กลุ่ม reference
- [x] ทำ reader กลาง:
  - [x] `listActiveBranches()`
  - [x] `listActiveBranchesByCodes(codes)`
  - [x] `findActiveBranchReferenceByCodeOrId()`
  - [x] `listActiveWarehouses()`
  - [x] `listActiveWarehousesByBranch(branchCode)`
  - [x] `findActiveWarehouseReferenceByCodeOrId()`
- [ ] ย้าย route read ชุดแรกมาใช้ service กลาง:
  - [x] `/api/branches`
  - [x] `/api/daily/weight-tickets/options`
  - [x] `/api/sales/bills` options payload
  - [x] `/api/purchase/bills` options payload
  - [x] `/api/stock/transfer`
  - [x] `/api/purchase/po-buy`
  - [x] `/api/purchase/advance-payments`
  - [x] `/api/finance/ar`
  - [x] `/api/finance/ap`
  - [x] `/api/master-data/branches` GET reader แยก contract สำหรับ active+inactive
  - [x] `/api/master-data/warehouses` GET reader แยก contract สำหรับ active+inactive
  - [x] option loaders ที่ใช้ branch/warehouse ซ้ำบ่อยใน stock
- [x] เพิ่ม invalidate หลัง create/update/deactivate branch/warehouse สำเร็จ
- [x] เพิ่ม focused tests ของ cache key / fallback / invalidation

### Batch 2: lookup masters

- [~] ขยาย shared service ไปที่ `bank-names`, `currencies`, `expense-types`, `product-units`, `product-types`, `machine-types`
  - [x] เพิ่ม `listActiveBankNames()` และ `findActiveBankNameReferenceByName()`
  - [x] เพิ่ม invalidate หลัง save/patch `bankNames`
  - [x] ย้าย `master-data/accounts` bank validation มาใช้ cached bank names
  - [x] ย้าย `master-data/suppliers` create/import flow มาใช้ cached bank names
  - [ ] ย้าย consumer อื่นของ `bank_names` เพิ่มตาม contract ที่เหมาะสม
  - [x] เพิ่ม `listCurrencies()` และ `findCurrencyReferenceByCode()`
  - [x] เพิ่ม invalidate หลัง write `currencies`
  - [x] ย้าย `finance/foreign/*` option payload และ `sales/customer-advances` มาใช้ cached currencies
  - [x] ย้าย `master-data/currencies` list reader มาใช้ shared cache
  - [ ] ย้าย consumer อื่นของ `currencies` เพิ่มตาม contract ที่เหมาะสม
  - [x] เพิ่ม `listExpenseTypes()` และ `findActiveExpenseTypeReferenceByCode()`
  - [x] เพิ่ม invalidate หลัง write `expense-types`
  - [x] ย้าย `master-data/expense-types` list reader มาใช้ shared cache
  - [x] ย้าย `master-data/expense-categories` expense type validation มาใช้ shared cache
  - [ ] ย้าย consumer อื่นของ `expense-types` เพิ่มตาม contract ที่เหมาะสม
  - [x] เพิ่ม `listProductTypes()` และ `findActiveProductTypeReferenceByName()`
  - [x] เพิ่ม `listProductUnits()` และ `findActiveProductUnitReferenceByNameOrSymbol()`
  - [x] เพิ่ม invalidate หลัง write `product-types` / `product-units`
  - [x] ย้าย `master-data/product-types` และ `master-data/product-units` list reader มาใช้ shared cache
  - [x] ย้าย `master-data/products` create/update และ import validation มาใช้ cached product types / units
  - [ ] ย้าย consumer อื่นของ `product-types` / `product-units` เพิ่มตาม contract ที่เหมาะสม
  - [x] เพิ่ม `listMachineTypes()` และ `findActiveMachineTypeReferenceByName()`
  - [x] เพิ่ม invalidate หลัง write `machine-types`
  - [x] ย้าย `master-data/machine-types` list reader มาใช้ shared cache
  - [x] ย้าย validation ของ `master-data/machines` มาใช้ cached machine types
  - [ ] ย้าย consumer อื่นของ `machine-types` เพิ่มตาม contract ที่เหมาะสม
- [~] ขยาย shared service ไปที่ `payment-methods`
  - [x] เพิ่ม `listActivePaymentMethods()`
  - [x] เพิ่ม invalidate หลัง save/patch `paymentMethods`
  - [x] ย้าย `purchase/advance-payments` มาใช้ cached payment methods
  - [x] ย้าย `master-data/accounts` helpers มาใช้ cached payment methods
  - [x] ย้าย consumer `payment_methods` ที่เหลือให้ครบ รวม validation/update flow ของ `purchase/advance-payments/[id]` และ `master-data/accounts`
- [ ] ย้าย read routes/options payload ที่ใช้ master กลุ่มนี้มาใช้ service กลาง
- [~] เพิ่ม invalidate write path ของ master แต่ละตัว
  - [x] `payment-methods`
  - [x] `bank-names`
  - [x] `currencies`
  - [x] `expense-types`
  - [x] `product-units`
  - [x] `product-types`
  - [x] `machine-types`

### Batch 3: searchable masters

- [~] เพิ่ม search-result cache ของ `customers` และ `suppliers`
- [x] ย้าย `tracking/customer` และ `tracking/supplier` มาใช้ shared search cache ชุดแรก
- [ ] กำหนด normalized query key และ TTL สั้น
- [ ] ย้าย autocomplete/search routes ที่ใช้ซ้ำบ่อยมารูปแบบเดียวกัน
- [ ] เพิ่ม invalidate active/search keys หลัง write master

### Batch 4: large and scoped masters

- [ ] เพิ่ม `products`
- [ ] เพิ่ม `accounts`
- [ ] เพิ่ม remaining option masters ที่มี repeated read สูง
- [ ] ทบทวน branch-scoped account/product option keys ถ้าจำเป็น

## Batch 1 Exit Criteria

- [~] `branches` และ `warehouses` อ่านผ่าน shared service กลางเท่านั้นใน route ชุดแรกที่เลือก
- [x] `sales/bills` และ `purchase/bills` options payload อ่าน branch/warehouse ผ่าน shared service กลางแล้ว
- [x] `stock/transfer`, `purchase/po-buy`, `purchase/advance-payments`, `finance/ar`, `finance/ap` อ่าน branch/warehouse ผ่าน shared service กลางแล้ว
- [ ] cache miss / Redis unavailable ยังอ่าน DB ได้
- [ ] create/update/deactivate branch/warehouse ทำให้ key ที่เกี่ยวข้องถูก invalidate
- [ ] ไม่มี route ใหม่ที่แตะ Prisma branch/warehouse option query ตรง ๆ ใน scope ของ batch นี้
- [x] cache miss / Redis unavailable ยังอ่าน DB ได้
- [x] create/update/deactivate branch/warehouse ทำให้ key ที่เกี่ยวข้องถูก invalidate
- [x] lint / type-check / focused tests ผ่าน

- เพิ่ม dependency และ invalidation complexity เพื่อแลกกับ shared cache กลางที่ควบคุมได้
- ยอมรับ Redis เป็น infra ของระบบ ไม่ทำแค่ browser cache เพราะปัญหาอยู่ที่ repeated server/DB reads ทั้งระบบ
- ยอมรับ server cache เพิ่มอีกชั้นเพื่อประหยัด repeated reads ใน process เดียว แต่ไม่ให้มันกลายเป็นอีก source of truth หรืออีก invalidation system หนึ่ง

## Checkpoint: CACHE-P1 Product Reference Option/Search (2026-07-16)

### สิ่งที่ cache และสิ่งที่ไม่ cache

`ProductReferenceRecord` ใช้เฉพาะ selector/search ของสินค้า: `id`, `code`, `name`, `unit`, `type`, `metalGroup`, `active` เท่านั้น. จึงไม่เก็บราคา, ต้นทุนมาตรฐาน, WAC, stock, balance หรือ image URL เพราะข้อมูลเหล่านั้นมีความหมายและอายุข้อมูลต่างกันตามธุรกรรม.

thumbnail storage key ถูกอ่านเป็น metadata contract แยก (`ProductThumbnailReferenceRecord`) เพื่อให้ endpoint WTI/WTO คง response thumbnail URL เดิมได้ โดยไม่ทำให้ product option cache กลายเป็น image-delivery cache. Binary ยังอ่านผ่าน Storage/CDN ตามเดิม.

### Read/Write Flow

```text
WTI/WTO product endpoint
  -> product option cache (server -> Redis -> products)
  -> thumbnail metadata cache (server -> Redis -> products)
  -> compose existing thumbnail URL response

product create/update/status/import succeeds in DB
  -> invalidate product option key
  -> invalidate product search-prefix keys
  -> invalidate thumbnail metadata key
```

เหตุผล: selector ได้ประโยชน์จาก master data ที่เปลี่ยนไม่บ่อย แต่ transaction, price, cost และ stock ต้องยังอ่านจาก source ของธุรกรรมเพื่อไม่ให้ข้อมูลธุรกิจค้างหรือถูกตีความผิด.

### Consumer และการตรวจสอบ

consumer ชุดแรกคือ `GET /api/daily/weight-tickets/products` เท่านั้น. focused tests ครอบ server memoization, Redis hydration, active-only contract และ invalidation; ห้ามขยาย product cache ไปยังข้อมูลภาพจริงหรือ financial/stock facts จนกว่าจะเปิด batch ใหม่ตาม execution queue.

Validation รอบ checkpoint นี้ผ่านครบ: focused cache tests `33` cases, workspace typecheck, lint, และ production build ของ Next.js (`308` routes). Runtime telemetry ยังเป็น checkpoint หลัง deploy ไม่ใช่เงื่อนไขที่ build ทดแทนได้.

### P2 Code-Path Assessment

ตรวจ endpoint และ `getProductImageDisplay` แล้วพบว่า request ของ WTI/WTO ไม่อ่าน binary รูปจาก database, ไม่สร้าง signed URL และไม่ทำ Storage network request ต่อสินค้า. Route อ่านเฉพาะ `image_thumbnail_storage_key` จาก thumbnail metadata cache แล้วประกอบ public URL; หลัง response กลับ browser จึงเป็นผู้โหลด thumbnail จาก Supabase Storage/CDN. ดังนั้น cache ของ product option ลด DB read ได้แล้ว แต่ยังไม่มีหลักฐานว่า image delivery เป็น bottleneck. `CACHE-P2` ต้องรอ production runtime latency/transfer หรือ client performance evidence ก่อน ไม่เพิ่ม Redis/image proxy/metadata layer โดยคาดเดา.

## Checkpoint: CACHE-A1 Account Consumer Audit (2026-07-16)

ตรวจ consumer ของ `listActiveAccounts()` และ `listAllAccounts()` แล้วพบว่า route/service ที่เป็น option, label หรือ historical account mapping ใน scope ถูกย้ายผ่าน shared account cache แล้ว. Route ที่ยังอ่าน `prisma.accounts` ตรงอยู่ใน master account list/write resolution และการคำนวณ statement total ซึ่งต้องใช้ข้อมูลปัจจุบันหรือข้อมูลธุรกรรม จึงไม่ควรเปลี่ยนเป็น account master cache.

ผลคือไม่สร้าง cache contract ใหม่และไม่ย้าย financial fact เพิ่ม. การตัดสินใจนี้ป้องกันไม่ให้ balance, ledger, FX valuation หรือยอด statement ที่เปลี่ยนตาม transaction ถูกอ่านจาก cache master.

## Checkpoint: CACHE-M1 Instrumentation Foundation (2026-07-16)

reference cache จะ emit structured runtime log ใน production เพื่อให้ตรวจจาก Vercel ได้โดยไม่สร้าง Redis counter write ทุกครั้งที่อ่าน cache:

| Event | Fields | ความหมาย |
| --- | --- | --- |
| `reference_cache_read` | `tier`, `outcome`, `keyFamily` | `server`/`redis` hit หรือ database miss |
| `reference_cache_error` | `stage`, `keyFamily` | Redis read/write ไม่สำเร็จหรือ payload Redis อ่านไม่ได้ |

`keyFamily` ไม่เก็บ search query, branch code หรือ id; key ที่มี dynamic segment จะถูกแทนด้วย `*`. Production เปิด instrumentation โดย default และปิดชั่วคราวได้ด้วย `REFERENCE_CACHE_OBSERVABILITY_ENABLED=false`; local ต้อง opt-in ด้วยค่า `true`.

เหตุผลที่ไม่ใช้ Redis counter ต่อการอ่าน: การนับ hit/miss ด้วย Redis write ทุกครั้งจะเพิ่ม network call และต้นทุนเข้าใน hot path ที่ cache มีหน้าที่ลดอยู่แล้ว. ขั้นถัดไปต้องดู runtime logs จริงก่อนตัดสินใจเปลี่ยน TTL หรือเลิก key ที่ไม่มี consumer.
