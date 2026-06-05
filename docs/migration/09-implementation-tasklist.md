# 09 Implementation Task List

## Objective

แตกงานสำหรับปรับระบบเดิมให้ถูกหลักทั้ง code และ database โดยเริ่มจากโครงสร้าง, master data และ key basic data ก่อน แล้วค่อยขยับไป core transaction

## Working Principles

- ใช้ระบบเดิมเป็น baseline
- ไม่ rewrite ทุก module พร้อมกัน
- รักษา UI และ business flow เดิมเท่าที่ทำได้
- แยก code structure ก่อนย้าย logic หนัก
- master data และ key basic data ต้องนิ่งก่อน transaction
- ทุก phase ต้องมี validation และ reconciliation

## Phase 0: Baseline and Safety

### 0.1 Freeze Baseline

- [ ] ยืนยัน commit baseline ของระบบเดิม
- [ ] เก็บ database dump baseline
- [ ] บันทึก environment/config ของ `legacy-prod-source`
- [ ] ระบุ URL/domain/Supabase project ที่ใช้งานจริง
- [ ] ระบุ user roles ที่ใช้งานจริง

### 0.2 Local Development Readiness

- [x] ดึง DB dump ลง local
- [x] สร้าง Supabase dev/target project
- [x] เพิ่ม project-level `.mcp.json`
- [x] ย้าย Supabase MCP ออกจาก global config มาไว้ที่ project-level เป็น canonical config
- [x] เพิ่ม Supabase MCP เข้า Codex runtime/global config เป็นข้อยกเว้น เพราะ CLI ปัจจุบันไม่ auto-load `.mcp.json`
- [x] ทำ `.env.example` สำหรับ local development
- [x] กำหนด rule ว่าไฟล์ dump/data sensitive ห้าม push
- [x] login MCP project-level server `supabase` ผ่าน CLI OAuth แล้ว
- [x] ทำ README วิธีรันระบบใหม่/ดู legacy source และ Supabase dev/target
- [x] restart Codex session แล้ว verify MCP runtime เห็น `supabase`
- [ ] เติม dev anon key และ dev DB URL จริงใน `.env.local`
  - [x] เติม dev frontend publishable key ใน `.env.local`
  - [x] เติม dev pooler host/user ใน `.env.local`
  - [x] เติม dev database password จริงใน `.env.local` สำหรับ local shell; ห้าม commit ไฟล์นี้
  - [x] import legacy `public` baseline เข้า `dev-target`

### 0.3 Scope Agreement

- [ ] ยืนยันกับลูกค้าว่า Phase 1 ทำเฉพาะ foundation + master data
- [ ] ระบุ module ที่ freeze ไว้ก่อน
- [ ] ระบุ flow ที่ห้ามกระทบในช่วง refactor
- [ ] ยืนยันแผน environment ระยะถัดไป: `dev-target` -> `staging-uat` -> final production decision
- [ ] ตัดสินภายหลังว่าจะ deploy กลับ old env ลูกค้า หรือสร้าง `new-prod`

## Phase 1: Project Structure

### 1.1 Create Vue/Vite Shell

- [x] ตั้ง `Vue 3 + Vite + TypeScript`
- [x] เพิ่ม `Vue Router`
- [x] เพิ่ม `Pinia`
- [x] เพิ่ม `TanStack Query`
- [x] เพิ่ม `Tailwind CSS`
- [x] เพิ่ม `Zod`
- [x] เพิ่ม `VueUse`
- [ ] เพิ่ม `Dexie` ถ้ายังต้องรองรับ offline/local cache

### 1.2 Archive Legacy Source

- [x] ย้ายระบบเก่าไว้ที่ `old-apps/legacy/index.html` เป็น archived source
- [x] ย้าย helper เดิมไว้ที่ `old-apps/legacy/export-button.js`
- [x] ตัด route/link จาก Vue app ใหม่กลับไปหา legacy runtime
- [x] ใช้วิธี copy เฉพาะ function/module ที่จำเป็นมา refactor ใน `old-apps/vue/src/`
- [x] ลบ transition route แบบ `/legacy/...` และ fallback placeholder route ออกจาก Vue app ใหม่

### 1.3 Folder Structure

- [x] สร้าง `old-apps/vue/src/router`
- [x] สร้าง `old-apps/vue/src/views`
- [x] สร้าง `old-apps/vue/src/components`
- [x] สร้าง `old-apps/vue/src/stores`
- [x] สร้าง `old-apps/vue/src/composables`
- [x] สร้าง `old-apps/vue/src/services`
- [x] สร้าง `old-apps/vue/src/queries`
- [x] สร้าง `old-apps/vue/src/schemas`
- [x] สร้าง `old-apps/vue/src/lib`

### 1.4 App Foundation

- [x] สร้าง app shell
- [x] สร้าง layout หลัก
- [x] สร้าง navigation/menu model
- [x] สร้าง route guard placeholder
- [x] สร้าง loading/error boundary pattern

### 1.5 Current Vue Shell Status

- [x] ใช้ `old-apps/vue/index.html` เป็น Vue/Vite entry ใหม่ และเก็บระบบเก่าไว้ที่ `old-apps/legacy/`
- [x] เพิ่ม `package.json`, `package-lock.json`, `vite.config.ts`, `tsconfig.json`, `tailwind.config.ts`, `postcss.config.js`
- [x] เพิ่ม Supabase client boundary ที่ `old-apps/vue/src/services/supabase/client.ts`
- [x] เพิ่ม Auth placeholder store/service/login route โดยใช้ Supabase Auth เป็นเป้าหมาย
- [x] ไม่มี legacy bridge route; ระบบใหม่ไม่ route กลับไปไฟล์เก่า
- [x] ไม่มี `/legacy/...` runtime route ใน Vue app ใหม่
- [x] รัน `npm install`
- [x] รัน `npm run build` ผ่าน
- [x] รัน `npm test` ผ่านหลัง route cleanup
- [x] เติม dev Supabase anon/publishable key จริงใน `.env.local` ก่อนทดสอบ login จริง
- [x] เริ่ม Auth/Permission schema + RLS ใน `dev-target`

### 1.6 Frontend Clone Surface

