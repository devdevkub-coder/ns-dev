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

## Active Batch: Customer/Supplier Branch Eligibility

เป้าหมาย: ทำให้ระบบรู้ชัดว่า Customer/Supplier รายใดใช้งานได้กับสาขาใด เพื่อให้หน้า master data, transaction selector, API validation, report และ audit ใช้ source เดียวกันโดยไม่ fallback เป็นทุกสาขา

### Contract

- Customer branch source of truth คือ `customer_branches`
- Supplier branch source of truth คือ `supplier_branches`
- mapping ต้องรองรับหลายสาขาต่อคู่ค้า, active/inactive, primary branch, created/updated timestamp และ audit actor เท่าที่ schema ปัจจุบันรองรับ
- transaction API ต้อง reject ถ้า Customer/Supplier ไม่ active หรือไม่มี active mapping กับ branch ของเอกสาร
- UI selector ต้องกรองตามสาขาที่เลือก และ clear คู่ค้าเดิมเมื่อเปลี่ยนสาขาแล้ว mapping ไม่ตรง
- ห้าม hard-code branch id/name และห้าม runtime fallback ให้ unmapped party เห็นทุกสาขา

### Task Breakdown

- [x] Update target requirements and page-flow docs for Customer/Supplier branch eligibility
- [x] Update this implementation tasklist before coding
- [x] Add DB migration for `customer_branches` and `supplier_branches` with FK, active unique constraints, primary-branch constraints, and lookup indexes
- [x] Update Prisma schema and generate client
- [x] Add data audit/backfill script/report for existing Customer/Supplier rows; ambiguous/unmapped rows must be fixed as data, not hidden by runtime fallback
- [x] Expose Customer/Supplier branch mapping fields through domain schemas and master data read/write APIs
- [x] Update Customer master UI/import/export/detail/table to manage allowed branches and primary branch
- [x] Update Supplier master UI/import/export/detail/table to manage allowed branches and primary branch
- [x] Update Purchase selectors/API validation: WTI supplier, PO Buy, Purchase Bill, Supplier Advance, Purchase Bill supplier swap, and AP filters that select Supplier with branch
- [x] Update Sales selectors/API validation: WTO customer, PO Sell, Sales Bill, and AR filters that select Customer with branch
- [x] Add focused service checks for branch mapping audit and unmapped reject behavior
  - Audit command: `npm run audit:party-branch-mappings --workspace @ns-scrap-erp/next`
  - Current dev-target data has no mapped active Customer/Supplier rows, so mapped-accepted checks are `null` until master mappings are populated.
  - Unmapped Customer/Supplier reject checks pass; strict runtime intentionally blocks new branch-bound writes for unmapped parties.
- [x] Run validation proportional to touched code and update checkpoint docs after each batch
  - Latest completed check: `npm run type-check --workspace @ns-scrap-erp/next -- --pretty false`
  - Remaining closeout checks for this batch: lint, build, `git diff --check`

### Runtime Coverage Notes

- Write-time strict validation is active for WTI/WTO, PO Buy, Purchase Bill, Supplier Advance, PO Sell, and Sales Bill.
- UI selectors clear an already selected party when the document branch changes and the party is not mapped to that branch.
- AP/AR are read/report surfaces, not write surfaces; their Customer/Supplier filters now carry `branchIds` from mapping tables and filter by selected branch.
- Customer Advance, Supplier Advance finance reports, Sales Receipt, Purchase Payment, and Receipt Voucher surfaces derive party from existing statements/source documents or do not own a branch + party write contract in the current runtime slice. Enforcement remains at the upstream branch-bound document writes.
- Daily Expense currently has no visible branch selector in the form even though the API schema keeps optional `branchId`; no new branch-party behavior was added there to avoid changing the expense flow outside this batch.
- Initial operational data task completed on dev-target: `51` active Customers and `1871` active Suppliers were assigned to branch `01` / `สมุทรสาคร` as active primary mappings. Users can correct branch ownership later in Customer/Supplier master data.

## Active Follow-up: Supplier ADV Type And VAT-Aware PB Allocation

เป้าหมาย: แยก `จ่ายเงินล่วงหน้า / ADV` เป็น 2 business cases และทำให้การหัก ADV ในบิลซื้อถูกต้องเมื่อ ADV มี VAT

### Contract

- หน้า `/purchase/advance-payments` ต้องมี dropdown `ประเภท ADV` ก่อนกรอกข้อมูล
- `มัดจำส่งของรอคัดแยก` ใช้ form ปัจจุบัน ไม่มี invoice เป็น default แต่ยังต้องเลือก VAT ได้ โดย default เป็น `ไม่มี VAT`
- `มัดจำล่วงหน้ายังไม่ส่งของ` ใช้ form สั้น: สาขา, ผู้ขาย, เลข invoice required, ยอดมัดจำ, VAT dropdown, หมายเหตุ
- VAT dropdown phase แรกมีอย่างน้อย `ไม่มี VAT` และ `มี VAT`; ถ้าขยายเป็น `VAT รวมใน` / `VAT แยกนอก` ต้องตกลงสูตรก่อน runtime change
- ADV ไม่มี VAT สามารถหักจาก `PB.total_amount` แบบยอดรวมได้
- ADV มี VAT ห้ามหักยอดรวมจาก `PB.total_amount` ตรง ๆ; ต้องหักยอดก่อน VAT กับฐานก่อน VAT ของ PB และหัก VAT กับ VAT ของ PB แยกกัน
- allocation fact สำหรับ ADV มี VAT ต้องเก็บ breakdown: `allocated_subtotal_amount`, `allocated_vat_amount`, `allocated_total_amount`
- Tax/VAT report, AP drilldown, detail, print, export ต้องอ่าน breakdown จาก source/allocation snapshot เพื่อไม่ให้ VAT ซ้ำหรือคลาด

### Task Breakdown

