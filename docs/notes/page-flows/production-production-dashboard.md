---
title: Production Dashboard Page Flow
tags:
  - page-flow
  - menu
status: accepted-baseline
updated: 2026-07-23
route: /production/dashboard
---

# Production Dashboard Page Flow

## Scope

| Field | Value |
|---|---|
| Menu section | Production |
| Route | `/production/dashboard` |
| Page | Production Dashboard |
| Current Next | active sidebar page |

## Canonical References

[[Production Flow]]

## Flow Baseline

dashboard KPI จาก production orders/input/output/WIP/yield/cost

Current runtime note: this route/API is an active Production sidebar page and remains a read-only operational monitor. Do not add write actions or alter production transactions from this dashboard.

## Requirement Snapshot 2026-06-13

Customer screenshot/latest requirement defines Production Dashboard as a read-only monitor for production output, WIP, yield, loss, and efficiency.

Dashboard must keep the meanings separated:

| Metric | Meaning | Source rule |
|---|---|---|
| `ใบสั่งผลิต` | จำนวนใบสั่งผลิตในช่วง filter | count production orders |
| `ผลิตได้` / Output | น้ำหนักผลผลิตจริงที่รับเข้า stock | sum active output receipts excluding loss |
| `WIP คงเหลือ` | น้ำหนักที่ยังค้างใน work in progress | PI/PO2 WIP ledger balance |
| `Yield %` | efficiency เชิงผลผลิต | `Output Qty / Input Qty * 100` |
| `Loss %` | สัดส่วนสูญเสีย | `Loss Qty / Input Qty * 100` |
| `Top 10 สินค้าที่ผลิตมากสุด` | สินค้าที่ผลิตจริง | group actual output stock-in product rows, excluding loss |
| `รอบที่ใช้` ใน Machine Utilization dashboard | จำนวนครั้งที่รับผลผลิต | count active production output receipt rows, excluding loss |
| `น้ำหนักผลิต` ใน Machine Utilization dashboard | น้ำหนัก output ของเครื่อง | sum active production output qty, excluding loss |

Do not use production order count as dashboard `รอบที่ใช้`. If order count is needed in the machine section, expose it as a separate `orderCount` field with a different label.

Legacy distinction:

- Legacy `view-productionDashboard` counts machine `batches` from production output rows.
- Legacy `view-machineUtil` counts machine `orderCount` from production orders and is a fuller utilization report.
- The dashboard follows `view-productionDashboard` and the latest customer screenshot, not the standalone machine utilization page, for the meaning of `รอบที่ใช้`.

## Page Responsibilities

- สรุป production KPI ตามช่วงเวลา/line/machine/product
- แสดง WIP, output, yield/loss, cost variance
- แสดง machine output summary โดย `รอบที่ใช้` = count output receipt rows และ `น้ำหนักผลิต` = sum output qty ไม่รวม loss
- drilldown ไป production order/report

## Non-Responsibilities

- ไม่สร้าง production transaction
- ไม่แก้ stock/cost
- ไม่เป็น source truth แทน production ledger/facts

## Lifecycle / Operation Flow

| Step | User action | System result |
|---|---|---|
| 1 | เปิดหน้า | GET dashboard aggregate |
| 2 | filter | date/line/machine/product |
| 3 | drilldown | orders/report/WIP |
| 4 | export | ตาม filter |

## API / Data Contract

### Current API

- `GET /api/production/dashboard - production KPI aggregate`

### Data Contract

- UI ใช้ outward business document/code เป็นหลัก และให้ server resolve internal id
- list/detail/print/export ต้องอ่าน source contract เดียวกันเพื่อลด drift
- transaction write ต้องทำใน server transaction และ append timeline/status/audit ตาม document policy
- ถ้า field เป็น money/qty/date/business code ให้ validate ตาม `docs/design.md` และ server-side ซ้ำ
- dashboard aggregate should expose `summary`, `daily`, `monthly`, `topProducts`, and `machineUtil`
- `topProducts` must group from actual output products received into stock, excluding loss categories
- `machineUtil.batches` means active output receipt row count, excluding loss; optional `orderCount` must be separately named if added
- `machineUtil.qty` / `outputQty` means sum output qty, excluding loss
- `summary.totalWipQty` should come from a WIP-specific read model, not a second full dashboard/report metric load. Formula remains `PI WIP_IN - PO2 PRODUCTION_OUTPUT_WIP_OUT - PO2 PRODUCTION_LOSS` for non-closed orders.
- status breakdown is optional/secondary in the latest dashboard requirement; it must not replace output/WIP/yield/loss/machine metrics

