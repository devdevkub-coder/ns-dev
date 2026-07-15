---
title: Daily Report Page Flow
tags:
  - page-flow
  - menu
status: accepted-baseline
updated: 2026-06-11
route: /daily-report
---

# Daily Report Page Flow

## Scope

| Field | Value |
|---|---|
| Menu section | Main Dashboard / Reports |
| Route | `/daily-report` |
| Page | Daily Report |
| Current Next | accepted code baseline |

## Canonical References

[[Main Dashboard Reports Flow]], [[Document Aging Policy]]

## Flow Baseline

Daily Report เป็นรายงานประจำวัน/ช่วงเวลา รวมซื้อ, ขาย, cash movement, expense, group/product breakdown และ top parties

## Page Responsibilities

- แสดง summary ของ purchase/sales/expense ประจำวัน
- แสดง cash movement แยก account/type
- แสดง top suppliers/customers/products และ group breakdown
- ใช้ filter/query contract เดียวกับ dashboard

## Non-Responsibilities

- ไม่ post รายการซื้อ/ขาย/เงินสด
- ไม่เป็น replacement ของ `/finance/bank`, `/purchase/bills`, `/sales/bills`
- ไม่แก้ source document เมื่อพบ mismatch

## Lifecycle / Read Flow

| Step | User action | System result |
|---|---|---|
| 1 | เปิดหน้า | `GET /api/daily-report` เรียก dashboard handler เดียวกัน |
| 2 | เลือกวันที่/ช่วง | API คืน `dailyReport` section จาก payload รวม |
| 3 | ตรวจรายการ | user ดู rows และ drilldown ไปเอกสารต้นทาง |
| 4 | Export/print | ต้องใช้ filter เดียวกับข้อมูลหน้าจอเมื่อเปิดใช้ |

## API / Data Contract

### Current API

- `GET /api/daily-report`
- implementation: re-export `GET` from `/api/dashboard`
- permission: `reports.reports.view`

### Current Response Sections

- `dailyReport.summary`
- `dailyReport.purchaseBills`, `dailyReport.salesBills`, `dailyReport.expenseRows`
- `dailyReport.cashMovement`
- `dailyReport.analytics`
- `dailyReport.groupBreakdown`

## Validation / Status Rules

- daily rows are based on selected document/business date, not `created_at`
- active-status exclusion follows dashboard helper
- cash movement uses today bank statement when available, otherwise receipt/payment fallback
- mixed product units must not be collapsed without a defined conversion rule

## Side Effects

- read-only; no transaction/ledger/bank/status writes

## Current Gap

- print/export format is not final
- source route mapping for row click/drilldown needs completion
- formula tests needed for selected date vs date range behavior

## Implementation Checklist

- [x] Verify current API delegates to dashboard API
- [x] Document current response sections
- [ ] Define print/export layout
- [ ] Add route mapping for PB/SB/EXP/BST source rows
- [ ] Add cutoff-date test cases

## 2026-07-12 Thai-first UI checkpoint

- Verified the rendered `/daily-report` and `/analytics-dashboard` surfaces in Codex Browser before changing visible copy.
- Daily cash movement now labels its net column/value as `สุทธิ` / `เงินสดสุทธิ`. Analytics uses Thai-first dashboard, tab, ranking, product, and action wording; the floating report actions keep their existing desktop-only placement but now use the shared compact `h-9 rounded-md` action treatment and normal font weight.
- This is presentation-only: reports remain read-only and their formulas, filters, export/print behavior, API contracts, permissions, database schema, and business data did not change.