- [x] Update Supplier Advance canonical flow with ADV type dropdown, invoice-advance special case, and VAT-aware allocation rule
- [x] Update `/purchase/advance-payments` page-flow with target data contract and validation
- [x] Update `/purchase/bills` page-flow with VAT-aware ADV allocation contract
- [x] Decide VAT input meaning for `มี VAT`: amount input is the pre-VAT base amount; system calculates VAT and total ADV amount from that base, and PMA/PMT/remaining use the total amount
- [x] Add DB migration and Prisma fields for ADV type, invoice no, VAT type/rate, subtotal amount, VAT amount, and allocation breakdown
- [x] Update ADV form schema/API validation for type-specific fields
- [x] Update Advance Payments UI to switch between current waiting-sort form and invoice-advance form
- [x] Update waiting-sort ADV form to show VAT dropdown and retain selected VAT instead of forcing `ไม่มี VAT`
- [x] Update ADV list/detail/print/export/timeline to show type, invoice no, VAT, and tax breakdown
- [x] Update PB ADV option/read model to expose VAT breakdown and block invalid VAT pairing
- [x] Update PB allocation and settlement logic so no-VAT ADV uses total-amount deduction and VAT ADV uses base/VAT deduction
- [x] Apply migration to dev-target and regenerate Prisma client
- [x] Update AP, Tax VAT/WHT, PB print/detail, and payment approval handoff to read VAT-aware PB/ADV settlement
  - AP drilldown, PB detail/direct detail/print, and payment approval now expose ADV type, invoice no, VAT mode, and allocated base/VAT/total where available.
  - Tax VAT/WHT intentionally continues to read purchase VAT from `purchase_bills` as the filing/report source; supplier ADV VAT is an allocation support snapshot and must not be counted as a second independent input-VAT document until a normalized tax ledger/filing flow is designed.
- [ ] Add focused tests/service checks for no-VAT ADV, VAT ADV, partial allocation, PB cancel/edit release, and tax report non-duplication

## Active Follow-up: Customer Advance CADV Sales Bill Allocation

เป้าหมาย: ให้ Customer Advance (`CADV`) ฝั่งขายใช้หลักคำนวณเดียวกับ Supplier Advance ฝั่งซื้อ โดยหักฐานก่อน VAT ออกจาก Sales Bill แล้วคำนวณ VAT ใหม่จากฐานที่เหลือ

- [x] Add CADV helper for gross receipt -> pre-VAT base capacity, allocation base/VAT/total split, and post-advance Sales Bill totals
- [x] Add DB migration/Prisma fields for `sales_bill_customer_advance_allocations` breakdown: `allocated_subtotal_amount`, `allocated_vat_amount`, `allocated_total_amount`
- [x] Update `/api/sales/bills` create/edit/cancel to select CADV from `customer_advances`, write allocation breakdown, and refresh CADV `allocated_amount`/`available_amount`/status
- [x] Update AR drilldown, Sales Bill detail, and print read models to display CADV allocated total from allocation facts
- [x] Add focused CADV calculation tests for receipt base capacity, allocation split, VAT recalculation, and cap-at-bill-base behavior
- [x] Apply the CADV allocation-breakdown migration to dev-target `fhglqymcdmrgbsbadnwr` and record migration version `20260716082726`
- [ ] Apply the CADV allocation-breakdown migration to any SIT/UAT/production runtime database before deploying this code there
- [ ] Implement `/sales/receipts` -> CADV receipt allocation so RCP populates CADV `received_amount` and `available_amount` from real cash receipts

## Active Follow-up: AR/AP Balance Source Of Truth

เป้าหมาย: ให้หน้า AR/AP และ report อ่านยอดค้างจาก snapshot ของเอกสารต้นทาง (`sales_bills`, `purchase_bills`) เป็นหลัก และใช้ receipt/payment/allocation logs เป็น drilldown/audit เท่านั้น เพื่อไม่ให้ยอดค้างคลาดเมื่อมี Customer/Supplier Advance หรือ cancellation/reversal

### Contract

- AR เกิดตอนบันทึก `Sales Bill (SB)`; `PO Sell` และ `WTO` ไม่สร้าง AR
- AR ลดจาก `RCP` และ Customer Advance allocation ที่ active
- AR read model ใช้ `sales_bills.receivable_balance` และ `sales_bills.received_amount` เป็น source หลัก
- AP เกิดตอนบันทึก `Purchase Bill (PB)`; `POB`, `WTI`, และ `PMA` ไม่สร้างหรือลด AP
- AP ลดจาก `PMT` และ Supplier Advance allocation ที่ active
- AP read model ใช้ `purchase_bills.payable_balance` และ `purchase_bills.paid_amount` เป็น source หลัก
- cancelled/reversed receipt/payment/allocation facts ต้องไม่ลด AR/AP
- drilldown/detail ต้องแสดงที่มาของการตัดยอดจาก allocation facts โดยไม่ derive balance ทับจาก log ก่อน snapshot
- AP ไม่มี channel filter จนกว่าจะมี purchase channel จริงในเอกสารซื้อ
- AP credit term / due date schema ไม่อยู่ใน implementation รอบนี้; policy ปัจจุบันใช้ `purchase_bills.date` เป็นฐานนับอายุหนี้

### Task Breakdown

- [x] Update AR/AP page flow docs and Purchase/Sales flow docs with source-of-truth and calculation impact matrix
- [x] Update AR/AP docs before implementation: remove Pending Sale summary from AR, document snapshot-first rows, document AP no-channel-filter policy, document no-credit-term implementation scope, and document detail drilldown targets
- [x] Fix `/api/finance/ar` source-of-truth: use `sales_bills.receivable_balance` and `sales_bills.received_amount` as primary balance/read fields; use `customer_receipt_allocations`, `customer_receipts`, and legacy `receipts` mirror only for RCP/Customer Advance drilldown/audit
- [x] Fix `/api/finance/ap` source-of-truth: use `purchase_bills.payable_balance` and `purchase_bills.paid_amount` as primary balance/read fields; use `payments`, `payment_allocations`, `payment_approvals`, and `supplier_advance_allocations` only for PMT/ADV drilldown/audit
- [x] Add AR detail drilldown from `/finance/ar` to SB/RCP and Customer Advance allocation facts, including cancelled receipt exclusion and created-date display in list/detail payload
- [x] Add AP detail drilldown from `/finance/ap` to PB/PMA/PMT and Supplier Advance allocation facts, including cancelled/reversed payment exclusion and created-date display in list/detail payload
- [x] Remove/hide AP channel filter and any `channelId` query/UI state from `/finance/ap` until purchase channel exists as a real source
- [ ] Align `/finance/ar` and `/finance/ap` UI with `docs/design.md` / Peach: metric cards on plain grid, desktop lined/resizable/sort table, mobile dense cards, read-only dark-header detail modal
- [ ] Add focused API/service checks for mixed cases:
  - SB with Customer Advance + RCP returns `receivable_balance` from `sales_bills`, not derived from legacy receipt sum
  - PB with Supplier Advance + PMT returns `payable_balance` from `purchase_bills`, not derived from payment sum
  - cancelled RCP/PMT restores AR/AP balance

