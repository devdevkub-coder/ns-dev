---
title: Transaction Ledger Page Flow
tags:
  - page-flow
  - menu
  - admin-system
status: accepted-baseline
updated: 2026-07-02
route: /admin/transaction-ledger
---

# Transaction Ledger Page Flow

## Scope

| Field | Value |
|---|---|
| Menu section | Admin / System |
| Route | `/admin/transaction-ledger` |
| Page | Transaction Ledger |
| Current Next | accepted code baseline |

## Canonical References

[[System Supporting Flows]], [[Menu Page Flow Catalog]]

## Flow Baseline

admin read model for cash/bank transaction ledger and duplicate/account reconciliation

## Page Responsibilities

- แสดง transaction ledger จาก bank/payment/cash movement facts
- โหลดสูงสุด 10000 rows สำหรับหน้า ledger ตาม current code
- รองรับ filter/search/date/account/ref type ใน client
- export CSV client-side และ Excel ผ่าน API format=xlsx
- แสดง account balances, duplicate groups, linked bills

## Non-Responsibilities

- ไม่สร้าง/แก้ transaction
- ไม่ลบ bank_statement หรือ payment facts
- ไม่แทน Finance Bank Statement page สำหรับ user workflow

## Lifecycle / Support Flow

| Step | User action | System result |
|---|---|---|
| 1 | เปิดหน้า | GET transaction-ledger?limit=10000 |
| 2 | filter/search | client-side filter จาก rows ที่โหลด |
| 3 | export CSV | build CSV จาก filtered rows |
| 4 | export Excel | GET format=xlsx จาก API |
| 5 | drilldown | ใช้ linkedBills/source refs ตาม payload |

## API / Data Contract

### Current API

- `GET /api/admin/transaction-ledger?limit=10000 - load ledger rows/accounts/duplicateGroups`
- `GET /api/admin/transaction-ledger?limit=10000&format=xlsx - Excel export`

### Data Contract

- user identity ต้องมาจาก authenticated context ไม่รับ actor จาก form
- admin/support action ต้อง enforce permission ที่ API ระบุ
- admin/support pages ต้องไม่เขียน business transaction facts
- current code ใน `apps/next` เป็น proof baseline ของ P3 admin/system ณ 2026-06-11

## Validation / Status Rules

- requires permission finance.cash.view
- rows ต้องมี account/source/ref/link เพื่อ audit
- export ต้อง match API payload/current filter behavior ตาม code
- current code เป็น proof baseline

## Side Effects

- read/export only ไม่มี transaction side effect

## 2026-07-02 Table Mechanics Checkpoint

- Main ledger table now follows the active Cost Pool / Weight Ticket table mechanics: sortable `ResizableTableHead` headers, persisted resizable widths, `colgroup`, fixed table layout, and a reset-width control.
- Sorting is client-side display sorting after the existing filters. When no column sort is selected, the existing default order remains latest date/id first.
- Mobile cards and client-side CSV export now use the same sorted row set as the desktop table.
- No API, ledger source, account balance card, duplicate diagnostic, Excel export, permission, or DB behavior changed.
- Browser QA remains pending.

## Current Gap

P3 proof completed from current code. Remaining report/formula proof belongs to finance/bank and payment flows.

## Implementation Checklist

- [x] Verify current page/component API calls
- [x] Verify current API route methods and permission boundary
- [x] Keep business transaction side effects out of this page
- [x] Update this file if admin/system code changes

## 2026-07-12 Table consistency checkpoint

`/admin/transaction-ledger` now paginates the filtered/sorted ledger at 25 rows by default with 10/25/50/100 page-size controls, the same page slice for desktop rows and mobile cards, an automatic page reset when filters change, and one result count only in the pagination row. What is what: pagination controls only the read-only ledger result already loaded from the existing API. Why it stays this way: the operational list must use the same count/range/navigation pattern as the approved table baseline without changing account balances, duplicate detection, exports, API behavior, permissions, database schema, or DB state; 50/100 are explicit opt-in reconciliation sizes for reviewers who need to scan a larger loaded batch, while 25 remains the default.
