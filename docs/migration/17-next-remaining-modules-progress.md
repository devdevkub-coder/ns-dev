# 17 Next Remaining Modules Progress

## Objective

แตกงานที่เหลือหลัง master data, daily transaction baseline และ production read baseline เพื่อ port ทุกหมวดใน Next.js ให้ครบแบบมี API/DB/UI/action/modal/validation/reconciliation ตามลำดับที่ไม่ทำให้ stock/finance พัง

## Continuous Work Rule

- ก่อนเริ่มหมวดใหม่ ต้องใช้ legacy explorer ตรวจหน้าเดิมว่ามี field, filter, button, modal, action, export และ side effect อะไร
- Batch ต้องแบ่ง 3 ระดับเสมอ:
  - Module batch เช่น `Batch S: Stock`
  - Module overview เช่น `S0: Module Overview`
  - Page batch เช่น `S1: Stock Balance`
  - Task batch เช่น `S1.1 Legacy/API`, `S1.2 UI`, `S1.3 Actions/Modal`, `S1.4 QA`
- ห้ามเริ่มทำ page batch ก่อนทำ module overview ของหมวดนั้น ยกเว้นเป็น bugfix เฉพาะหน้าที่ user ระบุชัด
- Module overview ต้องตอบให้ได้ก่อนลงมือ:
  - legacy pages ในหมวดนี้มีอะไรบ้าง
  - flow รวมของหมวดคืออะไร
  - shared tables/API/helpers ที่ควรใช้ร่วมกันคืออะไร
  - side effects ร่วม เช่น stock ledger, bank statement, AP/AR, cost allocation คืออะไร
  - ปุ่ม/action/modal/export ของแต่ละหน้าคืออะไร
  - dependency ระหว่างหน้าคืออะไร
  - page order ที่ควรทำก่อนหลังคืออะไร
  - risk/open decisions ที่ห้ามเดาเองคืออะไร
- ทุก batch ย่อยต้องอัปเดตเอกสารนี้ทันทีหลังจบงานหรือเมื่อเปลี่ยน schema/API contract
- ทุก route ใหม่หรือ route ที่เปลี่ยนสถานะ ต้องอัปเดต system sitemap
- ทุก API ใหม่หรือ API contract ที่เปลี่ยน ต้องอัปเดต OpenAPI spec
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

## Definition of Done Per Module Overview

ทุก module overview ต้องมีผลลัพธ์ก่อนเริ่ม page แรก:

- [ ] Legacy page inventory ครบทุก route/menu ในหมวด
- [ ] Shared flow summary
- [ ] Shared DB/table mapping
- [ ] Shared API/helper strategy
- [ ] Shared side effects/reconciliation rules
- [ ] Button/action/modal/export inventory รายหน้า
- [ ] Dependency map ระหว่างหน้า
- [ ] Page implementation order
- [ ] Risks/open decisions
- [ ] Docs updated before code

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

## Batch PRE: System Map and API Contract Baseline

ต้องทำก่อนเริ่ม Batch S หรือ batch ใหญ่ถัดไป เพื่อให้ไม่หลุด route/API contract ระหว่าง port ต่อ

### PRE0: System Sitemap Baseline

#### PRE0.1 Route Inventory

- [x] สร้าง `docs/migration/18-next-system-sitemap.md`
- [x] ดึง route จาก `apps/next/src/lib/navigation.ts`
- [x] ดึง page/API ที่มีจริงจาก `apps/next/src/app`
- [x] map route -> section -> status

#### PRE0.2 Page Metadata

- [x] บันทึก status ต่อหน้า: `done`, `read baseline`, `partial write`, `missing`, `deferred`
- [x] บันทึก API ที่ผูกกับหน้า
- [x] บันทึก DB/table หลัก
- [ ] บันทึก buttons/actions/modal/export ที่มีหรือยังขาด
- [x] บันทึก permission ที่ใช้

#### PRE0.3 Sitemap QA