- [x] clone sidebar/menu coverage จาก legacy inventory เข้า Vue routes
- [x] clone หน้าในหมวด admin, master data, purchase, sales, stock, daily, production, dual costing/trading/PO, finance, foreign finance, finance-accounting, reports/assets/loans และ tracking dashboards
- [x] ลบ visible technical copy เช่น `Vue migration`, `Vue Shell`, `clone`, `(placeholder)` และ `dev bypass` จากจุดที่ตรวจพบ
- [x] normalize sidebar icon/label ให้ไม่ซ้ำและเรียงตาม menu model ใหม่
- [x] ปรับ route names/internal navigation keys จาก `legacy.*` / `legacyView` เป็นชื่อ new app
- [ ] ทำ browser visual review ครบทุก route แบบ desktop/mobile
- [ ] ทำ auth-connected navigation smoke test หลัง login จริง

## Phase 2: Data Access Foundation

### 2.1 Supabase Client

- [x] ย้าย Supabase config ออกจาก hardcoded code ไป environment variables
- [x] สร้าง `old-apps/vue/src/services/supabase/client.ts`
- [x] สร้าง typed helper สำหรับ query/mutation
- [x] กำหนด error handling pattern เบื้องต้นใน service/query read layer

### 2.2 Query Layer

- [x] ตั้ง `TanStack Query` provider
- [x] กำหนด query key convention เบื้องต้นต่อ master data module
- [x] แยก reads ออกจาก writes ใน read-only pilots
- [x] กำหนด invalidation rule ต่อ module

### 2.3 Validation Layer

- [x] สร้าง Zod schemas สำหรับ master data read-only pilots
- [x] กำหนด form validation pattern
- [ ] กำหนด import validation pattern
- [ ] เพิ่ม minimum form validation ก่อนต่อ real mutation ของแต่ละหน้า
- [ ] เพิ่ม numeric/date coercion rule สำหรับฟอร์ม transaction และ finance
- [ ] เพิ่ม user-facing error state pattern ให้ใช้ซ้ำได้

## Phase 3: Security and Access Model

Tracker: [14-auth-permission-batch-plan.md](/Users/watcharathatsrithanesiganon/Documents/GitHub/ns-scrap-erp/docs/migration/14-auth-permission-batch-plan.md)

Reporting rule:
- update the tracker after every auth/permission batch
- record schema, API guard, route guard, reset-password, RLS, and validation changes
- never record real passwords, tokens, service keys, or credential values

### 3.1 Auth Model

- [x] ยืนยัน direction ว่าจะใช้ `auth.users` เป็น source of truth
- [x] ออกแบบ `app_users`
- [ ] map `public.users` เดิมไป `app_users`
- [x] ยกเลิกการใช้ password ใน `public.users`
- [x] ทำ forgot/reset password flow ด้วย Supabase Auth
- [x] ตัดสินใจ username login: ใช้ username lookup -> email ผ่าน `lookup_app_login_email`

### 3.2 Role and Permission Model

- [x] วิเคราะห์ `roles` และ `roles_config` เดิม
- [x] Audit เบื้องต้นจาก Vue clone: role/menu fixture มี Admin, Owner, บัญชี, บัญชีค่าใช้จ่าย, ประสานงาน, Poopae, คลัง
- [x] ออกแบบ `permissions`
- [x] ออกแบบ `role_permissions`
- [x] ออกแบบ `user_roles`
- [x] ออกแบบ `user_branch_access`
- [ ] migrate role matrix เดิม
- [x] map legacy menu keys ไป Next route paths เบื้องต้นสำหรับ Next permission guard
- [x] seed permission catalog จาก navigation/API/action model

### 3.3 Access Enforcement

- [x] สร้าง `useAuthStore`
- [x] สร้าง `usePermission`
- [x] สร้าง route guard
- [x] สร้าง component guard สำหรับ action buttons
- [x] Next `proxy.ts` มี admin-only guard ชั่วคราวผ่าน Supabase Auth + `user_profiles`
- [x] เปลี่ยนจาก admin-only guard เป็น normalized permission guard สำหรับ mapped paths พร้อม legacy admin/owner fallback ระหว่าง transition
- [x] เพิ่ม API permission guard สำหรับ view/create/update/export/status ของ user management และ key master APIs: customer/supplier/product
- [ ] เพิ่ม branch-scope enforcement สำหรับ role ที่จำกัดสาขา
  - [ ] ทำ server helper กลาง เช่น `getBranchScope(context)` จาก `app_user_branch_access` และ role admin/owner
  - [ ] นิยาม contract: `all` ใน UI หมายถึงทุกสาขาที่ user มีสิทธิ์ ไม่ใช่ทุกสาขาในระบบ
  - [ ] แก้ `/api/branches` ให้คืนเฉพาะ active branches ที่ user มีสิทธิ์; admin/owner เห็นทั้งหมด
  - [ ] บังคับ branch filter ใน API/query ที่มี `branch_id` หรือสาขาเอกสาร โดย intersect ระหว่าง requested branch กับ allowed branches
  - [ ] ถ้า list/filter ขอ branch ที่ไม่มีสิทธิ์ ให้คืน empty หรือ 403 ตาม contract ของหน้านั้น; ถ้า detail by id ข้ามสาขา ให้คืน 404/403 เพื่อกันเดาข้อมูล
  - [x] เริ่ม batch แรกที่ Purchase: `/api/purchase/bills`, `/api/purchase/payments`, `/api/purchase/payment-history`, `/api/purchase/po-buy`
  - [ ] ต่อด้วย Sales, Stock, Daily, Finance APIs ที่มีข้อมูลผูกสาขา
  - [ ] เพิ่ม browser/API smoke test สำหรับ user ที่มีสิทธิ์สาขาเดียวต้องไม่เห็นข้อมูลอีกสาขา
- [x] นิยาม role ที่เห็น cost/profit/cash/financials ใน `app_roles`

## Phase 4: Master Data and Key Basic Data

### 4.1 Organization

- [x] company profile
- [x] branches CRUD/form mutation pilot
- [x] warehouses CRUD/FK form mutation pilot
- [x] branch-warehouse relationship CRUD form เบื้องต้น
- [x] active/inactive behavior เบื้องต้นใน Branches/Warehouses pilots

### 4.2 Parties

- [x] customers CRUD/form mutation pilot
- [x] suppliers read-only Vue pilot
- [x] salespersons read-only Vue pilot
- [ ] customer/supplier code strategy
- [ ] duplicate detection

### 4.2A Identifier Mission Checkpoint

