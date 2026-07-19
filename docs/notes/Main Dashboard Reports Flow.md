---
title: Main Dashboard Reports Flow
tags:
  - main-dashboard
  - reports
  - read-model
  - flow
status: accepted-baseline
updated: 2026-07-18
---

# Main Dashboard Reports Flow

เอกสารนี้เป็นภาพรวมของหมวด `Main / Dashboard & Reports` และหน้า `/reports` ใน active Next app. ทุกหน้าในชุดนี้เป็น read-model/report surface: อ่านข้อมูลจากเอกสารต้นทาง, ledger, master data และ helper report ที่มีอยู่ แต่ไม่สร้างธุรกรรม ไม่ post บัญชี ไม่ตัด stock และไม่เปลี่ยนสถานะเอกสารต้นทาง

ข้อมูล Dashboard ย้อนหลังต้องตาม [[Reporting History Snapshot Policy]]: รายงานที่ตอบวันที่ในอดีตต้องอ่านจาก transaction facts/document snapshots/reporting snapshots ตาม `as_of_date` ไม่ใช้ยอด current-state ปัจจุบันย้อนแทนอดีต

## Menu Scope

| Route | Page | Current API | Permission | Source of truth |
|---|---|---|---|---|
| `/dashboard-overview` | Dashboard Overview | `GET /api/dashboard` | `reports.reports.view` | dashboard summary plus dashboard-used analytics, finance, stock, historical sources |
| `/owner-daily` | Owner Daily Control | `GET /api/owner-daily` | `reports.reports.view` | daily cash, AR/AP due, expense, loan, pending, FG and WIP sources only |
| `/daily-report` | Daily Report | `GET /api/daily-report` | `reports.reports.view` | range PB/SB/expense/cash and required line/reference sources only |
| `/analytics-dashboard` | Analytics Dashboard | `GET /api/analytics-dashboard` | `reports.reports.view` | range trend, group, ranking and top entity sources only |
| `/profit-cost-analysis` | Profit & Cost Analysis | `GET /api/profit-cost-analysis` | `reports.reports.view` | PB/SB items, stock ledger, branch/supplier/customer/channel/product masters |
| `/sales-commission` | Sales Tracking Dashboard | `GET /api/sales-commission` | `reports.reports.view` | salesperson/supplier/sales control read model |
| `/cash-flow-calendar` | Cash Flow Calendar | `GET /api/cash-flow-calendar` | `reports.reports.view` | accounts + bank statement by month |
| `/business-calendar` | Business Calendar | `GET /api/business-calendar` | `reports.reports.view` | PB, SB, expenses, receipts, payments by month |
| `/cash-others-summary` | Cash & Others Summary | `GET /api/cash-others-summary` | `reports.reports.view` | accounts, bank statement, AR/AP from bills, stock ledger, trading deals |
| `/anomaly-detector` | ตรวจจับความผิดปกติ | `GET /api/anomaly-detector` | `reports.reports.view` | derived anomaly rules from cash, stock, PB/SB, masters, bank statement, trading deals |
| `/reports` | รายงานทั้งหมด | `GET /api/reports/aggregate` | `reports.reports.view` | PB/SB aggregate plus static active-report catalog |

## Shared Rules