- [x] ตรวจ route ที่อยู่ใน navigation แต่ยังไม่มี page จริง
- [x] ตรวจ page ที่มีจริงแต่ไม่มี navigation item
- [x] ตรวจ API ที่มีจริงแต่ยังไม่มี sitemap mapping
- [x] commit sitemap baseline
- [x] push sitemap baseline

#### Execution Log

- Task: PRE0 system sitemap baseline.
- Legacy refs: none; this is a Next route/API inventory from the active app.
- Files changed: `docs/migration/18-next-system-sitemap.md`, `docs/migration/17-next-remaining-modules-progress.md`.
- DB/API changes: docs-only; no runtime API changes.
- Buttons/actions checked: deferred to each module/page batch; this PRE pass records route/page/API/permission coverage first.
- Modal/form checked: deferred to each module/page batch.
- Validation added: sitemap maintenance rule documented in `18-next-system-sitemap.md`.
- Playwright smoke: not run; docs-only baseline with no UI/runtime changes.
- Commands: `git diff --check` passed.
- Result: route inventory baseline created; `/stock/balance` confirmed placeholder and remains the next Batch S target.
- Commit: this checkpoint (`docs: add system map api baseline`).

### PRE1: OpenAPI Skeleton

#### PRE1.1 Spec Foundation

- [x] สร้าง `docs/api/openapi.yaml`
- [x] กำหนด OpenAPI version, title, version, server placeholders
- [x] กำหนด security scheme สำหรับ Supabase/session auth โดยไม่ใส่ secret
- [x] กำหนด tags ตามหมวด: Master Data, Daily, Production, Stock, Finance, Tracking, Admin

#### PRE1.2 Existing API Catalog

- [x] ใส่ API ที่มีจริงตอนนี้แบบ skeleton ก่อน
- [x] ใส่ path, method, tag, summary, auth requirement
- [x] ใส่ common error response schema
- [x] ยังไม่ต้องละเอียดทุก field ถ้า endpoint ซับซ้อน

#### PRE1.3 OpenAPI Maintenance Rule

- [x] เพิ่ม note ใน tracker ว่า API ใหม่ทุกตัวต้องอัปเดต OpenAPI ใน batch เดียวกัน
- [x] เพิ่ม sitemap/OpenAPI check เข้า QA checklist ของแต่ละ page batch
- [x] commit OpenAPI baseline
- [x] push OpenAPI baseline

#### Execution Log

- Task: PRE1 OpenAPI skeleton and existing API catalog baseline.
- Legacy refs: none; this is a Next route handler inventory from `apps/next/src/app/api`.
- Files changed: `docs/api/openapi.yaml`, `docs/migration/17-next-remaining-modules-progress.md`.
- DB/API changes: docs-only; no runtime API changes.
- Buttons/actions checked: not applicable.
- Modal/form checked: not applicable.
- Validation added: common auth/error/list response components and broad route skeletons.
- Playwright smoke: not run; docs-only baseline with no UI/runtime changes.
- Commands: `git diff --check` passed; `npx --yes @redocly/cli lint docs/api/openapi.yaml` validated the OpenAPI file with skeleton-level warnings.
- Result: OpenAPI skeleton created for current endpoint groups; detailed request/response schemas, `operationId`, tag descriptions, and full 4XX responses remain per-module hardening work.
- Commit: this checkpoint (`docs: add system map api baseline`).

## Batch S: Stock

Priority: สูง เพราะเป็นฐานของ purchase, sales, production, costing และ finance reports

### S0: Legacy Inventory and DB Mapping

- [x] สำรวจ legacy pages:
  - `/stock/balance`
  - `/stock/ledger`
  - `/stock/status-convert`
  - `/stock/convert`
  - `/stock/adjust`
  - `/stock/customer-return`
- [x] สรุป field/filter/button/modal/action ต่อหน้า
- [x] map DB tables/columns ที่มีใน dev-target
- [x] ระบุ movement types/ref types ที่ใช้จริง
- [x] ระบุจุดที่ต้องเขียน stock ledger
- [x] สรุปภาพรวม flow ทั้งหมวดก่อนเริ่ม S1
- [x] สรุป dependency/page order ของ Stock

