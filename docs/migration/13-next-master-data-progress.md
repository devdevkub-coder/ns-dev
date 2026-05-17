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
| `/master-data/products` | สินค้า | Batch 3 baseline Done |
| `/master-data/branches` | สาขา / คลัง | Batch 2 Done |
| `/master-data/warehouses` | คลังสินค้า | Batch 2 Done |
| `/master-data/accounts` | บัญชีเงิน | Batch 2 Done |
| `/master-data/channels` | ช่องทางซื้อ/ขาย | Batch 1 Done |
| `/master-data/expense-categories` | หมวดค่าใช้จ่าย | Batch 1 Done |
| `/master-data/directors` | กรรมการ/พนักงาน | Batch 4 Done - Target table migration added |
| `/master-data/machines` | เครื่องจักร | Batch 4 Done - Target table migration added |
| `/master-data/production-lines` | Production Line | Batch 4 Done - Target table migration added |
| `/master-data/currencies` | สกุลเงิน | Batch 1 Done |
| `/master-data/beneficiaries` | ผู้รับเงินต่างประเทศ | Batch 4 Done |
| `/master-data/payment-methods` | วิธีจ่าย/รับเงิน | Batch 4 Done - Target table migration added |
| `/master-data/remittance-purposes` | วัตถุประสงค์โอน | Batch 4 Done - Target table migration added |

### Out of Scope for This Batch

| Route | Label | Reason |
|---|---|---|
| `/master-data/import` | Import Master จาก Excel | ทำหลัง master CRUD baseline นิ่ง |
| `/master-data/import-transactions` | Import บิลซื้อ/บิลขาย | ทำหลัง transaction import design |

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

## Current Status as of 2026-05-18

- Current git checkpoint is `d6e8b29 feat: standardize supplier master form`.
- The branch was reset back to `d6e8b29` after the sidebar/shadcn design experiment. Those later design commits are not part of the current working baseline.
- Tailwind remains v3 (`tailwindcss ^3.4.17`). Tailwind v4 migration and shadcn component adoption are not current active changes.
- The current layout is the pre-shadcn Next shell with the simple dark sidebar/topbar.

- Next app created in `apps/next`.
- Next 16, React 19, Prisma 7, `@prisma/adapter-pg`, Supabase client, TypeScript and Tailwind are installed.
- Prisma schema has been introspected from `dev-target`.
- `Customer UI -> Next API Route -> Prisma -> Supabase Postgres` is the current data path.
- `/master-data/customers` has a real Next page, client-side table search/sort/filter/pagination/count, add/edit modal, structured Thai address form, API routes, and Excel-compatible export.
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
  - customer delete/soft-delete table action was removed; status changes must go through the edit form, and the dedicated `/api/master-data/customers/[id]` status endpoint was removed from the current route table
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
  - `/master-data/warehouses`
  - `/master-data/accounts`
- Batch 3 baseline routes exist:
  - `/master-data/products` still uses the shared master-data list/form UI and generic API baseline.
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
- Next login now uses Supabase Auth and protected routes through Next `proxy.ts`; admin-only access is enforced before pages/API except login/health.
- Local development login prefill can be supplied through `DEV_LOGIN_IDENTIFIER` and `DEV_LOGIN_PASSWORD`; these are intentionally dev-only and not production public env vars.
- Auth/role/RLS remains incomplete for the final permission model. Current app gating is admin-only and should be replaced with full role/permission mapping before UAT.
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
| 2026-05-18 | Customer delete action/API removal: `npm run lint --workspace @ns-scrap-erp/next`, `npm run type-check --workspace @ns-scrap-erp/next`, `npm run build` | Passed | Removed customer table delete action and `/api/master-data/customers/[id]`; build route table now only has customer list/save and export routes |

## Open Decisions

- Confirm whether `/master-data/warehouses` should remain a standalone Next route or be folded visually into `/master-data/branches` while preserving the sidebar route.
- Decide whether `directors` should remain setup-only for now or become tied to director loan / advance flows in a later finance batch.
- Decide final code strategy for all master keys after customer running-number pattern is validated across supplier/product/account codes.
- Confirm whether combined `/master-data/channels` should stay as one UI over `purchase_channels` + `sales_channels`, or split visually later while preserving the current sidebar route.
- Decide whether small static/reference option lists such as person title prefixes should remain code constants with DB seed/reference rows, or become fully DB-driven cached config later.
- Decide whether/when to introduce Upstash Redis for master/reference-data cache and rate limiting; not implemented yet.
- Hosting/runtime migration discussion is intentionally not recorded as a decision yet. Current deploy target remains the Next app path already configured for Vercel.