- ทุกหน้าเป็น management/read baseline ไม่ใช่งบ statutory accounting
- cancelled/void/reversed source ต้องถูก exclude หรือแสดงตามสูตรของแต่ละ report อย่างชัดเจน
- `created_at`, business document date, due date และ as-of date ต้องแยกความหมายกันเสมอ
- Export/CSV/print ต้องใช้ filter condition ชุดเดียวกับข้อมูลที่ผู้ใช้เห็น
- drilldown ต้อง link ไป source route ด้วย outward document number/code และ resolve internal id ฝั่ง server
- หน้า anomaly สามารถแนะนำ action/link ได้ แต่ไม่มี auto-fix/write action
- รายเดือน/รายปีต้อง roll up จาก daily snapshot/facts ที่ตรวจแล้ว: movement metric ใช้ผลรวมรายวัน ส่วน balance metric ใช้ ending balance ณ วันสุดท้ายของช่วง
- `/dashboard-overview` ต้องให้ผู้ใช้เห็น global filter scope ก่อน overview เสมอ: desktop ใช้ white/neutral filter card, mobile ใช้ compact strip + `MobileFilterSheet` เพื่อไม่ให้ filter stack ดัน KPI ลงล่าง และรายละเอียดที่เป็น table-heavy ต้องเปิดทีละบริบทผ่าน detail tabs แทนการกองหลายตารางยาวลงหน้าเดียว
- `/api/dashboard` ต้องเคารพ low-pool Supabase runtime (`DATABASE_POOL_MAX=1` ได้): อ่านหลายชุดผ่าน bounded concurrency ไม่เกิน 4 งานพร้อมกัน ห้ามใช้ `Promise.all` ก้อนใหญ่กับ Prisma read หลายสิบคำสั่ง เพราะจะทำให้ pg pool acquisition timeout และหน้า Dashboard ได้ 500 แม้สูตรรายงานถูกต้อง
- `/api/dashboard` ใช้ `buildMainDashboards(..., { includeAnalytics: true, includeDaily: false, includeOwner: false })`: คงเฉพาะ dashboard KPI/aging/stock/historical และ analytics ที่หน้า overview ใช้ ส่วน payment/receipt, bank movement รายวัน, loan, trading และ production detail ไม่ถูกอ่านในโหมดนี้
- `/api/analytics-dashboard` ใช้ line reader แบบ lightweight ที่ select เฉพาะ `sales_bill_id`, `product_id`, `product_name_snapshot`, `qty` และ `line_amount` และสร้าง daily trend จาก PB/SB โดยตรง; ห้ามเรียก `salesBillLineFactsByBillId` หรืออ่าน `bank_statement` เพราะ analytics ใช้ COGS จาก bill header และไม่ต้องใช้ allocation/trading/stock-ledger cost detail
- report API ต้องแยก payload ตาม consumer และตอบ `Cache-Control: private, no-store`; reference options เท่านั้นที่ใช้ shared reference cache ได้
- `/api/owner-daily`, `/api/daily-report` และ `/api/analytics-dashboard` ห้ามเรียก dashboard finance/stock/historical service ที่หน้าไม่ได้ใช้

## Current Query Patterns

| API | Query params currently used |
|---|---|
| `/api/dashboard` | `date`, `from`, `to`, `branchId`, `supplierId`, `customerId`, `productId`, `group` |
| `/api/owner-daily` | `date`, optional `from`, `to`, `branchId` |
| `/api/daily-report` | `date`, `from`, `to`, `branchId`, `supplierId`, `customerId`, `productId`, `group` |
| `/api/analytics-dashboard` | `date`, `from`, `to`, `branchId`, `supplierId`, `customerId` |
| `/api/profit-cost-analysis` | `from`, `to`, `branchId`, `supplierId`, `customerId`, `salesChannelId`, repeated/comma `metalGroup` |
| `/api/cash-flow-calendar` | `month=YYYY-MM` |
| `/api/business-calendar` | `month=YYYY-MM` |
| `/api/cash-others-summary` | `asOf=YYYY-MM-DD` |
| `/api/anomaly-detector` | `asOf=YYYY-MM-DD` |
| `/api/reports/aggregate` | `fromDate`, `toDate` |

## Side-Effect Boundary

These pages must not write:

- `purchase_bills`, `sales_bills`, `po_buys`, `po_sells`, `weight_tickets`
- `stock_ledger`, pending_out/reservation facts, WAC/cost facts
- `bank_statement`, payment/receipt allocation, PMA/PMT/RCP states
- production input/output ledger
- master data cleanup or duplicate merge

If a dashboard card needs a corrective action, it must navigate to the owning transaction/admin page and let that page enforce validation, locking, audit, timeline, and posting.

## Open Gaps

- define final formula owner for each KPI before changing report math
- define historical snapshot/read-model owner for Bill, PO, Finance, Stock, and Tracking dashboards before enabling long-range as-of reporting
- add row-level source-document drilldown where current payload only returns summary rows
- align Profit & Cost COGS with final Stock Ledger/WAC policy
- decide whether `/reports` CSV export should become server-side Excel for large datasets
- add explicit report definition tests for cutoff date, cancelled status exclusion, and mixed unit display
