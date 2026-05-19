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
- Commit: `a5ec099` (`docs: start finance debt batch`), pushed to `main`.

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
- Commit: `1331a79 feat: polish finance ap baseline` pushed to `main`.

### F3: Bank Statement

- [x] API `/api/finance/bank`
- [x] Page `/finance/bank`
- [x] read `bank_statement`
- [x] filters: account/date/ref type/type
- [x] running balance
- [x] detail modal
- [x] export `.xlsx`

#### Execution Log

- Task: F3 Bank Statement read/reconciliation baseline.
- Legacy refs: `old-apps/vue/src/views/finance/BankStatementView.vue`, legacy cleanup/reconciliation references in `old-apps/legacy/index.html` around `bank_statement`.
- Files changed: `apps/next/src/app/api/finance/bank/route.ts`, `apps/next/src/app/finance/bank/page.tsx`, `apps/next/src/components/finance/BankStatementPageClient.tsx`, `docs/api/openapi.yaml`, `docs/migration/18-next-system-sitemap.md`, this tracker.
- DB/API changes: added `GET /api/finance/bank`; no schema migration; reads `bank_statement` and `accounts`.
- Buttons/actions checked: summary/detail tabs, account/date/ref/type/search filters, date sort toggle, pagination, export `.xlsx`, row detail open/close.
- Modal/form checked: row detail modal only; no write form in F3.
- Validation added: server query parsing, pagination bounds, running balance fallback from account opening balance plus visible ledger flow, OpenAPI parameters.
- Playwright smoke: desktop `/finance/bank` loaded with `GET /api/finance/bank` 200, detail modal opened, export endpoint returned `.xlsx` 200; mobile 390x844 loaded with API 200 and no new console warning/error.
- Commands: `git diff --check`; `npm run type-check --workspace @ns-scrap-erp/next`; `npm run lint --workspace @ns-scrap-erp/next`; `npm run build --workspace @ns-scrap-erp/next`; `npx --yes @redocly/cli lint docs/api/openapi.yaml --max-problems 200`.
- Result: F3 Bank Statement read/reconciliation baseline validated. OpenAPI remains valid with existing skeleton warnings outside hardened finance endpoints.
- Commit: `a48d655 feat: add finance bank statement baseline` pushed to `main`.

### F4: Cash Position

- [x] API `/api/finance/cash-position`
- [x] Page `/finance/cash-position`
- [x] aggregate cash/bank balances
- [x] upcoming receivable/payable summary
- [x] account group cards

#### Execution Log

- Task: F4 Cash Position aggregation baseline.
- Legacy refs: `old-apps/vue/src/views/finance/CashPositionView.vue`.
- Files changed: `apps/next/src/app/api/finance/cash-position/route.ts`, `apps/next/src/app/finance/cash-position/page.tsx`, `apps/next/src/components/finance/CashPositionPageClient.tsx`, `docs/api/openapi.yaml`, `docs/migration/18-next-system-sitemap.md`, this tracker.
- DB/API changes: added `GET /api/finance/cash-position`; no schema migration; reads `accounts`, `bank_statement`, `sales_bills`, `receipts`, `purchase_bills`, `payments`.
- Buttons/actions checked: read-only page with refresh on load; no mutation buttons.
- Modal/form checked: none in F4.
- Validation added: account balance aggregation and AR/AP exposure buckets.
- Playwright smoke: desktop `1440x900` and mobile `390x844` loaded `/finance/cash-position`; `GET /api/finance/cash-position` returned `200`; no console warnings/errors.
- Commands: `git diff --check`, `npm run type-check --workspace @ns-scrap-erp/next`, `npm run lint --workspace @ns-scrap-erp/next`, `npm run build --workspace @ns-scrap-erp/next`, `npx --yes @redocly/cli lint docs/api/openapi.yaml --max-problems 200`.
- Result: validated; OpenAPI remains valid with existing skeleton warnings.
- Commit: `5f1f11c` (`feat: add finance cash position baseline`), pushed to `main`.

### F5: Supplier Advance

- [x] API `/api/finance/supplier-advance`
- [x] Page `/finance/supplier-advance`
- [x] read baseline first
- [ ] modal/form only after allocation rule clear

#### Execution Log

- Task: F5 Supplier Advance read baseline.
- Legacy refs: `old-apps/vue/src/views/finance/SupplierAdvanceView.vue`, legacy `view-supplierAdvance` in `old-apps/legacy/index.html`.
- Files changed: `apps/next/src/app/api/finance/supplier-advance/route.ts`, `apps/next/src/app/finance/supplier-advance/page.tsx`, `apps/next/src/components/finance/SupplierAdvancePageClient.tsx`, `docs/api/openapi.yaml`, `docs/migration/18-next-system-sitemap.md`, this tracker.
- DB/API changes: added `GET /api/finance/supplier-advance`; no schema migration; reads `bank_statement` rows with `ref_type = 'SADV'`, plus `suppliers` and `accounts`.
- Source/schema note: dev-target currently has no `supplier_advances` or `advance_allocations` table and no `SADV` bank rows; allocation is exposed as missing source metadata, not guessed.
- Buttons/actions checked: read-only page with filters and `.xlsx` export; no create/cancel/allocation mutation.
- Modal/form checked: intentionally deferred until allocation rule and table ownership are confirmed.
- Validation added: query parsing, date/search/status/supplier filters, summary totals, source schema metadata.
- Playwright smoke: desktop `1440x900` and mobile `390x844` loaded `/finance/supplier-advance`; `GET /api/finance/supplier-advance?pageSize=100` returned `200`; `.xlsx` export returned `200`; no console warnings/errors.
- Commands: `git diff --check`, `npm run type-check --workspace @ns-scrap-erp/next`, `npm run lint --workspace @ns-scrap-erp/next`, `npm run build --workspace @ns-scrap-erp/next`, `npx --yes @redocly/cli lint docs/api/openapi.yaml --max-problems 200`.
- Result: validated; OpenAPI remains valid with existing skeleton warnings.
- Commit: `d4f9a8c` (`feat: add finance supplier advance baseline`), pushed to `main`.

