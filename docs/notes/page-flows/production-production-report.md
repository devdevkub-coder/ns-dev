---
title: รายงานการผลิต / Yield Page Flow
tags:
  - page-flow
  - menu
status: accepted-baseline
updated: 2026-06-13
route: /production/report
---

# รายงานการผลิต / Yield Page Flow

## Scope

| Field | Value |
|---|---|
| Menu section | Production |
| Route | `/production/report` |
| Page | รายงานการผลิต / Yield |
| Current Next | accepted code baseline |

## Canonical References

[[Production Flow]]

## Requirement Snapshot 2026-06-13

Source material:

- Legacy `old-apps/legacy/index.html` component `view-productionReport`.
- Customer annotated screenshots on 2026-06-13 for `/production/report`.
- Target production ledger contract in [[Production Flow]].

Business purpose:

- วิเคราะห์ผลผลิตจริงเทียบกับวัตถุดิบที่ใช้
- วัด efficiency โรงงาน
- detect production loss
- ดู WIP คงเหลือของใบสั่งผลิตที่ยังค้าง
- ส่งออกตารางรายละเอียดเป็น CSV ตาม filter ที่เห็นบนหน้า

Primary formula:

```text
Yield % = Output Qty / Input Qty * 100
```

Example:

```text
Input 1,000 kg
Output 920 kg
Yield = 920 / 1,000 * 100 = 92%
```

Cost/loss formulas:

| Metric | Formula | Notes |
|---|---|---|
| `RM บาท/กก.` | `RM Cost / Input Qty` | ใช้เป็น unit material cost ของ order นั้น |
| `ต้นทุนผลิต บาท/กก.` | `Total Production Cost / Output Qty` | ใช้เมื่อต้องดูต้นทุนผลิตต่อผลผลิตดี ไม่ใช้ label กว้างว่า `บาท/กก.` |
| `Loss Value (บาท)` | `Loss Qty * RM บาท/กก.` | ใช้มูลค่า loss จากน้ำหนัก loss คูณต้นทุน RM ต่อกก. ของ order |
| `Total Production Cost` | `RM Cost + Process Cost` | Process cost อ่านเฉพาะรายการ active/include in production |

No-fallback rule:

- ค่าที่แสดงต้องมาจาก production facts/stock ledger ที่ reconcile ได้เท่านั้น
- ห้าม fallback ไปใช้ stale summary ใน `production_orders` เพื่อให้ report ดูครบ
- ถ้า ledger/source facts ขาด ต้องแสดง audit/mismatch signal หรือแก้ data/migration/source write path ไม่ใช่ default ค่าแทน

## Flow Baseline

production report/yield/output/loss by period/order/line

## Page Responsibilities

- รายงาน output, yield, loss value, WIP คงเหลือ, RM/process/total cost และ production performance
- filter date, branch, machine, status และขยายเป็น order/line/product เมื่อ runtime API รองรับครบ
- แสดง KPI ตาม requirement snapshot: ใบสั่งผลิต, วัตถุดิบรวม, ผลผลิตรวม, Loss รวม, Yield %, ต้นทุนผลิตรวม, Loss Value (บาท)
- ไม่แสดง KPI `บาท/กก. เฉลี่ย` บน summary เพราะทำให้สูตร cost/kg สับสนระหว่าง `RM/Input` และ `Total/Output`
- แสดง block `WIP คงเหลือ (Work-in-Progress)` ในหน้านี้ได้ แม้ standalone `/production/wip-report` ถูก retire แล้ว
- แสดง block `ผลผลิตแยกตามสินค้า` จาก output facts ที่รับเข้า stock ของบริษัท ไม่รวม loss
- แสดงตาราง `รายละเอียดใบสั่งผลิต` เป็น source สำหรับ CSV export
- drilldown ไป production order and WIP/cost เมื่อมี route/action รองรับ

## Non-Responsibilities

- ไม่สร้าง production transaction
- ไม่ปรับ yield/loss เอง
- ไม่คำนวณ stock balance แทน stock ledger
- ไม่เปิด standalone WIP report กลับมา

## Lifecycle / Operation Flow

| Step | User action | System result |
|---|---|---|
| 1 | เปิดหน้า | GET production report |
| 2 | filter | date/branch/machine/status; future order/line/product when API supports it |
| 3 | review KPI | summary must tie back to detail rows |
| 4 | review WIP | show open/partial orders with remaining WIP qty/value |
| 5 | review product summary | group output by product, excluding loss |
| 6 | review detail | order-level input/output/WIP/loss/yield/RM/process/total/loss value/unit cost |
| 7 | export | CSV from the visible detail table and active filters |

## Legacy Baseline

Legacy `view-productionReport`:

- filters by from date, to date, branch, machine, and status; cancelled orders are excluded
- calculates `totalInputQty`, `totalOutputQty`, `totalLossQty`, `totalRMCost`, `totalProcessCost`, and `totalProductionCost`
- calculates `Yield % = totalOutputQty / totalInputQty * 100`
- calculates `Loss % = totalLossQty / totalInputQty * 100`
- calculates legacy `costPerKg = totalProductionCost / totalOutputQty`
- groups output by product excluding `Loss`/`Waste`
- exports CSV columns: `Date`, `DocNo`, `Type`, `Machine`, `Status`, `Input`, `Output`, `Loss`, `Yield%`, `RM Cost`, `Process`, `Total Cost`, `฿/Kg`

Target differences from legacy:

- do not copy legacy cloud force-refresh behavior
- do not expose `Closed` as MVP status unless accounting/cost lock is added later
- replace ambiguous `฿/Kg` label with explicit formula labels
- add `Loss Value (บาท)` from the customer screenshot
- derive facts from PI/PO2 stock ledger/read model rather than legacy in-memory arrays

## API / Data Contract

### Current API

- `GET /api/production/report - production/yield report`
- `GET /api/production/yield-loss-report - yield/loss detail API exists but not active menu page`

### Data Contract

- UI ใช้ outward business document/code เป็นหลัก และให้ server resolve internal id
- list/detail/print/export ต้องอ่าน source contract เดียวกันเพื่อลด drift
- transaction write ต้องทำใน server transaction และ append timeline/status/audit ตาม document policy
- ถ้า field เป็น money/qty/date/business code ให้ validate ตาม `docs/design.md` และ server-side ซ้ำ
- report rows must expose enough fields for `lossValue`, `rmCostPerKg`, and `productionCostPerKg`; do not overload one `costPerKg` field with multiple meanings
- `Output Qty` excludes loss; `Loss Qty` is reported separately
- `WIP Qty` is derived from `WIP_IN - PRODUCTION_OUTPUT_WIP_OUT - PRODUCTION_LOSS`
- product output summary must group actual output product rows received into stock, excluding loss rows

## Validation / Status Rules

- yield formula ต้องชัดและใช้หน่วยเดียวกัน
- loss category ต้องมาจาก output category policy
- report ต้อง reconcile กับ WIP/output facts
- cancelled production orders are excluded from default report rows
- status filter follows MVP statuses: `Open`, `In Production`, `Partially Completed`, `Completed`, `Cancelled`; `Closed` is a future accounting/cost-lock decision, not MVP default
- `Loss Value (บาท)` must be zero only when loss qty is zero or the order has no valid RM unit cost; missing cost data must be visible as a data/reconciliation issue, not silently defaulted
- CSV export must use the same detail row set shown on screen

## Side Effects

- read-only ไม่มี side effect

## Current Code Baseline

- Current `apps/next` page/API code is accepted as the P1 proof baseline as of 2026-06-11.
- This page belongs to the finance/production/report baseline group and must keep source facts traceable before formula or write-flow changes.
- Transaction side effects are limited to the current API contract documented above; report pages remain read-model surfaces.
- Future changes should reconcile source table, cutoff, status, and downstream side-effect details here before changing runtime behavior.

## Current Gap

- abnormal loss policy and output categories ต้องต่อกับ write flow
- Current Next report summary still has an ambiguous cost/kg metric; target requirement removes average cost/kg from KPI and keeps explicit order-level `RM/Input` and `Total/Output` formulas.
- Current Next report row contract needs explicit `lossValue`, `rmCostPerKg`, and `productionCostPerKg` fields before UI can match the screenshot.
- Current product summary in the shared report client groups by production order target product; target requires grouping actual output products received into stock.
- Current filter UI only sends date range from the shared client; target production report needs branch, machine, and status filters to match legacy/customer screenshot.

## Implementation Task Breakdown

### Task 1: API / Read Model Contract

- [x] Add explicit row fields from `/api/production/report`:
  - `rmCostPerKg = inputCost / inputQty`
  - `productionCostPerKg = totalCost / outputQty`
  - `lossValue = lossQty * rmCostPerKg`
- [x] Keep legacy-compatible row fields for `inputQty`, `outputQty`, `wipQty`, `lossQty`, `yieldPct`, `inputCost`, `processCost`, and `totalCost`.
- [x] Add summary `lossValue` by summing row `lossValue`.
- [x] Remove or stop using ambiguous summary `costPerKg` for `/production/report`; keep explicit unit-cost fields only.
- [x] Preserve no-fallback behavior: if ledger facts are missing, expose mismatch/audit signal instead of deriving from stale order totals.

### Task 2: Product Output Summary

- [x] Return or derive product summary from actual active output rows/ledger destination stock-in products.
- [x] Exclude `LOSS` / loss-effect rows from product summary.
- [x] Include product code/name, round count, output qty, output value/cost, and unit cost.
- [x] Do not group by production order target product unless the actual output product is the same.

### Task 3: Filters