## Active Follow-up: Finance / Accounting Menu And Period Close

เป้าหมาย: ให้ทีมเห็นชัดว่าแต่ละหน้าใน `การเงิน & หนี้` และ `Finance / Accounting` คืออะไร ใช้ source ไหน และเมื่อมี month/year close ต้อง freeze อะไรบ้าง

### Task Breakdown

- [x] Add per-menu summary doc for `การเงิน & หนี้` and `Finance / Accounting`: [[Finance And Accounting Menu Summary]]
- [x] Update [[Finance Accounting Flow]] to include active `Accounting Periods` and `Posting Rules` policy pages
- [ ] Define accounting period state model: open, soft-closed, locked, reopened, year-closed
- [ ] Define runtime closed-period enforcement matrix for Sales, Purchase, Payment, Stock, Bank, Asset, Loan, and Tax write APIs
- [ ] Define reopen/rebuild snapshot audit flow before enabling period lock in production
- [ ] Define GL/statutory posting scope separately from current management report pages

## Active Follow-up: Historical Dashboard / Reporting Snapshots

เป้าหมาย: ให้ Dashboard, Report, Tracking 360, AR/AP, PO/Bill history, Stock และ Finance ย้อนหลังอ่านข้อมูลจาก fact/snapshot ที่มี cutoff ชัดเจน แทนการเอายอด current-state ปัจจุบันไปคำนวณอดีต

### Contract

- ใช้ [[Reporting History Snapshot Policy]] เป็นกฎกลาง
- Bill ย้อนหลังต้องอ่าน bill header/line snapshots + status/allocation facts ตาม document date และ as-of date
- PO ย้อนหลังต้องอ่าน PO allocation/release logs หรือ daily PO outstanding snapshot; ห้ามใช้ remaining ปัจจุบันตอบอดีต
- Finance ย้อนหลังต้องมี AR/AP/cash/bank/advance as-of snapshots; AR/AP current ใช้ bill balance snapshot แต่ historical aging ต้องใช้ allocation facts หรือ daily snapshot ตามวันที่
- Stock ย้อนหลังต้อง derive จาก `stock_ledger` append-only ถึง as-of date; pending_out ต้องมี usage/pending_out snapshot ถ้าจะแสดงย้อนหลัง
- Stock real-time และ historical as-of ต้องตอบได้ทั้งจำนวน, มูลค่า, WAC/ต้นทุนเฉลี่ย, pending_out และ available ด้วย cutoff เดียวกัน; ห้ามใช้ WAC ปัจจุบันแทน WAC ย้อนหลัง
- รายเดือน/รายปีต้อง roll up จาก daily snapshot ที่ตรวจแล้ว: movement metric = sum รายวัน, balance metric = ending balance วันสุดท้ายของช่วง
- ถ้าขาด snapshot/fact ต้องแสดง data incomplete/reconciliation gap; ห้าม fallback ไปใช้ current balance แบบเงียบ

### Task Breakdown

- [x] Add cross-domain reporting history snapshot policy doc
- [x] Define daily snapshot schema/view plan for Bill, PO, Finance, and Stock domains
- [x] Define Stock real-time/as-of API contract for quantity, stock value, WAC, pending_out, and available by bucket
- [ ] Add source coverage matrix for each Dashboard/Tracking/Report card
- [x] Add `asOf` contract and stale/incomplete snapshot warning for dashboard APIs that support historical view
- [ ] Add backfill/rebuild scripts from transaction facts for selected date ranges
- [ ] Add reconciliation checks comparing daily snapshots against source facts
- [ ] Update monthly/yearly report APIs to use daily snapshots once the snapshot layer exists

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
- [x] ออกแบบ target document history table model แบบแยก table ตามเอกสาร/flow ไม่ใช้ generic `document_events` เป็น source of truth
  - [x] บันทึก design ที่ `docs/notes/Document History Table Design.md`
  - [x] ระบุว่า `WTI/WTO`, `POB`, `PB`, `ADV`, `PMA`, `PMT`, `POS`, `SB`, `RCP` ต้องมี status/usage/allocation logs เฉพาะตามข้อมูลของแต่ละ flow; `PSALE` เหลือเฉพาะ legacy/data-repair reference หลังตัด `/sales/stock-issue`
  - [x] ระบุว่า active allocation/detail tables เป็น fact/current tables ไม่ใช่ timeline replacement
  - [x] เพิ่ม `weight_ticket_usage_logs` สำหรับ `WTI -> PB` allocation/release พร้อม backfill active allocations และตาราง `ประวัติการใช้งานใบรับของ` ใน WTI detail
  - [x] เพิ่ม `weight_ticket_status_logs` สำหรับ create/edit/cancel/status transition ของ `WTI/WTO` และให้ WTI detail timeline อ่านจาก dedicated document logs แทน `app_audit_logs`
  - [ ] ต่อ `weight_ticket_usage_logs` ฝั่ง `WTO -> SB`
  - [x] เพิ่ม `po_buy_allocation_logs` สำหรับ `POB -> PB` allocation/release พร้อม backfill active allocations และตาราง `ประวัติการจัดสรร` ใน PO Buy detail
  - [x] เพิ่ม `supplier_advance_status_logs` และ `supplier_advance_allocation_logs` สำหรับ lifecycle/status และ ADV -> PB allocation/release timeline
  - [x] เพิ่ม `customer_receipts`, `customer_receipt_allocations`, และ `customer_receipt_status_logs` สำหรับ `RCP` lifecycle/allocation พร้อม cancel-and-reissue edit policy
  - [ ] เพิ่ม `payment_approval_status_logs`, `payment_status_logs`, `payment_allocations`, และ `payment_account_splits`
  - [ ] เพิ่ม sales-side status/allocation logs สำหรับ `POS`, `WTO`, และ `SB` ส่วน `RCP` done ผ่าน Customer Receipt contract แล้ว; `PSALE` เป็น legacy-only/data-repair reference ไม่ใช่ target runtime log ใหม่
