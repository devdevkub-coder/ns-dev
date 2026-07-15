---
title: รายงานทั้งหมด Page Flow
tags:
  - page-flow
  - menu
status: accepted-baseline
updated: 2026-06-11
route: /reports
---

# รายงานทั้งหมด Page Flow

## Scope

| Field | Value |
|---|---|
| Menu section | Reports |
| Route | `/reports` |
| Page | รายงานทั้งหมด |
| Current Next | accepted code baseline |

## Canonical References

[[Main Dashboard Reports Flow]], [[P2 Report Current Code Baseline]], [[Menu Page Flow Catalog]]

## Flow Baseline

`/reports` เป็น report hub และ aggregate management report. หน้าเดียวมีทั้ง catalog ของ report routes ที่เปิดใช้งาน และ legacy-style aggregate table สำหรับ purchase/sales summary

## Page Responsibilities

- แสดง report catalog แยกหมวด main, finance, accounting, stock, tracking, production, daily
- search/filter report catalog ด้วยชื่อ, owner, status, summary, href
- โหลด aggregate report จาก PB/SB ตาม date range
- export CSV ของ active aggregate tab ฝั่ง client

## Non-Responsibilities

- ไม่สร้าง report definition ใน database
- ไม่แก้ source report/page
- ไม่เป็น endpoint รวมทุก report payload ในระบบ
- ไม่ทำ server-side export large report ใน current baseline

## Lifecycle / Read Flow

| Step | User action | System result |
|---|---|---|
| 1 | เปิดหน้า | client โหลด static `reports` catalog และ `GET /api/reports/aggregate` |
| 2 | กรองวันที่ | API aggregate PB/SB ใหม่ตาม `fromDate`, `toDate` |
| 3 | เปลี่ยน tab | client เลือก rows จาก payload เดียวกัน |
| 4 | Export CSV | client download active tab rows ที่โหลดอยู่ |
| 5 | เปิด report | user คลิก link ไป route เจ้าของรายงาน |

## API / Data Contract

### Current API

- `GET /api/reports/aggregate?fromDate=YYYY-MM-DD&toDate=YYYY-MM-DD`
- permission: `reports.reports.view`

### Current Source Tables

- `purchase_bills` + `purchase_bill_items`
- `sales_bills`
- `suppliers`
- `customers`
- `sales_channels`
- `products`

### Current Response

- `purchaseChannel`
- `purchaseSupplier`
- `purchaseProduct`
- `salesChannel`
- `salesCustomer`
- `scope`
- `generatedAt`

## Validation / Status Rules

- active PB/SB excludes `cancelled`, `void`, `reversed`
- purchase product rows calculate avg price from item amount / item weight
- sales channel rows calculate margin from amount, cost, profit
- date filter is document date range, not created date
- client CSV exports only rows currently loaded in active tab

## Side Effects

- read-only; no transaction, report-definition, ledger, bank, payment or source status writes

## Current Gap

- static report catalog can drift from navigation unless kept in sync
- Excel export is client-side and may not suit large datasets
- source drilldown from aggregate rows is not complete

## UI Checkpoint - 2026-07-12

What is what:
- แท็บ, catalog, placeholder การค้นหา และชื่อหมวดใน `/reports` ใช้ Thai-first เพื่อให้ route directory อ่านสอดคล้องกับ sidebar
- ปุ่ม export ส่งออกไฟล์ Excel ตามข้อมูลที่เรียง/กรองใน tab ปัจจุบัน

Why it has to be like this:
- หน้ารายงานเป็นจุดรวมทางเลือกของผู้ใช้ จึงต้องไม่สลับภาษาและต้องให้ action/export อ่านตาม design baseline เดียวกับหน้าตารางอื่น

## Table Mechanics Checkpoint - 2026-07-02

What is what:
- The aggregate report table shows loaded PB/SB summary rows for the active legacy tab and date range.
- The report catalog table is the route directory for active report pages and supports search/category filtering.

Why it has to be like this:
- `/reports` is a read-model/report hub, so users compare numbers across tabs and need the same sortable/resizable table behavior used by Cost Pool and other active report tables.
- Mobile cards must come from the same sorted row sets as desktop so row order does not change between devices.

Implementation note:
- Both desktop tables now use `ResizableTableHead`, persisted resizable column widths, reset-width controls, `colgroup`, and fixed table layout.
- Client CSV export uses the displayed sorted aggregate row order. No aggregate API, report formula, catalog route, source drilldown, permission, or DB behavior changed.

## Implementation Checklist

- [x] Verify `/api/reports/aggregate` and report catalog source
- [x] Document current aggregate tabs
- [ ] Add guard/process to keep static catalog synced with navigation
- [ ] Decide server-side export for large reports
- [ ] Add source drilldown contract for aggregate rows
