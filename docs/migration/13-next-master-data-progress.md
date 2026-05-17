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
| `/master-data/customers` | ลูกค้า | Baseline Done |
| `/master-data/salespersons` | พนักงานขาย (Sales) | Batch 1 Done |
| `/master-data/suppliers` | ผู้ขาย | Batch 3 Done |
| `/master-data/products` | สินค้า | Batch 3 Done |
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

## Current Status as of 2026-05-17

- Next app created in `apps/next`.
- Next 16, React 19, Prisma 7, `@prisma/adapter-pg`, Supabase client, TypeScript and Tailwind are installed.
- Prisma schema has been introspected from `dev-target`.
- `Customer UI -> Next API Route -> Prisma -> Supabase Postgres` is the current data path.
- `/master-data/customers` has a real Next page, client table/search/sort, add/edit modal baseline, structured Thai address dropdowns, and API routes.
- Batch 1 pages now have real Next routes, shared master-data list/form UI, API routes, Prisma/dev-target reads, add/edit baseline, search/sort, and active/inactive where the source table supports it:
  - `/master-data/salespersons`
  - `/master-data/currencies`
  - `/master-data/expense-categories`
  - `/master-data/channels`
- Batch 2 pages now have real Next routes, shared master-data list/form UI, API routes, Prisma/dev-target reads, add/edit baseline, search/sort, and active/inactive:
  - `/master-data/branches`
  - `/master-data/warehouses`
  - `/master-data/accounts`
- Batch 3 pages now have real Next routes, shared master-data list/form UI, API routes, Prisma/dev-target reads, add/edit baseline, search/sort, and active/inactive:
  - `/master-data/suppliers`
  - `/master-data/products`
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
- Auth/role/RLS remains intentionally bypassed for this UI/data-wiring phase.
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

## Open Decisions

- Confirm whether `/master-data/warehouses` should remain a standalone Next route or be folded visually into `/master-data/branches` while preserving the sidebar route.
- Apply and verify the target-table migration in `dev-target`, then regenerate Prisma from the live schema if needed.
- Decide whether `directors` should remain setup-only for now or become tied to director loan / advance flows in a later finance batch.
- Decide final code strategy for all master keys after customer running-number pattern is validated across supplier/product/account codes.
- Confirm whether combined `/master-data/channels` should stay as one UI over `purchase_channels` + `sales_channels`, or split visually later while preserving the current sidebar route.