### F6: Customer Advance

- [x] API `/api/finance/customer-advance`
- [x] Page `/finance/customer-advance`
- [x] read baseline first
- [ ] modal/form only after allocation rule clear

#### Execution Log

- Task: F6 Customer Advance read baseline.
- Legacy refs: `old-apps/vue/src/views/finance/CustomerAdvanceView.vue`, legacy `view-customerAdvance` in `old-apps/legacy/index.html`.
- Files changed: `apps/next/src/app/api/finance/customer-advance/route.ts`, `apps/next/src/app/finance/customer-advance/page.tsx`, `apps/next/src/components/finance/CustomerAdvancePageClient.tsx`, `docs/api/openapi.yaml`, `docs/migration/18-next-system-sitemap.md`, this tracker.
- DB/API changes: added `GET /api/finance/customer-advance`; no schema migration; reads `bank_statement` rows with `ref_type = 'CADV'`, plus `customers` and `accounts`.
- Source/schema note: dev-target currently has no `customer_advances` or `advance_allocations` table and no `CADV` bank rows; allocation is exposed as missing source metadata, not guessed.
- Buttons/actions checked: read-only page with filters and `.xlsx` export; no create/cancel/allocation mutation.
- Modal/form checked: intentionally deferred until allocation rule and table ownership are confirmed.
- Validation added: query parsing, date/search/status/customer filters, summary totals, source schema metadata.
- Playwright smoke: desktop `1440x900` and mobile `390x844` loaded `/finance/customer-advance`; `GET /api/finance/customer-advance?pageSize=100` returned `200`; `.xlsx` export returned `200`; no console warnings/errors.
- Commands: `git diff --check`, `npm run type-check --workspace @ns-scrap-erp/next`, `npm run lint --workspace @ns-scrap-erp/next`, `npm run build --workspace @ns-scrap-erp/next`, `npx --yes @redocly/cli lint docs/api/openapi.yaml --max-problems 200`.
- Result: validated; OpenAPI remains valid with existing skeleton warnings.
- Commit: `77930c8` (`feat: add finance customer advance baseline`), pushed to `main`.

### F7: Finance QA Batch

- [x] QA checker ตรวจทุก finance page
- [x] AP/AR/bank reconciliation smoke
- [x] type/lint/build
- [x] commit/push

#### Execution Log

- Task: F7 Finance QA checkpoint after F1-F6.
- Scope checked: `/finance/ar`, `/finance/ap`, `/finance/bank`, `/finance/cash-position`, `/finance/supplier-advance`, `/finance/customer-advance`.
- API/export checked during slices: AR/AP/bank/cash-position/supplier-advance/customer-advance APIs returned `200`; `.xlsx` export checked for AR/AP/bank/supplier-advance/customer-advance.
- Browser smoke checked during slices: desktop and mobile smoke completed for each implemented finance page; no console warnings/errors recorded in the latest page-specific smoke checks.
- Commands: latest finance batch validation included `git diff --check`, `npm run type-check --workspace @ns-scrap-erp/next`, `npm run lint --workspace @ns-scrap-erp/next`, `npm run build --workspace @ns-scrap-erp/next`, `npx --yes @redocly/cli lint docs/api/openapi.yaml --max-problems 200`.
- Result: Finance/debt read baseline batch F1-F6 is validated and pushed. Supplier/customer advance remain read-only because dev-target has no dedicated advance/allocation tables yet.
- Commit: `1c0b5c7` (`docs: add finance qa checkpoint`), pushed to `main`.

## Batch T: Tracking 360

### T0: Module Overview

- [x] สำรวจ legacy tracking pages ทั้ง customer/supplier/product
- [x] map shared data sources: customers, suppliers, products, purchase/sales bills, payments/receipts, stock ledger
- [x] สรุป shared filters: year/month/party/product/salesperson/branch
- [x] สรุป shared detail/export pattern
- [x] สรุป page order และ risk

#### Module Overview

- Legacy/Vue refs:
  - `old-apps/vue/src/views/trackingDashboards/CustomerTrackingView.vue`
  - `old-apps/vue/src/views/trackingDashboards/SupplierTrackingView.vue`
  - `old-apps/vue/src/views/trackingDashboards/ProductTrackingView.vue`
- Current Next state:
  - `/tracking/supplier` has a read baseline through `GET /api/tracking/supplier`.
  - `/tracking/customer` has a read baseline through `GET /api/tracking/customer`.
  - `/tracking/product` is in progress as a read/report baseline through planned `GET /api/tracking/product`.
- Shared source tables:
  - Customer tracking: `customers`, `sales_bills`, `receipts`, optionally `products`, `salespersons`, `branches`.
  - Supplier tracking: `suppliers`, `purchase_bills`, `payments`, optionally `products`, `branches`.
  - Product tracking: `products`, `stock_ledger`, `purchase_bills`, `sales_bills`, optionally production outputs/inputs when product flow needs production detail.
- Shared filter pattern:
  - `year`, `month`, party/product selector, search text.
  - Add `branchId` and `salespersonId` only where the backing table has reliable columns.
- Shared output pattern:
  - summary cards, monthly trend, ranked table, top/bottom lists, detail drilldown, `.xlsx` export.
  - Keep CSV/export labels consistent with existing Next finance/stock exports; prefer `.xlsx` for active app.
- Page order:
  - T1 Customer Tracking first because it mirrors AR/sales data already normalized in finance F1.
  - T2 Supplier Tracking polish second because a baseline already exists and can be extended without new route shell.
  - T3 Product Tracking third because stock/sales/purchase/production joins are broader and riskier.
  - T4 QA batch last, using light checks unless code changed since the previous validation.
- Risks:
  - Legacy tracking pages contain visual fixture arrays, not authoritative business logic.
  - Purchase/sales bill item JSON shapes are not fully normalized; product-level tracking must tolerate missing item detail and document fallback behavior.
  - Production contribution to product tracking should remain read-only until product-output mapping is confirmed.

