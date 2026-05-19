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
- [x] docs/type/lint/build/commit/push

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

- [x] row detail modal
- [x] export `.xlsx`
- [x] refresh button

#### S2.4 QA

- [x] API smoke
- [x] browser smoke
- [x] docs/type/lint/build/commit/push

#### S2 Follow-up Execution Log

- Task: Stock Ledger row detail modal follow-up after UI parity pass.
- Legacy refs: `old-apps/legacy/index.html:11483`, `old-apps/vue/src/views/stock/StockLedgerView.vue`.
- Files changed: `apps/next/src/components/purchase-flow/StockLedgerPageClient.tsx`, this tracker, and current work handoff.
- DB/API changes: no schema migration and no route-handler change; the modal reads the row payload already returned by `GET /api/stock/ledger`.
- Buttons/actions checked: `อ่าน` is now active and opens a read-only Stock Ledger detail modal. Duplicate/orphan cleanup buttons remain disabled.
- Modal/form checked: modal shows document reference, product/location, quantity/cost, value/status, note, and counterparty/source. It has no write inputs and no mutation action.
- Playwright smoke: authenticated main Playwright session passed `/stock/ledger` at desktop `1365x900` and mobile `390x844`; `อ่าน` opened the read-only detail modal, modal markers rendered, there was no page-level overflow, and no console warnings/errors were found. Unauthenticated QA subagent confirmed route redirects to `/login?redirect=%2Fstock%2Fledger` and API returns `401` JSON (`กรุณาเข้าสู่ระบบ`).
- Commands: `npm run lint --workspace @ns-scrap-erp/next` passed; `npm run type-check --workspace @ns-scrap-erp/next` passed; `npm run build --workspace @ns-scrap-erp/next` passed; `git diff --check` passed.
- Result: Stock Ledger row detail modal follow-up validated and pushed.
- Commit: `181a2e5 feat: add stock ledger detail modal` pushed to `main`.

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
- [x] commit/push

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

### UI-T360: Tracking 360 Legacy UI Parity Revision

- [x] `/tracking/customer` legacy hero/filter/summary/top/tabs/table parity
- [x] `/tracking/supplier` legacy hero/filter/summary/top/tabs/table parity
- [x] `/tracking/product` legacy hero/filter/summary/top/tabs/table parity
- [x] Product Tracking list order aligned to legacy revenue-first sort
- [ ] detail drilldowns after item JSON contract is normalized

#### Execution Log

- Task: post-SYS legacy UI parity revision for Tracking 360.
- Legacy refs: `old-apps/legacy/index.html:27163`, `old-apps/legacy/index.html:27515`, `old-apps/legacy/index.html:27894`; Vue refs remain useful for simplified visual shape only.
- Files changed: `apps/next/src/components/tracking/CustomerTrackingPageClient.tsx`, `apps/next/src/components/purchase-flow/SupplierTrackingPageClient.tsx`, `apps/next/src/components/tracking/ProductTrackingPageClient.tsx`, `apps/next/src/app/api/tracking/product/route.ts`, this tracker, current work handoff.
- DB/API changes: no schema migration and no write endpoint changes; `GET /api/tracking/product` now sorts rows by revenue first to match legacy product tracking order.
- Buttons/actions checked: read-only filters, tabs, and active `.xlsx` export links only; no write actions were enabled.
- Modal/form checked: no mutation form; customer/supplier/product detail drilldowns remain deferred until item JSON contract and stock/product mappings are confirmed.
- Validation added: customer table restores `Code`, `COGS`, `GP`, `GP%`, `฿/กก.`, received, receivable; supplier table restores Code/Supplier/bills/qty/purchase/avg/paid/payable/paid%; product table restores Code/product/metal group/status/sales/COGS/GP/buy/stock/WAC.
- Playwright smoke: authenticated main Playwright session passed `/tracking/customer`, `/tracking/supplier`, and `/tracking/product` at desktop `1365x900` and mobile `390x844`; tabs switched correctly, JSON APIs returned `200`, XLSX exports returned `200` with spreadsheet content type and `PK` signature, and no page-level overflow/console errors/failed requests were found. Unauthenticated QA subagent confirmed route redirects to `/login?redirect=...` and APIs return `401` JSON.
- Commands: `npm run lint --workspace @ns-scrap-erp/next` passed; `npm run type-check --workspace @ns-scrap-erp/next` passed; `npm run build --workspace @ns-scrap-erp/next` passed; `git diff --check` passed.
- Result: Tracking 360 legacy UI parity revision validated and pushed.
- Commit: `d4bc621 fix: restore tracking 360 legacy ui parity` pushed to `main`.

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
- Commit: `cc0ff0d feat: add compare margin read baseline` pushed to `main`.

### D8: Dual Costing QA Batch

- [x] QA checker
- [x] type/lint/build
- [x] commit/push

#### Execution Log

- Task: D8 Dual Costing QA checkpoint across D1-D7 routes/APIs.
- Scope checked: `/sales/po-sell`, `/purchase/po-buy`, `/trading/dashboard`, `/trading/matching`, `/dual-costing/cost-pool`, `/dual-costing/cost-allocator`, `/dual-costing/match-log`, `/dual-costing/deal-margin`, and `/dual-costing/compare-margin`.
- QA fixes applied: added PO Sell `from`/`to` date filter support in API/UI/export/OpenAPI; aligned Trading Matching `q/from/to` filters across deals, purchase rows, sales rows, and summary; rebuilt Cost Pool status filter options after usage calculation; changed Cost Pool derived display refs to use business document refs instead of source UUIDs; removed unsupported Cost Allocator `Manual` mode from API/UI/OpenAPI; made Deal Margin `statusMatch` respect raw partial/full status text; limited Compare Margin stock side to trading/PO-linked sales bills; aligned PO Sell OpenAPI row names with runtime `customerName`/`channelName`/`branchName`/`productName`.
- Playwright smoke: authenticated smoke across all 9 pages/APIs returned page/API `200`, no login fallback, no desktop/mobile overflow, and no console errors; export-capable endpoints returned XLSX with `PK` signature. Targeted post-fix smoke confirmed PO Sell has 2 date inputs, Cost Pool statuses include `Available`, `Fully Used`, and `Partially Used`, first Cost Pool id `CP-POB-POB-051-P145` does not expose a UUID, Cost Allocator modes are `FIFO/LIFO/Cheap/Expensive`, Trading Matching empty `q` filter returns zero rows and zero summary, and Compare Margin stock side now reads 23 trading/PO-linked sales bills.
- Subagent QA: unauth subagent confirmed all 9 protected routes redirect to `/login?redirect=...` and all 9 APIs return `401`; UI/source subagent confirmed D5-D7 card/color baselines match the tracker and found missing PO Sell date filters, now fixed; API/contract subagent findings were fixed except permission granularity.
- Carry-over: permission guard for trading/dual-costing still uses `finance.cash.view`; redesign as a dedicated trading/cost/profit permission slice instead of changing guards ad hoc in this QA batch.
- Commands: `git diff --check`, `npm run type-check --workspace @ns-scrap-erp/next`, `npm run lint --workspace @ns-scrap-erp/next`, `npx --yes @redocly/cli lint docs/api/openapi.yaml --max-problems 130`, and `npm run build --workspace @ns-scrap-erp/next` passed. OpenAPI lint still reports existing skeleton warnings only.
- Result: D8 Dual Costing QA checkpoint passed with targeted contract/UI fixes; permission split remains a future auth batch.
- Commit: `c91d814 fix: tighten dual costing qa findings` pushed to `main`.

### UI-D1: PO Buy / Trading Matching Legacy UI Parity Revision

- [x] `/purchase/po-buy` legacy info banner/KPI/top/outstanding/filter/purpose-tab/table shell parity
- [x] `/trading/matching` legacy hero/action/summary/tabs/unmatched-table parity
- [x] keep mutation/action controls disabled for write-risk boundaries
- [ ] Cost Pool / Cost Allocator parity follow-up
- [ ] Match Log / Deal Margin / Compare Margin parity follow-up

#### Execution Log

- Task: post-SYS Batch D Group A legacy UI parity revision.
- Legacy refs: `old-apps/legacy/index.html:21903`, `old-apps/legacy/index.html:22008`, `old-apps/legacy/index.html:41280`, `old-apps/legacy/index.html:41309`, `old-apps/legacy/index.html:41425`.
- Files changed: `apps/next/src/components/purchase-flow/PoBuyPageClient.tsx`, `apps/next/src/components/purchase-flow/TradingMatchingPageClient.tsx`, this tracker, current work handoff.
- DB/API changes: no schema migration and no route-handler change; all new summary/top/monthly/unmatched visuals are derived client-side from existing read payloads.
- Buttons/actions checked: PO Buy create/move/cancel shell buttons and Trading Matching duplicate cleanup/cloud pull/recalc/new match/reverse controls render disabled/read-only. Export links remain active existing `.xlsx` capability.
- Modal/form checked: PO Buy detail modal and Trading deal detail modal remain read-only; no mutation form was added.
- Validation added: PO Buy restores legacy blue info copy, six colored KPI cards, Top 5 Supplier, outstanding panel, status chips, purpose cards, checkbox/action table shell, and empty wording. Trading Matching restores fuchsia hero, disabled action cluster, GP mega card, status donut, match-rate/monthly/top-pair panels, compact KPI row, two legacy tabs, colored deal table, cancelled toggle, disabled Recalc/Reverse shell, and unmatched split tables.
- Playwright smoke: authenticated main Playwright session passed `/purchase/po-buy` and `/trading/matching` at desktop `1365x900` and mobile `390x844`; tabs/purpose buttons switched correctly, JSON APIs returned `200`, XLSX exports returned `200` with spreadsheet content type and `PK` signature, disabled write-risk buttons remained disabled, and no page-level overflow/console errors/failed requests were found. Unauthenticated QA subagent confirmed route redirects to `/login?redirect=...` and APIs return `401` JSON.
- Commands: `npm run lint --workspace @ns-scrap-erp/next` passed; `npm run type-check --workspace @ns-scrap-erp/next` passed; `npm run build --workspace @ns-scrap-erp/next` passed; `git diff --check` passed.
- Result: UI-D1 PO Buy / Trading Matching legacy UI parity revision validated and pushed.
- Commit: `0c9df8e fix: restore po trading legacy ui parity` pushed to `main`.

### UI-ADM1: Company Profile Legacy UI Parity Queue

- [x] `/admin/company-profile` parity recheck requested from production URL `https://new-ns-scrap-erp.vercel.app/admin/company-profile`
- [x] compare active Next page against `old-apps/legacy` and `old-apps/vue/src/views/admin/CompanyProfileView.vue`
- [x] keep existing settings writes guarded by `system.settings.manage`; do not add new write behavior without validation/audit review

#### Execution Log

- User requested adding this page to the active parity list after UI-D1 work started.
- Existing references: sitemap already lists `/admin/company-profile` with `GET/PUT /api/admin/company-profile`; visual audit checklist already contains `companyProfile`.
- Task: recheck and revise Company Profile under legacy-first parity rule.
- Legacy refs: `old-apps/legacy/index.html:44417`, `old-apps/vue/src/views/admin/CompanyProfileView.vue`.
- Files changed: `apps/next/src/app/admin/company-profile/CompanyProfilePageClient.tsx`, this tracker, current work handoff.
- DB/API changes: no schema migration and no route-handler change; existing `GET/PUT /api/admin/company-profile` and `system.settings.manage` guard remain unchanged.
- Buttons/actions checked: restored legacy three-button action row: save, preview receipt, preview delivery. Preview buttons call the existing validated save path first and then show legacy no-sample-bill alerts; no new print/write endpoint was added.
- Modal/form checked: no modal added. Removed the non-legacy live print preview card and refresh button from the visible surface.
- Validation added: restored branch label, address textarea density, bank/footer placeholders, logo delete text, and legacy usage note wording while keeping current input sanitization and API validation.
- Playwright smoke: authenticated main Playwright session passed `/admin/company-profile` at desktop `1365x900` and mobile `390x844`; `GET /api/admin/company-profile` returned `200`, no page-level overflow/console warnings/errors/failed requests were found, and legacy markers/buttons were visible. Unauthenticated QA subagent confirmed route redirects to `/login?redirect=%2Fadmin%2Fcompany-profile` and API returns `401` JSON (`กรุณาเข้าสู่ระบบ`).
- Commands: `npm run lint --workspace @ns-scrap-erp/next` passed; `npm run type-check --workspace @ns-scrap-erp/next` passed; `npm run build --workspace @ns-scrap-erp/next` passed; `git diff --check` passed.
- Result: UI-ADM1 Company Profile legacy UI parity revision validated and pushed.
- Commit: `bebef00 fix: restore company profile legacy ui parity` pushed to `main`.

#### Follow-up: Form Border/Preview Parity

- User reported the form border/color still did not match legacy and the receipt/delivery preview buttons could not show example documents.
- Files changed: `apps/next/src/app/admin/company-profile/CompanyProfilePageClient.tsx`, this tracker, current work handoff.
- DB/API changes: none. Existing `GET/PUT /api/admin/company-profile` and `system.settings.manage` guard remain unchanged.
- UI fix: made input, textarea, logo, and form utility borders explicit with legacy-like slate borders/white fields so Tailwind v4 does not render inherited/current-color borders.
- Preview fix: the receipt and delivery preview buttons now open a print-preview tab with sample document HTML generated from the current company profile, using the same legacy print document layout structure, toolbar, document title/stamp, item table, totals, remarks, signatures, and footer note. The validated save path still runs first; no new print/write endpoint was added.
- Playwright smoke: local authenticated route `http://localhost:3100/admin/company-profile` opened both `บิลซื้อ / PURCHASE BILL ตัวอย่าง` and `ใบส่งของ / DELIVERY NOTE ตัวอย่าง` tabs successfully. Computed input/textarea style showed white background, 4px radius, and slate border color.
- Commands: `npm run lint --workspace @ns-scrap-erp/next` passed; `npm run type-check --workspace @ns-scrap-erp/next` passed; `npm run build --workspace @ns-scrap-erp/next` passed; `git diff --check` passed.

### UI-D2: Cost Pool / Cost Allocator Legacy UI Parity Revision

- [x] `/dual-costing/cost-pool` legacy warning copy/filter/table parity
- [x] `/dual-costing/cost-allocator` legacy step order/action/preview parity
- [x] keep confirm/match write control disabled
- [x] Match Log / Deal Margin / Compare Margin parity follow-up

#### Execution Log

- Task: post-SYS Batch D Group B legacy UI parity revision.
- Legacy refs: `old-apps/legacy/index.html:22591`, `old-apps/legacy/index.html:22624`, `old-apps/legacy/index.html:22653`, `old-apps/legacy/index.html:22818`, `old-apps/legacy/index.html:22872`, `old-apps/legacy/index.html:22877`.
- Files changed: `apps/next/src/components/dual-costing/CostPoolPageClient.tsx`, `apps/next/src/components/dual-costing/CostAllocatorPageClient.tsx`, this tracker, current work handoff.
- DB/API changes: no schema migration and no route-handler change; Cost Allocator keeps read-only simulation payload and Cost Pool keeps existing `.xlsx` export.
- Buttons/actions checked: Cost Allocator restores legacy `🎯 Auto Match จาก Cost Pool` placement and preview/confirm surface, but confirm remains disabled. Cost Pool removes the extra detail action column from the legacy table surface.
- Modal/form checked: no mutation form was added; Cost Pool detail modal surface was removed from this parity slice to match legacy first-screen table shape.
- Validation added: Cost Pool restores legacy `💰/⚠/≠` warning copy, compact filter row, and 12-column table ending at status. Cost Allocator restores legacy `①/②` step sequence, `Manual` option as read-only shell, Auto Match button placement, disabled manual qty inputs, and disabled `✓ ยืนยัน Match → สร้าง Match Log` button.
- Playwright smoke: authenticated main Playwright session passed `/dual-costing/cost-pool` and `/dual-costing/cost-allocator` at desktop `1365x900` and mobile `390x844`; JSON APIs returned `200`, Cost Pool XLSX export returned `200` with spreadsheet content type and `PK` signature, and no page-level overflow/console errors/failed requests were found. Unauthenticated QA subagent confirmed route redirects to `/login?redirect=...` and APIs return `401` JSON.
- Commands: `npm run lint --workspace @ns-scrap-erp/next` passed; `npm run type-check --workspace @ns-scrap-erp/next` passed; `npm run build --workspace @ns-scrap-erp/next` passed; `git diff --check` passed.
- Result: UI-D2 Cost Pool / Cost Allocator legacy UI parity revision validated and pushed.
- Commit: `488f7fa fix: restore cost pool allocator legacy ui parity` pushed to `main`.