- [x] ยืนยัน mission ว่า `id` ต้องเป็น internal PK/FK only และ `code` / `doc_no` เป็น business identifier ที่ขอบ UI/API
- [x] ยืนยัน execution policy ว่า `B1/B2/B3` ต้องเดินแบบ schema-first ทีละ family และห้ามปิดงานด้วย fallback ไป internal id
- [x] ปิด boundary-first slice สำหรับ `B1 branches + warehouses`
- [x] ปิด boundary-first slice สำหรับ `B2 salespersons + customers`
- [x] ปิด boundary-first slice สำหรับ `B3 suppliers`
- [x] ปิด schema target แล้วใน Group A simple masters บางส่วน (`bank_names`, `payment_methods`, `product_units`, `product_types`) โดยใช้ internal `bigint id`
- [x] harden active master-data business-key constraints ใน DB/schema (`customers`, `salespersons`, `suppliers`, `products`, `accounts`, `currencies`, `purchase_channels`, `sales_channels`) ให้ `code` เป็น contract จริงระดับฐานข้อมูล และลบ legacy auth leftovers `public.users.password` + `user_profiles.branch_ids`
- [x] harden shared simple-master runtime so bigint-backed masters (`machine-types`, `machines`, `production-lines`, `vat-settings`, `wht-settings`) stringify outward ids and coerce back on save/status update, while code-backed masters (`account-subtypes`, `directors`, `expense-types`, `production-output-categories`) update by outward `code`
- [x] audit master-data UI configs so pages with existing business `code` expose it in form/list again (`currencies`, `channels`, `accounts`, `account-subtypes`)
- [ ] audit consumer ที่ยัง leak internal ids นอก active B1/B2/B3 slices
  - [x] ตัด runtime fallback แบบ `code ?? id` ออกจาก outward UI/API/filter surfaces ของ active business-facing master refs หลัก (`branches`, `warehouses`, `customers`, `suppliers`, `salespersons`) เพื่อให้ contract fail เร็วเมื่อ data ไม่มี `code`
  - [x] ตัด fallback ที่ยังเหลือซึ่งแปลง internal `id` / FK เป็น outward display/value เช่น `supplierName/customerName/partyName = ... ?? String(id)` หรือ `stringifyBusinessValue(id, ...)` ออกจาก active B1/B2/B3 display/detail/report surfaces; ถ้ายังไม่มี business data ให้ใช้ `-` / empty แทน
- [x] ห้ามเพิ่ม fallback ใหม่จาก business/display fields กลับไป internal ids ระหว่างปิด `B1/B2/B3`
- [x] บันทึก strategy reset เป็น `DB-first identifier cutover` แยกใน `docs/migration/21-db-first-identifier-cutover.md`
- [x] migrate `branches.id` / `warehouses.id` และ downstream FKs ไป internal `bigint`
  - direct-cutover audit on 2026-06-05 already proved this touches at least admin users / `app_user_branch_access`, `/api/branches`, daily expense, WTI/WTO, finance AP/AR, dashboard/report helpers, supplier import/export, and shared auth-context/filter logic in addition to purchase/stock/master-data
  - runtime/schema-prep follow-up on 2026-06-05 compiled and built cleanly before DB cutover, and Wave 1 DB apply was completed later the same day on `dev-target`
- [x] migrate `customers.id` / `salespersons.id` และ downstream FKs ไป internal `bigint`
- runtime/prisma fallout checkpoint on 2026-06-05 passed `type-check`, `lint`, and `build` before DB cutover, and Wave 1 DB apply was completed later the same day on `dev-target`
- [x] migrate `suppliers.id` และ downstream FKs ไป internal `bigint`
- runtime/prisma fallout checkpoint on 2026-06-05 passed `type-check`, `lint`, and `build` before DB cutover, and Wave 1 DB apply was completed later the same day on `dev-target`
- [x] execute Wave 1 DB cutover from `21-db-first-identifier-cutover.md`
  - [x] master PKs: `branches`, `warehouses`, `customers`, `salespersons`, `suppliers`
  - [x] branch refs: `accounts`, `app_user_branch_access`, `assets`, `expenses`, `payments`, `po_buys`, `po_sells`, `production_lines`, `production_machines`, `production_orders`, `purchase_bills`, `receipts`, `sales_bills`, `stock_adjustments`, `stock_issues`, `stock_ledger`, `supplier_advance_payments`, `suppliers`, `users`, `warehouses`, `weight_tickets`
  - [x] warehouse refs: `grade_adjustments`, `po_buys`, `po_sells`, `production_orders` warehouse columns, `purchase_bills`, `sales_bills`, `stock_adjustments`, `stock_issues`, `stock_ledger`
  - [x] customer refs: `po_sells`, `receipts`, `sales_bills`, `stock_issues`, `trading_deals`, `weight_tickets`
  - [x] supplier refs: `assets`, `payments`, `po_buys`, `purchase_bills`, `supplier_advance_payments`, `supplier_bank_accounts`, `trading_deals`, `weight_tickets`
  - [x] salesperson refs: `customers.sales_id`, `suppliers.sales_id`, `purchase_bills.sales_id`, `sales_bills.sales_id`
  - [x] apply cutover to `dev-target`
  - [x] rerun runtime validation after DB apply
- [x] remove temporary Wave 1 compatibility columns after cutover validation
  - [x] drop master `legacy_id` columns from `branches`, `warehouses`, `customers`, `salespersons`, `suppliers`
  - [x] drop all downstream `*_legacy_id` columns created during Wave 1
  - [x] rerun runtime validation after cleanup