- [x] Optimize Customer Receipt API/DB contract
  - [x] แยก `/api/sales/receipts` queue query เป็น outstanding SB และ active-allocation SB เพื่อลด OR-heavy query
  - [x] ลด broad ORM relation payload ด้วย `select` เฉพาะ field ที่ response ใช้จริง
  - [x] เพิ่ม index `idx_sales_bills_customer_receipt_outstanding_queue`, `idx_customer_receipt_allocations_active_sales_bill`, และ `idx_customer_receipts_history_order`
  - [x] apply migration `20260612131350_optimize_customer_receipt_queries.sql` ไป dev-target และ verify ด้วย EXPLAIN
- [ ] เพิ่ม Document Aging read model/report สำหรับ `PB/SB/WTI/WTO/POB/POS`
  - [x] บันทึก target contract ที่ `docs/notes/Document Aging Policy.md`
  - [ ] ใช้ bucket เดียวกับ AP/AR สำหรับ `PB/SB` financial due aging
  - [ ] เพิ่ม operational pending aging ให้ `WTI/WTO/POB/POS`
  - [ ] ตรวจทุกหน้า list/detail ของเอกสารให้แสดง `วันที่สร้างรายการ` จาก `created_at` แยกจากวันที่เอกสาร/วันที่จ่าย/วันที่ครบกำหนด
  - [ ] ออกแบบ API/report กลางหรือ page-specific fields ก่อนเพิ่ม OpenAPI path ใหม่
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
  - [x] `/purchase/bills` Stock create/edit requires a branch-filtered active warehouse dropdown and server-side same-branch validation; no runtime warehouse fallback from name/code/type/status hint

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
- [x] เพิ่มช่อง `รูปสินค้า` แบบ profile upload รูปเดียวใน `/master-data/products` create/edit modal พร้อม preview, replace/remove-before-save, persistence ผ่าน `products.image_names`, และ export เฉพาะชื่อไฟล์
- [x] แยก `/daily/weight-tickets` option bootstrap ออกจาก master product full-list API: ใช้ `/api/daily/weight-tickets/options` สำหรับ header options แบบเบา และ preload `/api/daily/weight-tickets/products` ต่อทันทีหลัง options สำเร็จโดยไม่รอ user เลือก header โดย route สินค้าคืนรูปสินค้าแรกมาพร้อมแต่ละ product row เพื่อคง requirement รูปโดยไม่เรียก master product full-list
- [ ] ย้ายรูปสินค้าออกจาก `products.image_names` base64 ไป Storage และสร้าง thumbnail URL สำหรับ product option/picker
  - [x] เพิ่ม `products.image_storage_key` และ bucket/policy สำหรับ `product-images`
  - [x] เปลี่ยน `/master-data/products` modal ให้ upload รูปผ่าน Supabase Storage ภายใต้ user session แทนการส่ง base64 เข้า DB
  - [x] เพิ่ม `products.image_thumbnail_storage_key` และเก็บไฟล์ `original + thumb` แยกกันใน Storage
  - [x] ย่อ/บีบรูปใน browser ก่อน upload แล้วบันทึกเป็น `.webp`
  - [x] ให้ `/api/master-data/products` และ `/api/daily/weight-tickets/products` ส่ง `thumbnailUrl` จาก thumb object จริง
  - [x] ใช้ flow เดียวกันกับ WTI/WTO product picker โดยไม่แยก image API เพิ่ม
  - [x] backfill รูป legacy จาก `products.image_names` ไป `image_storage_key` + `image_thumbnail_storage_key` สำหรับข้อมูลเดิม
  - [ ] ล้าง/ตัดข้อมูล legacy `products.image_names` หลังย้าย flow เสร็จ โดยไม่ทำ runtime fallback
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
- [ ] define bill-driven stock movement trigger/rule: `PB Stock = stock in`, `WTO = pending_out / รอออก`, `SB Stock = consume pending_out + stock out`, `WTI = source evidence`
- [ ] keep Stock PB as stock-in owner with `WTI 1 ใบ -> PB 1 ใบ`, reverse/rebuild PB ledger on edit/cancel, and release/recalc WTI usage from active facts
- [ ] enforce `/purchase/bills` canonical status/filter/runtime contract
  - [ ] list filter uses only `ยังไม่อนุมัติ`, `รอจ่าย`, `ชำระบางส่วน`, `เสร็จสิ้น`, `ยกเลิก`
  - [ ] remove `อนุมัติแล้ว` as PB-level filter/status; PMA owns that state
  - [ ] Stock PB WTI selector accepts only `WTI = รับของแล้ว`
  - [ ] block legacy partial WTI from new write path selectors
  - [ ] disable edit/cancel/supplier-swap when active `PMA approved` or `PMT active` exists
- [ ] define payment relation
- [x] `/purchase/bills` supplier swap flow
  - [x] แยก page-specific flow doc เป็น `docs/notes/Purchase Bills Page Flow.md`
  - [x] เพิ่มปุ่ม `เปลี่ยน Supplier` ใน modal แก้ไข PB ข้างช่อง Supplier
  - [x] save supplier swap ต้อง void PB เดิมทั้งใบและสร้าง PB ใหม่เลขใหม่ใน transaction เดียว
  - [x] PB ใหม่คง WTI/receipt เดิมได้ แต่เปลี่ยน Supplier และราคาได้
  - [x] PB ใหม่จาก supplier swap ต้องเป็น Spot Buy ทั้งหมด และ API ต้อง reject ถ้ามี `poBuyId` เพราะห้ามตัด PO ข้าม Supplier จากใบรับของเดิม
  - [x] ADV allocation ของ PB เดิมต้องถูก void/release ไปกับ PB เดิม และไม่ carry ไป PB ใหม่อัตโนมัติ
  - [x] PB เดิมที่ถูก void จาก supplier swap ใช้ status แยก `cancelled_supplier_swap` และแสดงผล `ยกเลิก/เปลี่ยน Supplier`
  - [x] บันทึก `bill_swap_history` ให้ `/daily/bill-swap-history` แสดง Supplier เดิม/ใหม่ ราคาเดิม/ใหม่ และเลข PB ใหม่ในเหตุผลได้

### 6.2 Sales Prep