### UI-D3: Match Log / Deal Margin / Compare Margin Legacy UI Parity Revision

- [x] `/dual-costing/match-log` legacy info/filter/table/action-shell parity
- [x] `/dual-costing/deal-margin` legacy donut/table/empty-state parity
- [x] `/dual-costing/compare-margin` legacy first-screen card order parity
- [x] commit and push

#### Execution Log

- Task: post-SYS Batch D Group C legacy UI parity revision.
- Legacy refs: `old-apps/legacy/index.html:22907`, `old-apps/legacy/index.html:23082`, `old-apps/legacy/index.html:23213`, `old-apps/vue/src/views/dualCosting/MatchLogView.vue`, and `old-apps/vue/src/views/dualCosting/CompareMarginView.vue`.
- Files changed: `apps/next/src/components/dual-costing/MatchLogPageClient.tsx`, `apps/next/src/components/dual-costing/DealMarginPageClient.tsx`, `apps/next/src/components/dual-costing/CompareMarginPageClient.tsx`, `apps/next/src/app/api/dual-costing/deal-margin/route.ts`, `docs/api/openapi.yaml`, this tracker, and current work handoff.
- DB/API changes: no schema migration and no mutation endpoint. Deal Margin now exposes `sellQty` as current deal-side `trading_deals.matched_qty` so the restored legacy `Sell Qty` column is populated; OpenAPI documents that this is a temporary read contract until normalized PO Sell allocation logs exist.
- Buttons/actions checked: Match Log restores a disabled read-only `Reverse` action shell and local `ทุก PO Sell` filter from Target / Reference. Reverse/export remains API-filter based and does not mutate stock/cost pool.
- Validation added: Match Log restores the `📋 Match Log` info box, visible-row summary cards, PO Sell filter shell, status/type badge labels, 14-column table, and disabled Reverse column. Deal Margin restores the donut SVG/legend, `PO Sell` table heading, `Sell Qty`, and `ยังไม่มี PO Sell` empty state. Compare Margin restores legacy first-screen order: info band, Deal/Stock cards, diff cards, with Next-only date filters/row stats reduced after the core legacy blocks.
- Playwright smoke: authenticated main Playwright session passed `/dual-costing/match-log`, `/dual-costing/deal-margin`, and `/dual-costing/compare-margin` at desktop `1365x900` and mobile `390x844`; JSON APIs returned `200`, no page-level overflow/console warnings/errors/failed requests were found, and legacy markers were visible. Unauthenticated QA subagent confirmed all three routes redirect to `/login?redirect=...` and all three APIs return `401` JSON (`กรุณาเข้าสู่ระบบ`); browser console logged only expected 401 resource messages during unauth API probes.
- Commands: `npm run lint --workspace @ns-scrap-erp/next` passed; `npm run type-check --workspace @ns-scrap-erp/next` passed; `npm run build --workspace @ns-scrap-erp/next` passed; `git diff --check` passed.
- Result: UI-D3 Match Log / Deal Margin / Compare Margin legacy UI parity revision validated and pushed.
- Commit: `dcfa1c1 fix: restore dual costing margin legacy ui parity` pushed to `main`.

## Batch FF: Foreign Finance

### FF0: Module Overview

- [x] สำรวจ legacy foreign finance pages
- [x] map shared data: currencies, fx rates, accounts, beneficiaries, remittance purposes, bank statement
- [x] สรุป flow เงินเข้า/ออกต่างประเทศและ FX gain/loss
- [x] สรุป bank statement/FCD ledger side effects
- [x] สรุป page order และ risk

#### FF0 Module Overview

- Legacy/Vue refs:
  - Vue routes: `old-apps/vue/src/router/index.ts:536` for `/finance/foreign/intl-transfer`, `/finance/foreign/overseas-receipt`, `/finance/foreign/fx-rate`, `/finance/foreign/fcd-ledger`, `/finance/foreign/fx-gain-loss-report`, and `/finance/foreign/bank-reconciliation`.
  - Vue menu section: `old-apps/vue/src/router/menu.ts:781` lists the six `foreign-finance` entries.
  - International Transfer: `old-apps/vue/src/views/finance/IntlTransferView.vue`, `old-apps/legacy/index.html:23569`.
  - Overseas Receipt: `old-apps/vue/src/views/finance/OverseasReceiptView.vue`, `old-apps/legacy/index.html:23720`.
  - FX Rate: `old-apps/vue/src/views/finance/FxRateView.vue`, `old-apps/legacy/index.html:23287`.
  - FCD Ledger: `old-apps/vue/src/views/finance/FcdLedgerView.vue`, `old-apps/legacy/index.html:23856`.
  - FX Gain/Loss: `old-apps/vue/src/views/finance/FxGainLossReportView.vue`, `old-apps/legacy/index.html:23932`.
  - Bank Reconciliation: `old-apps/vue/src/views/finance/BankReconciliationView.vue`, `old-apps/legacy/index.html:23984`.
- Active Next state:
  - FF0 start state: all six foreign finance routes were placeholder pages through the catch-all route, with no `/api/finance/foreign/*` route handlers or OpenAPI paths yet.
  - Current state after FF1-FF6: all six foreign finance routes have dedicated Next pages and OpenAPI-documented route handlers, with money-moving writes still deferred except FX Rate reference-data management.
  - Related baselines already exist: `/finance/bank` with `GET /api/finance/bank`, plus master data pages/APIs for accounts, currencies, beneficiaries, payment methods, and remittance purposes.
- Current DB/table mapping:
  - `accounts`: cash/bank/OD/FCD account master with `currency`, `opening_balance`, `od_limit`, and relation to `bank_statement`.
  - `bank_statement`: generic cash/bank ledger with `date`, `account_id`, `ref_type`, `ref_id`, `ref_no`, `amount_in`, `amount_out`, `cash_flow_category`, and account relation.
  - `currencies`: current currency master with `code`, `name`, `symbol`, and `rate_to_thb`; this is not a full historical FX rate table yet.
  - `fx_gain_loss`: realized FX gain/loss table with `date`, `ref_type`, `ref_id`, `currency`, `amount_fc`, `rate_book`, `rate_settlement`, and `gain_loss`.
  - `overseas_recipients`: current beneficiary table behind `/master-data/beneficiaries`.
  - `overseas_remittance_purposes`: current remittance purpose lookup behind `/master-data/remittance-purposes`.
  - No confirmed normalized tables yet for `intl_transfers`, `overseas_receipts`, `bank_imports`, or historical `fx_rates` in the active Prisma schema.
  - No dedicated `fcd_ledger` table exists; FCD running balance must be derived from `accounts.currency` + `bank_statement` until a ledger table is designed.
  - `payments` and `receipts` already write `bank_statement` rows with `PMT`/`RCP` refs and idempotency keys; foreign transfer/receipt write design must avoid double-counting bank movements.
  - `accounts.currency`, `overseas_recipients.currency`, and `fx_gain_loss.currency` are plain strings, not enforced FKs to `currencies`; `currencies.code` versus display symbol (`THB`, `USD`, etc.) needs mapping care.
  - `fx_gain_loss` has `ref_type/ref_id` but no business-facing `ref_no`, so reports must not expose opaque ids as the main reference.
- Legacy flow summary:
  - International Transfer creates business refs like `ITF*`, tracks purpose, transfer type, source account, beneficiary, source/destination currency, FX rate, fees, charge bearer `OUR/SHA/BEN`, SWIFT ref, value date, and status. Legacy actions include save draft, submit to bank, complete, and reverse. Submit/reverse mutates `bankStatement` with ref type `ITF`.
  - Overseas Receipt creates business refs like `ORC*`, tracks customer, payer country, received account, optional sales bill, foreign amount, FX rate, bank fee, SWIFT ref, value date, and status. Approval mutates `bankStatement` with `ORC`/`ORC-FEE` rows and creates `fxGainLoss` when book and settlement rates differ.
  - FCD Ledger is derived from FCD accounts, approved overseas receipts, and submitted/completed international transfers; it keeps running foreign balance and THB equivalent balance.
  - FX Gain/Loss report is realized-only in legacy, with date filters, original/settlement rates, original/settlement THB values, and net gain/loss cards.
  - Bank Reconciliation imports pasted CSV `date,desc,amount`, stores imported rows, auto-matches ERP bank statement rows by date and amount, supports ignore/delete import, and shows imported vs ERP statement side by side.
- Visual refs to preserve:
  - FX Rate: blue info band, white latest-rate cards, blue numeric rates, rounded white history table.
  - International Transfer: purple info band, amber fee block, blue primary buttons, status badges for submitted/completed/reversed.
  - Overseas Receipt: emerald info band, emerald THB values, amber bank fee values, red/emerald FX G/L.
  - FCD Ledger: indigo info band, indigo foreign balance card, blue THB equivalent card, emerald inflow and red outflow columns.
  - FX Gain/Loss: blue info band, emerald gain card, red loss card, blue/indigo net card.
  - Bank Reconciliation: blue imported statement panel, emerald ERP statement panel, stat cards in white/emerald/amber/slate/red.
- Side effects and rules not to guess:
  - Do not implement money-moving writes for ITF/ORC until idempotency, reverse, approval, and bank statement ref rules are designed.
  - Do not auto-post FX gain/loss from read pages; derive/report first.
  - Do not mutate `bank_statement` or import/match records from Bank Reconciliation until a normalized import table and reconciliation state model are designed.
  - Keep business document refs (`ITF*`, `ORC*`, bank ref no, account code) user-facing; keep UUID/opaque ids internal.
  - Do not rely on `currencies.rate_to_thb` alone for historical FX; add effective-date design or snapshot rates before money-moving writes.
  - Permission is currently `finance.cash.view`; a dedicated foreign finance/FX permission split remains a later auth batch.
- Implementation order:
  1. FF1 FX Rate read/manage baseline first. It is reference data and should not touch bank statement.
  2. FF4 FCD Ledger read baseline from FCD accounts + existing bank statement/derived sources to validate running balance before writes.
  3. FF5 FX Gain/Loss read baseline from `fx_gain_loss` or derived rows; no auto-post.
  4. FF2 International Transfer read/form baseline only; defer bank statement mutation.
  5. FF3 Overseas Receipt read/form baseline only; defer bank statement and FX gain/loss mutation.
  6. FF6 Bank Reconciliation read/import-design baseline after ledger/statement model is clear.
  7. FF7 QA across routes/API/browser/OpenAPI/permission consistency.

#### Execution Log

- Task: FF0 Foreign Finance legacy inventory, active surface check, and DB mapping.
- Legacy refs: see FF0 module overview above.
- Files changed: this tracker and current work handoff.
- DB/API changes: docs-only; no schema/runtime change.
- Buttons/actions checked: inventoried add, submit, approve, complete, reverse, import CSV, auto match, ignore, delete import, and delete FX rate actions.
- Modal/form checked: inventoried FX rate modal, ITF form, ORC form, FCD account selector, FX date filters, and bank reconciliation import/match controls.
- Validation added: no runtime validation; docs-only checkpoint.
- Playwright smoke: not run; active Next routes are known placeholders from sitemap and navigation check.
- Commands: `git diff --check` passed.
- Result: FF0 module overview completed; FF1 FX Rate is next.

### FF1: FX Rate

- [x] API `/api/finance/foreign/fx-rate`
- [x] Page `/finance/foreign/fx-rate`
- [x] CRUD/modal/validation

#### Execution Log

- Task: FF1 FX Rate manage baseline.
- Files changed: `supabase/migrations/20260519044755_create_fx_rates_table.sql`, `apps/next/prisma/schema.prisma`, `apps/next/src/lib/finance-foreign.ts`, `apps/next/src/app/api/finance/foreign/fx-rate/route.ts`, `apps/next/src/app/finance/foreign/fx-rate/page.tsx`, `apps/next/src/components/finance/foreign/FxRatePageClient.tsx`, `docs/api/openapi.yaml`, `docs/migration/18-next-system-sitemap.md`, this tracker, and current work handoff.
- DB/API changes: added `fx_rates` historical rate table with business-readable ids like `FX-YYYYMMDD-USD-THB-BOT`; added `GET/POST/PATCH /api/finance/foreign/fx-rate` guarded by `finance.cash.view`.
- Tables used: `fx_rates` for rate history and `currencies` for currency options/seed data.
- Buttons/actions checked: add FX rate, edit existing row, cancel/close modal, save validation without submitting invalid data.
- Modal/form checked: date, rate type, from/to currency, positive numeric rate, source, active flag, note, and client/server Zod validation.
- Legacy UI parity checked: preserved blue info band, five white latest-rate cards, blue numeric rates, `FX Rate History` heading with add button, compact rounded white table, and compact modal layout.
- Validation added: OpenAPI path and schemas for FX rate list/write payloads.
- Playwright smoke: desktop and mobile route render passed on `http://localhost:3100/finance/foreign/fx-rate`; API returned 200 after dev server restart; modal validation displayed `Rate ต้องมากกว่า 0`; screenshots saved as `ff1-fx-rate-desktop.png` and `ff1-fx-rate-mobile-closed.png`.
- Commands: `npm run prisma:generate --workspace @ns-scrap-erp/next`, `npm run type-check --workspace @ns-scrap-erp/next`, `npm run lint --workspace @ns-scrap-erp/next`, `npm run build --workspace @ns-scrap-erp/next`, `npx --yes @redocly/cli lint docs/api/openapi.yaml --max-problems 200`, Prisma smoke query, and `git diff --check` passed. OpenAPI still has the existing 113 skeleton warnings outside this endpoint.
- Supabase advisor: security advisor still reports existing environment-wide RLS/security-definer findings; no FF1-specific blocker was addressed in this batch.
- Result: FX Rate route is no longer a placeholder; foreign finance money-moving writes remain deferred.
- Commit: `1cf344c feat: add foreign fx rate baseline` pushed to `main`.

### FF2: International Transfer

- [x] API `/api/finance/foreign/intl-transfer`
- [x] Page `/finance/foreign/intl-transfer`
- [x] modal/form, beneficiaries, accounts, remittance purposes
- [x] bank statement side effect deferred until rule clear

#### Execution Log

- Task: FF2 International Transfer read/form baseline.
- Files changed: `apps/next/src/app/api/finance/foreign/intl-transfer/route.ts`, `apps/next/src/app/finance/foreign/intl-transfer/page.tsx`, `apps/next/src/components/finance/foreign/IntlTransferPageClient.tsx`, `apps/next/src/lib/finance-foreign.ts`, `docs/api/openapi.yaml`, `docs/migration/18-next-system-sitemap.md`, this tracker, and current work handoff.
- DB/API changes: added `GET /api/finance/foreign/intl-transfer` guarded by `finance.cash.view`; no new table and no writes.
- Tables used: `accounts`, `overseas_recipients`, `overseas_remittance_purposes`, `currencies`, `fx_rates`, and read-only `bank_statement` rows with `ref_type = ITF` when present.
- Read/form rule: save draft, submit to bank, complete, reverse, and bank-statement mutation are intentionally disabled until the dedicated `intl_transfers` schema, idempotency, approval, and reversal rules exist.
- Legacy UI parity checked: purple info band, `+ โอนต่างประเทศใหม่` button, compact white rounded table without extra cards, 3xl modal, amber fee block, slate draft button, blue submit button, and legacy table columns/status placement.
- Playwright smoke: desktop and mobile route render passed on `http://localhost:3100/finance/foreign/intl-transfer`; API returned 200; console had no errors; modal opened with legacy fields, amber fee block, and disabled write buttons; screenshots saved as `ff2-intl-transfer-desktop.png` and `ff2-intl-transfer-mobile.png`.
- Commands: `npm run type-check --workspace @ns-scrap-erp/next`, `npm run lint --workspace @ns-scrap-erp/next`, `npm run build --workspace @ns-scrap-erp/next`, `npx --yes @redocly/cli lint docs/api/openapi.yaml --max-problems 200`, and browser smoke passed. OpenAPI still has the existing 113 skeleton warnings outside these endpoints.
- Result: International Transfer route is no longer a placeholder, but remains read/form-only.
- Commit: `7fc1a69 feat: add foreign transfer receipt form baselines` pushed to `main`.