#### Execution Log

- Task: T0 Tracking 360 inventory and target order.
- Files changed: this tracker and current work handoff.
- DB/API changes: docs-only; no runtime API or schema changes.
- Validation: `git diff --check`.
- Result: inventory complete; T1 Customer Tracking is next.
- Commit: this T0 checkpoint.

### T1: Customer Tracking

- [x] API `/api/tracking/customer`
- [x] Page `/tracking/customer`
- [x] customer profile, sales, receipts, outstanding
- [x] filters: year/month/customer/search
- [x] export
- [ ] product trend/detail drilldown after item JSON contract is confirmed

#### Execution Log

- Task: T1 Customer Tracking read baseline.
- Legacy refs: `old-apps/vue/src/views/trackingDashboards/CustomerTrackingView.vue`.
- Files changed: `apps/next/src/app/api/tracking/customer/route.ts`, `apps/next/src/app/tracking/customer/page.tsx`, `apps/next/src/components/tracking/CustomerTrackingPageClient.tsx`, `docs/api/openapi.yaml`, `docs/migration/18-next-system-sitemap.md`, this tracker.
- DB/API changes: added `GET /api/tracking/customer`; no schema migration; reads `customers`, `sales_bills`, `receipts`.
- Buttons/actions checked: read-only filters and `.xlsx` export; no write actions.
- Modal/form checked: no mutation form in T1; detail drilldown deferred until product-level item JSON contract is clearer.
- Validation added: year/month/customer/search filters, monthly trend, sales/receipt/receivable/GP summary.
- Playwright smoke: desktop `1440x900` and mobile `390x844` loaded `/tracking/customer`; `GET /api/tracking/customer?year=2026` returned `200`; `.xlsx` export returned `200`; no console warnings/errors.
- Commands: `git diff --check`, `npm run type-check --workspace @ns-scrap-erp/next`, `npm run lint --workspace @ns-scrap-erp/next`, `npm run build --workspace @ns-scrap-erp/next`, `npx --yes @redocly/cli lint docs/api/openapi.yaml --max-problems 120`.
- Result: validated; OpenAPI remains valid with existing skeleton warnings.
- Commit: `a83e5d1` (`feat: add customer tracking baseline`), pushed to `main`.

### T2: Supplier Tracking Polish

- [x] ตรวจ `/tracking/supplier` ที่มีแล้ว
- [x] เพิ่ม product breakdown
- [x] เพิ่ม `.xlsx` export
- [ ] detail drilldown แบบ modal/row-level หลัง normalize item JSON contract
- [ ] filter salesperson/branch/category where relevant

#### Execution Log

- Task: T2 Supplier Tracking polish.
- Legacy refs: `old-apps/vue/src/views/trackingDashboards/SupplierTrackingView.vue`.
- Files changed: `apps/next/src/app/api/tracking/supplier/route.ts`, `apps/next/src/components/purchase-flow/SupplierTrackingPageClient.tsx`, `docs/api/openapi.yaml`, this tracker.
- DB/API changes: no schema migration; extended `GET /api/tracking/supplier` with `byProduct` aggregation from `purchase_bills.items` and `.xlsx` export.
- Buttons/actions checked: read-only filters and `.xlsx` export; no write actions.
- Modal/form checked: no mutation form in T2; detail drilldown deferred until item JSON contract is normalized.
- Validation added: product breakdown tolerates missing item detail and uses fallback empty state.
- Playwright smoke: passed via QA subagent on `http://localhost:3100/tracking/supplier`; desktop `1440x900`, mobile `390x844`, no console errors, no failed network requests, page loaded, export link and product breakdown visible, JSON API 200, XLSX API 200 with spreadsheet content type and `PK` signature.
- Commands: `git diff --check` passed; `npm run type-check --workspace @ns-scrap-erp/next` passed; `npm run lint --workspace @ns-scrap-erp/next` passed; `npm run build --workspace @ns-scrap-erp/next` passed; `npx --yes @redocly/cli lint docs/api/openapi.yaml --max-problems 120` passed validity with existing skeleton warnings.
- Result: T2 Supplier Tracking polish implemented with product breakdown and `.xlsx` export; detail drilldown remains deferred until item JSON contract is normalized.
- Commit: `6fd570f feat: polish supplier tracking report` pushed to `main`.

### T3: Product Tracking

- [x] API `/api/tracking/product`
- [x] Page `/tracking/product`
- [x] purchase/sales/stock trend from `products`, `purchase_bills.items`, `sales_bills.items`, `stock_ledger`
- [ ] production trend - optional/deferred until production product mapping is confirmed
- [ ] product detail modal - deferred until item JSON contract is normalized
- [x] export `.xlsx`

#### Execution Log

- Task: T3 Product Tracking read/report baseline.
- Legacy refs: `REQUIREMENTS_LEGACY_PROTOTYPE.md:327`, `old-apps/legacy/index.html:27890`, `old-apps/vue/src/views/trackingDashboards/ProductTrackingView.vue`.
- Files changed: `apps/next/src/app/api/tracking/product/route.ts`, `apps/next/src/app/tracking/product/page.tsx`, `apps/next/src/components/tracking/ProductTrackingPageClient.tsx`, `docs/api/openapi.yaml`, `docs/migration/18-next-system-sitemap.md`, this tracker, current work handoff.
- DB/API changes: no schema migration; added `GET /api/tracking/product` with JSON response and `.xlsx` export.
- Buttons/actions checked: filters `year`, `month`, `q`, and export link; no write actions.
- Modal/form checked: no mutation form; product detail modal deferred until item JSON contract is normalized.
- Validation added: item JSON parsing tolerates `productId/product_id/code/name`, amount/qty/cost field variants, and keeps UUID/opaque IDs internal while showing code/name.
- Playwright smoke: authenticated main Playwright session passed `/tracking/product` desktop and mobile, JSON API 200, XLSX API 200 with spreadsheet content type and `PK` signature. QA subagent unauthenticated fallback correctly hit login/401 guard and was not treated as product-page failure.
- Commands: `git diff --check` passed; `npm run type-check --workspace @ns-scrap-erp/next` passed; `npm run lint --workspace @ns-scrap-erp/next` passed; `npm run build --workspace @ns-scrap-erp/next` passed; `npx --yes @redocly/cli lint docs/api/openapi.yaml --max-problems 120` passed validity with existing skeleton warnings.
- Result: T3 Product Tracking read/report baseline implemented; production trend and product detail modal remain deferred.
- Commit: `097a12c feat: add product tracking baseline` pushed to `main`.