#### S0 Module Overview

- Legacy refs:
  - `old-apps/vue/src/views/stock/StockBalanceView.vue`
  - `old-apps/vue/src/views/stock/StockLedgerView.vue`
  - `old-apps/vue/src/views/stock/StockAdjustView.vue`
  - `old-apps/vue/src/views/stock/GradeStatusConvertView.vue`
  - `old-apps/vue/src/views/stockGaps/StatusConvertView.vue`
  - `old-apps/vue/src/views/stockGaps/CustomerReturnView.vue`
- Shared flow summary:
  - `stock_ledger` is the source of truth for balance and movement history.
  - Stock Balance aggregates ledger rows by product, branch, warehouse, lot, status/output category, and available flag.
  - Status convert and grade convert create paired out/in ledger movements.
  - Stock count adjustment creates one ledger movement with qty only and value = 0, keeping value impact as note/audit data.
  - Customer return creates stock-in with `not_available_for_sale` and send-back creates stock-out.
- Shared DB/table mapping:
  - `stock_ledger`: all movement and balance source.
  - `stock_adjustments`: stock count adjustment header/audit row.
  - `grade_adjustments`: grade/product conversion audit row.
  - `products`, `branches`, `warehouses`, `customers`: lookup/display and form options.
  - Existing related transaction sources: `purchase_bills`, `sales_bills`, `stock_issues`, `production_*`.
- Movement/ref mapping:
  - `PB`: purchase bill stock in.
  - `SB`: sales bill stock out.
  - `ST`: stock transfer out/in.
  - `SC`: status convert out/in.
  - `GA`: grade/product convert out/in.
  - `ADJ`: stock count loss/gain.
  - `CR`: customer return in/send-back out.
- Side effects/reconciliation:
  - All new stock writes must leave traceable `ref_id`, `ref_no`, and `ref_type`.
  - Paired flows (`SC`, `GA`, `ST`) must balance source out and target in by ref.
  - `ADJ` intentionally changes qty but keeps ledger value zero until accounting policy is confirmed.
  - Customer-return stock is separated from saleable stock with `not_available_for_sale`.
- Page implementation order:
  - S1 Stock Balance, S2 Stock Ledger, S3 Status Convert, S4 Grade Adjustment, S5 Stock Count Adjust, S6 Customer Return, S7 QA.
- Risks/open decisions:
  - WAC/cost-source policy for transfer, conversion, sale, and production is still a follow-up hardening decision.
  - Void/reversal is not implemented for new stock writes in this batch.
  - Branch-scope enforcement still depends on the broader auth/permission follow-up.
  - Header/line relational redesign is still pending for purchase/sales; stock APIs currently work with existing ledger source.

### S1: Stock Balance

#### S0.1 Stock API Contract Hardening

- [x] เพิ่ม `operationId` ให้ stock endpoints ที่แตะใน batch นี้
- [x] เพิ่ม query parameters จริงของ `/api/stock/ledger` และ `/api/stock/balance`
- [x] เพิ่ม request schemas ของ write flows: status convert, convert, adjust, customer return
- [x] เพิ่ม stock response schemas สำหรับ balance, ledger, operation list, และ write result
- [x] lint OpenAPI หลังจบ batch

#### S1.1 Legacy/API

- [x] ตรวจ legacy field/filter/button/modal/action ของ Stock Balance
- [x] API `/api/stock/balance`
- [x] backend aggregation จาก `stock_ledger`
- [x] define query params: product, branch, warehouse, status/category/lot/date

#### S1.2 UI

- [x] Page `/stock/balance`
- [x] filter bar
- [x] table: product, branch, warehouse, qty, value, avg cost, available/not available
- [x] summary cards

#### S1.3 Actions/Modal/Export

- [x] action buttons: refresh/export/detail
- [x] detail modal: balance row detail
- [x] export `.xlsx`

#### S1.4 QA