- [ ] map `sales_bills.items jsonb`
- [x] design `sales_bill_lines`
- [x] Document canonical `/sales/bills` create flow before coding: `PO Sell -> WTO -> SB`, select WTO first, show WTO product lines, allocate to PO Sell, split excess as Spot Sale, remove free-text reference/truck fields, reuse PB VAT/totals design, and add Customer advance/deposit section (`docs/notes/Sales Bills Page Flow.md`)
- [x] `/sales/bills` create-form PB parity slice
  - [x] Customer search dropdown
  - [x] required `WTO` search dropdown filtered by branch/Customer
  - [x] no blank/manual product row before `WTO`
  - [x] auto-fill STOCK item rows from `WTO` product summary/snapshot
  - [x] remove free-text reference and vehicle registration display from SB form/detail/print
  - [x] keep `+ เพิ่มรายการ` only for Trading/manual flow; STOCK uses WTO lines only
- [x] `/sales/bills` STOCK allocation UX slice
  - [x] target columns: product, น้ำหนักสุทธิที่ส่ง, จำนวนที่ขายได้, หักสิ่งเจือปน, น้ำหนักขายสุทธิ, PO Sell/Spot Sale source, unit price, discount, amount
  - [x] line-level `PO Sell / Spot Sale` selector with `Spot Sale` as default
  - [x] PB-style split rows under the same WTO product with `+ เพิ่มแถว` / `ลบ`
  - [x] allow partial WTO allocation when Customer buys less than sent quantity; cap selected PO Sell rows by remaining quantity and keep the unsold source qty as active `pending_out` for return
  - [x] lock `ราคา/หน่วย` when a row selects `PO Sell`; keep Spot Sale price editable
- [x] `/sales/bills` totals/deposit/print runtime slice
  - [x] PB-style VAT/totals section and money-input behavior
  - [x] Customer advance/deposit selector and interim snapshot allocation marker
  - [x] per-document SB print with branch-specific Company Profile, A4 portrait, multi-page header/footer, Customer/document panels, VAT/totals, deposit, and receivable balance
  - [x] SB print item table no longer repeats WTO document number or vehicle registration
- [x] Design and implement durable `WTO -> Sales Bill` allocation tables/write rules for new create/cancel, including `sales bill -> source`, `sales bill -> PO Sell`, `sales bill -> Spot Sale`, and Customer advance allocation/release. Legacy `PSALE` / `/sales/stock-issue` is removed from target runtime and must not be treated as a current source.
  - [x] Batch WTO-A schema/API foundation
    - [x] add `weight_ticket_lines.warehouse_id` for WTO intended stock location
    - [x] add durable `stock_holds` technical table for the business state `pending_out / รอออก` with `active/consumed/released/cancelled` status
    - [x] add pending_out-aware availability helper from `stock_ledger + stock_holds`
    - [x] add `GET /api/daily/weight-tickets/stock-options?branchId=&productId=` for active branch `RM/FG` warehouses with `onHandQty/onHoldQty/availableQty`
    - [x] enforce WTO server validation on `POST/PUT/PATCH /api/daily/weight-tickets`: require warehouse, validate available qty, create/rebuild/release pending_outs in transaction
  - [ ] Batch WTO-B create/edit UX
    - [x] update WTO create/edit UX ให้เลือกสินค้าใน line ก่อน แล้วเลือกคลัง `RM/FG` ต่อ line
    - [x] show line availability as `คงเหลือจริง / จองไว้ / พร้อมส่ง`
    - [x] show intended warehouse in WTO detail/print/read models
    - [x] show pending_out state in WTO detail where relevant at baseline level
  - [ ] Batch WTO-C downstream stock-out
    - [x] add `SB Stock` create flow consume pending_out + stock-out ledger write by referencing WTO intended warehouse; WTI/WTO must not write stock ledger rows
    - [x] split Sales Bill stock quantity from commercial sales quantity: `จำนวนที่ขายได้ - หักสิ่งเจือปน = น้ำหนักขายสุทธิ`, while stock consume is capped by WTO pending_out source quantity
    - [x] support partial consume of active pending_out rows in `stock_holds` so remaining `pending_out` stays active after a partial Sales Bill
    - [x] add explicit `รับของคืน` UI/API action for remaining WTO pending_out after a partial Sales Bill; user must enter actual returned weight, exact return releases/closes pending_out without ledger movement, short return requires a reason and posts `WTO-RETURN-LOSS` stock ledger for the loss qty
    - [x] show stock balance as `คงเหลือจริง / จองไว้ / พร้อมส่ง` in `/stock/balance`
    - [x] show pending_out consume context in SB create from WTO at baseline level
    - [x] transaction-safe release/cancel on `SB`; full edit/rebuild remains disabled until read-model normalization is complete
  - [x] current allocation table for `WTO -> SB`; legacy `PSALE` columns/indexes are migration/data-repair residue only, not target write path
  - [x] current allocation table for `SB -> PO Sell`
  - [x] current allocation table for `SB -> Spot Sale`
  - [x] current allocation table for `Customer advance -> SB`
  - [x] server-side detail/print and list item-count reads allocation facts/current tables before json snapshots
  - [ ] future line-level export/dashboard/tracking reads allocation facts/current tables, not json snapshots
  - [x] 2026-06-25 terminology hardening: runtime/business API names should use `pending_out`; `stock_holds` remains only a technical DB table name and must not be presented as the business concept.
- [ ] Runtime status/usage cleanup after status decision
  - [x] WTI/WTO list filters use canonical target status only
  - [x] WTI has no target partial-billed status in new writes
  - [x] WTO has target `partially_billed / ออกบิลแล้วบางส่วน` status when an active SB consumes only part of the WTO pending_out and the remaining pending_out must be closed by `รับของคืน`
  - [ ] detail/timeline surfaces downstream usage facts instead of inferring from status string only
  - [ ] reconciliation report flags legacy partial-billed/status mismatch rows instead of hiding them
- [ ] Add sales-bill timeline/log coverage
  - [x] `weight_ticket_usage_logs` for `WTO -> SB` allocate on create
  - [x] `weight_ticket_usage_logs` for `WTO -> SB` release/reverse on cancel
  - [x] `sales_bill_status_logs` for create/cancel and Trading allocation correction
  - [x] dedicated `po_sell_allocation_logs` for billed/released quantity from `SB`
  - [x] detail/timeline reads dedicated logs for `WTO`, `PO Sell`, and `SB`
  - [ ] dedicated allocation timeline logs for Customer Advance allocation/release beyond current allocation facts