### T4: Tracking QA Batch

- [x] QA checker
- [x] type/lint/build
- [ ] commit/push

#### Execution Log

- Task: T4 Tracking QA Batch.
- Legacy refs: not applicable; this is a cross-check of implemented Next tracking baselines.
- Files changed: `apps/next/src/app/api/tracking/product/route.ts`, `apps/next/src/components/tracking/ProductTrackingPageClient.tsx`, this tracker.
- DB/API changes: no schema migration; normalized Product Tracking slow mover payload in both `top.slowMovers` and `slowMovers`.
- Buttons/actions checked: customer/supplier/product export links and read filters; no write actions.
- Modal/form checked: no mutation forms in tracking baselines; product detail modal remains deferred until item JSON contract is normalized.
- Validation added: fixed Product Tracking slow movers so UI labels and API payload show stock qty/value, not sales qty/revenue.
- Playwright smoke: unauthenticated QA subagent confirmed login guards for all three tracking pages/APIs; authenticated main Playwright session confirmed Product Tracking page/export after the slow mover fix, and authenticated API checks confirmed customer/supplier/product JSON 200 plus XLSX 200 with `PK` signature.
- Commands: `git diff --check` passed; `npm run type-check --workspace @ns-scrap-erp/next` passed; `npm run lint --workspace @ns-scrap-erp/next` passed; `npm run build --workspace @ns-scrap-erp/next` passed; `npx --yes @redocly/cli lint docs/api/openapi.yaml --max-problems 120` passed validity with existing skeleton warnings.
- Result: Tracking 360 QA checkpoint passed after slow mover payload/UI correction. Carry-over: add `401` responses and detailed response schemas to OpenAPI, and expose product `productId`/`metalGroup`/`branchId` filters in UI if needed.
- Commit: `6c7d605 fix: align product slow movers tracking` pushed to `main`.

## Batch D: Dual Costing / Trading / PO

### D0: Legacy Inventory and DB Mapping

- [x] สำรวจ PO Sell, Cost Pool, Cost Allocator, Match Log, Deal Margin, Compare Margin, Trading Dashboard
- [x] map `po_buys`, `po_sells`, `trading_deals`, cost pool source
- [x] สรุปภาพรวม dual costing/trading/PO ก่อนเริ่ม D1
- [x] สรุป dependency/page order

#### D0 Module Overview

- Legacy/Vue refs:
  - PO Buy: `old-apps/vue/src/views/purchase/PoBuyView.vue`, `old-apps/legacy/index.html:21577`.
  - PO Sell: `old-apps/vue/src/views/sales/PoSellView.vue`, `old-apps/legacy/index.html:22171`.
  - Cost Pool: `old-apps/vue/src/views/dualCosting/CostPoolView.vue`, `old-apps/legacy/index.html:22535`, source helper `old-apps/legacy/index.html:5950`.
  - Cost Allocator: `old-apps/vue/src/views/dualCosting/CostAllocatorView.vue`, `old-apps/legacy/index.html:22694`.
  - Match Log: `old-apps/vue/src/views/dualCosting/MatchLogView.vue`, `old-apps/legacy/index.html:22907`.
  - Deal Margin / Compare Margin: `old-apps/vue/src/views/dualCosting/DealMarginView.vue`, `old-apps/vue/src/views/dualCosting/CompareMarginView.vue`, `old-apps/legacy/index.html:23082`, `old-apps/legacy/index.html:23213`.
  - Trading Dashboard / Matching: `old-apps/vue/src/views/dualCosting/TradingDashboardView.vue`, `old-apps/vue/src/views/dualCosting/TradingMatchingView.vue`, `old-apps/legacy/index.html:40502`, `old-apps/legacy/index.html:40805`.
- Visual refs:
  - `reports/frontend-visual-audit/po-sell-final/results.json`.
  - `reports/frontend-visual-audit/cost-allocator-final/results.json`.
  - `reports/frontend-visual-audit/match-log-final/results.json`.
  - Existing `poBuy`, `poSell`, `poOutstanding`, `costPool`, `dealMargin`, `compareMargin`, `tradingDashboard`, and `tradingMatching` desktop/mobile legacy/vue screenshots under `reports/frontend-visual-audit/`.
- Current Next state:
  - `/purchase/po-buy` and `GET /api/purchase/po-buy` exist as read baseline.
  - `/po-reports/outstanding` and `GET /api/po-reports/outstanding` exist as read baseline.
  - `/trading/matching` and `GET /api/trading/matching` exist as read baseline.
  - `/sales/po-sell`, `/trading/dashboard`, `/dual-costing/cost-pool`, `/dual-costing/cost-allocator`, `/dual-costing/match-log`, `/dual-costing/deal-margin`, and `/dual-costing/compare-margin` remain missing/placeholder.
- Shared DB/table mapping:
  - `po_buys`: PO purchase/cost reservation source with `items` JSON plus fallback single-line fields; `doc_no` is indexed but not unique.
  - `po_sells`: PO sell/deal target with `items` JSON plus fallback single-line fields; `doc_no` is indexed but not unique.
  - `purchase_bills`: actual buy bills, `items` JSON, `po_buy_id`, `transaction_mode`, and unique `doc_no`.
  - `sales_bills`: actual sell bills, `items` JSON, `po_sell_id`, `trading_from_purchase_id(s)`, COGS/GP fields, and unique `doc_no`.
  - `trading_deals`: matched purchase/sales records with FK to purchase/sales bills, product, supplier, customer; `deal_no` is not unique.
  - `stock_ledger`: movement source with `ref_type/ref_id/ref_no` and product/branch/warehouse FK only.
  - Lookup tables: `products`, `customers`, `suppliers`, `branches`, `sales_channels`.
