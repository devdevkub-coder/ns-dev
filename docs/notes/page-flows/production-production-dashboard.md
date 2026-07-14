---
title: Production Dashboard Page Flow
tags:
  - page-flow
  - menu
status: accepted-baseline
updated: 2026-07-12
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
