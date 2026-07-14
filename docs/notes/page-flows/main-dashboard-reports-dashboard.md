---
title: Dashboard Overview Page Flow
tags:
  - page-flow
  - menu
status: accepted-baseline
updated: 2026-07-07
route: /dashboard
---

# Dashboard Overview Page Flow

## Scope

| Field | Value |
|---|---|
| Menu section | Main Dashboard / Reports |
| Route | `/dashboard` |
| Page | Dashboard Overview |
| Current Next | accepted code baseline |

## Canonical References

[[Main Dashboard Reports Flow]], [[P2 Report Current Code Baseline]], [[Document Aging Policy]]

## Flow Baseline

Dashboard Overview เป็น management KPI view จาก operational facts. ใช้สำหรับดูภาพรวมซื้อ/ขาย/เงินสด/หนี้/stock/production ไม่ใช่หน้า posting หรือแก้ source document

## UI Baseline

- ยึด legacy Dashboard ใน `https://sirimasth.github.io/ns-scrap-erp/` หมวดหน้าหลักเป็น visual reference แต่ใช้ข้อมูลและ API ของ active Next app เท่านั้น
- ลำดับหน้าจอคือ global filter area -> historical/runtime notice -> KPI 6 ใบ -> chart/widget cards -> risk/breakdown panels -> detail tabs สำหรับ Top Ranking / Stock / Metrics
- Desktop แสดงตัวกรองหลัก (`ช่วงเวลา`, `from`, `to`, `branch`, `group`, `supplier`, `customer`, `product`) ใน white/neutral filter card เดียวกัน ไม่ซ่อนอยู่ใน details เพื่อให้เห็น scope ของ dashboard ชัดก่อนอ่าน KPI
- Desktop filter ต้องใช้ shared filter shell (`rounded-md bg-white p-3 shadow`), control height `h-9`, slate segmented quick-range buttons, และแสดงปุ่มล้างตัวกรองเฉพาะเมื่อมี active filter เพื่อไม่ให้ดูเป็น action ลอยที่ไม่จำเป็น
- Mobile แสดงเฉพาะ quick range, ช่วงวันที่, count summary และปุ่ม `ตัวกรอง`; ตัวกรองเต็มเปิดผ่าน `MobileFilterSheet` เพื่อไม่ให้หน้าเริ่มด้วย form stack ยาว และ controls ใน sheet ต้องคง `h-9` + neutral slate apply/focus treatment ไม่ใช้ปุ่มฟ้า custom
- ห้ามแสดง hero/banner แยกสำหรับชื่อหน้า Dashboard Overview ถ้ามี title/scope จาก app shell และ filter card อยู่แล้ว เพราะกินพื้นที่และซ้ำกับข้อมูลหน้า
- KPI 6 ใบใช้ white cards พร้อม accent สีซ้ายเท่านั้น; ห้ามทำ full-gradient ทุกใบจนทั้งหน้าดูแข่งกันเด่น และไม่ใช้ dot marker ที่เหมือนสถานะถ้าไม่มีความหมายจริง
- KPI 6 ใบแสดง optional delta badge ใต้/ข้างตัวเลขหลักได้เฉพาะเมื่อมาจากข้อมูลจริงของช่วงก่อนหน้าที่เทียบกันได้ (`previousEquivalentRange`); badge เป็นลูกศรขึ้น/ลง/คงที่ + เปอร์เซ็นต์เล็ก ไม่ใช่ sparkline หรือกราฟแยก และสีต้องตีความตามธุรกิจ เช่น Expenses/AP เพิ่มเป็นสัญญาณลบ แต่ Revenue/Cash/Net Profit เพิ่มเป็นสัญญาณบวก
- Filter card ห้ามใช้แถบดำหนักในหน้านี้; ช่อง input/select/search ต้องอ่านค่าและ placeholder ชัดเจน ไม่ดูเหมือนช่องว่าง
- `Historical` แสดงเฉพาะเมื่อมี rows จริง ถ้าไม่มีข้อมูลไม่ต้องแสดง empty banner เพราะไม่ช่วยการตัดสินใจ
- Detail metric sections ท้ายหน้าต้องไม่ซ้ำกับ KPI โดยตรง เช่น ซื้อ/ขายท้ายหน้าเน้นจำนวนบิล, น้ำหนัก, ราคาเฉลี่ย, GP/Margin แทนการย้ำยอดรวมเดิม
- Detail-heavy content เช่น ranked list, stock table, และ metric drill-down ต้องอยู่หลัง overview ใน tabs เพื่อให้ผู้ใช้เลือกอ่านทีละบริบท ไม่ให้ dashboard กลายเป็นหน้าตารางยาว
- Detail tabs สำหรับ `อันดับคู่ค้า` / `Stock` / `ตัวชี้วัดย่อย` ต้องใช้ line tabs (`TabsList variant="line"` / `TabsTrigger variant="line"`) ไม่ใช้ปุ่มการ์ดใหญ่ เพราะเป็นตัวเลือก data surface ไม่ใช่ KPI cards
- AR/AP overdue หรือยอดลูกหนี้/เจ้าหนี้คงค้างไม่ต้องแสดงเป็น alert strip/card แยก ถ้าข้อมูลเดียวกันอยู่ใน `Receivables & Payables Aging` แล้ว เพราะตาราง Aging เป็นพื้นที่หลักที่แยก Current/1-30/31-60/61-90/>90/Total ชัดกว่า
- Chart/insight cards ต้องเพิ่มมุมมองบริหารที่ต่างจาก KPI และ detail tabs เท่านั้น ห้ามแสดง `Expense Breakdown`, `Channel Performance`, หรือ `Quick Insights` เป็นการ์ดแยก ถ้าค่าเหล่านั้นซ้ำกับ `Revenue vs Expense (Monthly)`, KPI cards, `Receivables & Payables Aging`, หรือแท็บ `Metrics` อยู่แล้ว
- Ranked list ใน Dashboard Overview แสดง 5 อันดับแรกก่อน และให้กดขยายดูครบ 10 อันดับเมื่อจำเป็น
- การเปลี่ยน UI นี้ไม่เปลี่ยนสูตรรายงาน, source tables, permissions, หรือ side effects ของ `GET /api/dashboard`