### FF3: Overseas Receipt

- [x] API `/api/finance/foreign/overseas-receipt`
- [x] Page `/finance/foreign/overseas-receipt`
- [x] modal/form; bank statement and FX gain/loss side effects deferred

#### Execution Log

- Task: FF3 Overseas Receipt read/form baseline.
- Files changed: `apps/next/src/app/api/finance/foreign/overseas-receipt/route.ts`, `apps/next/src/app/finance/foreign/overseas-receipt/page.tsx`, `apps/next/src/components/finance/foreign/OverseasReceiptPageClient.tsx`, `apps/next/src/lib/finance-foreign.ts`, `docs/api/openapi.yaml`, `docs/migration/18-next-system-sitemap.md`, this tracker, and current work handoff.
- DB/API changes: added `GET /api/finance/foreign/overseas-receipt` guarded by `finance.cash.view`; no new table and no writes.
- Tables used: `customers`, active bank/FCD/OD/foreign-currency `accounts`, `sales_bills`, `currencies`, `fx_rates`, and read-only `bank_statement` rows with `ref_type IN (ORC, ORC-FEE)` when present.
- Read/form rule: draft/save, approve receipt, reverse, bank statement mutation, and FX gain/loss posting are intentionally disabled until the dedicated `overseas_receipts` schema, posting idempotency, approval, and reversal rules exist.
- Legacy UI parity checked: emerald info band, `+ รับเงินต่างประเทศใหม่` button, compact white rounded table without extra cards, 2xl modal, emerald THB values, amber fee values, FX G/L color placement, and blue `รับเงิน + เพิ่ม Bank/FCD` submit button.
- Playwright smoke: desktop and mobile route render passed on `http://localhost:3100/finance/foreign/overseas-receipt`; API returned 200; console had no errors; modal opened with legacy fields, emerald THB values, amber fee values, and disabled write buttons; screenshots saved as `ff3-overseas-receipt-desktop.png` and `ff3-overseas-receipt-mobile.png`.
- Commands: `npm run type-check --workspace @ns-scrap-erp/next`, `npm run lint --workspace @ns-scrap-erp/next`, `npm run build --workspace @ns-scrap-erp/next`, `npx --yes @redocly/cli lint docs/api/openapi.yaml --max-problems 200`, and browser smoke passed. OpenAPI still has the existing 113 skeleton warnings outside these endpoints.
- Result: Overseas Receipt route is no longer a placeholder, but remains read/form-only.
- Commit: `7fc1a69 feat: add foreign transfer receipt form baselines` pushed to `main`.

### FF4: FCD Ledger

- [x] API `/api/finance/foreign/fcd-ledger`
- [x] Page `/finance/foreign/fcd-ledger`
- [x] running balance by currency/account

#### Execution Log

- Task: FF4 FCD Ledger read baseline.
- Files changed: `apps/next/src/app/api/finance/foreign/fcd-ledger/route.ts`, `apps/next/src/app/finance/foreign/fcd-ledger/page.tsx`, `apps/next/src/components/finance/foreign/FcdLedgerPageClient.tsx`, `docs/api/openapi.yaml`, `docs/migration/18-next-system-sitemap.md`, this tracker, and current work handoff.
- DB/API changes: added `GET /api/finance/foreign/fcd-ledger` guarded by `finance.cash.view`; no new table and no writes.
- Tables used: `accounts` for active FCD/foreign-currency accounts, `bank_statement` for read-only THB movement rows, and `fx_rates` for historical FX reference display when available.
- Conservative data rule: FF4 does not infer foreign movement from THB bank rows or current currency rates. `foreignIn`/`foreignOut` remain zero unless future ITF/ORC source tables provide true foreign amounts; opening foreign balance comes from `accounts.opening_balance`.
- Legacy UI parity checked: indigo info band, FCD account selector, three cards, and compact table columns match the legacy/Vue FCD Ledger baseline.
- Buttons/actions checked: account selector only; no write, post, reverse, or bank-statement mutation actions.
- Playwright smoke: desktop and mobile route render passed on `http://localhost:3100/finance/foreign/fcd-ledger`; API returned 200 for default and selected account requests; console had no errors; screenshots saved as `ff4-fcd-ledger-desktop.png` and `ff4-fcd-ledger-mobile.png`.
- Commands: `npm run type-check --workspace @ns-scrap-erp/next`, `npm run lint --workspace @ns-scrap-erp/next`, `npm run build --workspace @ns-scrap-erp/next`, `npx --yes @redocly/cli lint docs/api/openapi.yaml --max-problems 200`, and browser smoke passed. OpenAPI still has the existing 113 skeleton warnings outside this endpoint.
- Result: FCD Ledger route is no longer a placeholder, but it remains a conservative read baseline until foreign transfer/receipt source tables exist.
- Commit: `7088964 feat: add fcd ledger read baseline` pushed to `main`.

### FF5: FX Gain/Loss

- [x] API `/api/finance/foreign/fx-gain-loss-report`
- [x] Page `/finance/foreign/fx-gain-loss-report`
- [x] realized baseline

#### Execution Log

- Task: FF5 FX Gain/Loss read baseline.
- Files changed: `apps/next/src/app/api/finance/foreign/fx-gain-loss-report/route.ts`, `apps/next/src/app/finance/foreign/fx-gain-loss-report/page.tsx`, `apps/next/src/components/finance/foreign/FxGainLossReportPageClient.tsx`, `docs/api/openapi.yaml`, `docs/migration/18-next-system-sitemap.md`, this tracker, and current work handoff.
- DB/API changes: added `GET /api/finance/foreign/fx-gain-loss-report` guarded by `finance.cash.view`; no new table and no writes.
- Tables used: `fx_gain_loss` for realized rows and `bank_statement` only to resolve `ref_no` where `ref_type/ref_id` matches.
- Read-only rule: no auto-post, no reversal, no bank statement mutation, no unrealized gain/loss derivation.
- Legacy UI parity checked: blue info band, date filters, emerald/red/net cards, compact rounded white table, and empty state match the legacy/Vue FX Gain/Loss report.
- Reference rule: UI displays resolved `bank_statement.ref_no` when available, otherwise `ref_type` or a non-opaque ref id; opaque `ref_id` is not used as the primary reference.
- Playwright smoke: desktop and mobile route render passed on `http://localhost:3100/finance/foreign/fx-gain-loss-report`; API returned 200; console had no errors; screenshots saved as `ff5-fx-gain-loss-desktop.png` and `ff5-fx-gain-loss-mobile.png`.
- Commands: `npm run type-check --workspace @ns-scrap-erp/next`, `npm run lint --workspace @ns-scrap-erp/next`, `npm run build --workspace @ns-scrap-erp/next`, `npx --yes @redocly/cli lint docs/api/openapi.yaml --max-problems 200`, and browser smoke passed. OpenAPI still has the existing 113 skeleton warnings outside this endpoint.
- Result: FX Gain/Loss route is no longer a placeholder and remains realized-only.
- Commit: `ebc08d0 feat: add fx gain loss report baseline` pushed to `main`.

### FF6: Bank Reconciliation

- [x] API `/api/finance/foreign/bank-reconciliation`
- [x] Page `/finance/foreign/bank-reconciliation`
- [x] statement matching design baseline

#### Execution Log

- Task: FF6 Bank Reconciliation read/design baseline.
- Files changed: `apps/next/src/app/api/finance/foreign/bank-reconciliation/route.ts`, `apps/next/src/app/finance/foreign/bank-reconciliation/page.tsx`, `apps/next/src/components/finance/foreign/BankReconciliationPageClient.tsx`, `docs/api/openapi.yaml`, `docs/migration/18-next-system-sitemap.md`, this tracker, and current work handoff.
- DB/API changes: added `GET /api/finance/foreign/bank-reconciliation` guarded by `finance.cash.view`; no new table and no writes.
- Tables used: `accounts` for bank account options and `bank_statement` for ERP-side rows.
- Read-only rule: import CSV, auto match, ignore, delete import, manual match, and reconciliation state writes are intentionally disabled until normalized `bank_imports`/match state schema exists.
- Legacy UI parity checked: blue info band, account/date toolbar, Import/Auto Match controls, five stat cards, blue imported panel, emerald ERP panel, and compact tables match the legacy/Vue Bank Reconciliation baseline.
- Playwright smoke: desktop and mobile route render passed on `http://localhost:3100/finance/foreign/bank-reconciliation`; API returned 200 for default and selected account requests; console had no errors; screenshots saved as `ff6-bank-reconciliation-desktop.png` and `ff6-bank-reconciliation-mobile.png`.
- Commands: `npm run type-check --workspace @ns-scrap-erp/next`, `npm run lint --workspace @ns-scrap-erp/next`, `npm run build --workspace @ns-scrap-erp/next`, `npx --yes @redocly/cli lint docs/api/openapi.yaml --max-problems 200`, and browser smoke passed. OpenAPI still has the existing 113 skeleton warnings outside this endpoint.
- Result: Bank Reconciliation route is no longer a placeholder, but matching remains a design/read baseline until import/match schema and RLS are designed.
- Commit: `79b9b74 feat: add bank reconciliation design baseline` pushed to `main`.

### FF7: Foreign Finance QA Batch

- [x] QA checker
- [x] type/lint/build
- [x] commit/push

#### Execution Log

- Task: FF7 Foreign Finance QA checkpoint.
- Files changed: this tracker, current work handoff, and sitemap notes only.
- Routes checked: `/finance/foreign/fx-rate`, `/finance/foreign/intl-transfer`, `/finance/foreign/overseas-receipt`, `/finance/foreign/fcd-ledger`, `/finance/foreign/fx-gain-loss-report`, and `/finance/foreign/bank-reconciliation`.
- API checks: browser fetch smoke returned 200 JSON for all six `/api/finance/foreign/*` endpoints.
- Browser QA: subagent sweep passed FX Rate, FCD Ledger, and FX Gain/Loss with no console errors and expected legacy color/card/table layout; latest FF2/FF3/FF6 Playwright smokes already passed after implementation, and main sweep confirmed API 200 plus console error-free session for the foreign finance group.
- Contract/permission check: all six route handlers are guarded by `finance.cash.view`; only FX Rate exposes POST/PATCH and it is reference-data management. ITF/ORC/FCD/FX Gain-Loss/Bank Reconciliation remain read-only or read/form-only.
- Stale docs fixed: FF0 start-state wording now explicitly says the placeholder note was the start state, and sitemap notes no longer claim foreign finance beyond FX Rate is placeholder-only.
- Commands: `npm run type-check --workspace @ns-scrap-erp/next`, `npm run lint --workspace @ns-scrap-erp/next`, `npm run build --workspace @ns-scrap-erp/next`, `npx --yes @redocly/cli lint docs/api/openapi.yaml --max-problems 200`, and `git diff --check` passed. OpenAPI still has the existing 113 skeleton warnings outside this batch.
- Result: Foreign Finance route/API baselines are complete for FF1-FF6; money-moving writes, dedicated ITF/ORC schemas, import/match reconciliation schema, and more granular foreign finance permissions remain deferred.

## Batch A: Finance / Accounting

### A0: Module Overview

- [x] สำรวจ legacy finance/accounting pages ทั้งหมด
- [x] map shared data: purchase/sales, AP/AR, bank, stock value, tax, assets, loans, opening balances
- [x] สรุปว่าอะไรเป็น read/report baseline และอะไรต้องรอ GL/accounting design
- [x] สรุป report dependency และ page order
- [x] สรุป risk/open decisions

#### A0 Module Overview

- Legacy/Vue refs:
  - Vue routes: `old-apps/vue/src/router/index.ts:248` through `old-apps/vue/src/router/index.ts:351` map all 18 Finance / Accounting routes.
  - Vue menu keys: `old-apps/vue/src/router/menu.ts:450` through `old-apps/vue/src/router/menu.ts:536`.
  - Report views: `old-apps/vue/src/views/financeReports/FinancialDashboardView.vue`, `CashFlowAnalysisView.vue`, `CashFlowForecastView.vue`, `WorkingCapitalView.vue`, `StockFinanceView.vue`, `ProfitLeakView.vue`, `TaxVatView.vue`, `PlStatementView.vue`, `BalanceSheetView.vue`, and `CashFlowStatementView.vue`.
  - Asset/loan/setup views: `old-apps/vue/src/views/systemGaps/AssetRegisterView.vue`, `DepreciationView.vue`, `AssetDisposalView.vue`, `LoanContractsView.vue`, `LoanDashboardView.vue`, `EquityMaintenanceView.vue`, `OpeningBalanceView.vue`, and `HistoricalDataView.vue`.
- Active Next state:
  - A1-A7 are now implemented as 18/18 `/finance-accounting/*` read or read-design page/API baselines in the active Next app.
  - Sitemap currently marks the section as `18` navigation routes, `18` real pages, `0` placeholders, and API coverage for every Finance / Accounting route.
  - All routes are currently under `finance.financials.view` in navigation.
- Visual refs to preserve:
  - Financial Dashboard: violet/purple gradient hero, empty 6-month P&L chart, Cash & Bank-only asset donut, cash need/inflow cards, finance section cards, P&L summary, balance sheet, and Cash Health Insights.
  - Cash Flow Forecast Calendar: 30-day baseline with start/end cash, flat forecast graph, calendar grid, AR/AP insight tables, and two-decimal money formatting.
  - Working Capital: 90-day period selector, CCC card, CCC breakdown bars, current/quick ratio gauges, stock turnover panel, KPI cards, analysis cards, and calculation table.
  - P&L Statement: emerald gradient hero, period/month/year toolbar order, branch selector, quick range buttons, Net Profit waterfall, Stock vs Trading split cards, and P&L table.
  - Asset Register: amber/orange gradient header, Template/Export/Add/CSV button order, NBV card, category panel, monthly depreciation card, filters, and compact Thai table headers.
  - Loan Contracts: blue/cyan gradient header, Template/Add buttons, four summary cards, filters, and loan schedule/action table.
- Active DB/table mapping:
  - Available: `accounts`, `bank_statement`, `sales_bills`, `purchase_bills`, `receipts`, `payments`, `expenses`, `stock_ledger`, `assets`, `depreciations`, `loans`, `loan_schedules`, `loan_payments`, `equity`, and singleton `opening_balance`.
  - Partially available: VAT/WHT source fields exist on some sales/purchase/payment/receipt records, but there is no normalized tax ledger or statutory filing table in the active Prisma schema.
  - Missing for true accounting statements: no confirmed GL journal header/line table, chart of accounts mapping, closing period table, retained earnings roll-forward, tax filing state, or dedicated historical import staging tables.
- Read/report baseline candidates:
  - A1 Financial Dashboard can be derived from existing AR/AP/cash/stock/assets/loans tables as a management dashboard, with clear source-state notes.
  - A2 Cash Flow Analysis / Forecast can derive from `accounts`, `bank_statement`, `sales_bills.receivable_balance/due_date`, `purchase_bills.payable_balance/due_date`, `loan_schedules`, and known expense/payment rows.
  - A3 Working Capital / Stock Finance can derive from AR/AP balances, stock value from `stock_ledger`, and cash/bank state.
  - A6 Asset Register / Depreciation / Disposal can start as read baselines from `assets` and `depreciations`; depreciation run/reversal/disposal writes need a separate accounting-side-effect design.
  - A7 Loan Contracts / Loan Dashboard can start as read baselines from `loans`, `loan_schedules`, and `loan_payments`.
- Must defer until GL/accounting design:
  - P&L, Balance Sheet, and Cash Flow Statement must be labeled management/read baselines if implemented before GL. Do not claim statutory financial statements without journal/COA/closing-period design.
  - Do not auto-post depreciation, asset disposal gain/loss, loan interest accrual, tax payable, retained earnings, or opening balance entries into accounting ledgers until GL schema and idempotency rules exist.
  - Do not mutate `opening_balance` or historical import state from report pages.
  - Do not use UUIDs as user-facing accounting refs; prefer document numbers, account codes, asset codes, loan contract numbers, period labels, and branch names.