- Shared flow summary:
  - PO Buy can represent delivery PO or costing-only/opening pool; do not assume every PO Buy becomes stock receipt.
  - PO Sell is the sales commitment target for deal costing; its match status depends on cost allocation/match logs.
  - Cost Pool is read-derived from PO Buy, purchase bill lines, production outputs, grade adjustments, and active matches.
  - Cost Allocator should be preview/simulation-first until the source formula and status transitions are confirmed.
  - Trading Dashboard/Matching uses trading-mode purchase/sales bills plus `trading_deals`; write actions need stricter idempotency and reversal rules before implementation.
- Buttons/actions/modal/export inventory:
  - PO Buy: search/date/status/purpose filters, create/edit/cancel, move delivery/costing purpose, export.
  - PO Sell: search/date/match status filters, create/edit/cancel, export.
  - Cost Pool: product/cost type/source/status/sort/available-only filters; derived read table.
  - Cost Allocator: source selector, allocation mode, auto match, manual qty adjust, confirm match.
  - Match Log: search/match type/cost type/PO/status filters, reverse action.
  - Deal Margin / Compare Margin: date/channel filters and export.
  - Trading Matching: tabs, show cancelled, new match modal, reverse/recalc/cleanup/pull cloud in legacy.
- Side effects and rules not to guess:
  - Do not implement PO write/cancel/cut, cost allocation, match confirm, match reverse, duplicate cleanup, or trading deal recalc until reconciliation/idempotency rules are explicitly designed.
  - Do not delete match history; reverse-style status changes are the legacy pattern.
  - Preserve meaningful document numbers as user-facing identifiers; keep UUID/opaque ids internal.
- Risks/open decisions:
  - `items` JSON remains non-normalized and sparse for `po_buys`; target line-table design is still carry-over.
  - `po_sells` has zero dev-target rows, so D1 must support empty state and not fake data.
  - Status names vary across PO/bills/trading (`Open`, `Received`, `Cancelled`, `paid`, `partial`, `Completed`, etc.); normalize display carefully but preserve raw status in read baselines.
  - `po_buys.doc_no`, `po_sells.doc_no`, and `trading_deals.deal_no` are not unique yet; write flows need running-number and uniqueness policy first.
- Implementation order:
  1. D1 PO Sell read baseline/API/page.
  2. D2 PO Buy polish against legacy filters/export/detail while keeping writes disabled.
  3. D3 Trading Dashboard read baseline.
  4. D4 Trading Matching polish read-only first.
  5. D5 Cost Pool read-derived baseline.
  6. D6 Cost Allocator preview-only baseline.
  7. D7 Match Log / Deal Margin / Compare Margin read/export baselines.

#### Execution Log

- Task: D0 Dual Costing / Trading / PO legacy inventory and DB mapping.
- Legacy refs: see D0 module overview refs above.
- Files changed: this tracker and current work handoff.
- DB/API changes: docs-only; no schema or runtime changes.
- Buttons/actions checked: inventoried per D0 module overview.
- Modal/form checked: inventoried; write modals/actions deferred until rules are confirmed.
- Validation added: none; docs-only checkpoint.
- Playwright smoke: not run; docs-only inventory.
- Commands: `git diff --check` passed.
- Result: D0 module overview completed; D1 PO Sell read baseline is next.
- Commit: `d858133 docs: map dual costing trading batch` pushed to `main`.

### D1: PO Sell

- [x] API `/api/sales/po-sell`
- [x] OpenAPI contract for `GET /api/sales/po-sell`
- [x] Sitemap route/API/table/permission coverage for `/sales/po-sell`
- [x] Page `/sales/po-sell`
- [x] filter/search read baseline
- [ ] modal baseline (deferred; read-only slice)
- [x] export

#### Execution Log

- Task: D1 PO Sell read baseline/API/page.
- Legacy refs: D0 PO Sell refs remain `old-apps/vue/src/views/sales/PoSellView.vue` and `old-apps/legacy/index.html:22171`.
- Files changed: `apps/next/src/app/api/sales/po-sell/route.ts`, `apps/next/src/app/sales/po-sell/page.tsx`, `apps/next/src/components/sales/PoSellPageClient.tsx`, `docs/api/openapi.yaml`, `docs/migration/18-next-system-sitemap.md`, `docs/migration/17-next-remaining-modules-progress.md`, `docs/migration/00-current-work.md`.
- DB/API changes: added runtime `GET /api/sales/po-sell` with `q`, `status`, `matchStatus`, and `format=json|xlsx`; response coverage includes JSON/XLSX, `401`, and `403`. Source tables recorded as `po_sells`, `customers`, `sales_channels`, `branches`, `products`, and `trading_deals` / match data. No schema migration.
- Buttons/actions checked: D1 remains read baseline only; create/edit/cancel/match allocation stays deferred.
- Modal/form checked: modal baseline not implemented in this read-only slice.
- Validation added: OpenAPI documents `docNo` as the user-facing document identifier; UUID/opaque ids remain internal.
- Playwright smoke: authenticated `/sales/po-sell` render passed on desktop/mobile; `GET /api/sales/po-sell` returned `200` with zero dev rows; XLSX export returned `200`, spreadsheet content type, and `PK` signature. Subagent unauth smoke confirmed route/API guards return login/`401`.
- Commands: `git diff --check`, `npm run type-check --workspace @ns-scrap-erp/next`, `npm run lint --workspace @ns-scrap-erp/next`, `npx --yes @redocly/cli lint docs/api/openapi.yaml --max-problems 130`, and `npm run build --workspace @ns-scrap-erp/next` passed. OpenAPI lint still reports existing skeleton warnings only.
- Result: D1 PO Sell read baseline implemented and validated; dev-target `po_sells` currently has zero rows, so empty state is expected.
- Commit: `5f2afc4 feat: add po sell read baseline` pushed to `main`.

