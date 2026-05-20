# 13 Next Master Data Progress

## Objective

ติดตามงานย้ายกลุ่ม `ข้อมูลหลัก` จาก Vue/legacy visual baseline มายัง Next.js โดยโฟกัส route จริง, API route, Prisma data wiring, form baseline, validation และ smoke test

## Reporting Rule

- อัปเดตเอกสารนี้หลังจบทุก batch
- อัปเดตทันทีเมื่อมีการเปลี่ยน schema/API contract ที่กระทบหลายหน้า
- อัปเดตผล validation หลังรัน build, type-check, lint หรือ Playwright/API smoke
- ถ้าหน้าใดใช้ visual fixture เพราะ DB ยังไม่มีข้อมูล ต้องบันทึกให้ชัดว่าเป็น fixture ไม่ใช่ข้อมูลจริง
- Import pages ยังไม่อยู่ใน scope ของ batch นี้

## Scope

### In Scope

| Route | Label | Status |
|---|---|---|
| `/master-data/customers` | ลูกค้า | Enhanced CRUD/export/validation Done |
| `/master-data/salespersons` | พนักงานขาย (Sales) | Batch 1 Done |
| `/master-data/suppliers` | ผู้ขาย | Enhanced CRUD/export/validation Done |
| `/master-data/products` | รายการสินค้า | Batch 3 baseline Done; product parent menu is submenu-only |
| `/master-data/branches` | สาขา / คลัง | Batch 2 Done |
| `/master-data/warehouses` | คลังสินค้า | Retired from active Next route; use Branches as the business-facing สาขา / คลัง master |
| `/master-data/accounts` | บัญชีเงิน | Simplified Done - no separate code column; account number/name are the display references |
| `/master-data/channels` | ช่องทางขาย | Simplified Done - sales channels only in UI/API |
| `/master-data/expense-categories` | หมวดค่าใช้จ่าย | Simplified Done - no code/parent field |
| `/master-data/directors` | กรรมการ/พนักงาน | Batch 4 Done - Target table migration added |
| `/master-data/machines` | รายการเครื่องจักร | Simplified Done - no code/maintenance status; branch shows as สาขา/คลัง name; machine type dropdown is DB-backed; machine parent menu is submenu-only |
| `/master-data/machine-types` | ประเภทเครื่องจักร | Done - DB-backed lookup for machine form |
| `/master-data/production-lines` | Production Line | Simplified Done - no code; branch shows as สาขา/คลัง name |
| `/master-data/currencies` | สกุลเงิน | Simplified Done - no user-facing code; symbol is required |
| `/master-data/beneficiaries` | ผู้รับเงินต่างประเทศ | Batch 4 Done |
| `/master-data/payment-methods` | วิธีจ่าย/รับเงิน | Batch 4 Done - Target table migration added |
| `/master-data/remittance-purposes` | วัตถุประสงค์โอน | Simplified Done - no user-facing code |

### Out of Scope for This Batch

| Route | Label | Reason |
|---|---|---|
| `/master-data/import` | Import Master จาก Excel | Not ported; removed from Next navigation until import design is approved |
| `/master-data/import-transactions` | Import บิลซื้อ/บิลขาย | Not ported; removed from Next navigation until transaction import design is approved |

## Standard Work per Page

1. สร้าง Next route จริงใต้ `apps/next/src/app/master-data/...`
2. ทำ UI baseline ให้ตรง Vue/legacy visual surface ที่ผ่านการ audit แล้ว
3. สร้าง API route ใต้ `apps/next/src/app/api/master-data/...`
4. ดึงข้อมูลจริงจาก `dev-target` ผ่าน Prisma
5. เพิ่ม domain mapper/schema แยกจาก UI
6. ทำ search/sort/filter baseline
7. ทำ add/edit modal baseline พร้อม validation ขั้นต้น
8. ทำ active/inactive หรือ soft state ถ้าตารางรองรับ
9. ใส่ visual fixture เฉพาะกรณีจำเป็นเพื่อไม่ให้ baseline ว่างตอนตรวจ UI
10. รัน validation และบันทึกผล

## Batch Plan

| Batch | Pages | Goal | Status |
|---|---|---|---|
| 0 | `customers`, shared shell/API foundation | ยืนยัน Next + Prisma path และ customer baseline | Done |
| 1 | `salespersons`, `currencies`, `expense-categories`, `channels` | หน้าง่าย/โครงสร้างซ้ำ เพื่อสร้าง reusable pattern | Done |
| 2 | `branches`, `warehouses`, `accounts` | ข้อมูลองค์กร/บัญชีและ FK พื้นฐาน | Done |
| 3 | `suppliers`, `products` | field เยอะและใช้ต่อ transaction | Done |
| 4 | `directors`, `machines`, `production-lines`, `beneficiaries`, `payment-methods`, `remittance-purposes` | simple master ที่เหลือและ lookup ต่างประเทศ/การเงิน | Done - DB-backed after target migration |
| B | `products` | ยกระดับสินค้าเป็น specialized customer-style master page | Done |
| C1 | `branches`, `warehouses`, `accounts` | ยกระดับข้อมูลองค์กร/คลัง/บัญชีให้ใช้ shared customer-style list pattern และ API guard | Done |
| C2 | `salespersons`, `channels`, `expense-categories`, `currencies` | harden reference masters ที่เหลือในกลุ่ม sales/reference | Done |
| C3 | `directors`, `machines`, `production-lines`, `beneficiaries`, `payment-methods`, `remittance-purposes` | harden production/foreign/setup masters ที่เหลือ | Done |

## Remaining Customer-Style Hardening Plan

Batch A is intentionally skipped for this Next master-data track. In older docs, Batch A refers to Vue clone visual audit work and is not part of the remaining Next master-data hardening.

### Batch B: Products Specialized Page

Goal:
- Make `/master-data/products` follow the same practical master-data UX pattern as `customers` and `suppliers`.
- Keep the existing DB data safe. Any DB/schema change must be additive only.