- Recommended implementation order:
  1. A6 Fixed Assets read baselines first: Asset Register, Depreciation, and Asset Disposal need NBV/accumulated depreciation clarity before Balance Sheet and dashboard aggregates.
  2. A7 Loans / Equity / Opening / Historical read baselines next: loan outstanding, schedules, equity, and opening/historical balances feed statements and dashboards.
  3. A5 Financial Statements as clearly labeled management/read baselines only, once asset/loan/equity source displays are visible. Do not claim statutory statements until GL/COA/closing-period design exists.
  4. A4 Tax/VAT/WHT transaction-derived summary after purchase/sales/payment/receipt/expense field mapping is confirmed. Do not implement filing or tax-period state yet.
  5. A2 Cash Flow Analysis + Forecast Calendar, because it reuses AR/AP/cash/loan schedule/tax due dependencies and tests date buckets.
  6. A3 Working Capital + Stock Finance, because it depends on stable AR/AP/stock-value/cash calculations.
  7. A1 Financial Dashboard last among page builds, because it aggregates all prior outputs. If implemented earlier, it must be a strictly read-only zero/management baseline.

#### Execution Log

- Task: A0 Finance / Accounting legacy inventory, active DB mapping, and implementation order.
- Files changed: this tracker and current work handoff.
- DB/API changes: docs-only; no schema/runtime change.
- Validation added: none; this is a planning checkpoint.
- Commands: `rg`/`sed` inventory of Vue routes, menu, visual audit notes, legacy files, active navigation, and Prisma models; subagents completed read-only legacy/UI and DB/API mapping; `git diff --check` pending before commit.
- Result: A6 Fixed Assets read baseline is the next implementation slice unless the user explicitly wants dashboard first.

### A1: Financial Dashboard

- [x] API/page financial dashboard
- [x] cards: revenue, purchase, AP/AR, cash, stock value
- [x] OpenAPI entry for the aggregated financial dashboard endpoint
- [x] read baseline first; no GL/statutory/payment/receipt/transfer writes

#### Execution Log

- Task: A1 Financial Dashboard read baseline.
- Files changed: added one Next page, one dashboard client component, one server aggregation helper, and one read-only API route under `/api/finance-accounting/financial-dashboard`.
- DB/API changes: aggregates existing A2/A3/A5 helper outputs and account/bank cash split; no schema change and no write side effects.
- UI baseline: preserved legacy-first violet/purple hero, P&L 6-month chart, asset composition donut, cash need/inflow comparison, finance section cards, P&L summary, balance sheet summary, and Cash Health Insights.
- Validation: passed `npm run lint --workspace @ns-scrap-erp/next`, `npm run type-check --workspace @ns-scrap-erp/next`, `npm run build --workspace @ns-scrap-erp/next`, `npx --yes @redocly/cli lint docs/api/openapi.yaml --max-problems 200`, and `git diff --check`. OpenAPI remains valid with the existing warning baseline.
- Browser QA: unauth subagent confirmed the page redirects to login, API returns `401`, and login desktop/mobile has no horizontal overflow. Authenticated main Playwright smoke confirmed the API returns `200`, desktop/mobile widths have no horizontal overflow, expected legacy-colored dashboard markers render, and no console errors were reported.
- Push marker: committed and pushed as `01a6b5b` (`feat: add financial dashboard baseline`).

### A2: Cash Flow Analysis and Forecast Calendar

- [x] `/finance-accounting/cash-flow-analysis`
- [x] `/finance-accounting/cf-forecast-calendar`
- [x] AP/AR/payment schedule source
- [x] OpenAPI entries for the two cash planning endpoints
- [x] read baseline first; no forecast/payment/reclass writes

#### Execution Log

- Task: A2 Cash Flow Analysis + Forecast Calendar read baselines.
- Files changed: added two Next pages, one shared cash-flow planning client component, one server derivation helper, and two read-only API routes under `/api/finance-accounting/*`.
- DB/API changes: reads `accounts`, `bank_statement`, `sales_bills`, `purchase_bills`, `receipts`, `payments`, `expenses`, `stock_ledger`, `loan_payments`, `loan_schedules`, and the transaction-derived Tax/VAT/WHT helper; no schema change, no forecast write, no payment/receipt creation, no reclass, no bank reconciliation, no tax filing, and no GL posting.
- UI baseline: preserved legacy-first cyan/blue and sky/blue heroes, date/horizon toolbars, NP vs OCF bars, cash trap donut, Burn Rate/OD card, cash projection cards, insight cards, daily forecast graph, calendar grid, AR/AP insight tables, and day detail modal affordance.
- Validation: passed `npm run lint --workspace @ns-scrap-erp/next`, `npm run type-check --workspace @ns-scrap-erp/next`, `npm run build --workspace @ns-scrap-erp/next`, `npx --yes @redocly/cli lint docs/api/openapi.yaml --max-problems 200` (valid with existing warnings), and `git diff --check`.
- Browser QA: unauth subagent confirmed page redirects to login and API 401 for both endpoints on desktop/mobile with no login overflow. Authenticated smoke on `http://localhost:3100` confirmed both APIs return 200, desktop/mobile have no horizontal overflow, legacy-colored hero/card/table markers render, forecast calendar renders the day grid, and day detail modal opens.

### A3: Working Capital and Stock Finance

- [x] `/finance-accounting/working-capital`
- [x] `/finance-accounting/stock-finance`
- [x] `/finance-accounting/profit-leak`
- [x] OpenAPI entries for the three working-capital/stock/profit-leak endpoints
- [x] read baseline first; no financing, stock adjustment, reclass, price update, or GL writes

#### Execution Log

- Task: A3 Working Capital + Stock Finance + Profit Leak read baselines.
- Files changed: added three Next pages, one shared finance analysis client component, one server derivation helper, and three read-only API routes under `/api/finance-accounting/*`.
- DB/API changes: reads AR/AP/cash/stock/loan/sales/purchase/expense/production/FX/payment/receipt operational sources; no schema change and no write side effects.
- UI baseline: preserved legacy-first teal/cyan working-capital hero, amber/orange stock-finance hero, rose/red profit-leak hero, compact cards, gauges, donut charts, aging bars, KPI cards, and dense tables.
- Validation: passed `npm run lint --workspace @ns-scrap-erp/next`, `npm run type-check --workspace @ns-scrap-erp/next`, `npm run build --workspace @ns-scrap-erp/next`, `npx --yes @redocly/cli lint docs/api/openapi.yaml --max-problems 200` (valid with existing warnings), and `git diff --check`.
- Browser QA: unauth subagent confirmed all three pages redirect to login, all three APIs return 401, and desktop/mobile login has no horizontal overflow. Authenticated smoke on `http://localhost:3100` confirmed all three APIs return 200, legacy-colored hero/card/table markers render, desktop/mobile have no horizontal overflow on checked pages, and no console errors were reported.

### A4: Tax / VAT / WHT

- [x] `/finance-accounting/tax-vat-wht`
- [x] VAT/WHT source mapping
- [x] OpenAPI entry for transaction-derived read/design endpoint
- [x] read baseline first; no filing, tax-period lock, payable posting, or GL write

#### Execution Log

- Task: A4 Tax / VAT / WHT transaction-derived read/design baseline.
- Files changed: added one Next page, one tax client component, one server tax derivation helper, and one read-only API route under `/api/finance-accounting/tax-vat-wht`.
- DB/API changes: reads `sales_bills`, `purchase_bills`, `expenses`, `payments`, and `receipts`; no schema change, no normalized tax ledger write, no PP30/PND filing state, no tax-period lock, no payable posting, and no GL write.
- UI baseline: preserved legacy-first rose/pink hero, month/year period toolbar, VAT Payable mega card, VAT Output/Input donut, WHT Position card, six KPI cards, VAT trend, detail tables, and Tax Calendar.
- Validation: `npm run lint --workspace @ns-scrap-erp/next`, `npm run type-check --workspace @ns-scrap-erp/next`, `npm run build --workspace @ns-scrap-erp/next`, `npx --yes @redocly/cli lint docs/api/openapi.yaml --max-problems 200`, and `git diff --check` passed. OpenAPI remains valid with existing catalog warnings.
- Browser QA: subagent unauth sweep confirmed the page redirects to login and API returns `401`; authenticated main Playwright smoke confirmed the A4 API returns `200`, the page renders the legacy-colored Tax/VAT/WHT baseline UI, Excel is disabled, and desktop/mobile widths have no horizontal overflow.

### A5: Financial Statements

- [x] `/finance-accounting/pl-statement`
- [x] `/finance-accounting/balance-sheet`
- [x] `/finance-accounting/cash-flow-statement`
- [x] OpenAPI entries for the three management/read endpoints
- [x] read baseline first; no GL posting until accounting design is clear

#### Execution Log

- Task: A5 Financial Statements management/read baselines.
- Files changed: added three Next pages, one shared financial statements client component, one server derivation helper, and three read-only API routes under `/api/finance-accounting/*`.
- DB/API changes: reads operational tables only: `sales_bills`, `expenses`, `depreciations`, `loan_payments`, `fx_gain_loss`, `accounts`, `bank_statement`, `purchase_bills`, `stock_ledger`, `assets`, `loans`, and `equity`; no schema change, no GL posting, no period close, no retained earnings roll-forward, and no cash-flow category writes.
- UI baseline: preserved legacy-first emerald/blue/cyan gradients, management baseline notice, compact card/table density, filter/action order, Stock vs Trading split, balanced/off-by badge, direct-method cash flow sections, and drill modal affordance. Excel is shown disabled/read-only until export policy is implemented.
- Validation: `npm run type-check --workspace @ns-scrap-erp/next`, `npm run lint --workspace @ns-scrap-erp/next`, `npm run build --workspace @ns-scrap-erp/next`, `npx --yes @redocly/cli lint docs/api/openapi.yaml --max-problems 200`, and `git diff --check` passed. OpenAPI remains valid with existing catalog warnings.
- Browser QA: subagent unauth sweep confirmed protected pages redirect to login and APIs return `401`; authenticated main Playwright smoke confirmed the three A5 APIs return `200`, pages render the legacy-colored management baseline UI, Excel buttons are disabled, and mobile width has no horizontal overflow.

### A6: Fixed Assets

- [x] `/finance-accounting/asset-register`
- [x] `/finance-accounting/depreciation`
- [x] `/finance-accounting/asset-disposal`
- [x] OpenAPI entries for the three read/design endpoints
- [x] Browser QA and full validation

#### Execution Log

- Task: A6 Fixed Assets read baseline.
- Files changed: added three Next pages, one shared fixed-assets client component, and three read-only API routes under `/api/finance-accounting/*`.
- DB/API changes: reads `assets` and `depreciations`; no schema change, no depreciation run/reversal write, no disposal write, and no GL posting.
- UI baseline: preserved legacy-first headers, cards, filters, compact tables, color semantics, and disabled write controls for Asset Register, Depreciation, and Asset Disposal.
- Validation: `npm run type-check --workspace @ns-scrap-erp/next`, `npm run lint --workspace @ns-scrap-erp/next`, `npm run build --workspace @ns-scrap-erp/next`, `npx --yes @redocly/cli lint docs/api/openapi.yaml --max-problems 200`, and `git diff --check` passed. OpenAPI remains valid with existing catalog warnings.
- Browser QA: subagent unauth sweep confirmed protected pages redirect to login and APIs return `401`; authenticated main Playwright smoke confirmed the three pages and APIs render/return `200`, desktop/mobile widths do not horizontally overflow, and write/import/run/disposal buttons are disabled. Only residual console error observed was the pre-existing `/favicon.ico` 500, not a touched A6 endpoint.

### A7: Loans / Equity / Opening / Historical

- [x] `/finance-accounting/loan-contracts`
- [x] `/finance-accounting/loan-dashboard`
- [x] `/finance-accounting/equity-maint`
- [x] `/finance-accounting/opening-balance`
- [x] `/finance-accounting/historical-data`
- [x] OpenAPI entries for the five read/design endpoints
- [x] Browser QA and full validation

#### Execution Log

- Task: A7 Loans / Equity / Opening / Historical read baselines.
- Files changed: added five Next pages, one shared loan/equity/opening/historical client component, and five read-only API routes under `/api/finance-accounting/*`.
- DB/API changes: reads `loans`, `loan_schedules`, `loan_payments`, `equity`, `opening_balance`, `accounts`, `branches`, and `historical_monthly`; no schema change, no loan payment/schedule generation, no equity save, no opening balance apply/lock, and no historical clear/save/sync.
- UI baseline: preserved legacy-first gradients, summary cards, filter/action order, tab chips, compact tables, and disabled write controls.
- Validation: `npm run type-check --workspace @ns-scrap-erp/next`, `npm run lint --workspace @ns-scrap-erp/next`, `npm run build --workspace @ns-scrap-erp/next`, `npx --yes @redocly/cli lint docs/api/openapi.yaml --max-problems 200`, and `git diff --check` passed. OpenAPI remains valid with existing catalog warnings.
- Browser QA: subagent unauth sweep confirmed protected pages redirect to login and APIs return `401`; authenticated main Playwright smoke confirmed the five A7 APIs return `200`, Loan Contracts and Opening Balance render without desktop overflow, Opening Balance and Historical Data render without mobile overflow, and write controls are disabled. The main authenticated smoke also checked Loan Contracts disabled Template/Import/Add/Schedule actions, Opening Save/Push disabled, and Historical Clear/Save disabled.

### A8: Accounting QA Batch

- [x] QA checker
- [x] type/lint/build
- [x] commit/push

#### Execution Log

- Task: A8 Finance / Accounting QA checkpoint after A1-A7.
- Coverage audit: static subagent confirmed all 18 Finance / Accounting navigation routes have matching Next pages, API routes, OpenAPI paths, and sitemap rows.
- Browser QA: unauth subagent confirmed all 18 protected pages redirect to login and all 18 APIs return `401`; authenticated main Playwright sweep confirmed all 18 pages render, all 18 APIs return `200`, desktop/mobile widths have no horizontal overflow, and no console/request failures were reported.
- Write-control audit: subagent confirmed APIs in scope expose only `GET` and UI actions for import/save/delete/reverse/run/disposal/apply/clear are disabled or read-only.
- Fixes applied: removed stale Finance / Accounting placeholder notes from sitemap/progress docs, added `/api/finance-accounting/` to the central permission prefix map, added OpenAPI `401` responses for Finance Accounting endpoints, and changed Historical Data to display `categoryLabel` instead of using `categoryId` as the primary table label.
- Validation: passed `npm run lint --workspace @ns-scrap-erp/next`, `npm run type-check --workspace @ns-scrap-erp/next`, `npm run build --workspace @ns-scrap-erp/next`, `npx --yes @redocly/cli lint docs/api/openapi.yaml --max-problems 200`, and `git diff --check`. OpenAPI remains valid with the existing warning baseline.
- Targeted smoke after fixes: authenticated Playwright check on `/finance-accounting/historical-data` returned API `200`, no visible UUID, no desktop/mobile horizontal overflow, and no console/request failures.
- Push marker: committed and pushed as `f4a9762` (`fix: audit finance accounting baselines`).

## Batch M: Main Dashboards and Operational Control

### M0: Module Overview

- [x] สำรวจ legacy main dashboard/owner daily/control pages
- [x] map shared KPI sources: purchase, sales, stock, finance, production, tracking
- [x] สรุป dashboard card/chart/table ที่ต้องใช้ร่วมกัน
- [x] สรุป page order และ dependency
- [x] สรุป risk/open decisions

#### M0 Module Overview