- [ ] หลัง DB/schema ของแต่ละ family เสร็จ ต้อง rerun cleanup pass เพื่อให้ outward payload/display/export/filter ของ family นั้นไม่มี internal-id fallback เหลือก่อนประกาศจบ
- [ ] หลัง master batches A+B1+B2+B3 ถึง target shape แล้ว ค่อยเปิด transaction families เช่น `WTI/WTO`, `PO`, `PB`, `SB`, `PMT`, `PMA`
- [x] เริ่ม Batch C runtime cleanup ด้วย read/report document surfaces ที่มี `doc_no` พร้อมแล้ว
  - [x] `/api/purchase/receipt-vouchers` ใช้ `doc_no` outward และไม่ปล่อย bigint voucher/purchase bill ids
  - [x] `finance-accounting-cashflow-planning` ใช้ `doc_no` เป็น outward `id` สำหรับ AR/AP drill-down rows
  - [x] `ADV` list/detail/create outward ids ใช้ `doc_no` ผ่าน `advance-payments` helper/route
  - [x] `/api/purchase/payments` แถวเอกสาร PMT ใช้ `doc_no` เป็น outward `id`
  - [x] `/api/sales/stock-issue` แถวเอกสารใช้ `doc_no` เป็น outward `id`
  - [x] `/api/daily/expenses` และ `/api/daily/expenses/[id]` ใช้ `doc_no` เป็น outward `id` และ lookup เอกสารด้วย `doc_no` only
  - [x] `/api/daily/petty-advances` และ `/api/daily/petty-advances/returns` ใช้ `doc_no` เป็น outward `id` ของเอกสารหลัก และ lookup return target ด้วย `doc_no` only
  - [x] `/api/daily/transfers` ใช้ `doc_no` เป็น outward `id` และ lookup เอกสารด้วย `doc_no` only
  - [x] `/api/daily/payment-approval` ใช้ `doc_no` / `sourceDocNo` เป็น source key outward และ approval POST resolve target ด้วย `doc_no` only
  - [x] `petty_advance_returns` มี `doc_no` จริงใน DB/schema แล้ว และ active PRET flows ใช้ `doc_no` outward โดยไม่รับ bigint compatibility path
  - [x] `supplier_bank_accounts` มี `code` จริงใน DB/schema แล้ว และ `/api/daily/payment-approval` ใช้ `supplier_bank_accounts.code` เป็น destination id โดยไม่ synthesize fallback จาก `suppliers.bank_account` / `suppliers.bank_name`
  - [x] `accounts` ใน active daily/payment family ใช้ `accounts.code` outward แล้ว โดย `listDailyAccounts()` และ write routes ที่แตะอยู่ resolve กลับเป็น internal bigint เฉพาะ server-side
  - [x] `/api/sales/receipts` ใช้ `doc_no` เป็น outward `id` และ receipt edit รับ `doc_no` only
  - [x] `bank_statement` มี `doc_no` จริงใน DB/schema แล้ว และ finance read APIs หลักใช้ `bank_statement.doc_no` outward แทน internal bigint row ids
  - [x] report/tracking/ledger ที่แตะในรอบนี้ (`profit-cost-analysis`, `tracking/product`, `tracking/supplier`, `stock/ledger`, `admin/transaction-ledger`, `dual-costing-management`) เลิกใช้ internal ids เป็น outward bill/statement keys แล้ว
  - [x] `/api/finance/ap` และ `/api/finance/ar` ใช้ `doc_no` เป็น outward `id` ของ aging rows แล้ว และ AR channel filter ใช้ `sales_channels.code`
  - [x] `/api/daily/bill-swap-history` ไม่ใช้ internal bigint row id ออกข้างนอกแล้ว; row key ใช้ business composite จาก `billDocNo:itemIndex:swapDate`
- [x] execute Wave 2 DB cutover from `21-db-first-identifier-cutover.md`
  - [x] apply `20260605082953_db_first_identifier_wave2_remaining_text_ids.sql` to `dev-target`
  - [x] convert every remaining `public.id text` table to `id bigint`
  - [x] add missing business-key columns in the same pass for `accounts`, `currencies`, `impurities`, `purchase_channels`, `sales_channels`, and `overseas_remittance_purposes`
  - [x] add `loans.contract_no`
  - [x] add interim `trading_deals.deal_no`
  - [x] verify post-apply inventory: `public.id text = 0`
- [x] remove duplicated supplier-level bank truth from `suppliers`
  - [x] add `supplier_bank_accounts.bank_name_id -> bank_names.id`
  - [x] backfill existing supplier bank-account rows from `bank_names`
  - [x] refactor supplier master-data / import-export / payment flows to read primary bank data from `supplier_bank_accounts`
  - [x] drop `suppliers.bank_name`, `suppliers.bank_account`, `suppliers.bank_account_name`, and `supplier_bank_accounts.bank_name`
  - [x] apply migration to `dev-target` and rerun runtime validation
  - [x] rerun `prisma db pull` / `prisma generate` against `dev-target`
- [x] close Wave 2 runtime fallout after DB/schema sync
  - [x] update server/API code that still assumes converted ids are `string`
  - [x] rerun `npm run type-check --workspace @ns-scrap-erp/next`
  - [x] rerun `npm run lint --workspace @ns-scrap-erp/next`
  - [x] rerun `npm run build --workspace @ns-scrap-erp/next`
- [ ] execute UUID app-owned wave after Wave 2 fallout
  - [x] cut over repo-owned UUID PKs/FKs in `equity`, `bill_swap_history`, `app_permissions`, `app_roles`, `app_users`, and dependent app log/join tables
  - [x] keep `auth_users.id` as the external Supabase Auth identity key until a separate identity-layer replacement plan exists
  - [x] remove UUID assumptions from Prisma/runtime for the app-owned wave without adding internal-id fallback
  - [x] rerun `prisma db pull` / `prisma generate`
  - [x] rerun `type-check`, `lint`, and `build`
- [ ] if the project later insists on rewriting `auth.users.id`
  - [ ] open a separate migration stream for Supabase-managed auth internals
  - [ ] inventory GoTrue contract points, raw SQL casts, invite/admin/auth flows, and external Supabase Auth responses
  - [ ] treat it as identity-layer replacement, not ordinary PK bigint normalization
- [x] close report/tracking/runtime fallout for the app-owned UUID wave
  - [x] audit `admin/auth/app-user` surfaces and confirm UUID remains only on intentional auth-provider links
  - [x] remove outward internal-id leaks from `main-dashboards`, `main-sales-control`, `profit-cost-analysis`, `finance-accounting-working-capital`, `main-calendars`, and `/api/tracking/{customer,supplier,product}`
  - [x] rerun global `type-check`, `lint`, `build`, and `git diff --check`
- [x] close B4 runtime outward-contract cleanup for product refs in the active Next app scope
  - [x] purchase product refs: `/api/purchase/bills`, `/api/purchase/po-buy`, `purchase-bill-items`, `po-buy-reconciliation`
  - [x] sales product refs: `/api/sales/bills`, `/api/sales/po-sell`, `/api/sales/receipts`
  - [x] costing/report/trading product refs: `/api/dual-costing/cost-allocator`, `/api/dual-costing/cost-pool`, `/api/trading/dashboard`, `dual-costing-management`, `production-reports`, `cash-others-anomaly`, `/api/reports/aggregate`
  - [x] enforce `no internal-id fallback` for touched outward product fields and rerun `type-check`, `lint`, `build`, `git diff --check`
- [x] close B5 runtime outward-contract cleanup for account refs in the active Next app scope
  - [x] `listDailyAccounts()` and active daily/payment write paths use `accounts.code` outward and resolve `accounts.id bigint` only server-side
  - [x] finance/bank/foreign/cash-position selectors and filters use outward `accounts.code`
  - [x] `purchase/advance-payments` list/detail/update now use outward `fundingAccountId = accounts.code` consistently instead of leaking `funding_account_id bigint`
  - [x] touched account-facing APIs rerun `type-check`, `lint`, `build`, `git diff --check` cleanly after the last ADV cleanup

