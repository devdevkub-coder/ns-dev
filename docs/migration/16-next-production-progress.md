# 16 Next Production Progress

## Objective

ติดตามงานดึงกลุ่ม `ผลิต` จาก legacy source เข้าสู่ Next.js พร้อม API, DB wiring, validation, stock/cost side effects, report baseline และ reconciliation

## Reporting Rule

- อัปเดตเอกสารนี้หลังจบแต่ละ production batch หรือเมื่อเปลี่ยน schema/API contract
- ใช้ `old-apps/legacy/index.html` เป็น source material เท่านั้น ห้าม route/import runtime กลับไปหา legacy
- DB migration ต้องเป็น additive เป็นค่าเริ่มต้น และห้ามลบข้อมูลเดิม
- ทุก API write ต้อง validate syntax และ required fields ด้วย schema layer
- ทุก side effect ที่กระทบ stock/cost ต้องระบุ ledger/ref type และ reconciliation query

## Legacy Flow Summary

Legacy production flow หลักอยู่ที่ `old-apps/legacy/index.html`:

| Legacy Area | Approx Component / Usage | Current Understanding |
|---|---|---|
| Production Orders | `view-production` | เปิดใบสั่งผลิต โดยเลือก branch, machine, production line, shift, target product และ production type |
| Production Inputs | production input section in `view-production` | ตัดวัตถุดิบเข้าใบผลิต และสร้าง stock/WIP movement |
| Production Outputs | production output section in `view-production` | บันทึกผลผลิตพร้อม `outputCategory` และ allocation cost |
| Production Reports | `view-productionReport`, `view-productionDashboard` | สรุป order/input/output, yield, cost, machine utilization |
| Machine Utilization | `view-machineUtil` | ใช้ `machines`/`production_machines` ในการคำนวณ utilization |
| Production Cost Report | `view-productionCostReport` | ใช้ input/output/process cost เพื่อดูต้นทุนผลิต |

## Production Output Category Finding

`หมวดหมู่การผลิต` ใน legacy ไม่ใช่ target DB table แยก แต่เป็น enum-like local value บน production output form และ stock ledger output category

Legacy values:

| Code | Meaning | Target Handling |
|---|---|---|
| `FG` | สินค้าสำเร็จรูป | เก็บเป็น active production output category; stock available/saleable |
| `RM` | วัตถุดิบที่ได้กลับมา | เก็บเป็น active production output category; stock available as raw material |
| `CUSTOMER_RETURN` | ของคืนลูกค้า | เก็บเป็น active production output category; stock received but should be tracked separately |
| `LOSS` | สูญเสีย / ของเสีย | เก็บเป็น active production output category; used in yield/loss report, not saleable |

Current Next/DB status:

- `production_machines` exists and is used by master data page/API.
- `production_lines` exists and is used by master data page/API.
- `production_orders`, `production_inputs`, and `production_outputs` exist in Prisma schema.
- `stock_ledger.output_category` exists and can preserve legacy category code.
- `production_output_categories` target table now exists in dev-target with legacy seed values.
- `production_outputs.output_category` and `production_outputs.output_status` were added additively for future output write flow.

## Target Design

Recommended additive table:

```text
production_output_categories
  id
  code
  name_th
  name_en
  stock_effect
  available_for_sale
  sort_order
  active
  created_at
  updated_at
```

Rules:

- Keep legacy `code` values stable: `FG`, `RM`, `CUSTOMER_RETURN`, `LOSS`.
- Existing `production_outputs.output_category` and `stock_ledger.output_category` should continue storing the code during transition.
- UI/API should read category choices from DB instead of hardcoded frontend constants.
- Do not drop or rewrite existing production output/category values in this batch.

## Batch Plan

### Batch P1: Production Output Category Master

Scope:

- DB table `production_output_categories`
- Seed legacy category values
- API `/api/production/output-categories`
- Validation helper for checking active category code

Status: Done baseline on 2026-05-18.

Tasks:

- [x] Add additive Supabase migration for `production_output_categories`.
- [x] Add Prisma model and generate client.
- [x] Seed `FG`, `RM`, `CUSTOMER_RETURN`, `LOSS`.
- [x] Add category mapping helper for legacy output type/status/stock movement behavior.
- [x] Add read/write/status API for category master:
  - `/api/production/output-categories`
  - `/api/production/output-categories/[id]`
- [x] Add UI page with shared master modal and active toggle:
  - `/production/output-categories`