Tasks:
- Replace the generic shared products page with a specialized products client.
- Load product rows once, then run search/filter/sort/count/pagination in the frontend for normal master-data use.
- Put result count and pagination controls together above the table.
- Let row click open detail/edit modal; do not add a select column unless there is a real batch action.
- Add product filters where useful:
  - product type
  - metal group
  - item status: `RM`, `WIP`, `FG`
  - active/inactive
- Add a product form with clear fields:
  - code
  - name
  - type
  - unit
  - metal group
  - item status
  - grade
  - standard price
  - standard cost
  - active
- Validate syntax for every changed input:
  - code format
  - name/grade/unit text
  - item status option
  - non-negative numeric price/cost where applicable
- Keep active/inactive as a toggle in both table and form.
- Add `.xlsx` export for products if the current schema has enough fields to make the export useful.
- Add or verify route-level API permission guards:
  - `master.products.view`
  - `master.products.create`
  - `master.products.update`
  - `master.products.status`
  - `master.products.export` if export is added.
- Update docs after implementation and record validation.

Validation before closing Batch B:
- `npm run lint --workspace @ns-scrap-erp/next`
- `npm run type-check --workspace @ns-scrap-erp/next`
- `npm run build`
- API/page smoke for `/master-data/products` and product API routes.

### Batch C: Remaining Master Hardening

Goal:
- Bring the remaining master-data pages up to the same operating pattern where it makes sense, without overbuilding small reference screens.
- Keep work reviewable by splitting Batch C into smaller sub-batches and pushing checkpoints after validation.

Batch C1: Organization / finance setup
- `/master-data/branches`
- `/master-data/warehouses` (retired from active Next routes on 2026-05-20)
- `/master-data/accounts`

Tasks:
- Done: kept C1 on the shared master UI because the current fields are simple and do not need a page-specific component yet.
- Done: shared master UI now loads rows once and handles search/sort/count/pagination in the frontend.
- Done: row click opens detail/edit modal; the old select checkbox column was removed because there is no real batch action.
- Done: active toggle works in the table and form where the table supports active state.
- Done: shared form schema now validates branch/account code/name/phone/address/bank/account/currency/numeric fields more strictly before save. Warehouse validation was retired with the active warehouse master route.
- Done: C1 API routes now enforce route-level permissions:
  - GET requires `master.reference.view`
  - POST/PATCH requires `master.reference.manage`
- Decision: skipped `.xlsx` export for C1 for now because these are small setup/reference lists and the current user-facing export requirement is on customer/supplier/product. Add C1 export later only if UAT asks for it.

Batch C2: Sales/reference masters
- `/master-data/salespersons`
- `/master-data/channels`
- `/master-data/expense-categories`
- `/master-data/currencies`

Tasks:
- Done: kept these pages on the shared master UI because current field sets are small reference/setup data.
- Done: shared UI already follows the customer-style list pattern after C1.
- Done: added route-level API permission guards:
  - GET requires `master.reference.view`
  - POST/PATCH requires `master.reference.manage`
- Done: added stricter validation for C2 fields through shared schema and route checks:
  - email/phone syntax for salespersons
  - non-negative commission/base salary/rate values
  - channel type must be `purchase` or `sales`
  - currency code must be 3 uppercase English letters such as `THB`
- Done: currencies are marked as not supporting active state in the shared UI because the current DB table/API does not persist active/inactive.
- Decision: skipped `.xlsx` export for C2 for now because these are small reference lists. Add export later only if UAT asks for it.

Batch C3: Production / foreign / setup masters
- `/master-data/directors`
- `/master-data/machines`
- `/master-data/production-lines`
- `/master-data/beneficiaries`
- `/master-data/payment-methods`
- `/master-data/remittance-purposes`

Tasks:
- Done: `machines` and `production-lines` remain production-critical masters and keep branch name, active state, name, and metadata visible in the shared UI. Separate business code fields were removed from UI/API/DB after backup.
- Done: shared validation now covers production/foreign/setup fields:
  - non-negative capacity, process cost, prices, credit, and numeric values
  - yield percent 0-100
  - SWIFT code syntax 8 or 11 alphanumeric characters
  - practical Thai/English business text for country, responsible person, required document, unit, grade, and metal group
- Done: simple target-table masters now enforce route-level permissions through the shared helper:
  - list requires `master.reference.view`
  - save/status update requires `master.reference.manage`
- Done: simple target-table masters validate key enums:
  - directors type
  - machine type and maintenance status
  - payment method type
- Done: beneficiaries API now enforces `master.reference.view/manage` and validates account currency as a 3-letter code.
- Decision: `directors` remains setup-only until finance/director advance flows define stronger requirements.
- Decision: skipped `.xlsx` export for C3 for now because these are setup/reference lists. Add export later only if UAT asks for it.

Validation before closing each Batch C sub-batch:
- `npm run lint --workspace @ns-scrap-erp/next`
- `npm run type-check --workspace @ns-scrap-erp/next`
- `npm run build`
- API/page smoke for the touched routes.

Continuation rule:
- After this plan is committed, work should continue in order: Batch B, then C1, C2, C3.
- Do not pause for confirmation between sub-batches unless a schema change could delete/overwrite data, a route must be removed, or a UX decision would change a business flow.
- Update this tracker and `09-implementation-tasklist.md` after every batch or sub-batch.

## Current Status as of 2026-05-18

- Current git checkpoint is `07d1355 docs: update auth permission status`.
- The branch was reset back to a pre-shadcn baseline earlier after the sidebar/shadcn design experiment. Those experimental design commits are not part of the current working baseline.
- Tailwind remains v3 (`tailwindcss ^3.4.17`). Tailwind v4 migration and shadcn component adoption are not current active changes.
- The current layout is the pre-shadcn Next shell with the simple dark sidebar/topbar.