- [x] API smoke
- [x] browser smoke
- [ ] docs/type/lint/build/commit/push

### S2: Stock Ledger Polish

#### S2.1 Legacy/API

- [x] ตรวจ legacy stock ledger field/action
- [x] เพิ่ม query params/ref type/product/date/branch/warehouse
- [x] pagination backend
- [x] ตรวจ running balance calculation

#### S2.2 UI

- [x] ปรับ `/stock/ledger`
- [x] filter bar
- [x] sort/pagination
- [x] summary cards

#### S2.3 Actions/Modal/Export

- [ ] row detail modal
- [x] export `.xlsx`
- [x] refresh button

#### S2.4 QA

- [x] API smoke
- [x] browser smoke
- [ ] docs/type/lint/build/commit/push

### S3: Status Convert

#### S3.1 Legacy/API/DB

- [x] ตรวจ legacy status convert flow
- [x] API `/api/stock/status-convert`
- [x] schema/table decision ถ้าต้องมี header table
- [x] stock ledger movement mapping

#### S3.2 UI

- [x] Page `/stock/status-convert`
- [x] list/filter baseline
- [x] summary cards

#### S3.3 Modal/Form/Validation

- [x] modal/form ปรับสถานะ RM/WIP/FG
- [x] validate product, branch, warehouse, qty, status from/to, reason
- [ ] field-level validation errors

#### S3.4 Write/Reconcile/QA

- [x] write stock ledger แบบ traceable
- [x] reconciliation: qty out/in ต้อง balance by ref design
- [ ] docs/type/lint/build/commit/push

### S4: Grade Adjustment / Convert

#### S4.1 Legacy/API/DB

- [x] ตรวจ legacy grade adjustment/convert flow
- [x] API `/api/stock/convert`
- [x] cost rule documented ก่อน write
- [x] stock ledger out/in mapping

#### S4.2 UI

- [x] Page `/stock/convert`
- [x] list/filter baseline

#### S4.3 Modal/Form/Validation

- [x] modal/form ปรับเกรด/แปลงสินค้า
- [x] validate source/destination product, qty, lot, reason

#### S4.4 Write/Reconcile/QA

- [x] stock ledger out/in
- [ ] reconciliation query
- [ ] docs/type/lint/build/commit/push

### S5: Stock Count Adjust

#### S5.1 Legacy/API/DB

- [x] ตรวจ legacy stock adjust flow
- [x] API `/api/stock/adjust`
- [x] header/detail table decision
- [x] adjustment movement mapping

#### S5.2 UI

- [x] Page `/stock/adjust`
- [x] list/filter baseline

#### S5.3 Modal/Form/Validation

- [x] modal/form นับสต๊อก/ปรับยอด
- [x] validate counted qty, system qty, adjustment reason
- [x] require audit note

#### S5.4 Write/Reconcile/QA

- [x] write adjustment movement
- [ ] reconciliation query
- [ ] docs/type/lint/build/commit/push

### S6: Customer Return

#### S6.1 Legacy/API/DB

- [x] ตรวจ legacy customer return flow
- [x] API `/api/stock/customer-return`
- [x] source sale/customer link rule baseline
- [x] not-available-for-sale rule

#### S6.2 UI

- [x] Page `/stock/customer-return`
- [x] list/filter baseline

#### S6.3 Modal/Form/Validation

- [x] modal/form รับคืนลูกค้า
- [x] validate customer, product, qty, reason, warehouse

#### S6.4 Write/Reconcile/QA

- [x] stock ledger with `not_available_for_sale` where applicable
- [x] link to customer if source exists
- [ ] docs/type/lint/build/commit/push

### S7: Stock QA Batch

- [x] QA checker ตรวจทุก stock page
- [x] Browser smoke desktop/mobile
- [x] API smoke 200
- [x] docs update
- [x] type/lint/build
- [x] commit/push

Execution notes:

- Desktop browser smoke: `/stock/balance`, `/stock/ledger`, `/stock/status-convert`, `/stock/convert`, `/stock/adjust`, `/stock/customer-return` returned HTTP 200 after login and did not show login/error states.
- Mobile browser smoke at 390x844: read pages and write forms loaded without visible error states.
- Authenticated API smoke: `/api/stock/balance`, `/api/stock/ledger`, `/api/stock/status-convert`, `/api/stock/convert`, `/api/stock/adjust`, `/api/stock/customer-return` returned HTTP 200.
- Write form smoke: `/stock/status-convert?new=1`, `/stock/convert?new=1`, `/stock/adjust?new=1`, `/stock/customer-return?new=1` rendered form title, fields, `ยกเลิก`, and `บันทึก`; no submit was performed.
- OpenAPI lint: `npx --yes @redocly/cli lint docs/api/openapi.yaml --max-problems 200` passed validity with existing skeleton-level warnings outside stock hardening scope.
- Validation: `git diff --check`, `npm run type-check --workspace @ns-scrap-erp/next`, `npm run lint --workspace @ns-scrap-erp/next`, and `npm run build --workspace @ns-scrap-erp/next` passed.
- Commit: `42ce82b feat: add stock module baselines` pushed to `main`.

## Batch F: Finance and Debt

Priority: สูง เพราะผูกกับ AP/AR/payment/receipt/bank statement

### F0: Legacy Inventory and DB Mapping

- [x] สำรวจ legacy: AR, AP, bank statement, cash position, supplier advance, customer advance
- [x] map payment/receipt/bank_statement/accounts/purchase_bills/sales_bills
- [x] ระบุ write flows ที่กระทบเงิน
- [x] สรุปภาพรวม flow ทั้งหมวดก่อนเริ่ม F1
- [x] สรุป dependency/page order ของ Finance and Debt

#### F0 Module Overview

- Legacy refs:
  - `old-apps/vue/src/views/finance/ArView.vue`
  - `old-apps/vue/src/views/finance/ApView.vue`
  - `old-apps/vue/src/views/finance/BankStatementView.vue`
  - `old-apps/vue/src/views/finance/CashPositionView.vue`
  - `old-apps/vue/src/views/finance/SupplierAdvanceView.vue`
  - `old-apps/vue/src/views/finance/CustomerAdvanceView.vue`
  - `old-apps/vue/src/views/purchase/SupplierPaymentsView.vue`
  - `old-apps/vue/src/views/sales/CustomerReceiptsView.vue`
  - `old-apps/vue/src/views/daily/PettyAdvanceView.vue`
  - `old-apps/vue/src/views/daily/PaymentApprovalView.vue`
- Shared flow summary:
  - Finance/debt is a reconciliation and cash visibility layer over purchase, sales, daily payment, receipt, transfer, petty advance, and bank statement rows.
  - AR should reconcile `sales_bills.total_amount` against receipts allocated by `receipts.bill_id`.
  - AP should reconcile `purchase_bills.total_amount` against payments allocated by `payments.bill_id`; a read baseline already exists at `/finance/ap`.
  - Bank statement should read `bank_statement` as the ledger of money movement side effects before adding or changing write flows.
  - Cash position aggregates account balances plus upcoming AR/AP exposure; it should follow AR/AP/bank baseline work.
- Shared DB/table mapping:
  - AR: `sales_bills`, `receipts`, `customers`, `branches`, `sales_channels`.
  - AP: `purchase_bills`, `payments`, `suppliers`, `branches`, `purchase_channels`.
  - Bank/cash: `bank_statement`, `accounts`, `branches`.
  - Advance surfaces: supplier/customer advance logic is not clear enough for write mutations yet; read baseline first.
- Shared side effects/reconciliation rules:
  - Money-moving writes already exist in `/purchase/payments`, `/sales/receipts`, `/daily/petty-advance`, `/daily/transfer`, and payment approval surfaces.
  - Bank statement rows are side effects from multiple flows, so reconciliation must detect duplicate/missing rows before mutation changes.
  - AR/AP allocation must not assume one bill = one receipt/payment; partial and multi-line allocation remain likely.