### 4.3 Product Domain

- [x] products read-only Vue pilot
- [ ] product grade
- [x] product status: RM / WIP / FG read model เบื้องต้น
- [x] unit of measure read model เบื้องต้น
- [x] metal group read model เบื้องต้น
- [ ] standard cost/price policy

### 4.4 Finance Master

- [x] accounts / cash-bank accounts read-only Vue pilot
- [x] currencies read-only Vue pilot
- [x] expense categories read-only Vue pilot

### 4.4.1 Channel Master

### 4.5 Purchase Transaction State, History, and Summary

- [x] เพิ่ม append-only status log สำหรับ PO Buy (`po_buy_status_logs`)
  - [x] ยกระดับ table เดิมให้เป็น structured event log (`event_key`, `action`, `from_status`, `to_status`, `po_buy_doc_no`) โดยไม่สร้าง table ใหม่
  - [x] ให้ create/edit/reconcile/short-close/cancel ของ `/api/purchase/po-buy` เขียนผ่าน event-log contract เดียวกัน
  - [x] ให้ PO Buy detail modal ใช้ `event_key` และ render action/transition จาก event log แทน raw bigint log id
  - [x] กำหนด columns ขั้นต่ำ `po_buy_id`, `from_status`, `to_status`, `action`, `reason`, `changed_by`, `changed_at`, `metadata`
  - [x] กำหนด action set ขั้นต่ำ เช่น `created`, `edited`, `cancelled`, `partially_received`, `received`, `reopened` (ถ้ามี)
  - [x] วางกติกา append-only ห้าม rewrite log เดิม
- [x] ออกแบบ pattern เดียวกันสำหรับบิลซื้อ (`purchase_bill_status_logs`) เพื่อใช้เป็น history/timeline ในหน้า detail
  - [x] เพิ่ม table `purchase_bill_status_logs` แบบ append-only พร้อม `event_key`, `action`, `from_status`, `to_status`, `purchase_bill_doc_no`
  - [x] backfill baseline created/payment/cancel events สำหรับ purchase bills เดิม
  - [x] ให้ create/edit/cancel ของ `/api/purchase/bills` เขียนผ่าน event-log contract เดียวกัน
  - [x] ให้ `/api/purchase/payments` และ `/api/purchase/payments/cancel` เขียน payment-recorded / payment-reversed events
  - [x] ให้ `/purchase/bills/[id]` ใช้ event log เป็น timeline หลัก และไม่ใช้ raw internal payment ids เป็น outward history keys
- [ ] ปิด Batch C follow-up สำหรับ support/history tables ที่ยังไม่มี outward business/event key
  - [x] `bill_swap_history`: เพิ่ม `event_key` จริงใน schema/route/UI แทนการประกอบ `billDocNo:itemIndex:swapDate` ใน API
  - [x] `supplier_advance_allocations`: เพิ่ม `allocation_key` จริงใน schema และใช้เป็น outward allocation/timeline key แทน purchase-bill doc no surrogate
  - [x] `purchase bill detail`: `/purchase/bills/[id]` route/page ใช้ `doc_no` only และเอา `purchase_bill_items.id` / `payments.id` / `weight_ticket_product_summary_id` ออกจาก outward detail keys
  - [x] Batch C6 purchase bridge/detail contract
    - [x] ยืนยัน `purchase_bill_items`, `purchase_bill_receipt_allocations`, `purchase_bill_po_allocations` ว่าเป็น internal-only rows และไม่เพิ่ม persisted outward key
    - [x] ปิด route/page/report helper ที่ยังปล่อย `po_buy_id bigint` ผ่าน line-item payload โดยให้ item refs ใช้ `po_buy.doc_no`, `purchase_bill.doc_no`, และ `line_no`/composite จาก parent แทน
    - [x] `/api/purchase/bills` รับ/resolve PO refs ด้วย `doc_no` only แล้วใช้ internal bigint ต่อเฉพาะหลัง map เสร็จ
  - [x] Batch C7 weight-ticket bridge/detail contract
    - [x] ยืนยัน `weight_ticket_lines`, `weight_ticket_product_summaries`, `weight_ticket_product_summary_lines` ว่าเป็น internal-only bridge/detail rows และใช้ `WTI/WTO doc_no` + `line_no` / `product code` / `summary composite` เป็น outward contract เดียว
    - [x] ปิด read surfaces ที่ยังพึ่ง internal summary/line ids ให้เหลือ `WTI/WTO doc_no` + `line_no` / `product code` / `summary composite` only
    - [x] ทบทวน stock-allocation / purchase-bill detail / weight-ticket detail / reports ให้ใช้ contract เดียวกัน
  - [x] Batch C8 finance/support history key contract
    - [x] ตัดสินใจ `fx_gain_loss` ว่าจะใช้ persisted event/business key หรือคง natural composite เป็นมาตรฐานเดียว
    - [x] audit `payment_approvals`, `bank_statement`, `fx_gain_loss`, customer/supplier advance support routes, และ admin transaction ledger ว่าขาออกใช้ `doc_no` / `ref_no` / `code` แล้ว
    - [x] audit `stock_ledger` และ consumer/report helpers ที่ยังใช้ synthesized row ids; ตัดสินใจเพิ่ม persisted `ledger_key` ใน schema และให้ `/api/stock/ledger` ใช้ key นี้เป็น outward row id
    - [x] ให้ `payment_approval` queue/history/payment routes ใช้ `payment_approvals.doc_no` เป็น outward `approvalId` อย่างเดียว
    - [x] ให้ `bank_statement` read surface ใช้ `ref_no/doc_no` outward และไม่ปล่อย `bank_statement.ref_id` ออก API
    - [x] ให้ `customer-advance`, `supplier-advance`, `fx-gain-loss-report`, `cash-others-anomaly`, และ `admin/transaction-ledger` เลิก fallback ไป name match / `ref_id` / internal `bank_statement.id`
    - [x] เก็บ route/report ที่เหลือให้ใช้ `doc_no` / `ref_no` / `event_key` / `code` outward only โดยปิด `stock_ledger` ด้วย `ledger_key`
  - [ ] Batch C9 support/admin internal-only declaration
    - [x] ระบุเป็นลายลักษณ์อักษรว่าตาราง support/admin ตัวใดคง internal-only ได้: `audit_logs`, `deletion_log`, `deletion_tombstones`, `company_profiles`, `roles`, `user_profiles`, `app_users`, `app_auth_events`, `app_user_roles`, `app_user_branch_access`
    - [x] แยกออกจากตารางที่ต้องมี business/event key จริง เพื่อไม่ให้ batch ถัดไปวน audit ซ้ำ
    - [x] อัปเดต tracker/doc ว่า `auth.*` และ identity-layer ไม่ใช่งานค้างของ Batch C business-flow cutover