- Next app created in `apps/next`.
- Next 16, React 19, Prisma 7, `@prisma/adapter-pg`, Supabase client, TypeScript and Tailwind are installed.
- Prisma schema has been introspected from `dev-target`.
- `Customer UI -> Next API Route -> Prisma -> Supabase Postgres` is the current data path.
- `/master-data/customers` has a real Next page, client-side table search/sort/filter/pagination/count, add/edit modal, structured Thai address form, API routes, Excel-compatible export, and all-or-nothing `.xlsx` import using the same `ลูกค้า` sheet/columns that export produces.
- Customer form/API contract now includes:
  - customer type constrained to `บุคคล` or `นิติบุคคล`
  - separate `market_scope` for `ในประเทศ` / `ต่างประเทศ`
  - individual-customer person fields: `name_title`, `first_name`, `last_name`
  - contact person fields: `contact_title`, `contact_first_name`, `contact_last_name`
  - syntax validation for email, phone, tax ID, postcode, person names, business names, address text, and numeric credit fields
- Customer table UX updates:
  - master-list search/filter/sort/count/pagination run in the frontend after one list load
  - row click opens detail/edit; the old select/checkbox column was removed
  - result count and pagination controls are shown together above the table
  - customer export uses `/api/master-data/customers/export` and asks the database for all rows matching the current search/filter/sort, not just the visible page slice
  - customer import uses `/api/master-data/customers/import`, accepts the exported `.xlsx` workbook sheet `ลูกค้า`, validates with the shared customer save schema, and upserts by canonical `CUS...` id/code; blank customer codes are generated as new `CUS...` rows
  - customer delete/soft-delete table action was removed; active status can be changed from the edit form or the status-column toggle through `/api/master-data/customers/[id]/status`
- Supplier table UX now follows the same customer-style master pattern:
  - master-list search/filter/sort/count/pagination run in the frontend after one list load
  - row click opens detail/edit; no row select column is used
  - result count and pagination controls are shown together above the table
  - supplier export uses `/api/master-data/suppliers/export` and generates a real `.xlsx` workbook
- Active/inactive form controls now use a toggle-style switch instead of the old checkbox in customer, supplier, and shared master-data forms.
- Thai address form now follows the postcode-first pattern: postcode filters/auto-fills province, district, and subdistrict where possible.
- Added project-level validation guidance:
  - `AGENTS.md` now requires syntax validation for every new/changed form/API field.
  - `.agents/skills/ns-scrap-erp-input-validation/SKILL.md` documents validation and Thai address form patterns.
- Batch 1 pages now have real Next routes, shared master-data list/form UI, API routes, Prisma/dev-target reads, add/edit baseline, search/sort, and active/inactive where the source table supports it:
  - `/master-data/salespersons`
  - `/master-data/currencies`
  - `/master-data/expense-categories`
  - `/master-data/channels`
- Batch 2 pages now have real Next routes, shared master-data list/form UI, API routes, Prisma/dev-target reads, add/edit baseline, search/sort, and active/inactive:
  - `/master-data/branches`
  - `/master-data/warehouses` was later retired from active Next routes; use `/master-data/branches` for the business-facing `สาขา / คลัง` master.
  - `/master-data/accounts`
- Batch 3 baseline routes exist:
  - `/master-data/products` has been upgraded from the shared generic page to a specialized customer-style products page.
  - Product list UX now loads once and runs search/filter/sort/count/pagination in the frontend.
  - Product filters cover type, metal group, item status `RM/WIP/FG`, and active state.
  - Product row click opens the edit modal; no select column is used.
  - Product form includes code, name, type, unit, metal group, item status, grade, standard price, standard cost, target margin %, and active toggle.
  - Product form/API now use product-specific Zod validation instead of the generic master-data schema.
  - Product export uses `/api/master-data/products/export` and generates a real `.xlsx` workbook with summary and product sheets.
  - `/master-data/suppliers` has been upgraded to the customer-style specialized page with frontend search/filter/sort/count/pagination, structured Thai address form, add/edit modal, syntax validation, active toggle, and `.xlsx` export.
- Batch 4 pages now have real Next routes, shared master-data list/form UI, API routes, add/edit baseline, search/sort, and active/inactive:
  - `/master-data/beneficiaries` uses real Prisma/dev-target table `overseas_recipients`.
  - `/master-data/directors`, `/master-data/machines`, `/master-data/production-lines`, `/master-data/payment-methods`, and `/master-data/remittance-purposes` now have additive target-table migrations.
  - Final clearer table names are `director_employees`, `production_machines`, `production_lines`, `payment_methods`, and `overseas_remittance_purposes`.
  - The migration uses `create table if not exists`, non-destructive indexes/triggers, RLS enablement, and `insert ... on conflict do nothing` seed rows so existing data is not overwritten.
  - Next APIs for those five routes now use Prisma target tables instead of frontend fixtures.
- Legacy usage check for Batch 4 fixture-backed masters:
  - `directors` exists in legacy local seed/sync/import/master CRUD lists, but no direct transaction flow usage was found in the current search pass.
  - `machines` exists in legacy local seed/master CRUD and is used by Production Order validation, machine name lookup, machine selector filtering by branch/active state, production reports, and machine utilization.
  - `productionLines` exists in legacy local seed/master CRUD and is used by Production Order line lookup, detail display, and line selector filtering by branch/active state.
  - Therefore `machines` and `production-lines` should be treated as production-critical masters before UAT even though they are not real tables in the old DB.
- Shared master-data contract added for Next batch pages:
  - `apps/next/src/lib/master-data.ts`
  - `apps/next/src/components/master-data/shared/MasterDataPageClient.tsx`
  - `apps/next/src/lib/master-data-page-configs.ts`
  - `apps/next/src/lib/server/master-data.ts`
  - `apps/next/src/lib/server/simple-master-tables.ts`
- Added `apps/next/eslint.config.mjs` so `npm run lint` works with ESLint 9 and ignores generated Prisma output.
- Thai address reference tables exist in `dev-target`: provinces 77, districts 928, subdistricts 7,436.
- Next login now uses Supabase Auth and protected routes through Next `proxy.ts`; normalized app permission checks are enforced for mapped paths, with legacy admin/owner fallback during transition.
- Local development login prefill can be supplied through `DEV_LOGIN_IDENTIFIER` and `DEV_LOGIN_PASSWORD`; these are intentionally dev-only and not production public env vars.
- Auth/role/RLS remains incomplete for final UAT because full table-level RLS rollout and branch-scope enforcement are still pending.
- Import pages remain out of scope and were not ported in Batch 1 or Batch 2.