- [x] Sales Bill commercial correction slice 2
  - [x] allow edit of `จำนวนที่ขายได้`, `หักสิ่งเจือปน`, derived `น้ำหนักขายสุทธิ`, price, discount, PO Sell allocation, VAT/header, export order, and Customer Advance allocation when no active RCP exists
  - [x] keep `transactionMode`, branch, Customer, WTO/source, product, line count, and `stockIssueQty` locked; do not write `stock_ledger`, reopen/consume `pending_out`, or recalc WAC in this slice
  - [x] release/recreate active `sales_bill_po_sell_allocations` and `sales_bill_customer_advance_allocations` in the same transaction, update `sales_bills.received_amount` / `receivable_balance`, and append status/allocation logs
  - [ ] leave stock/source quantity correction as a separate append-only stock correction flow after policy/QA
- [ ] Harden SB detail/print after allocation facts exist
  - [x] detail source labels read line allocation facts instead of snapshot/header fallback
  - [x] print source labels read line allocation facts via shared Sales Bill detail read model
  - [ ] QA long A4 multi-page print with mixed `PO Sell`/`Spot Sale`
- [ ] Design Trading sales bill flow as follow-up: choose optional purchase bills, auto-fill sale lines when linked, allow optional PO Sell linking, and send Trading lines to Trading Matching without stock-out
  - [x] Expose optional row-level `PO Sell / Spot Sale` selector in Trading SB create UI
  - [x] Keep Trading SB server-side stock boundary: reject WTO/PSALE/warehouse payload fields and persist no stock source fields
  - [x] Linked Trading SB rows reuse the existing PO Sell remaining reduction path without writing stock ledger
  - [x] Design/implement durable Trading source allocation facts for `SB Trading line -> PB Trading line` on create/cancel
  - [x] Design first-class non-PB Trading cost source for `SB Trading line -> Spot Trading source` allocations
  - [x] Add Trading SB allocation-only correction API that reverses old active facts and appends a corrected active fact set
  - [x] Add UI action for Trading SB allocation-only correction; full Sales Bill edit remains disabled until sales-side allocation tables are complete
  - [x] Add rollback-based automated verification for Trading SB allocation correction success, capacity guard, product mismatch guard, corrected COGS/GP, and no stock ledger side effect
  - [x] Add dashboard UI to create/list manual non-PB Trading Cost Source
  - [x] Logged-in browser QA Trading SB allocation correction: open `แก้ต้นทุน`, change multiple line sources, save, verify revised Matched COGS/GP, and confirm no stock ledger side effect
- [x] Define sales bill allocation tables/rules for `sales bill -> WTO`, `sales bill -> PO Sell/Spot Sale`, and `Customer advance -> sales bill`; Trading cost continues through `trading_allocation_facts`. `PSALE/direct stock` are not target runtime sources.
- [x] Implement the durable Sales Bill allocation tables/write path after the design above: `sales_bill_lines`, `sales_bill_source_allocations`, `sales_bill_po_sell_allocations`, and `sales_bill_customer_advance_allocations`
- [x] Switch Stock SB detail/print/list item-count read models from `sales_bills.items` snapshots to durable Sales Bill allocation facts only; legacy rows without durable facts now return an explicit contract error instead of warning/fallback display
- [x] Decide legacy SB reconciliation/backfill policy before removing the legacy snapshot display path entirely
  - [x] policy = no runtime snapshot fallback and no mandatory backfill; legacy/test rows without durable facts are treated as data-repair rows and may return explicit contract errors
- [x] Remove/supersede `/sales/stock-issue` pending sale write flow from target runtime
  - [x] active route/API `/sales/stock-issue` and `/api/sales/stock-issue` removed
  - [x] active report/API `/pending-sales` and `/api/pending-sales` removed
  - [x] Sales Bill new write path uses `WTO -> SB` only and does not create/convert/cancel `PSALE`
  - [x] dashboards/reports/AR no longer read `stock_issues` as pending-sale fallback
  - [x] legacy PSALE behavior remains historical/data-repair context only and must not be listed as target-complete runtime work
- [x] define sales COGS rule: Stock SB uses weighted average cost at the time of sale, captured into `stock_ledger.value_out`/`unit_cost` when `SB` consumes WTO pending_out; downstream COGS reads that posted SB ledger cost, not current/recomputed WAC
- [x] `/sales/bills` create/edit save UX: after successful save, close the modal and reload the list with the user's current filters; do not auto-fill search with the saved SB doc no because that silently filters the table
- [ ] define receipt relation

### 6.3 Payment and Receipt Prep

- [ ] Next daily transaction tracker: [15-next-daily-transactions-progress.md](/Users/watcharathatsrithanesiganon/Documents/GitHub/ns-scrap-erp/docs/migration/15-next-daily-transactions-progress.md)
- [x] Batch A: `/daily/transfer`, `/daily/expense`, `/daily/petty-advance`, `/daily/expense-dashboard`
- [x] Batch B: `/daily/payment-approval`, `/purchase/payments`, `/purchase/receipt-vouchers`, `/sales/receipts`
- [x] Batch C: `/stock/transfer`, `/daily/bill-swap-history`
- [x] Batch D/E read baseline: `/purchase/bills`, `/sales/bills`, `/sales/stock-issue`
- [x] document active Finance & Debt page contracts for `/daily/petty-advance`, `/finance/ar`, `/finance/ap`, `/finance/bank`, `/finance/cash-position`, and `/finance/customer-advance`
- [ ] design supplier payment allocations
- [ ] design customer receipt allocations
- [ ] define bank statement relation
- [ ] sync `/finance/ap` and `/finance/ar` with created-date display, source document links, and final allocation facts
- [x] Fix `/api/finance/ar` AR source-of-truth: use `sales_bills.receivable_balance` and `sales_bills.received_amount` as the primary balance/read fields; use `customer_receipt_allocations`, `customer_receipts`, and legacy `receipts` only for RCP drilldown/audit. This prevents Customer Advance allocations from being missed when legacy receipt rows are used to derive received amounts.
- [x] Add AR detail drilldown from `/finance/ar` to SB and RCP allocation facts, including Customer Advance allocation facts, cancelled receipt exclusion, and created-date display in list/detail payload.
- [x] Fix `/api/finance/ap` AP source-of-truth: use `purchase_bills.payable_balance` and `purchase_bills.paid_amount` as the primary balance/read fields; use `payments`, `payment_allocations`, `payment_approvals`, and `supplier_advance_allocations` only for PMT/PMA/ADV drilldown/audit.
- [ ] Remove `/finance/ap` channel filter until purchase channel exists as a real document source; do not keep an empty dropdown or fallback query.
- [ ] Keep AP aging on current policy: `purchase_bills.date` is the aging base date. Do not add credit term/due-date schema in this batch.
- [x] design dedicated `customer_advances` source table so `/finance/customer-advance` and SB CADV selection no longer depend on `bank_statement.ref_type = CADV` only
- [ ] design dedicated customer receipt -> CADV allocation facts for `/sales/receipts`; SB allocation facts exist as `sales_bill_customer_advance_allocations`
- [ ] harden `/daily/petty-advance` with expense allocation, status logs, cancel/reverse policy, and server-side return-over-remaining guard
- [ ] sync `/finance/bank` and `/finance/cash-position` with complete source links, as-of/currency policy, and read-only/admin-cleanup boundary