- [x] purchase channels read-only Vue pilot
- [x] sales channels read-only Vue pilot

### 4.5 Key Basic Data

- [ ] primary key strategy
- [ ] document numbering strategy
- [ ] branch scope rules
- [ ] warehouse scope rules

### 4.6 Master Data Screens

- [x] สร้าง list view pattern เบื้องต้นจาก Branches pilot
- [x] สร้าง create/edit form pattern เบื้องต้นจาก Branches/Warehouses/Customers pilots
- [x] สร้าง active/inactive flow เบื้องต้นจาก Branches/Warehouses/Customers pilots
- [x] สร้าง export pattern สำหรับ Next customer master: server-side Excel-compatible export ตาม search/filter/sort ปัจจุบัน
- [x] กำหนด master-list pattern: search/filter/sort/count/pagination ทำใน frontend สำหรับ master data ขนาดเล็ก/กลาง
- [x] ขยาย customer-style master pattern ไปที่ supplier: form แยกบุคคล/นิติบุคคล, market scope, structured Thai address, frontend list pattern, syntax validation, active toggle, และ `.xlsx` export
- [x] สร้าง shared form-select pattern (`FormSelectField`) สำหรับ placeholder แบบ `เลือก...` ที่ซ่อนตัวเลือก placeholder หลังเลือกค่าแล้ว และนำไปใช้กับ customer/supplier form selects, generic `MasterDataPageClient` select generator, และ required helper-form selects
- [x] Batch B: ยกระดับ `/master-data/products` เป็น specialized customer-style page พร้อม frontend search/filter/sort/count/pagination, row-click modal, validation, active toggle, permission guards, และ export ถ้าเหมาะสม
- [x] Batch C1: harden `/master-data/branches`, `/master-data/warehouses`, `/master-data/accounts` ให้เข้า master pattern เดียวกันตามความเหมาะสม
- [x] Batch C2: harden `/master-data/salespersons`, `/master-data/channels`, `/master-data/expense-categories`, `/master-data/currencies`
- [x] Batch C3: harden `/master-data/directors`, `/master-data/machines`, `/master-data/production-lines`, `/master-data/beneficiaries`, `/master-data/payment-methods`, `/master-data/remittance-purposes`
- [x] Recover local-app DB drift for `/purchase/bills`, `/purchase/advance-payments`, and `/daily/bill-swap-history` by applying the already-authored `bill_swap_history.event_key` and `supplier_advance_allocations.allocation_key` migrations to the database referenced by `apps/next/.env.local`
- [ ] สร้าง import pattern
- [ ] สร้าง audit metadata display

### 4.7 Next Master Data Port

Tracker: [13-next-master-data-progress.md](/Users/watcharathatsrithanesiganon/Documents/GitHub/ns-scrap-erp/docs/migration/13-next-master-data-progress.md)

Reporting rule:
- update the tracker after every master-data batch
- update the tracker after any shared schema/API contract change
- record validation result before moving to the next batch

- [x] ตั้ง Next app baseline ใน `apps/next`
- [x] ตั้ง Prisma data path สำหรับ Next API routes
- [x] ทำ `/master-data/customers` เป็น baseline page แรก
- [x] ต่อ `/api/master-data/customers` กับ Prisma/dev-target
- [x] ต่อ `/api/master-data/thai-address` กับ Thai address reference tables
- [x] Batch 1: `salespersons`, `currencies`, `expense-categories`, `channels`
- [x] Batch 2: `branches`, `warehouses`, `accounts`
- [x] Batch 3: `suppliers`, `products`
- [x] Batch 4: `directors`, `machines`, `production-lines`, `beneficiaries`, `payment-methods`, `remittance-purposes`
- [x] บันทึก legacy usage ของ Batch 4 fixture-backed masters: `machines` และ `production-lines` ถูก production flow ใช้จริง, `directors` ยังเจอเฉพาะ master/import/sync
- [x] เพิ่ม additive migration สำหรับ master ที่ไม่มี DB จริง: `directors`, `machines`, `production_lines`, `payment_methods`, `remittance_purposes`
- [x] เพิ่ม rename migration ให้ table name ชัดขึ้น: `director_employees`, `production_machines`, `production_lines`, `payment_methods`, `overseas_remittance_purposes`
- [x] เปลี่ยน Next API ของ master 5 ตัวจาก fixture ไป Prisma target tables
- [x] เพิ่ม customer classification fields: `type` จำกัดเป็น `บุคคล`/`นิติบุคคล` และเพิ่ม `market_scope` สำหรับ `ในประเทศ`/`ต่างประเทศ`
- [x] เพิ่ม structured person-name fields สำหรับลูกค้าแบบบุคคลและผู้ติดต่อ
- [x] เพิ่ม customer form/API syntax validation และ required-field validation ตาม project validation rule
- [x] ปรับ customer address form เป็น postcode-first และ auto/filter จังหวัด/อำเภอ/ตำบล
- [x] เพิ่ม customer frontend pagination/search/filter/sort/count UX และย้าย pagination ไปอยู่แถบเดียวกับจำนวนทั้งหมด
- [x] เพิ่ม customer export API `/api/master-data/customers/export`
- [x] เพิ่ม supplier classification fields และ supplier export API `/api/master-data/suppliers/export`
- [x] เพิ่มผู้ดูแลฝ่ายขายให้ supplier ด้วย `sales_id`/`sales_rep`, dropdown ในฟอร์ม, filter ผู้ดูแล, column/sort และ export ตาม filter
- [x] แยก field ธนาคาร/เลขบัญชีในกลุ่มข้อมูลหลักที่ยังเป็นบัญชีธนาคารก้อนเดียว: directors และ payment methods ใช้ `bank_name` + `account_no` แบบ additive migration; suppliers/accounts/beneficiaries ใช้ field แยกอยู่แล้ว
- [x] ปรับสินค้าให้ไม่ใช้ข้อมูล `metal_group`, `item_status`, `grade`, `std_price`, `std_cost` ใน Next flow แล้ว: เอาออกจาก form/table/filter/API write/export โดยยังไม่ drop column เพื่อไม่ให้ข้อมูลเก่าหาย
- [x] เพิ่ม master ย่อยใต้สินค้า: `/master-data/product-types` และ `/master-data/product-units`; หน้า Products ใช้ dropdown จาก DB สำหรับประเภทสินค้าและหน่วยสินค้า โดย seed หน่วย `กิโลกรัม (กก.)`, `ลัง` และประเภท `อิเล็กทรอนิกส์`
- [x] เพิ่ม master ย่อยใต้บัญชีเงิน: `/master-data/bank-names`; หน้า Accounts ใช้ dropdown ชื่อธนาคารจาก DB และ API validate ว่าชื่อธนาคารต้อง active
- [x] เปลี่ยน active/inactive form control เป็น toggle ใน customer, supplier, และ shared master-data forms
- [x] reset branch กลับ checkpoint `d6e8b29` หลังทดลอง sidebar/shadcn design; Tailwind v4/shadcn sidebar ไม่อยู่ใน baseline ปัจจุบัน
- [x] ทำ product page ให้เป็น specialized page แบบ customer/supplier
- [ ] ทำ Batch C remaining master hardening ตามแผนใน `13-next-master-data-progress.md`
- [ ] เพิ่ม automated smoke test สำหรับ master-data routes/API ทุกหน้า
- [x] รัน build/type-check/lint หลังจบแต่ละ batch