- Button/action/modal/export inventory:
  - AR/AP need filter/search, aging bucket summary, detail modal, and `.xlsx` export.
  - Bank statement needs account/date/ref-type filters, running balance, detail modal, and `.xlsx` export.
  - Cash position needs account cards and drilldowns, not write buttons in the first pass.
  - Supplier/customer advance pages should expose read detail first; allocation forms are deferred until rules are confirmed.
- Dependency/page order:
  1. F1 AR page/API.
  2. F2 AP polish on the existing baseline.
  3. F3 Bank Statement read/reconciliation baseline.
  4. F4 Cash Position aggregation.
  5. F5 Supplier Advance read baseline.
  6. F6 Customer Advance read baseline.
  7. F7 finance QA batch.
- Risks/open decisions:
  - Allocation source of truth for multi-bill receipt/payment lines needs confirmation from real data.
  - Bank statement duplicate cleanup/reconciliation must be checked before adding write-side changes.
  - Advance allocation rules are not yet safe to infer from placeholders.

#### Execution Log

- Task: F0 legacy inventory and DB mapping.
- Legacy refs: listed in F0 Module Overview above.
- Files changed: `docs/migration/00-current-work.md`, `docs/migration/17-next-remaining-modules-progress.md`.
- DB/API changes: docs-only; no runtime API changes.
- Buttons/actions checked: inventory only; implementation begins at F1.
- Modal/form checked: inventory only; implementation begins at F1.
- Validation added: module-level order and write-flow risk boundaries.
- Playwright smoke: not run; docs-only overview checkpoint.
- Commands: `git diff --check` required before commit.
- Result: F0 overview documented; F1 AR is the next implementation slice.
- Commit: pending.

### F1: AR

- [x] API `/api/finance/ar`
- [x] Page `/finance/ar`
- [x] read from `sales_bills` + `receipts`
- [x] aging buckets
- [x] filters: customer/date/status/branch
- [x] row detail modal
- [x] export `.xlsx`

#### Execution Log

- Task: F1 AR read/report baseline.
- Legacy refs: `old-apps/vue/src/views/finance/ArView.vue`, `old-apps/vue/src/views/sales/CustomerReceiptsView.vue`.
- Files changed: `apps/next/src/app/api/finance/ar/route.ts`, `apps/next/src/app/finance/ar/page.tsx`, `apps/next/src/components/finance/AccountsReceivablePageClient.tsx`, `docs/api/openapi.yaml`, `docs/migration/18-next-system-sitemap.md`, this tracker.
- DB/API changes: added `GET /api/finance/ar`; no schema migration; reads `sales_bills`, `receipts`, `customers`, `branches`, `sales_channels`.
- Buttons/actions checked: summary/detail tabs, filters, sort buttons, pagination, export `.xlsx`, row detail open/close.
- Modal/form checked: row detail modal only; no write form in F1.
- Validation added: server query parsing, pagination bounds, AR aging buckets, OpenAPI parameters.
- Playwright smoke: desktop `/finance/ar` loaded with `GET /api/finance/ar` 200, search/filter narrowed rows, detail modal opened/closed, export endpoint returned `.xlsx` 200; mobile 390x844 loaded with API 200 and no new console warning/error.
- Commands: `git diff --check`; `npm run type-check --workspace @ns-scrap-erp/next`; `npm run lint --workspace @ns-scrap-erp/next`; `npm run build --workspace @ns-scrap-erp/next`; `npx --yes @redocly/cli lint docs/api/openapi.yaml --max-problems 200`.
- Result: F1 AR read/report baseline validated. OpenAPI remains valid with existing skeleton warnings outside this endpoint.
- Commit: `4e239fd feat: add finance ar baseline` pushed to `main`.

### F2: AP Polish

- [x] ตรวจ `/finance/ap` ที่มีแล้ว
- [x] เพิ่ม filter/sort/pagination/export/detail modal ตาม legacy
- [x] reconcile paid/payable from `payments`