### 6.4 Inventory Prep

- [x] document active Stock category page contracts for `/stock/transfer`, `/stock/balance`, `/stock/ledger`, `/stock/status-convert`, `/stock/convert`, and `/stock/adjust`
- [ ] design inventory transaction header/lines
- [ ] map stock ledger movement types
- [ ] define lot/grade/status behavior
- [ ] sync `/stock/balance` with pending_out-aware columns/drilldown from `docs/notes/Stock Balance Page Flow.md`
- [ ] sync `/stock/ledger` with source links, created-date display, and no-pending_out-row rule from `docs/notes/Stock Ledger Page Flow.md`
- [ ] harden stock write pages (`transfer`, `status-convert`, `convert`, `adjust`) with pending_out-aware available checks, reversal policy, and reconciliation queries from their page flow docs

### 6.5 Production Prep

Tracker: [16-next-production-progress.md](/Users/watcharathatsrithanesiganon/Documents/GitHub/ns-scrap-erp/docs/migration/16-next-production-progress.md)

- [x] ตรวจ legacy flow ของ production orders, inputs, outputs, reports, cost, yield/loss, และ machine utilization เบื้องต้น
- [x] ระบุว่า `หมวดหมู่การผลิต` ใน legacy เป็น enum-like field บน production output ไม่ใช่ DB table เดิม
- [x] ระบุ legacy output category codes: `FG`, `RM`, `CUSTOMER_RETURN`, `LOSS`
- [x] Batch P1: เพิ่ม target DB/API สำหรับ `production_output_categories` แบบ additive และ seed จาก legacy
- [x] Batch P2: port `/production/orders` read baseline พร้อม API และ server-side pagination/filter/sort
- [ ] Batch P3: implement simplified production order write flow per `docs/notes/Production Order DB API Design.md` (backend/API/UI done; report reconciliation and logged-in QA pending)
- [x] Batch P4: port production dashboard/report/cost/yield/machine utilization read baseline
- [x] Document production stock flow in `docs/notes/Production Flow.md`, including `PI` input to WIP, `PO2` output from WIP, output category behavior, and current read-baseline gaps
- [x] Document simplified production MVP/no-fallback/API/DB task contract in `docs/notes/Production Order DB API Design.md`
- [x] Implement production write ledger contract backend/API
  - [x] create production order as `Open` with no stock ledger side effect
  - [x] production input writes source warehouse stock-out plus WIP-in in one transaction
  - [x] production output writes WIP-out plus destination FG/RM in or loss movement
  - [x] completed is allowed only when WIP balance is zero
  - [x] edit/cancel writes explicit append-only `PI-REV`/`PO2-REV` rows and keeps source document audit
  - [ ] reports read ledger facts for WIP/FG/RM/loss reconciliation
  - [x] do not implement approval/process cost/cost allocation/customer return/auto Grade Adjustment in MVP
  - [x] do not add runtime fallback for missing doc no, code, category, warehouse, WAC, or stock balance

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
9. Payment-approval model correction 2026-06-06
  - [x] supersede model เดิมที่สร้าง `PMA pending` ตั้งแต่ source-write time
  - [x] บันทึก canonical decision ใหม่ใน `docs/notes/Payment Flow.md` และ `docs/notes/Purchase Flow.md`: `PB/ADV/EXP` เป็น pending source queue, `PMA` เกิดตอน approve เท่านั้น, `PMT` ต้องจ่ายเต็ม PMA ที่เลือก
  - [x] เพิ่ม Mermaid flow และแยก status matrix ไว้ที่ `docs/notes/Purchase Flow Status Matrix.md` ตั้งแต่ PO/WTI/PB/ADV -> PMA -> PMT รวมถึง void PMA และ cancel PMT
  - [x] แยก ownership เอกสารให้ชัด: `Purchase Flow.md` จบที่ `PB/payable handoff`, ส่วน approval/PMA/PMT/void/cancel/payment history รับช่วงใน `Payment Flow.md`; matrix เป็น acceptance bridge ข้าม flow เท่านั้น
  - [x] อัปเดต canonical status boundary 2026-06-11: `POB` รองรับ partial, `WTI` ไม่มี partial target state, `PB` filter ใช้ `ยังไม่อนุมัติ / รอจ่าย / ชำระบางส่วน / เสร็จสิ้น / ยกเลิก`, `PMA` ใช้ `อนุมัติแล้ว / ยกเลิกแล้ว`, และ `PMT` ใช้ `เสร็จสิ้น / ยกเลิกแล้ว`
  - [ ] ตรวจ runtime status labels หลัง decision 2026-06-11: `/purchase/bills`, `/daily/payment-approval`, `/purchase/payments`, WTI/WTO list/detail/print ต้องใช้ชุดสถานะเดียวกับเอกสาร flow
  - [x] normalize legacy `payment_approvals.source_id` data (`PB-...` / `ADV-...`) ให้กลับมาอ้าง internal bigint id string ตาม flow มาตรฐาน ไม่เพิ่ม compatibility code ใน runtime
  - [x] ถอย runtime/schema/data จาก `PMA pending` เป็น source-derived pending queue
  - [x] ปรับ `/daily/payment-approval` แท็บ `ยังไม่อนุมัติ` ให้อ่าน `PB/ADV/EXP` และคำนวณ remaining approval balance จาก source minus active/consumed PMA
  - [x] ปรับ approve action ให้สร้าง `PMA approved` ใหม่ตาม split amount ที่อนุมัติจริง
  - [x] ปรับ `/daily/payment-approval` แท็บ `อนุมัติแล้ว` ให้ใช้ `PMA.doc_no` เป็นเลขหลัก และแสดง `PB/ADV/EXP` เป็นเอกสารอ้างอิง
  - [x] ปรับ `/purchase/payments` ให้อ่านเฉพาะ `PMA approved`, รวมหลาย PMA ของผู้รับเงินเดียวกันได้, และบังคับ PMT full-pay ทุก PMA ที่เลือก
  - [x] sync `/purchase/payments` PMT modal UI/flow 2026-06-08: ไม่แสดง manual `วิธีจ่าย`, derive `PMT.method` จาก selected PMA `destination_payment_method_snapshot`, restrict PMA selection to same recipient/payment method, and show `ช่องทางรับเงิน` / `บัญชีรับเงิน` next to source document before the numeric payment row
  - [x] สร้าง task/แก้ runtime gap 2026-06-08: `EXP` PMA approved ต้องเข้า `/purchase/payments`, ทำ PMT ได้โดย WHT เป็น 0 ตามยอด PMA, แสดงผู้รับเงินใน `/purchase/payment-history`, และ cancel PMT ต้อง recalc `expenses.status / paid_status / paid_at` กลับตาม active PMA/PMT
  - [x] เพิ่ม action void PMA ที่ approved แล้วแต่ยังไม่ออก PMT โดยให้ยอดกลับไป source pending candidate, เก็บ PMA เดิมเป็น audit/history, และแสดง snapshot `ยกเลิกแล้ว` ใน `/daily/payment-approval`
  - [x] ปรับ cancel PMT ให้ reverse bank/payment allocation, ปิด PMA cycle เดิม, และส่งยอดกลับ source pending candidate เพื่อ approve ใหม่
  - [x] ปรับ ADV status/filter 2026-06-08: เพิ่ม `อนุมัติแล้วบางส่วน` จาก active PMA partial totals, ถอด `รอคืนเงิน` / `คืนเงินแล้ว` ออกจาก runtime/filter/constraint, และให้ void PMA / cancel PMT recalc ADV จาก active PMA/PMT/allocation facts แทนการเซ็ตสถานะค้าง
  - [ ] บังคับ source financial lock หลังมี `PMA approved` หรือ `PMT active` ให้ครบทุก write path ของ `ADV`, `PB`, `EXP`