- [x] Add `production_outputs.output_category` and `production_outputs.output_status` as nullable additive columns.
- [x] Add route/API permission mapping under `/production/*` and `/api/production/*`.
- [x] Run DB smoke test confirming 4 seeded categories and new production output columns.
- [x] Update docs and run validation.

Validation target:

- `npm run type-check --workspace @ns-scrap-erp/next`
- `npm run lint --workspace @ns-scrap-erp/next`
- `npm run build --workspace @ns-scrap-erp/next`

Validation result:

- Passed: `npm run type-check --workspace @ns-scrap-erp/next`
- Passed: `npm run lint --workspace @ns-scrap-erp/next`
- Passed: `npm run build --workspace @ns-scrap-erp/next`
- Build confirmed routes generated:
  - `/production/output-categories`
  - `/api/production/output-categories`
  - `/api/production/output-categories/[id]`

### Batch P2: Production Orders Read Baseline

Scope:

- `/production/orders`
- `/api/production/orders`

Status: Done baseline on 2026-05-18.

Tasks:

- [x] Port read surface from legacy `view-production`.
- [x] Add API `/api/production/orders`.
- [x] Add page `/production/orders`.
- [x] Join/display branch, warehouse, target product, input/output counts, quantities, cost/value/variance, and output categories.
- [x] Add server-side pagination/filter/sort because production orders are transaction data.
- [x] Add `+ ใบสั่งผลิตใหม่` modal baseline with legacy sections:
  - Header
  - Input / เบิกวัตถุดิบ
  - Output / รับผลผลิต
  - Process Cost
  - Cost Allocation
- [x] Add row detail modal and legacy action buttons as disabled placeholders until write/stock/cost batch is implemented.
- [x] Add permission mapping for production routes/API.

Important boundary:

- This batch is DB-connected read baseline only. Create/save, submit/approve/close, input/output write, process cost write, reversals, and cost allocation recompute are intentionally disabled until Batch P3/P4 define stock/cost side effects.

Validation result:

- Passed: `npm run type-check --workspace @ns-scrap-erp/next`
- Passed: `npm run lint --workspace @ns-scrap-erp/next`
- Passed: `npm run build --workspace @ns-scrap-erp/next`
- Build confirmed routes generated:
  - `/production/orders`
  - `/api/production/orders`

### Batch P3: Production Order Write Flow MVP

Scope:

- Production order create
- Production input issue
- Production output receive
- WIP/yield status recompute
- Append-only reverse for input/output
- `production_orders`
- `production_inputs`
- `production_outputs`
- `stock_ledger`
- `production_order_status_logs`

Tasks:

- [x] Document simplified user-approved flow in `docs/notes/Production Order DB API Design.md`.
- [x] Remove approval/process cost/cost allocation/customer return from MVP scope in production docs.
- [x] Add additive schema for input/output doc numbers, reversal fields, category code, WAC snapshot, and status logs.
- [x] Implement production order create as `Open` with no stock ledger.
- [x] Implement `PI` input write with paired stock ledger rows:
  - `PRODUCTION_INPUT_OUT`
  - `WIP_IN`
- [x] Implement `PO2` output write with:
  - `PRODUCTION_OUTPUT_WIP_OUT`
  - `PRODUCTION_OUTPUT_IN`
  - `PRODUCTION_OUTPUT_RM_IN`
  - `PRODUCTION_LOSS`
- [x] Implement reverse flows with `PI-REV` and `PO2-REV`; never hard delete/rewrite original ledger rows.
- [x] Add WIP reconciliation and block `Completed` while WIP remains.
- [x] Add no-fallback API validation for doc no, product code, branch/warehouse code, category code, WAC, and stock availability.
- [x] Enable simplified `/production/orders` UI modals after APIs are ready.
- [x] Add logged-in browser QA for create -> repeated input rounds -> repeated output/loss rounds -> complete -> reverse-block -> reconciliation scenarios.

Important boundary:

- MVP does not include approval, process cost, cost allocation, auto Grade Adjustment, customer return output, over-issue confirmation, or direct edit/delete of stock ledger.
- Missing source data must be fixed via data/migration/master setup. Do not add runtime fallback.

#### Batch P3A: Docs and Schema Contract

Status: done on 2026-06-12.

Tasks:

- [x] Add `docs/notes/Production Order DB API Design.md` as the detailed flow/API/DB contract.
- [x] Update `docs/notes/Production Flow.md`.
- [x] Update `/production/orders` page-flow doc.
- [x] Update `docs/api/openapi.yaml` with production write endpoint skeletons.
- [x] Draft reconciliation SQL for PI/PO2/WIP checks.
- [x] Decide final additive migration names and exact DB constraints.