- Scope: 11 Main routes remain placeholder/missing API in Next: `/owner-daily`, `/anomaly-detector`, `/daily-report`, `/dashboard`, `/profit-cost-analysis`, `/pending-sales`, `/sales-plan`, `/sales-commission`, `/cash-flow-calendar`, `/business-calendar`, and `/cash-others-summary`.
- Legacy/Vue refs:
  - `/dashboard`: Vue `old-apps/vue/src/views/DashboardView.vue`, legacy `view-dashboard`.
  - `/owner-daily`: Vue `old-apps/vue/src/views/trackingDashboards/OwnerDailyView.vue`, legacy `view-ownerDaily`.
  - `/daily-report`: Vue `old-apps/vue/src/views/trackingDashboards/DailyReportView.vue`, legacy `view-dailyReport`.
  - `/profit-cost-analysis`: Vue `old-apps/vue/src/views/trackingDashboards/ProfitCostAnalysisView.vue`, legacy `view-profitCostAnalysis`.
  - `/pending-sales`: Next target maps intentionally to Vue `/sales/pending` and legacy `view-pendingSales`; preserve route difference in docs and implementation.
  - `/sales-plan`: Vue `old-apps/vue/src/views/trackingDashboards/SalesPlanView.vue`, legacy `view-salesPlan`.
  - `/sales-commission`: Vue `old-apps/vue/src/views/trackingDashboards/SalesCommissionView.vue`, legacy `view-salesCommission`.
  - `/cash-flow-calendar`: Vue `old-apps/vue/src/views/trackingDashboards/CashFlowCalendarView.vue`, legacy `view-cashFlowCalendar`.
  - `/business-calendar`: Vue `old-apps/vue/src/views/trackingDashboards/BusinessCalendarView.vue`, legacy `view-businessCalendar`.
  - `/cash-others-summary`: Vue `old-apps/vue/src/views/trackingDashboards/CashOthersSummaryView.vue`, legacy `view-cashOthersSummary`.
  - `/anomaly-detector`: Vue `old-apps/vue/src/views/trackingDashboards/AnomalyDetectorView.vue`, legacy `view-anomalyDetector`.
- Visual baseline summary:
  - Dashboard/owner/daily screens use dense legacy cards, section bands, filter bars, compact tables, charts, and empty states already Playwright-checked in `docs/migration/12-frontend-visual-audit-checklist.md`.
  - Profit Cost Analysis should prefer the denser legacy baseline where Vue is simplified: 8 KPI cards, AP/AR/customer/supplier rows, revenue/GP mega cards, donut/top GP sections, tabs, and product drilldown.
  - Pending Sales must preserve amber/orange hero, LME reference card, LME % table, segmented filters, metal chips, KPI cards, summary/detail tables, and Pool vs Stock explanation.
  - Sales Plan must preserve LME reference, plan table, product recommendation, and remaining stock-to-lock table, but write controls need explicit design.
  - Sales Commission must preserve before-VAT commission basis, 1,000,000 threshold, 500 per 500,000 rule, drill view, and supplier assignment table.
  - Cash Flow Calendar and Business Calendar should preserve month controls, KPI cards, chart cards, compact calendar/table surfaces, and modal/drilldown behavior.
  - Cash & Others should preserve the customer-visible Trading Pending block even though it is documented as intentional drift from current local legacy.
  - Anomaly Detector should first preserve the green `ทุกอย่างปกติ!` empty baseline and then add server-derived read-only anomaly rules.
- Shared data/API sources available in Next:
  - `purchase_bills`, `sales_bills`, `expenses`, `payments`, `receipts`, `accounts`, `bank_statement`, `stock_ledger`, `products`, `customers`, `suppliers`, `salespersons`, `production_orders`, `trading_deals`.
  - Reuse existing helper/API baselines where possible: finance-accounting dashboard/cashflow/working-capital/statements, stock helpers, production reports, trading dashboard/matching, finance cash/bank/AR/AP, and tracking customer/supplier/product.
- Implementation order:
  1. M1 `/dashboard`, `/owner-daily`, `/daily-report` as read/report baselines because they aggregate the most shared KPIs and set the shared dashboard helper shape.
  2. M2 `/profit-cost-analysis` read/report baseline because it depends on purchase/sales/stock/COGS and should not wait for sales planning writes.
  3. M3 `/pending-sales`, `/sales-plan`, `/sales-commission`; ship read/design baselines first and keep LME save, sales plan lock/save, and supplier assignment writes disabled until schemas/permissions/audit are designed.
  4. M4 `/cash-flow-calendar`, `/business-calendar`; reuse cash/bank and business daily aggregates, keep export/floating legacy shell disabled unless implemented as a harmless client export.
  5. M5 `/cash-others-summary`, `/anomaly-detector`; keep anomaly scans read-only and route fix links to active Next routes only.
  6. M6 QA sweep across all Main routes, API guards, visual parity, desktop/mobile overflow, and OpenAPI/sitemap status.
- Risks/open decisions:
  - `/dashboard` legacy/Vue source is `/`, but active Next target is `/dashboard`; keep `/dashboard` as the implementation route and leave `/` behavior unchanged unless a separate routing decision is made.
  - Do not route/import/execute `old-apps/vue` or `old-apps/legacy` from Next.
  - Do not silently enable planning/write actions: LME config, LME %, sales plan add/remove/lock/save, supplier assignment, anomaly fix navigation side effects, and legacy localStorage writes must be redesigned for target DB/auth/audit first.
  - Use business-facing refs (`docNo`, customer/supplier/product names/codes) in tables; avoid exposing UUIDs as primary labels.
  - Main dashboards are management/read baselines, not statutory accounting reports.
- Push marker: committed and pushed as `41962c1` (`docs: map main dashboard batch`).

### M1: Dashboard and Owner Daily

- [x] `/dashboard`
- [x] `/owner-daily`
- [x] `/daily-report`
- [x] summary from purchase/sales/stock/finance/production

#### Execution Log

- Task: M1 Dashboard, Owner Daily, and Daily Report read/report baselines.
- Files changed: added shared server helper `main-dashboards.ts`, three `GET` APIs, three Next pages, and one shared client component.
- DB/API changes: reads `purchase_bills`, `sales_bills`, `expenses`, `payments`, `receipts`, `accounts`, `bank_statement`, `stock_ledger`, `trading_deals`, and existing production/finance helper outputs. No schema change and no write side effects.
- UI baseline: preserved legacy-first dense dashboard cards, gradient heroes, KPI sections, daily bill tables, owner cash gap card, AR/AP due tables, and read-only baseline notice.
- Write controls: planning, approval, payment, anomaly fix, print/export, and legacy localStorage actions remain disabled/deferred in this batch.
- Validation: passed `npm run lint --workspace @ns-scrap-erp/next`, `npm run type-check --workspace @ns-scrap-erp/next`, `npm run build --workspace @ns-scrap-erp/next`, `npx --yes @redocly/cli lint docs/api/openapi.yaml --max-problems 200`, and `git diff --check`. OpenAPI remains valid with the existing warning baseline.
- Browser QA: unauth subagent confirmed all three protected pages redirect to login and all three APIs return `401`; authenticated main Playwright smoke confirmed all three APIs return `200`, desktop/mobile widths have no horizontal overflow, and no console errors were reported after restarting the dev server on `http://localhost:3100`.
- Push marker: committed and pushed as `f5ffa49` (`feat: add main dashboard baselines`).

### M2: Profit and Cost

- [x] `/profit-cost-analysis`
- [x] source mapping: purchase/sales/COGS/stock/product/party/channel

#### Execution Log

- Task: M2 Profit & Cost Analysis read/report baseline.
- Legacy refs: Vue `old-apps/vue/src/views/trackingDashboards/ProfitCostAnalysisView.vue`; legacy `old-apps/legacy/index.html` `view-profitCostAnalysis`; visual-audit note in `docs/migration/12-frontend-visual-audit-checklist.md`.
- Files changed: added `apps/next/src/lib/server/profit-cost-analysis.ts`, `GET /api/profit-cost-analysis`, `/profit-cost-analysis` Next page, `ProfitCostAnalysisPageClient`, navigation permission mapping, OpenAPI, and sitemap docs.
- DB/API changes: reads `purchase_bills`, `sales_bills`, `stock_ledger`, `products`, `suppliers`, `customers`, `branches`, `purchase_channels`, and `sales_channels`. No schema change and no write side effects.
- Buttons/actions checked: legacy `Export CSV` is visible but disabled in this read baseline; posting, allocation, planning changes, and write actions remain disabled.
- Modal/form checked: filters preserve date, branch, purchase/sales channel, supplier, customer, and metal group chip bar. Product row opens a read-only product drill modal.
- Validation added: API is guarded with `reports.reports.view`; OpenAPI path added with query parameters and 401/403 responses. Dedicated cost/profit permission remains a later auth follow-up before final UAT.
- Playwright smoke: unauth subagent confirmed `/profit-cost-analysis` redirects to `/login?redirect=%2Fprofit-cost-analysis`, unauth `/api/profit-cost-analysis` returns `401`, and login desktop/mobile has no overflow or console/network errors. Authenticated smoke confirmed `/api/profit-cost-analysis` returns `200`, desktop `1440x900` and mobile `390x844` have no document overflow, legacy markers are present, Export CSV is disabled, product drill modal opens/closes, and no console errors were reported after restarting the dev server.
- Commands: passed `npm run lint --workspace @ns-scrap-erp/next`, `npm run type-check --workspace @ns-scrap-erp/next`, `npm run build --workspace @ns-scrap-erp/next`, `npx --yes @redocly/cli lint docs/api/openapi.yaml --max-problems 200`, and `git diff --check`. OpenAPI remains valid with the existing 114 warning baseline.
- Result: implemented and validated locally.
- Commit: `814ba2c` (`feat: add profit cost analysis baseline`).

### M3: Pending Sales and Sales Plan

- [x] `/pending-sales`
- [x] `/sales-plan`
- [x] `/sales-commission`

#### Execution Log

- Task: M3 Pending Sales, Sales Plan, and Sales Commission read/design baselines.
- Legacy refs: Vue `old-apps/vue/src/views/sales/PendingSalesView.vue`, `old-apps/vue/src/views/trackingDashboards/SalesPlanView.vue`, `old-apps/vue/src/views/trackingDashboards/SalesCommissionView.vue`; legacy `view-pendingSales`, `view-salesPlan`, and `view-salesCommission`.
- Files changed: added shared server helper `main-sales-control.ts`, three `GET` APIs, three Next pages, shared M3 client component, permission mapping, sitemap, and OpenAPI docs.
- DB/API changes: reads `po_sells`, `po_buys`, `purchase_bills`, `trading_deals`, `stock_ledger`, `products`, `customers`, `suppliers`, and `salespersons`. No schema change and no write side effects.
- Buttons/actions checked: LME save, LME percent save, export, add/remove plan, lock/unlock, supplier assignment, and bulk assignment are disabled/deferred; sales card drilldown and pending-sales product drilldown are local read-only UI state.
- Modal/form checked: Pending Sales preserves segmented status filters, customer filter, metal chips, product detail drill view, and Pool vs Stock sections. Sales Plan preserves month/filter shell, LME reference, plan table shell, recommendation table, and remaining stock table. Sales Commission preserves period/date filter shell, sales cards, drill view, and supplier assignment table.
- Validation added: APIs are guarded with `reports.reports.view`; dedicated planning/assignment permissions remain later auth follow-up before writes.
- Playwright smoke: unauth subagent confirmed all three pages redirect to login and all three APIs return `401`; login desktop/mobile has no overflow or related console/network failures. Authenticated smoke confirmed `/api/pending-sales`, `/api/sales-plan`, and `/api/sales-commission` return `200`; desktop and mobile render core legacy markers with no document overflow and no console errors.
- Commands: passed `npm run lint --workspace @ns-scrap-erp/next`, `npm run type-check --workspace @ns-scrap-erp/next`, `npm run build --workspace @ns-scrap-erp/next`, `npx --yes @redocly/cli lint docs/api/openapi.yaml --max-problems 200`, and `git diff --check`. OpenAPI remains valid with the existing 114 warning baseline.
- Result: implemented and validated locally.
- Commit: `81b4199` (`feat: add main sales control baselines`).

### M4: Calendars

- [x] `/cash-flow-calendar`
- [x] `/business-calendar`

#### Execution Log

- Task: M4 Cash Flow Calendar and Business Calendar read/design baselines.
- Legacy refs: Vue `old-apps/vue/src/views/trackingDashboards/CashFlowCalendarView.vue` and `BusinessCalendarView.vue`; legacy `view-cashFlowCalendar` and `view-businessCalendar`.
- Files changed: added shared server helper `main-calendars.ts`, `GET /api/cash-flow-calendar`, `GET /api/business-calendar`, two Next pages, shared calendar client component, permission mapping, sitemap, and OpenAPI docs.
- DB/API changes: Cash Flow Calendar reads `accounts` and `bank_statement`; Business Calendar reads `purchase_bills`, `sales_bills`, `expenses`, `receipts`, and `payments`. No schema change and no write side effects.
- UI baseline: preserved Cash Flow blue info banner, month controls, 5 KPI cards, in/out chart, running balance chart, Sunday-first calendar grid, today/negative markers, legend, and read-only day drill modal. Preserved Business Calendar purple info banner, month controls, Combined/Purchase/Sales/Expense segmented modes, 7 KPI cards, buy/sell chart, cumulative GP chart, sticky dark combined table, weekend/today/empty row treatments, and mode-specific read-only tables.
- Buttons/actions checked: legacy floating export/auto-sync/write shell remains excluded; month controls and drilldown/mode changes are local read-only UI state.
- Validation added: APIs are guarded with `reports.reports.view`; OpenAPI paths include `month` query and 401/403 responses.
- Playwright smoke: unauth subagent confirmed both calendar pages redirect to login and both APIs return `401`; login desktop/mobile has no overflow or related console/network failures. Authenticated smoke confirmed both APIs return `200`, desktop and mobile have no horizontal overflow, legacy markers render, Business mode switches to Purchase view, and Cash day drill modal opens via the read-only day selector.
- Commands: passed `npm run lint --workspace @ns-scrap-erp/next`, `npm run type-check --workspace @ns-scrap-erp/next`, `npm run build --workspace @ns-scrap-erp/next`, `npx --yes @redocly/cli lint docs/api/openapi.yaml --max-problems 200`, and `git diff --check`. OpenAPI remains valid with the existing 114 warning baseline.
- Result: implemented and validated locally.

### M5: Cash & Others / Anomaly

- [x] `/cash-others-summary`
- [x] `/anomaly-detector`

#### Execution Log

- Task: M5 Cash & Others Summary and Anomaly Detector read baselines.
- Legacy refs: Vue `old-apps/vue/src/views/trackingDashboards/CashOthersSummaryView.vue` and `AnomalyDetectorView.vue`; legacy `view-cashOthersSummary` and `view-anomalyDetector`.
- Files changed: added shared server helper `cash-others-anomaly.ts`, `GET /api/cash-others-summary`, `GET /api/anomaly-detector`, two Next pages, shared M5 client component, permission mapping, sitemap, and OpenAPI docs.
- DB/API changes: Cash & Others reads `accounts`, `bank_statement`, `sales_bills`, `purchase_bills`, `stock_ledger`, `stock_issues`, `trading_deals`, and `expenses`. Anomaly Detector reads cash, stock, AR/AP, purchase/sales bill, customer/supplier, bank statement, and trading sources. No schema change and no write side effects.
- UI baseline: Cash & Others preserves the blue info banner, blue/indigo grand total card, Pending Sale block, Trading Pending block, asset/debt donut cards, AR aging bars, and four compact colored tables. Anomaly Detector preserves the red/rose hero, severity cards, green empty-state pattern, grouped expandable anomaly cards, active-route fix links, and checklist panel.
- Buttons/actions checked: export/allocation/reclass/posting/write actions remain disabled or omitted; anomaly fix actions are read-only links to active Next routes only.
- Validation added: APIs are guarded with `reports.reports.view`; OpenAPI paths include `asOf` query and 401/403 responses.
- Playwright smoke: unauth subagent confirmed both pages redirect to login, both APIs return `401`, and desktop/mobile login surfaces have no horizontal overflow or related console/network failures. Authenticated smoke confirmed both APIs return `200`, both pages render legacy markers, desktop/mobile have no page-level horizontal overflow, Cash & Others key blocks render with expected table-local horizontal scroll on mobile, and Anomaly Detector groups/details are visible by default with read-only active-route links.
- Commands: passed `npm run lint --workspace @ns-scrap-erp/next`, `npm run type-check --workspace @ns-scrap-erp/next`, `npm run build --workspace @ns-scrap-erp/next`, `npx --yes @redocly/cli lint docs/api/openapi.yaml --max-problems 200`, and `git diff --check`. OpenAPI remains valid with the existing 114 warning baseline.
- Result: implemented and validated locally.