## 2026-06-05 Identifier Contract Checkpoint

- [x] `/trading/dashboard` target runtime batch 2026-06-13: replace legacy accounting/trend/donut UI with trader/operator tabs, explicit date/supplier/customer/bill/product filters, allocation-backed Matched COGS, Product Qty/Sales from Trading Sales Bill lines, PB/SB source links, and no WAC/subtotal cost fallback.
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
- [x] `/daily/weight-tickets` vehicle/product-line image uploads use compact profile-style multi-image tiles with preview/remove actions, and active-line product selection keeps the original searchable combobox while adding product-type category chips plus compact mobile image-card selection
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
- [x] ADV runtime status now includes `partially_paid` (`จ่ายแล้วบางส่วน`), labels `paid` as `จ่ายแล้ว`, and prioritizes allocation status over payment status. PB cancel / supplier swap release ADV allocation now recalculates back to `จ่ายแล้ว` or `จ่ายแล้วบางส่วน` from actual PMT settlement.
- [x] purchase-bill weight-ticket selectors now use `doc_no` and doc-based composites instead of internal ticket/line/summary ids
- [x] `/api/finance/foreign/fx-gain-loss-report` now uses a natural outward composite id and no longer exposes raw internal `ref_id`
- [x] `/api/admin/auth-events` now uses event-based composite ids instead of internal audit/activity row ids
- [x] inventoryed remaining models without `code/doc_no` from `schema.prisma`: `59` total (`public 37`, `auth 22`)
- [x] `/purchase/po-buy` item rows now use searchable product combobox + money-pattern unit price input + number-exception qty input to match `docs/design.md`
- [x] `/purchase/po-buy` combobox behavior is restored inside the modal: supplier/product dropdowns are selectable, keyboard-navigable, not clipped by the table section, and create forms default `expectedDelivery` to today while list sort defaults to `docNo desc`
- [x] `/purchase/po-buy` short-close action is now only enabled for partially received PO rows with remaining quantity; unreceived open rows show the action disabled and the PATCH route rejects direct short-close requests unless the PO is partially received
- [x] `/purchase/po-buy` Excel export now follows the active purchase export convention: Thai headers, Thai worksheet name, dated filename, branch code included, and search/status/date/selected-row filters preserved
- [x] `/purchase/po-buy` create/edit modal now has checkbox `มี VAT` like purchase bill create, stores VAT snapshot fields on `po_buys`, and preserves VAT through PO reconciliation
- [x] Add per-document purchase-bill print for `/purchase/bills` list/detail/direct detail. Use Company Profile as the header source, show a company logo in the header with template default logo fallback if profile logo is missing, support A4 browser print/Save as PDF, show PB status/watermark for cancelled/supplier-swap documents, preserve historical PO/Spot source from PB snapshots, show actual item units, and design a clean corporate A4 landscape template. Use the customer sample image received 2026-06-09 as a data checklist only: delivery grid fields, total summary, document metadata, and item table with gross/deduct/net weight columns must be present.
- [x] Add per-document sales-bill print for `/sales/bills` list rows. Use branch-specific Company Profile, A4 portrait, multi-page table header repeat, fixed print footer, Customer/document panels, WTO trace, VAT/totals, Customer advance deduction, and final receivable balance from the `SB` snapshot/detail API.
- [ ] Audit and update quantity/unit display across PO/WTI/PB/SB/receipt/detail/print/export surfaces so `กก.` and `ลัง` are shown from item unit snapshots/master data and mixed-unit summaries are grouped by unit instead of combined into one number.
- [ ] decide next schema wave for `public` models still lacking explicit business keys, especially support/admin and document-detail tables