#### Execution Log

- Task: F2 AP polish.
- Legacy refs: `old-apps/vue/src/views/finance/ApView.vue`, `old-apps/vue/src/views/purchase/SupplierPaymentsView.vue`.
- Files changed: `apps/next/src/app/api/finance/ap/route.ts`, `apps/next/src/components/purchase-flow/AccountsPayablePageClient.tsx`, `docs/api/openapi.yaml`, this tracker.
- DB/API changes: enhanced `GET /api/finance/ap`; no schema migration; reads `purchase_bills`, `payments`, `suppliers`, `branches`, `purchase_channels`.
- Buttons/actions checked: summary/detail tabs, filters, sort buttons, pagination, export `.xlsx`, row detail open/close.
- Modal/form checked: row detail modal only; no write form in F2.
- Validation added: server query parsing, pagination bounds, AP aging buckets, OpenAPI parameters.
- Playwright smoke: desktop `/finance/ap` loaded with `GET /api/finance/ap` 200, search/filter narrowed rows, detail modal opened, export endpoint returned `.xlsx` 200; mobile 390x844 loaded with API 200 and no new console warning/error.
- Commands: `git diff --check`; `npm run type-check --workspace @ns-scrap-erp/next`; `npm run lint --workspace @ns-scrap-erp/next`; `npm run build --workspace @ns-scrap-erp/next`; `npx --yes @redocly/cli lint docs/api/openapi.yaml --max-problems 200`.
- Result: F2 AP polish validated. OpenAPI remains valid with existing skeleton warnings outside hardened finance endpoints.
- Commit: this checkpoint.

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

### T0: Module Overview

- [ ] สำรวจ legacy tracking pages ทั้ง customer/supplier/product
- [ ] map shared data sources: customers, suppliers, products, purchase/sales bills, payments/receipts, stock ledger
- [ ] สรุป shared filters: year/month/party/product/salesperson/branch
- [ ] สรุป shared detail/export pattern
- [ ] สรุป page order และ risk

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
- [ ] สรุปภาพรวม dual costing/trading/PO ก่อนเริ่ม D1
- [ ] สรุป dependency/page order

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

### FF0: Module Overview

- [ ] สำรวจ legacy foreign finance pages
- [ ] map shared data: currencies, fx rates, accounts, beneficiaries, remittance purposes, bank statement
- [ ] สรุป flow เงินเข้า/ออกต่างประเทศและ FX gain/loss
- [ ] สรุป bank statement/FCD ledger side effects
- [ ] สรุป page order และ risk

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

### A0: Module Overview

- [ ] สำรวจ legacy finance/accounting pages ทั้งหมด
- [ ] map shared data: purchase/sales, AP/AR, bank, stock value, tax, assets, loans, opening balances
- [ ] สรุปว่าอะไรเป็น read/report baseline และอะไรต้องรอ GL/accounting design
- [ ] สรุป report dependency และ page order
- [ ] สรุป risk/open decisions

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

### M0: Module Overview

- [ ] สำรวจ legacy main dashboard/owner daily/control pages
- [ ] map shared KPI sources: purchase, sales, stock, finance, production, tracking
- [ ] สรุป dashboard card/chart/table ที่ต้องใช้ร่วมกัน
- [ ] สรุป page order และ dependency
- [ ] สรุป risk/open decisions

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

### SYS0: Module Overview

- [ ] สำรวจ system/admin pages ที่เหลือ
- [ ] map auth/permission/audit/migration-tool requirements
- [ ] สรุป safety constraints สำหรับ destructive/admin actions
- [ ] สรุป route cleanup/full QA strategy

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

1. Batch PRE: System Map and API Contract Baseline
2. Batch S: Stock
3. Batch F: Finance and Debt
4. Batch T: Tracking 360
5. Batch D: Dual Costing / Trading / PO
6. Batch FF: Foreign Finance
7. Batch A: Finance / Accounting
8. Batch M: Main Dashboards and Operational Control
9. Batch SYS: System and Cleanup