## Phase 5: Database Refactor Plan

### 5.1 Target Schema V1

- [x] ออกแบบ schema สำหรับ security/auth permission baseline: `app_users`, `app_roles`, `app_permissions`, join tables, helper functions, audit events
- [ ] ออกแบบ schema สำหรับ master data
- [x] ออกแบบ target tables สำหรับ fixture-backed master ที่ต้องใช้ก่อน UAT: `machines`, `production_lines`
- [x] ออกแบบ target tables สำหรับ fixture-backed finance/setup masters: `directors`, `payment_methods`, `remittance_purposes`
- [x] ปรับชื่อ target tables ให้ชัดขึ้นโดยไม่ลบข้อมูล: `director_employees`, `production_machines`, `overseas_remittance_purposes`
- [x] เพิ่ม customer classification/person/contact fields แบบ additive โดยไม่ลบข้อมูลเดิม
- [x] ปรับ supplier target schema ให้ไม่มีข้อมูลผู้ติดต่อแล้ว: backup ค่าเดิมไว้ที่ `maintenance.supplier_contact_backup_20260518` ก่อน drop `contact`, `contact_title`, `contact_first_name`, `contact_last_name` จาก `public.suppliers`
- [x] ปรับ master setup ที่เกี่ยวกับการเงิน: `bank_names` ไม่ใช้ code แยกแล้วและเก็บเฉพาะ `id/name/symbol/active`; `currencies` ยังใช้ code แบบ running number พร้อม field `symbol`; `payment_methods` ไม่ใช้ข้อมูลธนาคาร/เลขบัญชีใน UI/API แล้ว
- [ ] ตัดสินใจ target table/flow owner สำหรับ `directors` ว่าผูกกับ director loan / advance flows หรือคงเป็น setup-only ชั่วคราว
- [ ] ออกแบบ schema สำหรับ document counters
- [ ] ออกแบบ schema สำหรับ opening balance
- [ ] ออกแบบ schema สำหรับ audit trail

### 5.2 Migration Scripts

- [ ] create target tables
- [ ] migrate branches
- [ ] migrate warehouses
- [ ] migrate customers
- [ ] migrate suppliers
- [x] migrate products
- [ ] migrate accounts/channels/currencies/categories
- [ ] migrate users/roles/permissions

### 5.3 Validation Queries

- [ ] row count comparison
- [ ] duplicate key check
- [ ] required field completeness
- [ ] orphan FK check
- [ ] active/inactive consistency

## Phase 6: Core Transaction Prep

เริ่ม phase นี้หลัง master data และ key basic data ผ่าน validation แล้วเท่านั้น

### 6.1 Purchase Prep

- [ ] map `purchase_bills.items jsonb`
- [ ] design `purchase_bill_lines`
- [ ] define stock movement trigger/rule
- [ ] define payment relation

### 6.2 Sales Prep

- [ ] map `sales_bills.items jsonb`
- [ ] design `sales_bill_lines`
- [ ] Design Trading sales bill flow: choose multiple purchase bills first, auto-fill sale lines, allow manual stock lines, and allocate each line to PO Sell
- [ ] Define sales bill allocation tables/rules for `sales bill -> purchase bill`, `sales bill -> stock`, and `sales bill -> PO Sell`
- [ ] define COGS/FIFO rule
- [ ] define receipt relation

### 6.3 Payment and Receipt Prep

- [ ] Next daily transaction tracker: [15-next-daily-transactions-progress.md](/Users/watcharathatsrithanesiganon/Documents/GitHub/ns-scrap-erp/docs/migration/15-next-daily-transactions-progress.md)
- [x] Batch A: `/daily/transfer`, `/daily/expense`, `/daily/petty-advance`, `/daily/expense-dashboard`
- [x] Batch B: `/daily/payment-approval`, `/purchase/payments`, `/purchase/receipt-vouchers`, `/sales/receipts`
- [x] Batch C: `/stock/transfer`, `/daily/bill-swap-history`
- [x] Batch D/E read baseline: `/purchase/bills`, `/sales/bills`, `/sales/stock-issue`
- [ ] design supplier payment allocations
- [ ] design customer receipt allocations
- [ ] define bank statement relation

### 6.4 Inventory Prep

- [ ] design inventory transaction header/lines
- [ ] map stock ledger movement types
- [ ] define lot/grade/status behavior

### 6.5 Production Prep

Tracker: [16-next-production-progress.md](/Users/watcharathatsrithanesiganon/Documents/GitHub/ns-scrap-erp/docs/migration/16-next-production-progress.md)

- [x] ตรวจ legacy flow ของ production orders, inputs, outputs, reports, cost, yield/loss, และ machine utilization เบื้องต้น
- [x] ระบุว่า `หมวดหมู่การผลิต` ใน legacy เป็น enum-like field บน production output ไม่ใช่ DB table เดิม
- [x] ระบุ legacy output category codes: `FG`, `RM`, `CUSTOMER_RETURN`, `LOSS`
- [x] Batch P1: เพิ่ม target DB/API สำหรับ `production_output_categories` แบบ additive และ seed จาก legacy
- [x] Batch P2: port `/production/orders` read baseline พร้อม API และ server-side pagination/filter/sort
- [ ] Batch P3: port production output write flow ให้ใช้ category จาก DB และเขียน `production_outputs`/`stock_ledger`
- [x] Batch P4: port production dashboard/report/cost/yield/machine utilization read baseline