### D2: PO Buy Polish

- [x] ตรวจ `/purchase/po-buy` ที่มีแล้ว
- [x] เพิ่ม read-only filters/detail/export จาก legacy surface
- [x] write flow เฉพาะเมื่อ PO cut/reconciliation ชัด

#### Execution Log

- Task: D2 PO Buy read-only polish.
- Legacy refs: D0 PO Buy refs remain `old-apps/vue/src/views/purchase/PoBuyView.vue` and `old-apps/legacy/index.html:21577`; expected legacy surface includes search/date/status/purpose filters, export, detail/edit/cancel/move actions.
- Files changed: `apps/next/src/app/api/purchase/po-buy/route.ts`, `apps/next/src/components/purchase-flow/PoBuyPageClient.tsx`, `docs/api/openapi.yaml`, `docs/migration/17-next-remaining-modules-progress.md`, `docs/migration/00-current-work.md`, `docs/migration/18-next-system-sitemap.md`.
- DB/API changes: extended runtime `GET /api/purchase/po-buy` with `q`, `status`, `purpose`, `from`, `to`, and `format=json|xlsx`; no schema migration.
- Buttons/actions checked: create/edit/cancel/move remain intentionally omitted because `po_buys.doc_no` uniqueness, running-number policy, and PO cut/reconciliation rules are not locked.
- Modal/form checked: added read-only detail modal for header, delivery/purpose/status, and item lines; no write form.
- Validation added: OpenAPI documents `docNo` as the user-facing document identifier; UUID/opaque ids remain internal.
- Playwright smoke: authenticated `/purchase/po-buy` render passed on desktop/mobile; `GET /api/purchase/po-buy` returned `200` with 478 dev rows; XLSX export returned `200`, spreadsheet content type, and `PK` signature; detail modal opened on a PO row. Subagent unauth smoke confirmed route/API guards return login/`401`.
- Commands: `git diff --check`, `npm run type-check --workspace @ns-scrap-erp/next`, `npm run lint --workspace @ns-scrap-erp/next`, `npx --yes @redocly/cli lint docs/api/openapi.yaml --max-problems 130`, and `npm run build --workspace @ns-scrap-erp/next` passed. OpenAPI lint still reports existing skeleton warnings only.
- Result: D2 PO Buy read-only polish implemented and validated; write/cancel/move remains deferred.
- Commit: `01b4bcd feat: polish po buy read baseline` pushed to `main`.

### D3: Trading Dashboard

- [x] API `/api/trading/dashboard`
- [x] Page `/trading/dashboard`
- [x] summary cards/trend/deal status

#### Execution Log

- Task: D3 Trading Dashboard read baseline.
- Legacy refs: `old-apps/vue/src/views/dualCosting/TradingDashboardView.vue` and `old-apps/legacy/index.html:40502`; legacy dashboard is read-only and uses date filters, KPIs, trend/status/product summaries, and purchase/sales/deal aggregates.
- Files changed: `apps/next/src/app/api/trading/dashboard/route.ts`, `apps/next/src/app/trading/dashboard/page.tsx`, `apps/next/src/components/trading/TradingDashboardPageClient.tsx`, `docs/api/openapi.yaml`, `docs/migration/17-next-remaining-modules-progress.md`, `docs/migration/00-current-work.md`, `docs/migration/18-next-system-sitemap.md`.
- DB/API changes: added runtime `GET /api/trading/dashboard` with `q`, `status`, `from`, and `to`; reads `trading_deals` plus customer/product/supplier lookups. No schema migration.
- Buttons/actions checked: dashboard remains read-only; create/update/reverse/cancel matching actions stay deferred to D4+ because deal number uniqueness, reversal, idempotency, and reconciliation rules are not locked.
- Modal/form checked: no write form or modal in this slice.
- Validation added: OpenAPI documents `dealNo` as business-facing and not unique yet; UUID/opaque ids remain internal.
- Playwright smoke: authenticated `/trading/dashboard` render passed on desktop/mobile; `GET /api/trading/dashboard` returned `200` with 26 dev deals, recent deals, trend, and top products. Subagent unauth smoke confirmed route/API guards return login/`401`.
- Commands: `git diff --check`, `npm run type-check --workspace @ns-scrap-erp/next`, `npm run lint --workspace @ns-scrap-erp/next`, `npx --yes @redocly/cli lint docs/api/openapi.yaml --max-problems 130`, and `npm run build --workspace @ns-scrap-erp/next` passed. OpenAPI lint still reports existing skeleton warnings only.
- Result: D3 Trading Dashboard read baseline implemented and validated; matching write/reverse actions remain deferred.
- Commit: `1328d01 feat: add trading dashboard baseline` pushed to `main`.

### D4: Trading Matching Polish

- [x] ตรวจ `/trading/matching` ที่มีแล้ว
- [x] add matching action modal when rules clear (deferred; read-only slice)
- [x] export/detail

#### Execution Log