### DB / Optimization Notes

- Dashboard range/list query should be supported by production order date/doc, branch/date/doc, machine/date/doc, and status/date/doc indexes.
- Active production input/output relation loads should use order/status indexes.
- Process cost reads should use production order/status/include index for report/dashboard calculations.
- Current optimization migration: `supabase/migrations/20260613093000_optimize_production_dashboard_queries.sql`.

## Validation / Status Rules

- KPI ต้อง reconcile กับ production facts
- yield/loss formula ต้องชัด
- read model ต้องแยก current WIP จาก completed output
- output and top-product metrics must exclude loss
- dashboard `รอบที่ใช้` must reconcile to output receipt rows, not production order rows

## Side Effects

- read-only ไม่มี side effect

## Current Code Baseline

- Current `apps/next` page/API code is accepted as the P1 proof baseline as of 2026-06-11.
- This page belongs to the finance/production/report baseline group and must keep source facts traceable before formula or write-flow changes.
- Transaction side effects are limited to the current API contract documented above; report pages remain read-model surfaces.
- Future changes should reconcile source table, cutoff, status, and downstream side-effect details here before changing runtime behavior.

## Current Gap

- Add branch/machine/status filters only if required for operational dashboard parity; date range remains the minimum current dashboard filter.

## Dashboard Query Separation Task List 2026-07-23

### Design Decision

This batch is limited to `/production/dashboard` and `GET /api/production/dashboard`. The report page and standalone machine-utilization API remain out of scope. The existing `production-reports.ts` shared module must not be changed in a way that changes those consumers; Dashboard-specific behavior belongs behind a dedicated module.

### Target Module Shape

```text
dashboard/route.ts
  -> production-dashboard.service.ts
    -> production-dashboard.query.ts
    -> production-scope.ts
    -> production-ledger-facts.ts
    -> production-serializer.ts
```

The route owns authentication, request parsing, service invocation, and response headers only. The Dashboard service owns KPI/chart/top-product/machine/WIP composition. Query modules own scoped reads and aggregation inputs. Ledger facts remain the source of truth for output, loss, and WIP.

### Implementation Tasks

- [x] `DASH-01` Define the Dashboard service interface with `dateFrom`, `dateTo`, and `allowedBranchIds`; preserve the current response shape.
- [x] `DASH-02` Resolve and enforce branch scope for every Dashboard query, including WIP and machine data; never treat an invalid scope as all branches.
- [x] `DASH-03` Extract Dashboard-specific query/service seams from `production-reports.ts` without changing Report or Machine Utilization routes.
- [x] `DASH-04` Keep WIP as a separate current snapshot query with the same branch scope; the as-of contract remains documented for the next query-plan batch.
- [x] `DASH-05` Keep `topProducts` based on active non-loss output receipts and preserve the current response/UI contract.
- [x] `DASH-06` Define `machineUtil.batches` according to this page flow as active non-loss output receipt row count; keep any order count separately named.
- [x] `DASH-07` Aggregate machine data by `machine_id`, not machine name, and serialize IDs safely for JSON.
- [x] `DASH-08` Fix zero-value variance fallback and retain Decimal-to-number conversion at the existing server response boundary.
- [x] `DASH-09` Apply `Cache-Control: private, no-store` to the Dashboard response.
- [x] `DASH-10` Review existing production indexes with `EXPLAIN ANALYZE`; add a migration only when a measured query plan requires it.
- [x] `DASH-11` Add focused tests for branch isolation, WIP scope, output/loss exclusion, distinct metric meanings, zero variance, BigInt serialization, date boundaries, and empty results.
- [x] `DASH-12` Run lint, type-check, build, diff-check, and document the final source/fact reconciliation result.

### Out Of Scope For This Batch

- [ ] Do not refactor `/api/production/report` or `/api/production/machine-utilization`.
- [ ] Do not change production transaction writes, stock-ledger rules, or production-order status transitions.
- [ ] Do not change primary-key types; production relational IDs remain `BigInt` and `stock_ledger.ref_id` remains polymorphic text.
- [ ] Do not introduce a Dashboard read model or new cache until query-plan/performance evidence supports it.

### Acceptance Criteria

- A user sees Dashboard facts only for allowed branches.
- Dashboard output, loss, yield, Top 10, machine summary, and WIP reconcile to the scoped PI/PO2 production facts.
- `รอบที่ใช้` is counted according to this page's output-receipt contract and does not silently overcount from unrelated rows.
- The Dashboard API returns JSON-safe IDs and is not cacheable by browsers/intermediaries.
- Existing Report and Machine Utilization consumers have no behavior change from this batch.
- Required focused and workspace validation passes.