## Latest Validation

| Date | Command / Check | Result | Notes |
|---|---|---|---|
| 2026-05-17 | `npm run build` in `apps/next` | Passed | Next route table includes customer page and master-data API routes |
| 2026-05-17 | API smoke `/api/master-data/customers` | Passed | Returned customer rows from dev DB |
| 2026-05-17 | API smoke `/api/master-data/thai-address` | Passed | Returned Thai address reference rows |
| 2026-05-17 | Playwright smoke `/master-data/customers` | Passed | Page title, sidebar link, modal and province field visible |
| 2026-05-17 | Batch 1 `npm run lint` in `apps/next` | Passed | ESLint 9 config added; generated Prisma output ignored |
| 2026-05-17 | Batch 1 `npm run build` in `apps/next` | Passed | Route table includes `salespersons`, `currencies`, `expense-categories`, `channels` pages and API routes |
| 2026-05-17 | Batch 1 `npm run type-check` in `apps/next` | Passed | Re-run after build refreshed `.next/types` |
| 2026-05-17 | Batch 2 `npm run lint` in `apps/next` | Passed | Shared master-data page/API code included |
| 2026-05-17 | Batch 2 `npm run build` in `apps/next` | Passed | Route table includes `branches`, `warehouses`, `accounts` pages and API routes |
| 2026-05-17 | Batch 2 `npm run type-check` in `apps/next` | Passed | Re-run after build refreshed `.next/types` |
| 2026-05-17 | Batch 3-4 `npm run type-check` in `apps/next` | Passed | Includes `suppliers`, `products`, remaining master-data pages, fixture-backed APIs, and expanded shared schema |
| 2026-05-17 | Batch 3-4 `npm run lint` in `apps/next` | Passed | No lint errors after adding remaining pages/APIs |
| 2026-05-17 | Batch 3-4 `npm run build` in `apps/next` | Passed | Route table includes all Batch 1-4 pages and API routes |
| 2026-05-17 | Batch 3-4 `npm run type-check` after build in `apps/next` | Passed | Re-run after `.next/types` refresh |
| 2026-05-17 | API smoke all Batch 1-4 master-data routes on `127.0.0.1:3001` | Passed | All 15 API routes returned HTTP 200 |
| 2026-05-17 | Page smoke all Batch 1-4 master-data routes on `127.0.0.1:3001` | Passed | All 15 page routes returned HTTP 200 |
| 2026-05-17 | Supabase `db push --dry-run` for `20260517124006_create_fixture_backed_master_tables.sql` | Passed | Would apply only this migration |
| 2026-05-17 | Supabase `db push` to `dev-target` | Passed | Additive-only migration applied; no destructive DDL/DML |
| 2026-05-17 | Live DB row count check for `director_employees`, `production_machines`, `production_lines`, `payment_methods`, `overseas_remittance_purposes` | Passed | Counts: 3, 4, 3, 6, 6 after table rename |
| 2026-05-17 | New table RLS check | Passed | RLS enabled on all 5 new tables; no public policies added |
| 2026-05-17 | Batch 4 target-table API smoke on `127.0.0.1:3001` | Passed | `directors`, `machines`, `production-lines`, `payment-methods`, `remittance-purposes` returned HTTP 200 with expected row counts |
| 2026-05-17 | Batch 4 target-table page smoke on `127.0.0.1:3001` | Passed | All 5 page routes returned HTTP 200 |
| 2026-05-17 | Batch 4 target-table `npm run lint`, `npm run type-check`, `npm run build` in `apps/next` | Passed | Prisma client regenerated after schema update |
| 2026-05-17 | Supabase advisors after target-table migration | Reviewed | No advisor issue specific to the 5 new tables; legacy baseline still has pre-existing RLS/policy/function warnings |
| 2026-05-17 | Supabase `db push` for table rename migration | Passed | Renamed tables only; no row deletion or truncation |
| 2026-05-17 | Live DB row count check after table rename | Passed | `director_employees=3`, `production_machines=4`, `production_lines=3`, `payment_methods=6`, `overseas_remittance_purposes=6` |
| 2026-05-17 | Batch 4 renamed-table API smoke on `127.0.0.1:3001` | Passed | All 5 API routes returned HTTP 200 with expected row counts after dev server restart |
| 2026-05-17 | Supabase `db push` for customer classification/person fields | Passed | Additive columns/checks only; no row deletion/truncation |
| 2026-05-17 | Customer form validation update: `npm run lint`, `npm run type-check`, `npm run build` | Passed | Includes person/contact required fields, syntax validation, postcode-first address form, and validation skill/rule updates |
| 2026-05-17 | Customer pagination/result-count update: `npm run lint`, `npm run type-check` | Passed | Result count and pagination moved above customer table |
| 2026-05-17 | Customer export API: `npm run lint`, `npm run type-check`, `npm run build` | Passed | Added `/api/master-data/customers/export`; Next route table includes export route |
| 2026-05-17 | Login dev prefill + customer top pagination: `npm run lint`, `npm run type-check`, `npm run build` | Passed | Production build keeps dev login prefill disabled by `NODE_ENV === 'production'` |
| 2026-05-17 | Customer frontend table UX switch: `npm run lint`, `npm run type-check`, `npm run build` | Passed | Customer master now loads list once; search/filter/sort/count/pagination run in frontend; export remains DB-backed by current query intent |
| 2026-05-17 | Supplier standardization: `npm run lint`, `npm run type-check`, `npm run build` | Passed | Supplier master follows customer-style form/list/export pattern; supplier classification migration applied to dev-target |
| 2026-05-18 | Reset checkpoint validation after returning to `d6e8b29`: `npm run lint --workspace @ns-scrap-erp/next`, `npm run type-check --workspace @ns-scrap-erp/next`, `npm run build` | Passed | Current git baseline excludes later sidebar/shadcn/Tailwind v4 experiment commits |
| 2026-05-18 | Active toggle UI update: `npm run lint --workspace @ns-scrap-erp/next`, `npm run type-check --workspace @ns-scrap-erp/next` | Passed | Customer, supplier, and shared master-data forms use toggle switch for active status |
| 2026-05-18 | Customer delete action/API cleanup: `npm run lint --workspace @ns-scrap-erp/next`, `npm run type-check --workspace @ns-scrap-erp/next`, `npm run build` | Passed | Removed customer table delete action; active status is handled by a dedicated `/api/master-data/customers/[id]/status` endpoint and toggle UI |
| 2026-05-18 | Batch B products specialized page: `npm run lint --workspace @ns-scrap-erp/next`, `npm run type-check --workspace @ns-scrap-erp/next`, `npm run build`, unauthenticated route smoke on `127.0.0.1:3002` | Passed | Added specialized `/master-data/products` page, product schema/domain client, product-specific API validation, active toggle, frontend search/filter/sort/count/pagination, and `/api/master-data/products/export`; unauth smoke returned page 307 to login and API/export 401 |
| 2026-05-18 | Batch C1 organization/finance setup hardening: `npm run lint --workspace @ns-scrap-erp/next`, `npm run type-check --workspace @ns-scrap-erp/next`, `npm run build` | Passed | Shared master UI now has frontend count/pagination above the table, row-click edit, no dummy checkbox/export action; branches/warehouses/accounts API routes now enforce `master.reference.view/manage`; shared schema validates C1 code/name/contact/account/numeric fields more strictly |
| 2026-05-18 | Batch C2 sales/reference hardening: `npm run type-check --workspace @ns-scrap-erp/next`, `npm run lint --workspace @ns-scrap-erp/next`, `npm run build` | Passed | Salespersons/channels/expense-categories/currencies API routes now enforce `master.reference.view/manage`; channels validate `purchase/sales`, currencies validate 3-letter code, shared schema validates non-negative rates, and currencies no longer show active toggle in the form |
| 2026-05-18 | Batch C3 production/foreign/setup hardening: `npm run type-check --workspace @ns-scrap-erp/next`, `npm run lint --workspace @ns-scrap-erp/next`, `npm run build` | Passed | Simple target-table masters now enforce `master.reference.view/manage` through shared helper; machines/directors/payment methods validate key enums; shared schema validates production/foreign fields including yield, SWIFT, account/country/responsible-person text, and beneficiaries validate 3-letter account currency |
| 2026-05-18 | Supplier duplicate data cleanup in `dev-target` | Passed | Merged supplier rows duplicated by normalized name: total suppliers `8236 -> 2975`, duplicate-name groups `1871 -> 0`, FK orphan checks for `assets`, `payments`, `po_buys`, `purchase_bills`, and `trading_deals` all returned `0`; backup stored in `maintenance.supplier_dedupe_backup_20260518` with `7132` rows |
| 2026-05-18 | Supplier salesperson owner/filter + salespersons table cleanup: `npm run type-check --workspace @ns-scrap-erp/next`, `npm run lint --workspace @ns-scrap-erp/next`, `npm run build` | Passed | Supplier form/table/export now supports salesperson owner filter using existing `sales_id`/`sales_rep`; salespersons table hides commission/base salary columns without deleting data |
| 2026-05-18 | Additive bank account field split migration on `dev-target` | Passed | Added `bank_name`/`account_no` to `director_employees` and `payment_methods`; backfilled 3 director account rows from old `bank_account`; no rows or old columns deleted |
| 2026-05-18 | Bank account split + product field cleanup: `npm run type-check --workspace @ns-scrap-erp/next`, `npm run lint --workspace @ns-scrap-erp/next`, `npm run build` | Passed | Product form/table/API/export no longer uses metal group, item status, grade, standard price, or standard cost; master bank account fields validate account number syntax |
| 2026-05-18 | Additive product type/unit master migrations on `dev-target` | Passed | Created `product_units` with 2 seed rows and `product_types` with 12 rows including `อิเล็กทรอนิกส์`; no product rows changed or deleted |
| 2026-05-18 | Product type/unit submenu integration: `npm run prisma:generate --workspace @ns-scrap-erp/next`, `npm run type-check --workspace @ns-scrap-erp/next`, `npm run lint --workspace @ns-scrap-erp/next`, `npm run build` | Passed | Sidebar supports collapsible product submenu; product type/unit routes are included in the Next build |
| 2026-05-18 | Bank names submenu integration: `npm run prisma:generate --workspace @ns-scrap-erp/next`, `npm run type-check --workspace @ns-scrap-erp/next`, `npm run lint --workspace @ns-scrap-erp/next`, `npm run build` | Passed | Created `bank_names` in `dev-target` with 2 valid seed rows; `/master-data/bank-names` and API routes are included in the Next build |
| 2026-05-18 | Supplier contact removal + finance reference cleanup in `dev-target`: `npm run prisma:generate --workspace @ns-scrap-erp/next`, `npm run type-check --workspace @ns-scrap-erp/next`, `npm run lint --workspace @ns-scrap-erp/next`, `npm run build` | Passed | Dropped supplier contact columns after backup of 1,841 rows; normalized bank/currency code+symbol data; cleared payment method bank/account values; verified supplier contact columns no longer exist |
| 2026-05-18 | Branch HQ row removal in `dev-target` | Passed | Removed `public.branches` row `BR001/HQ/สำนักงานใหญ่`; backed up the branch row plus 15 referencing rows to `maintenance.branch_hq_removal_backup_20260518`; cleared nullable `branch_id` references in accounts, expenses, purchase bills, stock ledger, and warehouses |
| 2026-05-18 | Supplier email removal + receiving account columns in `dev-target`: `npm run prisma:generate --workspace @ns-scrap-erp/next`, `npm run type-check --workspace @ns-scrap-erp/next`, `npm run lint --workspace @ns-scrap-erp/next`, `npm run build` | Passed | Dropped `public.suppliers.email` after creating `maintenance.supplier_email_backup_20260518`; supplier table/form/export now use receiving bank/account fields instead of email |
| 2026-05-18 | Supplier bank account split + Thai commercial bank seed in `dev-target` | Passed | Split bank names out of supplier account numbers for 1,927 rows; backup stored in `maintenance.supplier_bank_account_split_backup_20260518`; seeded 14 bank names including TTB, Krungsri, Thai Credit, UOB, ICBC, and Standard Chartered |
| 2026-05-20 | Supplier XLSX import follow-up | Passed | Added `/api/master-data/suppliers/import` for all-or-nothing import from the exported `.xlsx` workbook, using canonical uppercase supplier codes as `id`/`code`; supplier list table no longer displays the address column while form/export/import still keep address data |
| 2026-05-20 | Supplier international address + bank dropdown follow-up | Passed | Added international supplier address columns to dev-target, moved domestic/foreign selection into the address section, added foreign address line/city/state/postal/country-code fields, removed the general supplier note from modal/export/import, kept `ที่อยู่เต็ม/หมายเหตุที่อยู่`, and changed receiving bank to a dropdown from `bank_names`; `npm run lint --workspace @ns-scrap-erp/next`, `npm run type-check --workspace @ns-scrap-erp/next`, `git diff --check`, and `npm run build --workspace @ns-scrap-erp/next` passed |
| 2026-05-20 | Supplier CSV replacement + bank/tax repair follow-up | Passed | Replaced dev-target supplier data from `nsscrap permission and master data   - ผู้ขาย.csv`; final counts are suppliers `1888`, active CSV rows `1871`, inactive preserved referenced rows `17`, missing owners `0`, FK orphans `0`; added missing bank masters, restored 97 bank/account rows from backup where CSV was blank and name matching was reliable, and cleared all supplier tax IDs for user keying. Backups: `maintenance.supplier_replace_backup_20260520072518`, `maintenance.supplier_bank_tax_repair_backup_20260520082749`, and `maintenance.supplier_tax_clear_backup_20260520082854`. Modal/import now allow blank tax ID and hide `รหัสประเทศ (ISO)`. `npm run lint --workspace @ns-scrap-erp/next`, `npm run type-check --workspace @ns-scrap-erp/next`, `git diff --check`, and `npm run build --workspace @ns-scrap-erp/next` passed |
| 2026-05-20 | Customer/Supplier XLSX round-trip import/export follow-up | Passed | `/master-data/customers` now has Import Excel UI and `/api/master-data/customers/import` for all-or-nothing import from the exported `ลูกค้า` sheet. Customer and supplier import both use shared form schemas, upsert by canonical business code/id, and can generate new `CUS...`/`SU...` codes for template rows where code is blank. Export files include the editable fields needed to key required modal data before import |
| 2026-05-20 | Supplier receiving account normalization on `dev-target` | Passed | Removed supplier credit term/limit from UI/API/schema and dropped `public.suppliers.credit_term`/`credit_limit` after backup `maintenance.supplier_credit_bank_cleanup_backup_20260520115701`. Added `public.supplier_bank_accounts` with `payment_method`, split 1,470 transfer account rows, created 282 cash-payment rows with no bank/account required, split 8 suppliers with multiple account numbers, and verified non-digit account rows `0`, stored cash markers `0`, supplier credit columns `0`. Child backup: `maintenance.supplier_bank_accounts_backup_20260520115701` |
| 2026-05-20 | Supplier notes column cleanup on `dev-target` | Passed | Removed unused `public.suppliers.notes` from Prisma/API/domain and dropped the DB column after backup `maintenance.supplier_notes_drop_backup_20260520121005`; all 1,888 supplier rows had blank notes before drop |
| 2026-05-20 | Supplier version column cleanup on `dev-target` | Passed | Removed unused supplier row-version placeholder from Prisma and dropped `public.suppliers.version` after backup `maintenance.supplier_version_drop_backup_20260520121147`; all supplier rows were still default version `1`, and the active supplier flow was not using this column |
| 2026-05-20 | Supplier receiving account branch code on `dev-target` | Passed | Added nullable `supplier_bank_accounts.branch_code` after backup `maintenance.supplier_bank_accounts_branch_code_backup_20260520122022`; supplier modal now keeps `รหัสสาขา` inside each receiving account row instead of as a separate supplier-level field |
| 2026-05-20 | Supplier payment method master cleanup on `dev-target` | Passed | Removed `เงินสด`/`เงินโอน` rows from `bank_names` after backup `maintenance.bank_names_payment_method_cleanup_backup_20260520123520`; seeded bilingual `payment_methods` names such as `เงินสด (Cash)` and `เงินโอน (Bank Transfer)`; dropped `payment_methods.code`; normalized `supplier_bank_accounts.payment_method` from legacy `โอนเงิน` to canonical `เงินโอน` after backup `maintenance.supplier_payment_method_canonical_backup_20260520123520`; supplier receiving-account dropdown now loads payment methods from `/api/master-data/payment-methods` |
| 2026-05-20 | Bank name/channel code removal follow-up | Passed | `/master-data/bank-names` and `/master-data/channels` no longer show or accept code fields. Dev-target `bank_names`, `purchase_channels`, and `sales_channels` no longer have `code` columns; backup tables are `maintenance.reference_code_removal_backup_20260520090736_*`. Verified columns/counts after drop: bank names `19`, purchase channels `3`, sales channels `2`. `npm run type-check --workspace @ns-scrap-erp/next`, `npm run lint --workspace @ns-scrap-erp/next`, `npm run build --workspace @ns-scrap-erp/next`, `git diff --check`, and OpenAPI lint passed with existing warnings |
| 2026-05-20 | Warehouse route retirement + branch id remap | Passed | Removed the active Next `/master-data/warehouses` page/API/config because the sidebar/business master is `/master-data/branches` (`สาขา / คลัง`). Dev-target branches are now canonical `BR001/code 01/สมุทรสาคร` and `BR002/code 02/นครสวรรค์`; all old `BR003` references in public `branch_id` columns and `user_profiles.branch_ids` were remapped after backup tables under `maintenance.branch_id_remap_20260520_1720_*`. The physical `warehouses` table remains for existing stock/purchase-bill transaction history until a separate stock-location migration is designed. |
| 2026-05-20 | Master-data simplification + machine type cleanup | Passed | `/master-data/customers` now matches the supplier-style party/address form without contact person, bank account, or general notes. Product units/types no longer expose or store code fields. Channels page is now `ช่องทางขาย` over `sales_channels` only; purchase channels are retained in DB for referenced historical rows. Expense categories no longer expose code or parent category, and `expense_categories.parent_id` was dropped. Machines no longer expose or store maintenance status, `production_machines.maintenance_status` was dropped after backup, and `/master-data/machine-types` was added as the DB-backed source for machine type dropdowns. Topbar branch selector now reads active `branches` through `/api/branches`, respecting current user branch scope where available. Supplier account copy button now uses a small inline SVG icon with copied state and no CDN/dependency. Dev-target migration history repaired for `20260520125502`, `20260520125558`, and `20260520125615`; `npm run prisma:generate --workspace @ns-scrap-erp/next`, `npm run type-check --workspace @ns-scrap-erp/next`, `npm run lint --workspace @ns-scrap-erp/next`, `git diff --check`, and `npm run build --workspace @ns-scrap-erp/next` passed. |
| 2026-05-18 | Payment method and remittance purpose simplification: `npm run prisma:generate --workspace @ns-scrap-erp/next`, `npm run type-check --workspace @ns-scrap-erp/next`, `npm run lint --workspace @ns-scrap-erp/next`, `npm run build` | Passed | `payment_methods` and `overseas_remittance_purposes` now keep only internal id, name, active state, and timestamps; old type/docs/code data was backed up in maintenance schema and later code-removal slices dropped the code columns |
| 2026-05-20 | Currency/remittance code removal + submenu-only parents | Passed | Product and machine sidebar parent rows are now submenu toggles only, with working child labels `รายการสินค้า` and `รายการเครื่องจักร`. Dev-target `currencies.code` and `overseas_remittance_purposes.code` were removed after backups in `maintenance.currency_code_removal_backup_20260520131607` and `maintenance.remittance_purpose_code_removal_backup_20260520131607`. Currency keeps internal `id` derived from uppercase `symbol`; foreign-finance APIs still expose a compatibility `code` value from `symbol` for current forms. Validation passed: `npm run prisma:generate --workspace @ns-scrap-erp/next`, `npm run type-check --workspace @ns-scrap-erp/next`, `npm run lint --workspace @ns-scrap-erp/next`, `git diff --check`, and `npm run build --workspace @ns-scrap-erp/next`. |
| 2026-05-20 | Accounts/machines/production-lines code removal | Passed | Dev-target `accounts.code`, `production_machines.code`, and `production_lines.code` were removed after backups `maintenance.accounts_code_removal_backup_20260520133620`, `maintenance.production_machines_code_removal_backup_20260520133620`, and `maintenance.production_lines_code_removal_backup_20260520133620`. `/master-data/accounts`, `/master-data/machines`, and `/master-data/production-lines` no longer show or accept code fields. Branch fields use branch ids internally and show branch names under `สาขา/คลัง`. `account_no` is used as the display reference where finance screens still need a compatibility `code` value. Validation passed: `npm run prisma:generate --workspace @ns-scrap-erp/next`, `npm run type-check --workspace @ns-scrap-erp/next`, `npm run lint --workspace @ns-scrap-erp/next`, `git diff --check`, and `npm run build --workspace @ns-scrap-erp/next`. |