- Task: D4 Trading Matching read-only polish.
- Legacy refs: `old-apps/vue/src/views/dualCosting/TradingMatchingView.vue` and `old-apps/legacy/index.html:40805`; legacy includes create/update/reverse/recalc/pull actions but these remain deferred.
- Files changed: `apps/next/src/app/api/trading/matching/route.ts`, `apps/next/src/components/purchase-flow/TradingMatchingPageClient.tsx`, `docs/api/openapi.yaml`, `docs/migration/17-next-remaining-modules-progress.md`, `docs/migration/00-current-work.md`.
- DB/API changes: extended runtime `GET /api/trading/matching` with `q`, `status`, `from`, `to`, and `format=json|xlsx`; no schema migration.
- Buttons/actions checked: added read-only export and deal detail; create/update/reverse/recalc/pull/cleanup actions remain deferred because `trading_deals.deal_no` is not unique and reversal/idempotency/reconciliation rules are not locked.
- Modal/form checked: added read-only deal detail modal; no write form.
- Validation added: OpenAPI documents `dealNo` as business-facing and not unique yet; UUID/opaque ids remain internal.
- Playwright smoke: authenticated `/trading/matching` render passed on desktop/mobile; `GET /api/trading/matching` returned `200` with 26 dev deals; XLSX export returned `200`, spreadsheet content type, and `PK` signature; detail modal opened from the `ดู` button. Subagent unauth smoke confirmed route/API guards return login/`401`.
- Commands: `git diff --check`, `npm run type-check --workspace @ns-scrap-erp/next`, `npm run lint --workspace @ns-scrap-erp/next`, `npx --yes @redocly/cli lint docs/api/openapi.yaml --max-problems 130`, and `npm run build --workspace @ns-scrap-erp/next` passed. OpenAPI lint still reports existing skeleton warnings only.
- Result: D4 Trading Matching read-only polish implemented and validated; write/reverse/recalc actions remain deferred.
- Commit: `623e99c feat: polish trading matching read baseline` pushed to `main`.

### D5: Cost Pool

- [x] API `/api/dual-costing/cost-pool`
- [x] Page `/dual-costing/cost-pool`
- [x] source/allocated/unallocated summary

#### Execution Log

- Task: D5 Cost Pool read-derived baseline.
- Legacy refs: `old-apps/vue/src/views/dualCosting/CostPoolView.vue` and `old-apps/legacy/index.html:22592`; legacy visual baseline uses amber warning band, blue/orange/purple cost type cards, 5 summary cards, filters, and a table with emerald available columns.
- Files changed: `apps/next/src/app/api/dual-costing/cost-pool/route.ts`, `apps/next/src/app/dual-costing/cost-pool/page.tsx`, `apps/next/src/components/dual-costing/CostPoolPageClient.tsx`, `apps/next/src/lib/navigation.ts`, `docs/api/openapi.yaml`, `docs/migration/17-next-remaining-modules-progress.md`, `docs/migration/18-next-system-sitemap.md`, `docs/migration/00-current-work.md`.
- DB/API changes: added runtime `GET /api/dual-costing/cost-pool` with `q`, `productId`, `costType`, `sourceType`, `status`, `availableOnly`, `sort`, `from`, `to`, and `format=xlsx`; reads `po_buys`, `purchase_bills`, `production_outputs`, `grade_adjustments`, and `trading_deals`. No schema migration.
- Buttons/actions checked: page is read-only with filter reset, export, and detail modal only. Allocate/confirm/reverse/recalc actions remain deferred because dedicated cost allocation source links and reconciliation rules are not locked.
- Data assumptions: Cost Pool rows use business-facing derived lot refs like `CP-POB-*`, `CP-SPT-*`, `CP-PRD-*`, and `CP-RGD-*`; UUID/source ids remain internal fields. PO Buy rows use remaining item quantity when line items are available. Purchase bill usage is reduced by known active `trading_deals.matched_purchase_amount`; PO Buy, production, and regrade usage remains available until real match/allocation links exist.
- Playwright smoke: subagent unauth smoke confirmed `/dual-costing/cost-pool` redirects to `/login?redirect=%2Fdual-costing%2Fcost-pool` and unauth API returns `401`. Authenticated main smoke confirmed legacy-style amber warning band, blue/orange/purple cost cards, 5 summary cards, filters, table columns, export link, and detail modal; desktop/mobile had no page overflow and no console errors after duplicate derived lot refs were fixed.
- Commands: `git diff --check`, `npm run type-check --workspace @ns-scrap-erp/next`, `npm run lint --workspace @ns-scrap-erp/next`, `npx --yes @redocly/cli lint docs/api/openapi.yaml --max-problems 130`, and `npm run build --workspace @ns-scrap-erp/next` passed. OpenAPI lint still reports existing skeleton warnings only.
- Result: D5 Cost Pool read-derived baseline implemented and validated; allocate/reverse/recalc/write behavior remains deferred.
- Commit: `eb7603f feat: add cost pool read baseline` pushed to `main`.

### D6: Cost Allocator

- [x] API `/api/dual-costing/cost-allocator`
- [x] Page `/dual-costing/cost-allocator`
- [x] allocation simulation first
- [ ] write only after reconciliation design

#### Execution Log

- Task: D6 Cost Allocator read-only simulation baseline.
- Legacy refs: `old-apps/vue/src/views/dualCosting/CostAllocatorView.vue` and `old-apps/legacy/index.html:22820`; legacy visual baseline uses purple intro, step cards, product selector, PO Sell selector, allocation mode, preview table, and blue/emerald/red/purple result cards.
- Files changed: `apps/next/src/app/api/dual-costing/cost-allocator/route.ts`, `apps/next/src/app/dual-costing/cost-allocator/page.tsx`, `apps/next/src/components/dual-costing/CostAllocatorPageClient.tsx`, `docs/api/openapi.yaml`, and migration tracker docs.
- DB/API changes: added runtime `GET /api/dual-costing/cost-allocator` with `productId`, `poSellId`, and `mode`; combines available Cost Pool rows with open PO Sell lines and returns read-only simulation candidates. No schema migration.
- Buttons/actions checked: source selector, product selector, PO Sell selector, allocation mode, cancel/reset, and preview are implemented. Confirm/write remains disabled/deferred because allocation logs and reversal rules are not locked.
- Playwright smoke: subagent unauth smoke confirmed `/dual-costing/cost-allocator` redirects to `/login?redirect=%2Fdual-costing%2Fcost-allocator` and unauth API returns `401`. Authenticated main smoke confirmed purple intro band, source selector buttons, product selector, product Cost Pool summary, PO Sell selector section, no horizontal overflow on desktop/mobile, and no console errors. Dev-target currently has no active `/api/sales/po-sell` rows, so candidate preview was verified as contract-ready but cannot render a real preview row until a PO Sell exists for a product with available Cost Pool.
- Commands: `git diff --check`, `npm run type-check --workspace @ns-scrap-erp/next`, `npm run lint --workspace @ns-scrap-erp/next`, `npx --yes @redocly/cli lint docs/api/openapi.yaml --max-problems 130`, and `npm run build --workspace @ns-scrap-erp/next` passed. OpenAPI lint still reports existing skeleton warnings only.
- Result: D6 Cost Allocator read-only simulation baseline implemented and validated; confirm/write remains deferred.
- Commit: `bb42402 feat: add cost allocator simulation baseline` pushed to `main`.