### Implementation Checkpoint 2026-07-23

- Completed `DASH-01` through `DASH-09` in the first implementation batch.
- Added `production-dashboard.ts` and `production-dashboard-query.ts`; the API route now only handles auth, date parsing, scope resolution, service invocation, and response headers.
- Dashboard scope now passes authenticated branch IDs to both metric and WIP reads; machine aggregation uses machine IDs and response IDs are strings.
- Focused production tests passed `16/16`; workspace type-check and production build passed; workspace lint has zero errors and four pre-existing warnings outside this batch.
- Query-plan evidence: dev-target `EXPLAIN (ANALYZE, BUFFERS)` completed for scoped production orders, active input/output relations, and PI/PO2 ledger lookup. Current dataset is small and execution times were under 1.3 ms; existing indexes are sufficient, so no migration was added.
- Reconciliation evidence: `npm run verify:production-report --workspace @ns-scrap-erp/next` returned `ok: true`, `checkedRows: 7`, and `productSummaryRows: 3`.
- Final validation: focused production tests `19/19`, workspace type-check, production build, and `git diff --check` passed. Workspace lint has zero errors and four existing warnings outside this batch.

## Runtime Follow-up 2026-06-13

- `/api/production/dashboard` now groups `topProducts` from actual output products received into stock via `row.outputProducts`, not the production order target product.
- Dashboard `machineUtil.batches` now counts active non-loss output receipt rows from `row.outputProducts`; `machineUtil.qty` sums the same output qty by machine.
- Dashboard UI now uses an `Abnormal Loss` summary panel instead of making production order status a core panel.
- `/api/production/dashboard` now calculates all-system `totalWipQty` through a narrow PI/PO2 ledger helper instead of a second unfiltered full metric load.
- Dev-target DB now has targeted dashboard/report indexes for production order sort/filter, active input/output relation lookup, and included process-cost lookup.
- Shared production report/dashboard read model now uses field-level Prisma `select`, and `stock_ledger` has `idx_stock_ledger_production_source_movement` for `PI/PO2` `ref_id` ledger lookups.
- Branch/machine/status filters remain optional future dashboard parity work; date range is still the minimum dashboard filter.

## Runtime Follow-up 2026-07-05

- `/production/dashboard` now treats `สถานะใบสั่งผลิต` as a top KPI card instead of showing a separate lower status panel. It shows the three operational states requested by the user (`เสร็จบางส่วน`, `กำลังผลิต`, `เสร็จสิ้น`) as direct counts so order state is visible without reading progress bars.
- The daily Input/Output/Loss widget is now the date-filter owner for the dashboard (`วันนี้`, `7 วัน`, `30 วัน`, `90 วัน`, `เดือนนี้`, `ปีนี้`, and custom dates) and renders as a line chart with grid, axis ticks, legend, markers, and smoothed lines so the range selector and trend it controls stay together.
- The previous monthly production chart slot now shows dashboard Machine Utilization (`รอบที่ใช้` = output receipt row count, `น้ำหนักผลิต` = non-loss output qty by machine) because this is the operational machine view requested for the first dashboard viewport.
- The daily chart card layout was tightened into a professional dashboard surface: title and date controls live in a bordered header/toolbar, the legend sits directly above the chart canvas, and the plotting area has its own white canvas with axes and subtle area fills so the data is easier to scan.

## Implementation Checklist

- [x] Verify current Next page/component against this page-flow
- [x] Verify API route handlers match Current API and status rules above
- [ ] Verify legacy behavior for any gap before implementing runtime change
- [ ] Add/adjust tests or browser QA checklist before changing runtime
- [ ] Update this file and canonical reference if contract changes

## 2026-07-12 UI consistency checkpoint

- Verified `/production/dashboard` in Codex Browser at desktop and mobile sizes, in both Light and Dark mode.
- Replaced generic English working labels in the visible KPI/chart/machine surfaces with Thai-first labels, including `วัตถุดิบเข้า`, `ผลผลิต`, `สูญเสีย`, `งานระหว่างทำคงเหลือ`, `อัตราผลได้`, and `การใช้เครื่องจักร`.
- KPI cards now pass meaningful Lucide icons into the shared `KpiCard`; the mobile overview/product switch uses the shared line-tab component rather than a page-local segmented tab variant.
- The dashboard remains read-only. Date range behavior, dashboard formulas, API contracts, permissions, database schema, and business data did not change.