## Open Decisions

- `/master-data/warehouses` is retired from the active Next route set. Treat `/master-data/branches` as the business-facing `สาขา / คลัง` master; keep the physical `warehouses` table only for existing transaction history until a stock-location migration is designed.
- Topbar branch selector reads from `public.branches` via `/api/branches`, not `warehouses`. It stores the selected branch id in browser local storage for UI continuity; downstream page/report filters are still page-specific unless explicitly wired to listen for the branch-change event in a later batch.
- Decide whether `directors` should remain setup-only for now or become tied to director loan / advance flows in a later finance batch.
- Final code strategy: keep explicit business codes only where they are meaningful business identifiers or externally referenced (for example branches, customers, suppliers, products, salespersons). Small reference/setup masters should not keep separate code columns; use internal ids plus names. Accounts no longer keep a separate code column; use `account_no`/name for display references.
- Supplier duplicate rows by normalized name were cleaned in `dev-target`, but supplier `code` still has duplicate values across different suppliers. Do not rewrite these codes until the final supplier code strategy is confirmed.
- Supplier owner field now uses existing `suppliers.sales_id`/`sales_rep`: `/master-data/suppliers` has a salesperson dropdown in the form, a salesperson filter above the table, salesperson column/sort, and `.xlsx` export respects the salesperson filter. No destructive DB migration was needed.
- `/master-data/salespersons` table hides commission percent and base salary columns to keep the list compact; the fields and existing DB data are not deleted.
- Bank account fields in master data are split where the target table supports account detail: accounts, suppliers, overseas beneficiaries, and director employees. The old `director_employees.bank_account` column is retained for compatibility; UI uses `bank_name` + `account_no`.
- Branch master no longer contains the old HQ row `BR001/HQ/สำนักงานใหญ่`; references that pointed to it were nulled after backup because all affected `branch_id` columns are nullable.
- Product master no longer uses `metal_group`, `item_status`, `grade`, `std_price`, or `std_cost` in the Next UI/API/export flow. The columns are retained for now to avoid destructive data loss, but create/update payloads no longer write them and `.xlsx` export no longer includes them.
- Product master now has DB-backed child setup pages under the product menu:
  - `/master-data/product-types` for product type options, seeded with `อิเล็กทรอนิกส์` plus distinct existing product types from `products.type`.
  - `/master-data/product-units` for product unit options, seeded with `กิโลกรัม (กก.)` and `ลัง`.
  - Product add/edit uses dropdowns from these DB-backed masters and the API validates selected product type/unit against active rows.
