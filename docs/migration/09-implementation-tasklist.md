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
- [x] นิยาม role ที่เห็น cost/profit/cash/financials ใน `app_roles`

## Phase 4: Master Data and Key Basic Data

### 4.1 Organization

- [ ] company profile
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
- [ ] payment methods - pending target table/schema decision
- [ ] VAT/WHT flags
- [ ] remittance purposes - pending target table/schema decision

### 4.4.1 Channel Master

- [x] purchase channels read-only Vue pilot
- [x] sales channels read-only Vue pilot
- [ ] transaction modes

### 4.5 Key Basic Data

- [ ] primary key strategy
- [ ] document numbering strategy
- [ ] branch scope rules
- [ ] warehouse scope rules
- [ ] account mapping rules
- [ ] opening balance structure
- [ ] business config ownership

### 4.6 Master Data Screens

- [x] สร้าง list view pattern เบื้องต้นจาก Branches pilot
- [x] สร้าง create/edit form pattern เบื้องต้นจาก Branches/Warehouses/Customers pilots
- [x] สร้าง active/inactive flow เบื้องต้นจาก Branches/Warehouses/Customers pilots
- [x] สร้าง export pattern สำหรับ Next customer master: server-side Excel-compatible export ตาม search/filter/sort ปัจจุบัน
- [x] กำหนด master-list pattern: search/filter/sort/count/pagination ทำใน frontend สำหรับ master data ขนาดเล็ก/กลาง
- [x] ขยาย customer-style master pattern ไปที่ supplier: form แยกบุคคล/นิติบุคคล, market scope, structured Thai address, frontend list pattern, syntax validation, active toggle, และ `.xlsx` export
- [x] Batch B: ยกระดับ `/master-data/products` เป็น specialized customer-style page พร้อม frontend search/filter/sort/count/pagination, row-click modal, validation, active toggle, permission guards, และ export ถ้าเหมาะสม
- [x] Batch C1: harden `/master-data/branches`, `/master-data/warehouses`, `/master-data/accounts` ให้เข้า master pattern เดียวกันตามความเหมาะสม
- [x] Batch C2: harden `/master-data/salespersons`, `/master-data/channels`, `/master-data/expense-categories`, `/master-data/currencies`
- [x] Batch C3: harden `/master-data/directors`, `/master-data/machines`, `/master-data/production-lines`, `/master-data/beneficiaries`, `/master-data/payment-methods`, `/master-data/remittance-purposes`
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
- [ ] migrate products
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
- [ ] define COGS/FIFO rule
- [ ] define receipt relation

### 6.3 Payment and Receipt Prep

- [ ] design supplier payment allocations
- [ ] design customer receipt allocations
- [ ] define WHT/VAT fields
- [ ] define bank statement relation

### 6.4 Inventory Prep

- [ ] decide source of truth for stock
- [ ] design inventory transaction header/lines
- [ ] map stock ledger movement types
- [ ] define lot/grade/status behavior

## Phase 7: Testing and Reconciliation

### 7.1 Automated Tests

- [ ] unit tests for validation schemas
- [x] project validation rule documented in `AGENTS.md`
- [x] project input-validation skill added at `.agents/skills/ns-scrap-erp-input-validation/SKILL.md`
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

1. ออกแบบ role/permission read model ถัดจาก admin-only login gate ปัจจุบัน
2. ทำ browser smoke test รอบใหม่: login, redirect เมื่อยังไม่ login, sidebar หลัง login, logout, customer CRUD/export
3. เพิ่ม automated smoke test สำหรับ master-data routes/API ทุกหน้า
4. เดิน master data CRUD hardening ต่อ: suppliers/products/branches/warehouses/accounts ให้มี validation/export pattern เทียบกับ customer
5. ตัดสินใจ small reference data strategy: code constants + DB seed/cache หรือ DB-driven config
6. ทำ hosting/runtime cost review แยกต่างหากภายหลัง; ยังไม่บันทึกเป็น decision ในรอบนี้