### M6: Main QA Batch

- [x] QA checker
- [x] type/lint/build
- [x] commit/push

#### Execution Log

- Task: M6 QA sweep across all 11 Main routes and APIs after M1-M5.
- Scope checked: `/dashboard`, `/owner-daily`, `/daily-report`, `/profit-cost-analysis`, `/pending-sales`, `/sales-plan`, `/sales-commission`, `/cash-flow-calendar`, `/business-calendar`, `/cash-others-summary`, and `/anomaly-detector`, plus their matching `/api/*` routes.
- Static coverage: subagent confirmed all 11 routes have real Next pages, all 11 APIs exist, OpenAPI paths are present, navigation and API guards map to `reports.reports.view`, and the only drift was sitemap summary text. Fixed sitemap Main summary from `0` real pages / `11` placeholders / `none` API coverage to `11` real pages / `0` placeholders / all 11 read/read-design APIs.
- Unauth guard: subagent confirmed all 11 pages redirect to `/login?redirect=...`, all 11 APIs return `401`, login desktop/mobile has no page-level horizontal overflow, and no console/page/network errors were reported.
- Authenticated smoke: main Playwright sweep confirmed all 11 APIs return `200`, all 11 pages render their core headings/markers, desktop `1366x768` and mobile `390x844` have no page-level horizontal overflow, and no page/request errors were reported.
- Read-only/write-control audit: subagent confirmed all APIs in scope expose only `GET`, Batch M helpers do not use write Prisma calls or raw write queries, export/save/assign/lock/post/reclass/write controls are disabled/omitted/read-only, anomaly fix actions are active Next links only, and no localStorage/sessionStorage write side effects were found.
- Validation: passed `npm run lint --workspace @ns-scrap-erp/next`, `npm run type-check --workspace @ns-scrap-erp/next`, `npm run build --workspace @ns-scrap-erp/next`, `npx --yes @redocly/cli lint docs/api/openapi.yaml --max-problems 200`, and `git diff --check`. OpenAPI remains valid with the existing 114 warning baseline.
- Result: Batch M QA sweep passed after sitemap drift correction; all 11 Main routes/APIs remain read or read-design baselines with writes deferred.

## Batch SYS: System and Cleanup

### SYS0: Module Overview

- [x] สำรวจ system/admin pages ที่เหลือ
- [x] map auth/permission/audit/migration-tool requirements
- [x] สรุป safety constraints สำหรับ destructive/admin actions
- [x] สรุป route cleanup/full QA strategy

#### SYS0 Module Overview

- Scope: remaining System/Admin/Reports cleanup routes are `/admin/change-password`, `/admin/migration-tools`, `/reports`, plus polish/QA for `/admin/audit`, `/admin/users-permissions`, and full navigation route coverage.
- Legacy/Vue refs:
  - `/admin/change-password`: Vue `old-apps/vue/src/views/systemGaps/ChangePasswordView.vue`, legacy `view-changePassword`.
  - `/admin/migration-tools`: Vue `old-apps/vue/src/views/admin/MigrationToolsView.vue`, legacy `view-backup`.
  - `/reports`: Vue `old-apps/vue/src/views/systemGaps/ReportsView.vue`, legacy `view-reports`.
  - Existing admin baselines: `/admin/company-profile`, `/admin/audit`, `/admin/transaction-ledger`, and `/admin/users-permissions`.
- Current Next state:
  - `/admin/change-password` is a placeholder. It has no dedicated permission in sitemap because every authenticated user should be able to change their own password; implementation should use Supabase Auth update password and never read/write legacy `public.users.password`.
  - `/admin/migration-tools` is a placeholder with `system.backup.manage`; implementation must be safe/read-only first and must not perform reset, restore, cloud migration, destructive cleanup, or bulk writes without a separately approved design.
  - `/reports` is a placeholder under `reports.reports.view`; implementation should be an index/search surface that links to existing report/read pages instead of duplicating each report's query logic.
  - `/admin/audit` and `/admin/users-permissions` already have baselines, but still need filter/detail/export polish, role matrix polish, and branch-scope enforcement follow-up.
- Visual baseline summary:
  - Change Password must preserve the purple-to-pink hero, current-user info box, amber default-password warning, three password fields, show-password checkbox, inline success/error alert, full-width purple submit button, last-changed line, and password advice card.
  - Migration Tools must preserve the purple-to-pink hero, storage status card, record count grid, Export Backup card, Restore preview shell, snapshot table, Supabase migration card, Reset Transactions card, Danger Zone, and backup guide card, but all destructive/write actions must be disabled or omitted until approved.
  - Reports must preserve the date filter bar, report tab chips, compact tables, and export button placement; export can remain disabled/read-only until a per-report export contract is added.
- Permissions and safety constraints:
  - Keep `/admin/migration-tools` guarded by `system.backup.manage`.
  - Keep `/reports` guarded by `reports.reports.view`.
  - Add explicit `/admin/change-password` self-service access if needed, without requiring admin-only permissions.
  - Do not store user passwords in application tables. Use `auth.users` / Supabase Auth as source of truth.
  - Do not implement destructive migration/reset/restore actions in SYS2; surface them as disabled controls with clear deferred status unless a later batch designs confirmation, audit log, backups, RLS, and rollback behavior.
- Recommended implementation order:
  1. SYS1 `/admin/change-password`: real Supabase Auth self-service password update flow with validation and success/error states.
  2. SYS2 `/admin/migration-tools`: safe read/design baseline preserving legacy backup UI while disabling destructive actions.
  3. SYS4 `/reports`: report index/search baseline linking active report routes.
  4. SYS3 `/admin/audit` and `/admin/users-permissions` polish after the missing pages are no longer placeholders.
  5. SYS5 full route QA across navigation, placeholder inventory, guards, desktop/mobile smoke, validation, and final docs.
- Push marker: pending SYS0 commit.

### SYS1: Change Password

- [x] Page `/admin/change-password`
- [x] Supabase Auth update password flow
- [x] validation and success/error states

#### Execution Log

- Task: SYS1 self-service Change Password page.
- Legacy refs: Vue `old-apps/vue/src/views/systemGaps/ChangePasswordView.vue`, legacy `view-changePassword`.
- Files changed: added `/admin/change-password` Next page and client component; extended shared auth validation schema.
- Auth/API changes: uses browser Supabase client with current session, verifies the current password through `signInWithPassword`, then updates password through `supabase.auth.updateUser({ password })`. No app table stores password and no legacy `public.users.password` path is used.
- UI baseline: preserved purple-to-pink hero, current-user info box, amber must-change warning, three password fields, show-password checkbox, inline success/error messages, full-width purple submit button, and password advice card.
- Validation added: shared Zod schema requires current password, stronger new password syntax, matching confirmation, and new password different from current password; field-level errors render under each field.
- Browser QA: unauth subagent confirmed `/admin/change-password` redirects to `/login?redirect=%2Fadmin%2Fchange-password`, login desktop/mobile has no page-level horizontal overflow, and no console/page/network errors were reported. Authenticated main Playwright smoke confirmed the page renders legacy markers, three password inputs, desktop/mobile no page-level horizontal overflow, and no page/request errors; the form was not submitted so the test password was not changed.
- Commands: passed `npm run lint --workspace @ns-scrap-erp/next`, `npm run type-check --workspace @ns-scrap-erp/next`, `npm run build --workspace @ns-scrap-erp/next`, and `git diff --check`.
- Result: implemented and validated locally.

### SYS2: Migration Tools

- [x] Page `/admin/migration-tools`
- [x] safe UI only; no destructive action without explicit confirmation

#### Execution Log

- Task: SYS2 Migration Tools safe read/design baseline.
- Legacy refs: Vue `old-apps/vue/src/views/admin/MigrationToolsView.vue`, legacy `view-backup`.
- Files changed: added `/admin/migration-tools` Next page and client component; updated sitemap.
- UI baseline: preserved purple-to-pink Backup/Restore hero, storage status card, record count grid, Export Backup card, Restore preview shell, snapshot table, Supabase migration card, Reset Transactions card, Danger Zone card, backup guide, and deferred-action chips.
- Safety constraints: no API route added; page only reads browser localStorage metadata for storage size/snapshot count. Export, restore, cloud push/pull, user migration, reset transactions, snapshot cleanup, auto-backup, and full reset controls are disabled and documented as deferred until destructive-action design is approved.
- Browser QA: unauth subagent confirmed `/admin/migration-tools` redirects to `/login?redirect=%2Fadmin%2Fmigration-tools`, login desktop/mobile has no page-level horizontal overflow, and no console/page/network errors were reported. Authenticated main Playwright smoke confirmed legacy markers render, desktop/mobile have no page-level horizontal overflow, and export/restore/cloud migration/user migration/reset destructive controls are present but disabled.
- Commands: passed `npm run lint --workspace @ns-scrap-erp/next`, `npm run type-check --workspace @ns-scrap-erp/next`, `npm run build --workspace @ns-scrap-erp/next`, and `git diff --check`.
- Result: implemented and validated locally.

### SYS3: Audit and Users Polish

- [x] Audit filters/detail/export
- [x] Users & permissions role matrix polish
- [ ] branch-scope enforcement

#### Execution Log

- Task: SYS3 Audit and Users polish.
- Files changed: `/admin/audit` client and `/admin/users-permissions` client.
- Audit polish: existing server-backed filters and detail modal remain; added client-side CSV export for the currently loaded/filtered audit page. Export includes time, group, event title, event type, actor, target, user agent, and metadata. No API write side effect.
- Users polish: added summary cards for active users, branch-scoped users, users pending Auth link, and users marked must-change-password; existing role matrix remains visible with branch scope, user counts, and key permission flags.
- Branch-scope enforcement: still deferred to SYS5/auth hardening because it requires route/API-wide permission decisions, not a UI-only polish.
- Browser QA: unauth subagent confirmed `/admin/audit` and `/admin/users-permissions` redirect to login with correct redirect params, login desktop/mobile has no page-level horizontal overflow, and no console/page/network errors were reported. Authenticated main Playwright smoke confirmed `/admin/audit` renders `Audit & Activity Log` plus `Export CSV หน้านี้`, `/admin/users-permissions` renders summary cards, desktop/mobile have no page-level horizontal overflow, and no admin page/request errors were reported.
- Commands: passed `npm run lint --workspace @ns-scrap-erp/next`, `npm run type-check --workspace @ns-scrap-erp/next`, `npm run build --workspace @ns-scrap-erp/next`, and `git diff --check`.
- Result: implemented and validated locally.

### SYS4: Reports Index

- [x] Page `/reports`
- [x] link/search all report pages
- [ ] permission-aware visibility

#### Execution Log

- Task: SYS4 Reports Index read baseline.
- Legacy refs: Vue `old-apps/vue/src/views/systemGaps/ReportsView.vue`, legacy `view-reports`.
- Files changed: added `/reports` Next page and client component; updated sitemap and current work handoff.
- UI baseline: preserved legacy-style date filter bar, report tab chips, compact table, status pills, and export button placement. Export remains disabled until a report export contract is designed.
- Behavior: links active report/read pages instead of duplicating each report query. Search filters by report label, owner, status, summary, and path. Date filters are displayed as legacy-compatible shell and deferred for downstream report parameter handoff.
- Permission note: `/reports` remains guarded by `reports.reports.view`; per-link permission-aware filtering remains a SYS5/full navigation hardening follow-up.
- Browser QA: unauth subagent confirmed `/reports` redirects to `/login?redirect=%2Freports`, login desktop/mobile has no page-level horizontal overflow, and no console/page/network errors were reported. Authenticated main Playwright smoke confirmed legacy markers render, export is disabled, desktop/mobile have no page-level horizontal overflow, and no `/reports` page/request errors were reported.
- Commands: passed `npm run lint --workspace @ns-scrap-erp/next`, `npm run type-check --workspace @ns-scrap-erp/next`, `npm run build --workspace @ns-scrap-erp/next`, and `git diff --check`. Type-check was rerun after build regenerated Next route types for `/reports`.
- Result: implemented and validated locally.

### SYS5: Cleanup and Full Route QA

- [x] ตรวจทุก route ใน navigation
- [x] remove stale placeholder routes or mark intentionally deferred
- [x] browser smoke desktop/mobile
- [x] type/lint/build
- [x] final docs update
- [x] commit/push

#### Execution Log

- Task: SYS5 full route QA and System cleanup checkpoint.
- Static coverage: subagent confirmed all 106 navigation item and child routes have dedicated `page.tsx` files; no navigation route depends on the catch-all placeholder. Fixed sitemap summary drift for Reports (`1` real page, `0` placeholders) and Admin (`6` real pages, `0` placeholders).
- Unauth guard: subagent confirmed all 106 protected navigation pages redirect to `/login?redirect=...`, `/api/auth/me`, `/api/admin/auth-events`, and `/api/admin/users` return `401`, login desktop/mobile has no page-level horizontal overflow, and no console/page/network errors were reported.
- Authenticated smoke: main Playwright sweep confirmed SYS routes `/admin/change-password`, `/admin/migration-tools`, `/reports`, `/admin/audit`, and `/admin/users-permissions` render content with expected headings, desktop/mobile have no page-level horizontal overflow, and no SYS page/request errors were reported.
- Validation: passed `npm run lint --workspace @ns-scrap-erp/next`, `npm run type-check --workspace @ns-scrap-erp/next`, `npm run build --workspace @ns-scrap-erp/next`, and `git diff --check`.
- Result: Batch SYS System and Cleanup is complete for current read/design/self-service scope. Branch-scope enforcement and destructive migration/reset actions remain deferred until an auth/API hardening design.

## UI Parity Retrospective Backlog

- Rule point: explicit legacy UI parity started at `59ba09f docs: require legacy ui parity for clone batches` and was strengthened at `b2258d6 docs: strengthen legacy ui parity rule`.
- Audit reason: batches completed before `59ba09f` were not guaranteed to preserve cards, colors, banners, tables, button placement, labels, spacing, and compact density with the same strictness.
- First 10 routes for post-SYS UI parity audit:
  1. `/finance/ap` - revised in UI parity checkpoint
  2. `/finance/ar` - revised in UI parity checkpoint
  3. `/finance/cash-position` - revised in UI parity checkpoint
  4. `/finance/bank` - revised in UI parity checkpoint
  5. `/stock/balance` - revised in UI parity checkpoint
  6. `/stock/ledger` - revised in UI parity checkpoint
  7. `/stock/convert` - revised in UI parity checkpoint
  8. `/stock/adjust` - revised in UI parity checkpoint
  9. `/sales/po-sell` - revised in UI parity checkpoint
  10. `/trading/dashboard` - revised in UI parity checkpoint
- Batch priority after first 10: finish Finance and Debt (`/finance/supplier-advance`, `/finance/customer-advance`), Stock (`/stock/status-convert`, `/stock/customer-return`), Daily Reports (`/owner-daily`, `/daily-report`, with `/dashboard` checked only where shared legacy daily-report cards overlap), Tracking 360, then Dual Costing / Trading / PO routes.

### UI-P1: `/finance/ap` Legacy UI Parity Revision

#### Execution Log

- Task: revise AP page to match legacy/Vue visual baseline after SYS completion.
- Legacy refs:
  - `old-apps/legacy/index.html:10525` header, mega payable card, aging bars, top supplier card, KPI cards, bucket cards, tabs, summary/detail tables.
  - `old-apps/vue/src/views/finance/ApView.vue:100` cloned AP visual baseline.
- Files changed:
  - `apps/next/src/components/purchase-flow/AccountsPayablePageClient.tsx`
  - `apps/next/src/app/api/finance/ap/route.ts`
  - `docs/api/openapi.yaml`