- Product type and product unit masters no longer store or display separate code fields. Their internal `id` remains stable for API/upsert identity while users only manage names/symbols.
- Account master now has DB-backed child setup page `/master-data/bank-names` under the account menu. Account add/edit loads bank names as a dropdown from `/api/master-data/bank-names`; the account API validates that selected bank names are active rows before save.
- Supplier master no longer stores or displays separate contact-person fields. The dev-target migration backed up old supplier contact values to `maintenance.supplier_contact_backup_20260518` before dropping `contact`, `contact_title`, `contact_first_name`, and `contact_last_name` from `public.suppliers`.
- Supplier master no longer stores supplier email. The supplier table now shows `ธนาคารรับเงิน` and `เลขที่บัญชีรับเงิน`, and supplier export includes receiving bank/account fields.
- Supplier domestic/foreign classification is now part of the address section. Domestic suppliers use Thai postcode/province/district/subdistrict fields with `country_code = TH`; foreign suppliers use country plus international address line/city/state-region/postal fields and do not write Thai hierarchy columns. The ISO country-code field is stored internally/exported when available but is not shown in the supplier modal. `ที่อยู่เต็ม/หมายเหตุที่อยู่` is retained as address metadata; the separate general `notes` field has been removed from the supplier modal/export/import/API and DB.
- Supplier tax ID input now follows the project validation rule: only digits can remain after typing/paste, capped at 13 digits for Thai party tax IDs when entered, with blank values allowed temporarily so the exported supplier workbook can be keyed by users.
- Supplier owner (`ผู้ดูแล`) is required in the supplier modal and shared save schema; the UI shows `เลือกผู้ดูแล` and the API rejects saves without a selected active salesperson.
- Supplier modal now marks schema-required fields with a red `*` and native required controls: supplier type, person/company name fields, owner, market scope, and the required foreign-address fields.
- Supplier tax ID is optional in the supplier modal and shared save/import schema for now. If provided, the input still strips pasted/typed non-digits and the server schema requires exactly 13 digits.
- Supplier modal no longer shows `รหัสประเทศ (ISO)`. Domestic suppliers still write `country_code = TH`; foreign suppliers now require the visible `ประเทศ`, address line 1, and city fields while leaving `country_code` internal/export-only when available.
- Supplier master data in dev-target was replaced from `nsscrap permission and master data   - ผู้ขาย.csv`: 1,871 active CSV suppliers plus 17 inactive referenced legacy suppliers, all with uppercase `SU...` ids/codes and assigned owners. Tax IDs are currently blank for user keying; bank/account values missing from the CSV were restored from backup where the supplier name matched reliably. The old supplier rows and FK mapping were backed up in `maintenance.supplier_replace_backup_20260520072518` and `maintenance.supplier_replace_fk_backup_20260520072518`.
- Supplier receiving account display uses separated `bank_name` and digit-only `bank_account`. Supplier modal stores receiving accounts in child rows with payment method first from the `payment_methods` master: `เงินสด` requires no bank/account data, while canonical `เงินโอน` requires a bank and digit-only account number before save. Import strips cash markers such as `เงินสด` from bank/account text, normalizes legacy `โอนเงิน` text to `เงินโอน`, and splits multiple account numbers into separate `supplier_bank_accounts` rows.
- Supplier table displays every active receiving channel as separate aligned lines in the bank/account columns. Cash appears as `เงินสด` with no account number, and multiple transfer accounts show each bank plus account-level branch code and account number on separate lines. Ten-digit account numbers display as `XXX - XXX - XXXX` while stored values remain digits only; each displayed transfer account line has a copy button that copies the digit-only account number. The supplier modal no longer exposes a manual primary-account selector or explanatory cash-account text.
- Supplier phone field is grouped under `ข้อมูลผู้ขาย` in the modal; the separate contact section is not shown when phone is the only contact field.
- Supplier table no longer keeps the unused `notes` or `version` columns. Supplier address metadata remains in `address` (`ที่อยู่เต็ม/หมายเหตุที่อยู่`), and row versioning is not currently implemented for supplier master saves.
- Director employee bank data has been cleaned so `bank_name` and `account_no` are separate fields; director phone display follows the shared Thai phone formatter.
- Bank name master no longer exposes or stores a separate business code; `bank_names.id` remains an internal/FK-stable primary key and `symbol` remains available for display such as `KBANK`/`SCB`. Currency master no longer stores a separate `code`; `currencies.id` is internal and currently derived from required uppercase `symbol` such as `THB/USD/CNY/EUR/JPY/SGD`.
- Payment method and remittance purpose masters are plain lookup lists. Payment methods now expose only name and active status, with bilingual names such as `เงินสด (Cash)`; `payment_methods.code` was removed after backup. Remittance purposes now expose only name and active status; `overseas_remittance_purposes.code` was removed after backup.
- Sidebar parent menu rows with children now toggle their submenu when clicked instead of navigating to the parent row. Product and machine pages remain reachable through the child rows `รายการสินค้า` and `รายการเครื่องจักร`.
- `/master-data/channels` is now the sales-channel master (`ช่องทางขาย`) over `sales_channels` only. Historical `purchase_channels` rows are retained because purchase/PO rows still reference them, but they are no longer surfaced in this master UI/API.
- Expense category master no longer stores or displays a parent category. Existing dev-target rows had no parent references before `parent_id` was dropped.
- Machine master no longer stores or displays maintenance status. Machine type is now managed through `/master-data/machine-types`, and the machine save path validates selected type names against active rows in `production_machine_types`; there is no FK yet, so rename/cascade semantics remain a future DB design decision.
- i18n is not part of this cleanup batch. Treat localization as a separate future architecture batch covering namespace/key strategy, Thai default copy, fallback locale, and route/form validation message ownership.
- Decide whether small static/reference option lists such as person title prefixes should remain code constants with DB seed/reference rows, or become fully DB-driven cached config later.
- Decide whether/when to introduce Upstash Redis for master/reference-data cache and rate limiting; not implemented yet.
- Hosting/runtime migration discussion is intentionally not recorded as a decision yet. Current deploy target remains the Next app path already configured for Vercel.