## Page Responsibilities

- แสดง KPI รายได้, COGS, GP, expenses, net profit, AR/AP, cash และ stock
- แสดง trend รายเดือน, stock by branch/group, aging bucket และ filter option
- รองรับ filter `date`, `from`, `to`, `branchId`, `supplierId`, `customerId`, `productId`, `group`
- แสดงตัวเลขเป็น management report พร้อมข้อจำกัดใน `sourceState`

## Non-Responsibilities

- ไม่สร้าง/แก้ PB, SB, EXP, PMT, RCP, stock ledger หรือ production facts
- ไม่เป็นงบการเงินทางการ
- ไม่ auto-fix anomaly หรือ reconcile source facts

## Lifecycle / Read Flow

| Step | User action | System result |
|---|---|---|
| 1 | เปิดหน้า | `GET /api/dashboard` โหลด payload จาก `buildMainDashboards()` |
| 2 | เปลี่ยน filter | API resolve branch/supplier/customer จาก business code แล้วคำนวณใหม่ |
| 3 | ดู KPI/section | UI อ่าน `dashboard`, `dailyReport`, `ownerDaily`, `production` จาก payload เดียวกัน |
| 4 | Drilldown | ไป source report/document ที่เกี่ยวข้อง โดยไม่แก้ข้อมูลต้นทาง |

## API / Data Contract

### Current API

- `GET /api/dashboard`
- permission: `reports.reports.view`
- query: `date`, `from`, `to`, `branchId`, `supplierId`, `customerId`, `productId`, `group`

### Current Source Tables / Helpers

- `purchase_bills` + `purchase_bill_items`
- `sales_bills`
- `expenses`
- `payments`
- `receipts`
- `stock_ledger`
- `trading_deals`
- `bank_statement`, `accounts`
- `loan_schedules`, `loans`
- `products`, `salespersons`, `branches`, `suppliers`, `customers`
- `historical_monthly`
- helpers: `buildFinancialDashboard()`, `loadProductionMetrics()`

### Runtime Read Contract

- `buildMainDashboards()` ต้องทำงานได้ภายใต้ Prisma/pg pool ต่ำ (`DATABASE_POOL_MAX=1`) เพื่อไม่เปิด connection พร้อมกันเกิน Supabase runtime contract
- main dashboard read batch ใช้ sequential execution ผ่าน `runReadBatch()` แทน `Promise.all` ก้อนใหญ่; ห้าม optimize กลับเป็น parallel batch โดยไม่เพิ่ม bounded concurrency และ repro ด้วย `DATABASE_POOL_MAX=1`

### Response Sections

- `dashboard.kpi`, `dashboard.sections`, `dashboard.trend`, `dashboard.monthlyTrend`
- `dashboard.agingBuckets`, `dashboard.cashComposition`
- `dashboard.stockByBranch`, `dashboard.stockByGroup`
- shared `filterOptions`, `filters`, `sourceState`

## Validation / Status Rules

- cancelled/void/reversed PB/SB/EXP rows are excluded by active-status logic
- date range defaults to month start through selected date
- stock balance is currently derived from `stock_ledger` qty/value net
- historical monthly rows are added into revenue/COGS/expense management totals
- created date, document date, due date and as-of date must remain separate in UI and exports

## Side Effects

- read-only
- no transaction, ledger, bank, payment, receipt, production, master-data, status or timeline writes

## Current Gap

- KPI formulas need report-definition tests before runtime math changes
- source-document drilldown is not complete for every card/row
- dashboard totals must be reconciled with Finance Accounting pages before claiming statutory accuracy

## Implementation Checklist

- [x] Verify current API response shape and source tables
- [x] Document no-side-effect boundary
- [ ] Add report formula tests for cutoff/cancelled rows
- [ ] Define drilldown route per KPI card
- [ ] Reconcile with finance-accounting dashboard before changing formulas

## 2026-07-12 Thai-first UI checkpoint

- Verified the rendered `/dashboard` surface in Codex Browser before changing its visible copy.
- Dashboard KPI, chart, aging, tab, ranking, and metric-surface labels now use Thai-first wording; the readable accounting abbreviations `AR`, `AP`, `OD`, and `WAC` remain only as contextual abbreviations beside Thai business names.
- This is presentation-only: dashboard formulas, filters, source tables, API contracts, permissions, database schema, and business data did not change.