- DB/API changes: no schema change. `GET /api/finance/ap` now accepts `channelId` and `bucket` query filters and returns `filters.channels` so the UI can restore legacy Channel/Aging controls.
- Buttons/actions checked: summary/detail red segmented tabs, supplier/channel/aging filters, export button, reset filter button, AP detail bill button.
- Modal/form checked: existing AP detail modal still opens from bill number; no write form was added.
- Validation added: OpenAPI AP query parameters updated for `channelId` and `bucket`.
- Playwright smoke: authenticated main browser checked `/finance/ap` desktop 1440x900 and mobile 390x844; no page-level horizontal overflow, no console warnings/errors, `/api/auth/me` and `/api/finance/ap` returned 200. Subagent source-level QA confirmed restored header/top cards/KPIs/tables, but its isolated browser session was blocked by login.
- Commands: `npm run lint --workspace @ns-scrap-erp/next`, `npm run type-check --workspace @ns-scrap-erp/next`, `npm run build --workspace @ns-scrap-erp/next`, `git diff --check`, `npx --yes @redocly/cli lint docs/api/openapi.yaml --max-problems 50`.
- Result: `/finance/ap` now restores the legacy AP visual structure: red header, three top cards, colored KPI cards, aging cards, legacy tab/control row, 9-column summary table with footer, legacy detail table order with Channel, and full-filter detail footer total. Export remains `.xlsx` by active business-export rule.
- Commit: this checkpoint.

### UI-P2: `/finance/ar` Legacy UI Parity Revision

#### Execution Log

- Task: revise AR page to match legacy/Vue visual baseline after AP parity checkpoint.
- Legacy refs:
  - `old-apps/legacy/index.html:10315` pending sale banner, AR dashboard, filter row, and AR detail table.
  - `old-apps/vue/src/views/finance/ArView.vue:80` Vue AR visual clone baseline.
- Files changed:
  - `apps/next/src/components/finance/AccountsReceivablePageClient.tsx`
  - `apps/next/src/app/api/finance/ar/route.ts`
  - `docs/api/openapi.yaml`
  - `docs/migration/17-next-remaining-modules-progress.md`
- DB/API changes: no schema change. `GET /api/finance/ar` now accepts `channelId` and `bucket`, returns `filters.channels`, and includes pending stock issue summary for the legacy pending-sale banner.
- Buttons/actions checked: customer/channel/aging filters, active `.xlsx` export button, clear filters, pending-sale link, bill detail modal trigger.
- Modal/form checked: existing AR detail modal still opens from bill number; no write form was added.
- Validation added: OpenAPI AR query parameters updated for `channelId` and `bucket`.
- Playwright smoke: authenticated main browser checked `/finance/ar` desktop 1440x900 and mobile 390x844; no page-level horizontal overflow, no console warnings/errors, `/api/auth/me` and `/api/finance/ar` returned 200. Subagent source audit confirmed the original mismatch and safe patch scope, but its isolated browser session could not authenticate.
- Commands: `npm run lint --workspace @ns-scrap-erp/next`, `npm run type-check --workspace @ns-scrap-erp/next`, `npm run build --workspace @ns-scrap-erp/next`, `git diff --check`, `npx --yes @redocly/cli lint docs/api/openapi.yaml --max-problems 50`.
- Result: `/finance/ar` now restores the legacy AR visual surface: no extra hero header, pending-sale banner when applicable, blue/cyan/teal mega AR card, aging bar card, Top 5 customer card, legacy Customer/Channel/Aging filter row, and detail table columns/colors/order. Export remains `.xlsx` by active business-export rule.
- Commit: this checkpoint.

### UI-P3: `/finance/cash-position` Legacy UI Parity Revision

#### Execution Log

- Task: revise Cash Position page to match legacy/Vue visual baseline.
- Legacy refs:
  - `old-apps/legacy/index.html:10945` Cash Position top dashboard, top accounts, summary cards, net strip, and account table.
  - `old-apps/vue/src/views/finance/CashPositionView.vue:50` Vue Cash Position visual clone baseline.
- Files changed:
  - `apps/next/src/components/finance/CashPositionPageClient.tsx`
  - `docs/migration/17-next-remaining-modules-progress.md`
- DB/API changes: no schema or API route changes; derived legacy totals are computed client-side from the existing `/api/finance/cash-position` payload.
- Buttons/actions checked: no legacy action buttons on this read dashboard; route remains read-only.
- Modal/form checked: none.
- Validation added: none; this is UI parity only.
- Playwright smoke: authenticated main browser checked `/finance/cash-position` desktop 1440x900 and mobile 390x844; no page-level horizontal overflow, no console warnings/errors, `/api/auth/me` and `/api/finance/cash-position` returned 200. Subagent source audit confirmed original mismatch and safe patch scope, but its isolated browser session could not authenticate.
- Commands: `npm run lint --workspace @ns-scrap-erp/next`, `npm run type-check --workspace @ns-scrap-erp/next`, `npm run build --workspace @ns-scrap-erp/next`.
- Result: `/finance/cash-position` now restores the legacy visual surface: no extra hero header, mega Net Cash card, liquid composition donut, AR/AP bars, Top accounts bar list, colored cash/bank/FCD/OD/AR/AP cards, blue/indigo Net Cash strip, and legacy 8-column account table with type badges.
- Commit: this checkpoint.

### UI-P4: `/finance/bank` Legacy UI Parity Revision

#### Execution Log

- Task: revise Bank Statement page to match legacy/Vue visual baseline.
- Legacy refs:
  - `old-apps/legacy/index.html:10690` Bank Statement data flow, opening-balance row, duplicate cleanup behavior, and chart setup.
  - `old-apps/legacy/index.html:10829` legacy hero, KPI cards, chart cards, and statement table visual baseline.
  - `old-apps/vue/src/views/finance/BankStatementView.vue:58` Vue Bank Statement visual clone baseline.
- Files changed:
  - `apps/next/src/components/finance/BankStatementPageClient.tsx`
  - `apps/next/src/app/api/finance/bank/route.ts`
  - `docs/migration/17-next-remaining-modules-progress.md`
  - `docs/migration/00-current-work.md`
- DB/API changes: no schema change. `GET /api/finance/bank` now includes `openingBalance` on filter account options so the active UI can render the legacy opening-balance row for the selected account.
- Buttons/actions checked: account/date controls in hero, active `.xlsx` export, disabled `ลบ Duplicate` destructive action, secondary search/ref/type filters, date sort, clear filters, pagination, and ref detail modal trigger.
- Modal/form checked: existing Bank Statement detail modal still opens from reference number; no write form was added.
- Validation added: none beyond typed API response field; destructive duplicate cleanup remains disabled until audit, backup, rollback, RLS, and API design are approved.
- Playwright smoke: authenticated main browser checked `/finance/bank` desktop 1365x900 and mobile 390x844; no page-level horizontal overflow, no console warnings/errors, `/api/auth/me` and `/api/finance/bank` returned 200. Subagent source audit confirmed the original mismatch and safe patch scope, but its isolated browser session could not authenticate.
- Commands: `npm run lint --workspace @ns-scrap-erp/next`, `npm run type-check --workspace @ns-scrap-erp/next`, `npm run build --workspace @ns-scrap-erp/next`.
- Result: `/finance/bank` now restores the legacy visual surface: blue/indigo/purple Bank Statement hero, account/date/export/duplicate controls in the hero, four colored KPI cards, two chart panels, opening-balance row, legacy statement table columns/header/colors, and colored amount columns. Export remains `.xlsx` by active business-export rule.
- Commit: this checkpoint.

### UI-P5: `/stock/balance` Legacy UI Parity Revision

#### Execution Log

- Task: revise Stock Balance page to match legacy/Vue visual baseline.
- Legacy refs:
  - `old-apps/legacy/index.html:11049` Stock Balance data flow, WIP/status grouping, filters, selected-product panel, charts, matrix table, and detail table.
  - `old-apps/legacy/index.html:11230` legacy Stock Balance hero, KPI/status cards, filters, and export control.
  - `old-apps/vue/src/views/stock/StockBalanceView.vue:62` Vue Stock Balance visual clone baseline.
- Files changed:
  - `apps/next/src/components/stock/StockBalancePageClient.tsx`
  - `apps/next/src/lib/server/stock.ts`
  - `apps/next/src/lib/stock.ts`
  - `docs/api/openapi.yaml`
  - `docs/migration/17-next-remaining-modules-progress.md`
  - `docs/migration/00-current-work.md`
- DB/API changes: no schema change. `GET /api/stock/balance` now includes product metal group on balance rows and product reference options so the UI can restore legacy group filters, group charts, and matrix rows.
- Buttons/actions checked: Matrix/Detail toggle, group/status/branch/product filters, clear selected product, warehouse/search/refresh controls, active `.xlsx` export, selected-product inline panel, row detail modal trigger.
- Modal/form checked: existing row detail modal still opens from Detail; selected product now renders inline summary panel like legacy. No write form was added.
- Validation added: OpenAPI stock balance description and stock row/option schema fields updated for metal-group data.
- Playwright smoke: authenticated main browser checked `/stock/balance` desktop 1365x900 and mobile 390x844; no page-level horizontal overflow, no console warnings/errors, `/api/auth/me` and `/api/stock/balance` returned 200. Summary/detail toggle and selected-product inline panel were exercised. Subagent source audit confirmed the original mismatch and safe patch scope.
- Commands: `npm run lint --workspace @ns-scrap-erp/next`, `npm run type-check --workspace @ns-scrap-erp/next`, `npm run build --workspace @ns-scrap-erp/next`.
- Result: `/stock/balance` now restores the legacy visual surface: blue/cyan hero, five KPI cards, fixed RM/WIP/FG status cards, legacy Matrix/Detail segmented control, group/status/branch/product filters, selected-product inline panel, donut and Top group chart cards, metal-group matrix table with qty/value/footer, and detail table mode with legacy columns. Export remains `.xlsx` by active business-export rule.
- Commit: this checkpoint.

### UI-P6: `/stock/ledger` Legacy UI Parity Revision

#### Execution Log

- Task: revise Stock Ledger page to match legacy/Vue visual baseline.
- Legacy refs:
  - `old-apps/legacy/index.html:3088` duplicate/orphan stock ledger audit hooks and `old-apps/legacy/index.html:5009` / `old-apps/legacy/index.html:5264` destructive cleanup flows.
  - `old-apps/vue/src/views/stock/StockLedgerView.vue:21` toolbar/action visual baseline and `old-apps/vue/src/views/stock/StockLedgerView.vue:49` legacy 12-column table baseline.
- Files changed:
  - `apps/next/src/components/purchase-flow/StockLedgerPageClient.tsx`
  - `apps/next/src/app/api/stock/ledger/route.ts`
  - `apps/next/src/lib/server/stock.ts`
  - `docs/api/openapi.yaml`
  - `docs/migration/17-next-remaining-modules-progress.md`
  - `docs/migration/00-current-work.md`
- DB/API changes: no schema change. `GET /api/stock/ledger` now returns stock reference options and movement types, accepts `movementType`, continues to support branch/product/date filters, and returns `summary.negativeCount` for the legacy negative-stock badge.
- Buttons/actions checked: product/branch/movement/date filters, clear filters, balance-mode segmented control, negative-only badge/filter, active `.xlsx` export, disabled duplicate/orphan cleanup actions, pagination, and refresh.
- Modal/form checked: legacy bill detail/timeline/grade-fix/move-branch actions were audited. Read-only bill/timeline modals are deferred; write actions remain disabled/deferred until permission, audit log, rollback, and stock-side-effect design are approved.
- Validation added: OpenAPI stock ledger query contract updated with `movementType`, reference data, and movement type list.
- Playwright smoke: authenticated main browser checked `/stock/ledger` desktop 1365x900 and mobile 390x844; no page-level horizontal overflow, no console warnings/errors, `/api/auth/me` and `/api/stock/ledger` returned 200. Toolbar, 12 table headings, disabled cleanup buttons, and filter API calls for `movementType`, `branchId`, and `productId` were exercised.
- Commands: `npm run lint --workspace @ns-scrap-erp/next`, `npm run type-check --workspace @ns-scrap-erp/next`, `npm run build --workspace @ns-scrap-erp/next`, `git diff --check`, `npx --yes @redocly/cli lint docs/api/openapi.yaml --max-problems 50`.
- Result: `/stock/ledger` now restores the legacy toolbar-first dense ledger surface: product/branch/movement/date filters, balance-mode segmented control with persisted mode, negative-stock badge, disabled cleanup actions, active `.xlsx` export, and 12-column ledger table with counterparty/type/balance coloring. Read-only bill/timeline modals and write-side grade-fix/move-branch actions remain deferred.
- Commit: this checkpoint.

### UI-P7: `/stock/convert` Legacy UI Parity Revision

#### Execution Log

- Task: revise Grade Adjustment / Stock Convert page to match legacy/Vue visual baseline.
- Legacy refs:
  - `old-apps/legacy/index.html:42095` Grade Adjustment hero, seven KPI cards, filters, table, Confirm Cost/Reverse actions.
  - `old-apps/legacy/index.html:42288` grade-adjustment modal sections for Source, Target, allocation, loss/yield, and cost flow.
  - `old-apps/vue/src/views/stock/GradeStatusConvertView.vue:30` Vue visual clone for hero/cards/filters/table.
- Files changed:
  - `apps/next/src/components/stock/StockOperationPageClient.tsx`
  - `apps/next/src/app/api/stock/convert/route.ts`
  - `docs/migration/17-next-remaining-modules-progress.md`
  - `docs/migration/00-current-work.md`
- DB/API changes: no schema change. `GET /api/stock/convert` now includes display-only fields `sourceType`, `branchWarehouse`, `costStatus`, and `targetUnitCost` for legacy table parity. Existing simplified POST semantics are unchanged.
- Buttons/actions checked: hero `+ ปรับเกรดใหม่`, search, Source Type filter, Cost Status filter, Refresh, disabled Confirm Cost, disabled Reverse, modal cancel, and `บันทึก (Post)` submit button. Confirm/Reverse remain disabled until schema, permission, audit, reverse, and reconciliation design are approved.
- Modal/form checked: convert modal now groups fields into legacy-like Source (red), Target (green), and Loss/Yield/Cost Flow sections. Manual lot allocation, lot preview, cost adjustment P&L, and pending/partial cost workflows remain deferred.
- Validation added: client-side filters for Source Type and Cost Status; display-only API fields are covered by the generic stock operation OpenAPI response shape.
- Playwright smoke: authenticated main browser checked `/stock/convert` desktop 1365x900 and mobile 390x844; no page-level horizontal overflow, no console warnings/errors, `/api/auth/me` and `/api/stock/convert` returned 200. Hero CTA, seven cards, Source Type/Cost Status filters, 14 table headings, and `?new=1` modal sections/submit label were exercised.
- Commands: `npm run lint --workspace @ns-scrap-erp/next`, `npm run type-check --workspace @ns-scrap-erp/next`, `npm run build --workspace @ns-scrap-erp/next`, `git diff --check`, `npx --yes @redocly/cli lint docs/api/openapi.yaml --max-problems 50`.
- Result: `/stock/convert` now restores the legacy Grade Adjustment visual surface: cyan/teal hero with `+ ปรับเกรดใหม่`, seven KPI cards, Source Type and Cost Status filters, 14-column table with red Source and green Target groups, disabled Confirm Cost/Reverse actions, and modal sections for Source, Target, and Loss/Yield/Cost Flow. Full cost allocation, manual lot selection, pending/partial cost, reverse, and cost P&L workflows remain deferred.
- Commit: `5c572fc` (`fix: restore stock convert legacy ui parity`), pushed to `main`.

### UI-P8: `/stock/adjust` Legacy UI Parity Revision

#### Execution Log

- Task: revise Stock Count Adjustment page to match legacy/Vue visual baseline.
- Legacy refs:
  - `old-apps/legacy/index.html:40266` Stock Count Adjustment hero, note-only explanation, KPI cards, toolbar, 13-column table, and usage guidance.
  - `old-apps/vue/src/views/stock/StockAdjustView.vue:30` Vue visual clone for the amber hero and note-only layout.
  - `old-apps/vue/src/views/stock/StockAdjustView.vue:53` toolbar, branch/type/date filters, CSV button, and `old-apps/vue/src/views/stock/StockAdjustView.vue:72` table columns.
- Files changed:
  - `apps/next/src/components/stock/StockOperationPageClient.tsx`
  - `apps/next/src/app/api/stock/adjust/route.ts`
  - `docs/migration/17-next-remaining-modules-progress.md`
  - `docs/migration/00-current-work.md`