#### Batch P3B: DB Migration

Tasks:

- [x] Add `production_order_status_logs`.
- [x] Add production input `doc_no`, `status`, source/WIP warehouse refs, lot, WAC snapshot, and reversal fields.
- [x] Add production output `doc_no`, `status`, `category_code`, destination warehouse, lot, source WIP qty, and reversal fields.
- [x] Add stock ledger indexes for production refs.
- [x] Correct PI/PO2 `doc_no` and reversal doc numbers to non-unique document group keys so one input/output document can contain multiple lines.
- [x] Add `production_reconciliation_issues` DB view for production document/ledger checks.
- [x] Generate Prisma client.
- [x] Apply migration to `dev-target` only.
- [x] Run DB smoke checks and document result.

#### Batch P3C: Server Services

Tasks:

- [x] Add production document number generation for `PO`, `PI`, `PO2`, `PI-REV`, `PO2-REV`.
- [x] Add production order create service.
- [x] Add WIP calculation service from active production facts/ledger.
- [x] Add WAC lookup service that rejects missing or ambiguous cost.
- [x] Add stock availability validator with branch/warehouse/product/status/lot dimensions.
- [x] Add PI writer service.
- [x] Add PO2 writer service.
- [x] Add reverse PI/PO2 services with downstream-consumption guards.
- [x] Add status recompute and status log append service.

#### Batch P3D: API Routes and Validation

Tasks:

- [x] `POST /api/production/orders`
- [x] `PATCH /api/production/orders/[docNo]`
- [x] `POST /api/production/orders/[docNo]/inputs`
- [x] `POST /api/production/orders/[docNo]/inputs/[inputDocNo]/reverse`
- [x] `POST /api/production/orders/[docNo]/inputs/reverse`
- [x] `POST /api/production/orders/[docNo]/outputs`
- [x] `POST /api/production/orders/[docNo]/outputs/[outputDocNo]/reverse`
- [x] `POST /api/production/orders/[docNo]/outputs/reverse`
- [x] `GET /api/production/orders/options`
- [x] `GET /api/production/orders/product-stock`
- [x] `GET /api/production/orders/[docNo]/wip`
- [x] `GET /api/production/reconciliation`
- [x] Zod schemas for every write request.

#### Batch P3E: UI Enablement

Tasks:

- [x] Simplify create modal to MVP fields.
- [x] Enable order save.
- [x] Align create modal required-field behavior with design: no automatic first-option selection for required fields.
- [x] Use shared searchable combobox for create modal `สินค้าที่ผลิต`, searching product code/name and rendering code + name.
- [x] Auto-fill and lock create modal `คลัง WIP` when the selected branch has exactly one active WIP warehouse; reject non-WIP warehouse values server-side.
- [x] Enable input modal with available-stock/WAC validation delegated to API.
- [x] Enable output modal with FG/RM and loss summary fields.
- [x] Use searchable product comboboxes in input/output modal product fields.
- [x] Remove MVP-disabled approval/process cost/cost allocation/customer return controls from primary UI path.
- [x] Replace edit/delete production line actions with reverse actions and reason modal.
- [x] Show WIP summary in order detail modal.
- [x] Show selected target product stock by branch/warehouse in the create modal.
- [x] Keep the detail modal open after PI/PO2 saves and allow repeated one-document input/output saves without closing the order.

#### Batch P3F: Reports and Reconciliation

Tasks:

- [ ] Update order detail cards from active input/output/WIP facts.
- [ ] Update WIP report to reconcile with `PI/PO2` stock ledger refs.
- [ ] Update production dashboard and yield/loss status definitions.
- [x] Add reconciliation report/query for PI/PO2 imbalance.
- [x] Add read API for production reconciliation issues.
- [x] Add QA checklist and run browser verification.
- [x] Confirm legacy parity: legacy supports multi-round input/output by repeated modal saves; an in-modal editable multi-line grid is not required for MVP parity.
- [x] Surface production reconciliation as read-only `/production/reconciliation` UI and navigation item.

#### 2026-06-12 Logged-in Browser QA Result

- Environment: production build + `next start` on `http://127.0.0.1:3003`, dev-target Supabase.
- Result doc: `PO2606-0021`.
- Passed click flow: create order, input round 1 `SKU001 10kg`, input round 2 `SKU001 10kg` in the same modal, output round 1 `FG SKU001 8kg`, output round 2 `RM SKU001 7kg + loss 5kg` with complete checked.
- Final state: `Completed`, `inputCount=2`, `inputQty=20`, `outputCount=3`, `outputQty=20`.
- Guard verified: reverse after completed returns HTTP 400 with `ใบสั่งผลิตปิดงานหรือยกเลิกแล้ว ไม่สามารถ reverse ได้`.
- Reconciliation verified: `GET /api/production/reconciliation` returned `issueCount=0`.