### D7: Match Log / Deal Margin / Compare Margin

- [x] `/dual-costing/match-log`
- [x] `/dual-costing/deal-margin`
- [x] `/dual-costing/compare-margin`
- [x] read baseline, filters, detail, export

#### Execution Log

- Task: D7a Match Log read baseline.
- Legacy refs: `old-apps/vue/src/views/dualCosting/MatchLogView.vue` and `old-apps/legacy/index.html:22993`; legacy visual baseline uses slate intro, 6 metric cards, filters, and a match table.
- Files changed: `apps/next/src/app/api/dual-costing/match-log/route.ts`, `apps/next/src/app/dual-costing/match-log/page.tsx`, `apps/next/src/components/dual-costing/MatchLogPageClient.tsx`, `docs/api/openapi.yaml`, and migration tracker docs.
- DB/API changes: added runtime `GET /api/dual-costing/match-log` with `q`, `matchType`, `costType`, `status`, and `format=xlsx`; reads `trading_deals` as the current read source because a normalized allocation log table does not exist yet. No schema migration.
- Buttons/actions checked: filters and export are implemented. Reverse/write remains deferred; rows marked cancelled are displayed as `reversed` only for read baseline.
- Playwright smoke: authenticated `/dual-costing/match-log` returned 26 rows, XLSX returned `200` with `PK` signature, desktop/mobile had no page overflow and no console errors. Subagent unauth smoke confirmed route redirects to `/login?redirect=%2Fdual-costing%2Fmatch-log` and unauth API returns `401`.
- Commands: `git diff --check`, `npm run type-check --workspace @ns-scrap-erp/next`, `npm run lint --workspace @ns-scrap-erp/next`, `npx --yes @redocly/cli lint docs/api/openapi.yaml --max-problems 130`, and `npm run build --workspace @ns-scrap-erp/next` passed. OpenAPI lint still reports existing skeleton warnings only.
- Result: D7a Match Log read baseline implemented and validated; reverse/write remains deferred.
- Commit: `cbd189e feat: add match log read baseline` pushed to `main`.

#### D7b Deal Margin Execution Log

- Task: D7b Deal Margin read baseline.
- Legacy refs: `old-apps/vue/src/views/dualCosting/DealMarginView.vue`; legacy visual baseline uses purple/pink gross margin card, top 5 deal card, match status card, filters, export, and margin table.
- Files changed: `apps/next/src/app/api/dual-costing/deal-margin/route.ts`, `apps/next/src/app/dual-costing/deal-margin/page.tsx`, `apps/next/src/components/dual-costing/DealMarginPageClient.tsx`, `docs/api/openapi.yaml`, and migration tracker docs.
- DB/API changes: added runtime `GET /api/dual-costing/deal-margin` with `from`, `to`, `channel`, and `format=xlsx`; reads `trading_deals` matched sales/purchase amounts. No schema migration.
- Playwright smoke: authenticated `/dual-costing/deal-margin` returned 25 rows, gross margin/top deals/match status cards rendered, XLSX returned `200` with `PK` signature, desktop/mobile had no page overflow and no console errors. Subagent unauth smoke confirmed route redirects to `/login?redirect=%2Fdual-costing%2Fdeal-margin` and unauth API returns `401`.
- Commands: `git diff --check`, `npm run type-check --workspace @ns-scrap-erp/next`, `npm run lint --workspace @ns-scrap-erp/next`, `npx --yes @redocly/cli lint docs/api/openapi.yaml --max-problems 130`, and `npm run build --workspace @ns-scrap-erp/next` passed. OpenAPI lint still reports existing skeleton warnings only.
- Result: D7b Deal Margin read baseline implemented and validated.
- Commit: `5875dec feat: add deal margin read baseline` pushed to `main`.

#### D7c Compare Margin Execution Log

- Task: D7c Compare Deal vs Stock read baseline.
- Legacy refs: `old-apps/vue/src/views/dualCosting/CompareMarginView.vue`; legacy visual baseline uses a blue info band, purple/pink Deal Cost card, emerald/teal Stock Cost card, and 3 diff cards.
- Files changed: `apps/next/src/app/api/dual-costing/compare-margin/route.ts`, `apps/next/src/app/dual-costing/compare-margin/page.tsx`, `apps/next/src/components/dual-costing/CompareMarginPageClient.tsx`, `docs/api/openapi.yaml`, and migration tracker docs.
- DB/API changes: added runtime `GET /api/dual-costing/compare-margin` with `from` and `to`; deal side reads `trading_deals`, stock side reads `sales_bills.total_amount` and `cogs_amount`/`total_cost` when available. No schema migration.
- Playwright smoke: authenticated `/dual-costing/compare-margin` returned deal rows `25` and stock rows `80`; blue info band, Deal Cost card, Stock Cost card, diff cards, and date filters rendered; desktop/mobile had no page overflow and no console errors. Subagent unauth smoke confirmed route redirects to `/login?redirect=%2Fdual-costing%2Fcompare-margin` and unauth API returns `401`.
- Commands: `git diff --check`, `npm run type-check --workspace @ns-scrap-erp/next`, `npm run lint --workspace @ns-scrap-erp/next`, `npx --yes @redocly/cli lint docs/api/openapi.yaml --max-problems 130`, and `npm run build --workspace @ns-scrap-erp/next` passed. OpenAPI lint still reports existing skeleton warnings only.
- Result: D7c Compare Deal vs Stock read baseline implemented and validated.

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