- DB/API changes: no schema change. `GET /api/stock/adjust` now includes display-only `branchId` and `branchWarehouse` fields to support legacy branch filtering/table parity. Existing simplified note-only POST semantics are unchanged.
- Buttons/actions checked: Quick Adjust CTA, search, branch/type/date filters, disabled CSV placeholder, Refresh, modal cancel/submit, disabled row action placeholder. CSV/export and reverse remain deferred until export contract, permission, audit, and rollback design are approved.
- Modal/form checked: existing adjust modal still opens from `?new=1`; this slice focused on list/table parity and preserved the current write form behavior.
- Validation added: client-side branch/type/date filters and note-only KPI totals for LOSS/GAIN quantities and note values.
- Playwright smoke: authenticated main browser checked `/stock/adjust` desktop 1365x900 and mobile 390x844; no page-level horizontal overflow, no console warnings/errors, `/api/auth/me` and `/api/stock/adjust` returned 200. Note-only warning, five cards, toolbar, 13 table headings, usage box, and `?new=1` modal were exercised.
- Commands: `npm run lint --workspace @ns-scrap-erp/next`, `npm run type-check --workspace @ns-scrap-erp/next`, `npm run build --workspace @ns-scrap-erp/next`, `git diff --check`, `npx --yes @redocly/cli lint docs/api/openapi.yaml --max-problems 50`.
- Result: `/stock/adjust` now restores the legacy Stock Count Adjustment visual surface: amber/orange hero, note-only warning, five KPI cards, Quick Adjust toolbar with branch/type/date filters, disabled CSV placeholder, 13-column adjustment table, type/status badges, and bottom usage guidance. CSV/export and reverse remain deferred.
- Commit: `a4ee59d` (`fix: restore stock adjust legacy ui parity`), pushed to `main`.

### UI-P9: `/sales/po-sell` Legacy UI Parity Revision

#### Execution Log

- Task: revise PO Sell page to match legacy/Vue visual baseline.
- Legacy refs:
  - `old-apps/legacy/index.html:22331` PO Sell info banner, dashboard cards, top customer/outstanding panels, filters, table, and disabled-safe action surface.
  - `old-apps/legacy/index.html:22476` create/edit modal and write flow surface, kept deferred in Next.
  - `old-apps/vue/src/views/sales/PoSellView.vue:101` Vue visual clone for the same dashboard/list structure.
- Files changed:
  - `apps/next/src/components/sales/PoSellPageClient.tsx`
  - `docs/migration/17-next-remaining-modules-progress.md`
  - `docs/migration/00-current-work.md`
- DB/API changes: no schema or API route change. The UI uses existing `expectedDelivery`, remaining qty/amount, match status, and summary fields.
- Buttons/actions checked: search/date filters, clear filters, match-status chips, disabled `+ PO Sell ใหม่`, active `.xlsx` export, disabled row edit/cancel action placeholders. Create/edit/cancel remain deferred until permission, audit, validation, and reconciliation with Cost Allocator/Sales Bill are designed.
- Modal/form checked: legacy multi-line item modal was audited but not implemented in this read/display slice; write-modal behavior remains deferred.
- Validation added: client-side top customer aggregation, outstanding PO panel, and legacy match-status chip filtering.
- Playwright smoke: authenticated main browser checked `/sales/po-sell` desktop 1365x900 and mobile 390x844; no page-level horizontal overflow, no console warnings/errors, `/api/auth/me` and `/api/sales/po-sell` returned 200. Info banner, six cards, Top Customer/Outstanding panels, chips, disabled CTA, export, and 12 table headings were exercised.
- Commands: `npm run lint --workspace @ns-scrap-erp/next`, `npm run type-check --workspace @ns-scrap-erp/next`, `npm run build --workspace @ns-scrap-erp/next`, `git diff --check`, `npx --yes @redocly/cli lint docs/api/openapi.yaml --max-problems 50`.
- Result: `/sales/po-sell` now restores the legacy PO Sell visual surface: compact green info banner, six KPI cards, Top 5 Customer panel, PO outstanding panel, legacy search/date row, match-status chips, 12-column table, active `.xlsx` export, and disabled create/edit/cancel actions. PO Sell write/cancel modal behavior remains deferred.
- Commit: `6a4dfa8` (`fix: restore po sell legacy ui parity`), pushed to `main`.

### UI-P10: `/trading/dashboard` Legacy UI Parity Revision

#### Execution Log

- Task: revise Trading Dashboard page to match legacy/Vue visual baseline and close the first-10 post-SYS UI parity audit.
- Legacy refs:
  - `old-apps/legacy/index.html:40502` Trading Dashboard date defaults, trading purchase/sales/deal/product/trend calculations.
  - `old-apps/legacy/index.html:40593` hero, date filter, mega Trading Performance card, AR/AP card, KPI cards, trend/donut/top product panels, and dashboard tables.
  - `old-apps/vue/src/views/dualCosting/TradingDashboardView.vue:54` Vue visual clone for the same dashboard surface.
- Files changed:
  - `apps/next/src/app/api/trading/dashboard/route.ts`
  - `apps/next/src/components/trading/TradingDashboardPageClient.tsx`
  - `docs/api/openapi.yaml`
  - `docs/migration/17-next-remaining-modules-progress.md`
  - `docs/migration/00-current-work.md`
- DB/API changes: no schema change. `GET /api/trading/dashboard` now remains read-only but also reads `purchase_bills` and `sales_bills` with `transaction_mode = 'TRADING'` plus `trading_deals`, using subtotal-before-VAT totals for Trading dashboard parity. It returns purchase rows, sales rows, product analysis, daily trend, matched COGS, unmatched sales/purchase, AR/AP, and completed deal totals.
- Buttons/actions checked: legacy page has only date controls for this dashboard. Next now keeps From/To date controls and a refresh button; no Trading Matching write actions were added.
- Modal/form checked: none in legacy dashboard; match/reverse/cleanup modals belong to Trading Matching and remain deferred.
- Validation added: typed API response model and OpenAPI Trading Dashboard response fields updated for `purchases`, `sales`, `productList`, `trend`, and legacy summary fields.
- Playwright smoke: authenticated main browser checked `http://localhost:3100/trading/dashboard` on desktop 1365x900 and mobile 390x844; `/api/auth/me` and `/api/trading/dashboard?from=2026-05-01&to=2026-05-19` returned 200, no page-level horizontal overflow, no new console errors, and legacy hero/date filter/Trading Performance/AR-AP/KPI/trend/matching/top-product/purchase/sales/product surfaces were present. Subagent unauth smoke confirmed route redirects to login and unauth API returns 401.
- Commands: `npm run lint --workspace @ns-scrap-erp/next`, `npm run type-check --workspace @ns-scrap-erp/next`, `npm run build --workspace @ns-scrap-erp/next`, `git diff --check`, `npx --yes @redocly/cli lint docs/api/openapi.yaml --max-problems 50`.
- Result: `/trading/dashboard` restores the legacy visual surface: violet/fuchsia hero, date filter card, mega Trading Performance card, Trading AR/AP card, ten KPI cards, trend chart, matching donut, top product bars, Trading Purchases/Sales tables, and Trading by Product table. Write/matching actions remain deferred to the Trading Matching flow.
- Commit: `8ea1bbc fix: restore stock operation legacy ui parity`.

## Current Priority Queue

1. Batch PRE: System Map and API Contract Baseline
2. Batch S: Stock
3. Batch F: Finance and Debt
4. Batch DR: Daily Reports / รายงานประจำวัน
5. Batch T: Tracking 360
6. Batch D: Dual Costing / Trading / PO
7. Batch FF: Foreign Finance
8. Batch A: Finance / Accounting
9. Batch M: Main Dashboards and Operational Control
10. Batch SYS: System and Cleanup

### UI-FADV: `/finance/supplier-advance` and `/finance/customer-advance` Legacy UI Parity Revision

#### Execution Log

- Task: revise Supplier Advance and Customer Advance pages to match the legacy compact visual baseline after the first-10 post-SYS UI parity audit.
- Legacy refs:
  - `old-apps/legacy/index.html:23414` Supplier Advance amber info banner, two summary cards, blue create CTA, 11-column table, cancel action, empty state, and modal/write flow.
  - `old-apps/legacy/index.html:23513` Customer Advance emerald info banner, two summary cards, blue create CTA, 11-column table, cancel action, empty state, and modal/write flow.
  - `old-apps/vue/src/views/finance/SupplierAdvanceView.vue:42` and `old-apps/vue/src/views/finance/CustomerAdvanceView.vue:42` simplified Vue clone of the same compact surface.
- Files changed:
  - `apps/next/src/components/finance/SupplierAdvancePageClient.tsx`
  - `apps/next/src/components/finance/CustomerAdvancePageClient.tsx`
  - `docs/migration/17-next-remaining-modules-progress.md`
  - `docs/migration/00-current-work.md`
- DB/API changes: no schema or API route changes. Both pages still read from `bank_statement` `SADV`/`CADV` rows and expose missing dedicated advance/allocation tables as source metadata.
- Buttons/actions checked: disabled `+ จ่ายล่วงหน้าใหม่`, disabled `+ รับล่วงหน้าใหม่`, active `.xlsx` export kept as secondary Next capability, and disabled row `ยกเลิก` placeholders. Real create/cancel/allocation writes remain deferred.
- Modal/form checked: legacy modal/form was audited but not implemented in this read/display slice because the target advance/allocation schema and write semantics remain unresolved.
- Validation added: UI-only parity; no API validation change.
- Playwright smoke: authenticated main browser checked `/finance/supplier-advance` and `/finance/customer-advance` at `http://localhost:3100` on desktop 1365x900 and mobile 390x844; both APIs returned 200, no page-level horizontal overflow, no new console errors, and legacy banner/card/disabled CTA/Rate column/table/empty-state/export surfaces were present. Subagent unauth smoke confirmed both routes redirect to login and both APIs return 401.
- Commands: `npm run lint --workspace @ns-scrap-erp/next`, `npm run type-check --workspace @ns-scrap-erp/next`, `npm run build --workspace @ns-scrap-erp/next`, `git diff --check`.
- Result: `/finance/supplier-advance` and `/finance/customer-advance` now restore the legacy compact advance visual surface while preserving read-only Bank Statement baselines. Create, cancel, allocation, and dedicated advance table writes remain deferred.
- Commit: `b1b3b53 fix: restore finance advance legacy ui parity`.

### UI-STOCK2: `/stock/status-convert` and `/stock/customer-return` Legacy UI Parity Revision

#### Execution Log

- Task: revise Status Convert and Customer Return pages to match the legacy compact visual baseline after the first-10 post-SYS UI parity audit.
- Legacy refs:
  - `old-apps/legacy/index.html:48148` Status Convert purple/pink header, blue usage tip, search/action toolbar, 10-column table, status chips, empty state, and modal flow.
  - `old-apps/legacy/index.html:39796` Customer Return purple/pink header, 3 KPI cards, search/branch/CSV toolbar, 11-column table, return status/action cells, empty state, and guidance block.
  - `old-apps/vue/src/views/stockGaps/StatusConvertView.vue:185` and `old-apps/vue/src/views/stockGaps/CustomerReturnView.vue:96` Vue clone baselines.
- Files changed:
  - `apps/next/src/components/stock/StockOperationPageClient.tsx`
  - `apps/next/src/app/api/stock/status-convert/route.ts`
  - `apps/next/src/app/api/stock/customer-return/route.ts`
  - `docs/migration/17-next-remaining-modules-progress.md`
  - `docs/migration/00-current-work.md`
- DB/API changes: no schema change. `GET /api/stock/status-convert` adds display-only `note` and `createdBy`; `GET /api/stock/customer-return` adds display-only `branchId` and `warehouseId` so the legacy branch filter does not compare by branch name.
- Buttons/actions checked: Status Convert `+ ปรับสถานะใหม่`, Customer Return disabled `.CSV` placeholder, disabled `📤 ส่งคืน` placeholder, and legacy empty states. Real send-back/open export behavior remains deferred until audit/rollback/export contracts are designed.
- Modal/form checked: existing Next write forms remain reachable through `?new=1`; this slice did not change POST semantics, stock policy, WAC policy, status movement mapping, customer-return send-back semantics, or permissions.
- Validation added: UI/API display-only parity; OpenAPI stock operation list response already permits endpoint-specific row fields through `additionalProperties`.
- Playwright smoke: authenticated main browser checked `/stock/status-convert` and `/stock/customer-return` at `http://localhost:3100` on desktop 1365x900 and mobile 390x844; both APIs returned 200, no page-level horizontal overflow, no new console warnings/errors, and legacy title/card/toolbar/table/action markers were present. Subagent unauth smoke confirmed both routes redirect to login, both APIs return 401, login desktop/mobile has no horizontal overflow, and no related console/page/network errors were reported.
- Commands: `npm run lint --workspace @ns-scrap-erp/next`, `npm run type-check --workspace @ns-scrap-erp/next`, `npm run build --workspace @ns-scrap-erp/next`, `git diff --check`.
- Result: `/stock/status-convert` and `/stock/customer-return` now restore the legacy compact stock operation visual surfaces while preserving existing write semantics. Send-back, CSV export, field-level validation, reverse/audit/rollback, product status mutation, and cost-policy hardening remain deferred.
- Commit: `8ea1bbc fix: restore stock operation legacy ui parity`.

### UI-DR: Daily Reports / รายงานประจำวัน Legacy UI Parity Revision

#### Execution Log

- Task: revise `/owner-daily`, `/daily-report`, and shared `/dashboard` report-card overlap toward the legacy/Vue visual baseline after Stock parity.
- Legacy refs:
  - `old-apps/legacy/index.html:34955` Owner Daily amber/orange/rose header, end-of-day gap card, today cash/AR/AP cards, Trading Pending, Pending Sale, actual activity, due tables, loan/expense/pending panels.
  - `old-apps/legacy/index.html:46267` Daily Report amber/orange header, prev/next/today controls, two large KPI cards, group breakdown, bill tables, expense bars, cash movement, analytics dashboard, top tables, and print action.
  - `old-apps/legacy/index.html:12358` shared Dashboard report cards and filter/data overlap; Vue clone refs are `old-apps/vue/src/views/trackingDashboards/OwnerDailyView.vue`, `DailyReportView.vue`, and `DashboardView.vue`.
- Files changed:
  - `apps/next/src/lib/server/main-dashboards.ts`
  - `apps/next/src/components/main/MainDashboardsPageClient.tsx`
  - `docs/migration/00-current-work.md`
  - `docs/migration/17-next-remaining-modules-progress.md`
- DB/API changes: no schema change. Shared dashboard helper adds read-only derived fields from existing tables: bank-statement cash movement by type/account, due-today AR/AP rows with due/overdue fields, owner daily loan/expense/FG/pending/trading metrics, daily report group breakdown, expense category summary, range KPI, top supplier/customer/product rows, salesperson purchase summary, and daily purchase-vs-sales trend.
- Buttons/actions checked: Daily Report `← วันก่อน`, `วันถัดไป →`, `📍 วันนี้`, range buttons, and `🖨 Export PDF / Print` are UI/read-only controls; print calls browser print dialog only. Owner Daily Trading/Pending buttons remain disabled placeholders. No posting, matching, stock issue conversion, payment, receipt, approval, or fix action is enabled.
- Validation added: `npm run lint --workspace @ns-scrap-erp/next` and `npm run type-check --workspace @ns-scrap-erp/next` passed after the first code patch.
- Playwright smoke: authenticated main browser checked `/owner-daily`, `/daily-report`, and `/dashboard` at `http://localhost:3100` on desktop 1365x900 and mobile 390x844; all three APIs returned 200, no page-level horizontal overflow, no new console warnings/errors, and legacy title/card/table/action markers were present. Subagent unauth smoke confirmed all three protected routes redirect to login, all three APIs return 401, login desktop/mobile has no horizontal overflow, and no related console/page/network errors were reported.
- Commands: `npm run lint --workspace @ns-scrap-erp/next`, `npm run type-check --workspace @ns-scrap-erp/next`, `npm run build --workspace @ns-scrap-erp/next`, `git diff --check`.
- Result: `/owner-daily` and `/daily-report` now restore the legacy Daily Reports visual/data surface while preserving read-only behavior. Shared `/dashboard` report-card overlap remains compatible with the expanded helper fields. Posting, matching, stock issue conversion, payment, receipt, approval, anomaly fix, and server-side export/write actions remain deferred.
- Commit: pending.