## Phase 7: Testing and Reconciliation

### 7.1 Automated Tests

- [ ] unit tests for validation schemas
- [x] project validation rule documented in `AGENTS.md`
- [x] project input-validation skill added at `.agents/skills/ns-scrap-erp-input-validation/SKILL.md`
- [ ] tests for production output category API and invalid category validation
- [ ] unit tests for permission logic
- [ ] tests for master data service functions
- [ ] E2E smoke test for login
- [ ] E2E smoke test for master data CRUD

### 7.2 Data Reconciliation

- [ ] master data counts
- [ ] user/role counts
- [ ] product/warehouse mapping
- [ ] account balances baseline
- [ ] opening balance baseline

### 7.3 Business Sign-off

- [ ] sign-off master data
- [ ] sign-off role matrix
- [ ] sign-off key basic data
- [ ] sign-off transaction plan before implementation

## Phase 8: Deployment Readiness

- [x] configure current Vercel deployment path for `apps/next`
- [x] configure current Vercel environment variables for `DATABASE_URL`, `NEXT_PUBLIC_SUPABASE_URL`, and `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- [ ] choose final/interim production hosting target after cost/runtime review
- [ ] configure Supabase redirect URLs
- [ ] configure preview deployment
- [ ] create `staging-uat` Supabase project when ready for user testing
- [ ] deploy tested schema from `dev-target` to `staging-uat`
- [ ] seed sanitized or approved snapshot data into `staging-uat`
- [ ] run UAT against `staging-uat`
- [ ] decide final production target: old customer environment or new production project
- [ ] create rollback plan
- [ ] document runbook

## Immediate Next Tasks

Tracker หลักสำหรับงานที่เหลือทั้งหมด: [17-next-remaining-modules-progress.md](/Users/watcharathatsrithanesiganon/Documents/GitHub/ns-scrap-erp/docs/migration/17-next-remaining-modules-progress.md)

1. เริ่ม `Batch PRE: System Map and API Contract Baseline` ก่อน Batch S
2. สร้าง system sitemap และ OpenAPI skeleton เพื่อคุม route/API contract
3. เริ่ม `Batch S: Stock` ตาม task ย่อยใน tracker ใหม่
4. ใช้ legacy explorer ก่อนเริ่มแต่ละ page เพื่อเช็ก field/button/modal/action จากระบบเก่า
5. ใช้ QA checker หลังจบแต่ละ batch ย่อยเพื่อเช็กปุ่ม/modal/filter/export/page/API
6. อัปเดต tracker, sitemap, และ OpenAPI หลังจบ batch ย่อยทุกครั้ง
7. รัน type-check/lint/build แล้ว commit/push ทุก checkpoint
8. งานเก่าค้างยังต้องตามใน tracker: production write flow, purchase void/PO reconciliation, sales write/FIFO, stock transfer void/cost, payment approval persistence, branch-scope permission, automated smoke tests

## 2026-06-05 Identifier Contract Checkpoint

- [x] `/api/sales/bills` returns and creates sales bills with outward `id = doc_no`
- [x] `/api/sales/po-sell` returns and creates PO-sell documents with outward `id = doc_no`
- [x] `/api/daily/payment-approval` removes `approval.doc_no ?? approval.id` fallback; approved rows require real approval `doc_no`
- [x] `/api/purchase/payments` removes approval document fallback in payable rows; PMA rows require real approval `doc_no`
- [x] `/api/purchase/payment-history` uses approval `doc_no` as outward row id for voided approval rows
- [x] `/api/purchase/advance-payments/[id]` resolves detail/update/cancel by `doc_no` only
- [x] `/api/daily/weight-tickets/[id]` resolves detail/update/cancel by `doc_no` only
- [x] `/api/finance/foreign/overseas-receipt` uses sales-bill `doc_no` as outward selector id
- [x] `main-sales-control` open PO detail rows use `doc_no` instead of bigint-based synthetic ids
- [x] `working-capital` negative-margin rows use `${doc_no}-{line}` instead of `${bill.id}-{line}`
- [x] `weight-tickets` detail payload uses `doc_no`/`line_no`-based ids instead of bigint ids
- [x] `advance-payments` allocation timeline uses purchase-bill `doc_no`-based event ids
- [x] `dual-costing-management` ledger rows use `deal_no` instead of bigint `trading_deals.id`
- [x] add `overseas_recipients.code` to the target DB/schema and backfill existing beneficiaries
- [x] restore `overseas_remittance_purposes.code` as an outward business key in master/API
- [x] `/api/master-data/beneficiaries` and `/api/master-data/remittance-purposes` now use outward `id = code`
- [x] `/api/finance/foreign/intl-transfer` now uses `account.code`, `beneficiary.code`, and `purpose.code` in selector payloads
- [x] `/api/finance/foreign/fcd-ledger`, `/api/finance/foreign/bank-reconciliation`, `/api/finance/foreign/overseas-receipt`, `/api/finance/bank`, and `/api/finance/cash-position` now use outward `accounts.code` for account selectors/filter ids
- [x] `/api/finance/foreign/fx-rate` now uses the natural FX business key (`FX-YYYYMMDD-FROM-TO-RATE-TYPE`) instead of outward bigint ids
- [x] `/api/sales/bills` and `/api/sales/po-sell` now use outward `sales_channels.code` instead of internal channel ids
- [x] `/api/trading/dashboard`, `/api/trading/matching`, `/api/dual-costing/deal-margin`, and `/api/dual-costing/match-log` now return `deal_no` / `doc_no` as outward ids instead of bigint ids
- [x] `/api/stock/convert` and `/api/stock/transfer` no longer derive outward read keys from internal ledger ids
- [x] `/api/admin/transaction-ledger` no longer falls back from `accountName` to `account_id`
- [x] `advance-payments` and `weight-tickets` history/timeline events now use outward `event_key` instead of internal audit-log row ids
- [x] purchase-bill weight-ticket selectors now use `doc_no` and doc-based composites instead of internal ticket/line/summary ids
- [x] `/api/finance/foreign/fx-gain-loss-report` now uses a natural outward composite id and no longer exposes raw internal `ref_id`
- [x] `/api/admin/auth-events` now uses event-based composite ids instead of internal audit/activity row ids
- [x] inventoryed remaining models without `code/doc_no` from `schema.prisma`: `59` total (`public 37`, `auth 22`)
- [ ] decide next schema wave for `public` models still lacking explicit business keys, especially support/admin and document-detail tables