- [x] Restore production report filters to match legacy/customer screenshot: date from, date to, branch, machine, and status.
- [x] Use outward business codes/ids consistently and let the API resolve internal ids server-side.
- [x] Keep cancelled orders excluded by default; status handling must not silently reintroduce legacy `Closed` unless accounting/cost-lock policy is approved.
- [ ] Later extension: order/line/product filters can be added after API/schema support is confirmed.

### Task 4: UI Layout / KPI

- [x] Remove KPI card `บาท/กก. เฉลี่ย` from `/production/report`.
- [x] Add KPI card `Loss Value (บาท)`.
- [x] Keep KPI cards: ใบสั่งผลิต, วัตถุดิบรวม, ผลผลิตรวม, Loss รวม, Yield %, ต้นทุนผลิตรวม, Loss Value (บาท).
- [x] Add formula-safe labels in detail table:
  - `RM บาท/กก.`
  - `ต้นทุนผลิต บาท/กก.`
- [x] Keep in-page `WIP คงเหลือ (Work-in-Progress)` section; do not recreate standalone `/production/wip-report`.
- [x] Keep `ผลผลิตแยกตามสินค้า` section after filters/KPI and before detail table.

### Task 5: Detail Table / Export

- [x] Detail table columns should include: เลขที่, วันที่, ประเภท, เครื่อง, สถานะ, Input, Output, WIP, Loss, Yield %, RM, Process, Total, Loss Value (บาท), RM บาท/กก., ต้นทุนผลิต บาท/กก.
- [x] CSV export must export the visible detail row set under the active filters.
- [x] CSV headers must use explicit unit-cost labels, not ambiguous `฿/กก.`.
- [x] Export must not use a separate query or summary-only dataset that can drift from the visible table.

### Task 6: QA / Validation

- [x] Add focused validation for API formula fields with sample rows or service-level test where practical.
- [x] Run targeted ESLint for production report API/client files.
- [x] Run `npm run type-check --workspace @ns-scrap-erp/next -- --pretty false`.
- [x] Run `npm run build --workspace @ns-scrap-erp/next`.
- [x] Run `npm run verify:production-report --workspace @ns-scrap-erp/next`.
- [ ] Browser QA `/production/report`: filters, KPI totals, WIP section, product summary, detail columns, and CSV export.
- [x] Confirm `/production/wip-report` remains retired and is not reintroduced in navigation.

## Implementation Checklist

- [x] Verify current Next page/component against this page-flow
- [x] Verify API route handlers match Current API and status rules above
- [x] Verify legacy behavior for production report requirement update before implementing runtime change
- [x] Record customer screenshot requirement for KPI/formula/export behavior
- [x] Add/adjust tests or browser QA checklist before changing runtime
- [x] Update this file and canonical reference if contract changes

## Validation Result 2026-06-13

- Added `npm run verify:production-report --workspace @ns-scrap-erp/next`.
- The verifier checks formula invariants for fixture rows and the current dev-target dataset:
  - row `rmCostPerKg`, `productionCostPerKg`, `costPerKg`, `lossValue`, and `yieldPct`
  - summary `lossValue`, `rmCostPerKg`, `productionCostPerKg`, `yieldPct`, and `lossPct`
  - product summary qty/cost/unit cost grouping
- Latest run passed. Current dev-target production report dataset had `checkedRows = 0`, so logged-in browser QA and live non-empty report evidence remain open.

## API / DB Optimization 2026-06-13

- `loadProductionMetrics()` uses field-level Prisma `select` for production report/dashboard fields to avoid pulling unused relation columns.
- Stock ledger lookup for report/dashboard uses production line ids through `stock_ledger.ref_id`; migration `20260613124402_optimize_production_report_ledger_lookup.sql` adds `idx_stock_ledger_production_source_movement` on `(ref_type, ref_id, movement_type)` for active `PI/PO2` report reads.
- Existing `ref_no` production indexes remain for reconciliation/reversal paths and are not a replacement for this report lookup pattern.

## 2026-07-12 Table consistency checkpoint

`/production/report` now reserves wider default/minimum widths for long production document/type/product/cost headers, resets the persisted report-column layout to the new width version, and uses canonical `p-3` body density in its report/dashboard tables. What is what: the tables still display the existing production, WIP, cost, machine, and product read models. Why it stays this way: full business labels must remain on one line without overlap; filters, exports, formulas, API behavior, permissions, database schema, and DB state are unchanged.

## 2026-07-12 Browser visual consistency checkpoint

Verified in Codex Browser with live report rows. The report and its in-page WIP tab now use Thai-first working labels, Thai production-type display values, and Lucide KPI icons instead of unresolved `??` glyphs. The document number remains the sole left-aligned business column; every later report/WIP column, including date, text, status, and numeric values, is right-aligned in both header and body. What is what: this remains a read-only view of the same production/WIP facts. Why it stays this way: it applies the approved `/stock/convert` alignment and `/production/orders` density baseline without changing filters, formulas, exports, API contracts, permissions, or database state.