#### 2026-06-12 Production Reconciliation UI Result

- Added page: `/production/reconciliation`.
- Added navigation: Production section -> `Production Reconciliation`.
- UI reads `GET /api/production/reconciliation` and displays total issue count, ref-type counts, issue filter, search, refresh, and issue table.
- Authenticated browser QA on local Next dev server passed: API returned 200 with `issueCount=0`, page rendered empty state, desktop overflow check passed, and browser console errors were none.

### Batch P4: Production Reports Baseline

Scope:

- `/production/dashboard`
- `/production/report`
- `/production/production-cost-report`
- `/production/yield-loss-report`
- `/production/machine-utilization`
- `/production/wip-report`

Status: Done read baseline on 2026-05-18.

Tasks:

- [x] Port DB-connected read dashboards/reports from legacy.
- [x] Add additive legacy report fields on `production_orders`:
  - `machine_id`, `production_line_id`, `production_type`, `shift`, supervisor/operator names, planned qty, normal loss percent, cost allocation method, and production warehouse fields.
- [x] Add additive `process_costs` target table for production cost report and future process-cost write flow.
- [x] Add shared production report helper for input/output/loss/WIP/yield/cost calculations.
- [x] Add pages and APIs:
  - `/production/dashboard` + `/api/production/dashboard`
  - `/production/wip-report` + `/api/production/wip-report`
  - `/production/report` + `/api/production/report`
  - `/production/production-cost-report` + `/api/production/production-cost-report`
  - `/production/yield-loss-report` + `/api/production/yield-loss-report`
  - `/production/machine-utilization` + `/api/production/machine-utilization`
  - `/production/reconciliation` + `/api/production/reconciliation`
- [x] Add date filters on report pages.
- [x] Add CSV export buttons on report pages where legacy had export: production report, cost report, yield/loss report.
- [x] Keep report/dashboard pages read-only; no stock/cost mutation is performed in this batch.

## Open Decisions

- Current UI places `production_output_categories` under production setup route `/production/output-categories`; decide later if it should also appear under master data.
- Whether `production_outputs.output_category` bigint FK should remain transition-only while `category_code` becomes the audit/runtime contract.
- Whether `Closed` should be added later for accounting/cost lock after MVP `Completed`.
- How process costs should be allocated in a later phase.
- Whether `CUSTOMER_RETURN` belongs in production output later or should move to a separate return flow.

## Current Status as of 2026-05-18

- Legacy flow inventory and output category finding documented.
- Batch P1 and P2 implemented locally.
- Batch P4 report/dashboard read baseline implemented locally.
- Dev-target DB has `production_output_categories` with 4 legacy values.
- Next has `/production/output-categories`, `/api/production/output-categories`, `/production/orders`, and `/api/production/orders`.
- Next now has every production menu page from legacy as a DB-connected read baseline:
  - `/production/dashboard`
  - `/production/wip-report`
  - `/production/report`
  - `/production/production-cost-report`
  - `/production/yield-loss-report`
  - `/production/machine-utilization`
- Next already has production-related master data pages for machines and production lines.

## Docs Checkpoint 2026-06-11

- Added `docs/notes/Production Flow.md` as the canonical flow note for the whole `การผลิต` navigation section.
- Current Next production runtime remains read baseline for `/production/orders` and report pages.
- Production write flows are still pending:
  - Production Order create/update/status
  - Production Input write with paired `PI` stock ledger
  - Production Output write with `PO2` stock ledger
  - Process Cost write and allocation recompute
  - Reverse/reconciliation/lock rules

## Docs Checkpoint 2026-06-12

- User confirmed simplified production MVP:
  - no approval flow
  - no process cost/cost allocation in first scope
  - no customer return output in first scope
  - no auto Grade Adjustment
  - no direct edit/delete of stock ledger
- Added `docs/notes/Production Order DB API Design.md` as the detailed flow/API/DB/task contract.
- Updated `docs/notes/Production Flow.md` and `docs/notes/page-flows/production-production-orders.md` to point to the simplified write contract.
- Batch P3 is now split into P3A-P3F:
  - docs/schema contract
  - DB migration
  - server services
  - API validation
  - UI enablement
  - reports/reconciliation/QA
- Current next implementation task is P3A follow-up: reconciliation SQL draft and exact additive migration plan.
