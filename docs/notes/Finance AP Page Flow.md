---
title: Finance AP Page Flow
aliases:
  - Accounts Payable Page
  - Flow หน้าเจ้าหนี้ AP
  - หน้า Finance AP
tags:
  - ns-scrap-erp
  - finance
  - debt
  - accounts-payable
  - page-flow
status: draft
created: 2026-06-11
updated: 2026-06-26
---

# Finance AP Page Flow / Flow หน้าเจ้าหนี้ AP

## Scope

- Route: `/finance/ap`
- API: `GET /api/finance/ap`
- Owner: Finance & Debt
- Page type: read-only AP aging and payable dashboard
- Related payment owner: `/purchase/payments`
- Aging policy: [[Document Aging Policy]]

หน้านี้ใช้ดูยอดค้างจ่าย Supplier จากบิลรับซื้อ ไม่ใช่หน้าบันทึกจ่ายเงิน และไม่ใช่หน้าปรับสถานะบิลโดยตรง

## Source Of Truth

| Data | Source | Rule |
|---|---|---|
| ยอดตั้งหนี้ | `purchase_bills.total_amount` | นับเฉพาะบิลที่ไม่ cancelled |
| ยอดจ่ายแล้ว | `payments` + `purchase_bills.paid_amount` | รวม amount + WHT + discount ของ payment ที่ไม่ cancelled |
| ยอดค้างจ่าย | derived | `total_amount - paid_amount` |
| Aging | derived | target ใช้ due date / supplier credit term; current baseline ใช้ bill date + credit term 0 |
| Supplier/Branch | `suppliers`, `branches` | ใช้ outward business code ใน filter/API |

## Page Meaning

ใช้สำหรับ:

- ดูยอดค้างจ่ายรวมของ Supplier
- ดู aging bucket: `Current`, `1-30`, `31-60`, `61-90`, `>90`
- drilldown จาก supplier summary ไป bill detail rows
- export AP aging เป็น `.xlsx`
- ตรวจบิลที่ควรเข้าสู่ payment approval/payment queue

ไม่ใช้สำหรับ:

- สร้าง `PMA` / `PMT`
- ยกเลิก payment
- แก้ไข purchase bill
- ปรับ bank statement

## Main UI Contract

### Summary / KPI

ควรแสดง:

- ยอดค้างจ่ายรวม
- จำนวนบิลค้างจ่าย
- จำนวน Supplier ที่มียอดค้าง
- ยอด overdue
- ยอดครบกำหนดภายใน 7 วัน
- breakdown ตาม aging bucket

### Filters

ควรรองรับ:

- ค้นหาเลข PB / รหัส Supplier / ชื่อ Supplier / สาขา
- Supplier
- Branch
- Status
- Aging bucket
- วันที่เอกสารจาก-ถึง
- sort: date, docNo, dueDate, payableBalance, supplierName, aging

### Table Columns

คอลัมน์เป้าหมาย:

- เลข PB
- วันที่บิล
- วันที่สร้างรายการ
- วันที่ครบกำหนด
- Aging days
- Aging bucket
- Supplier code/name
- Branch
- Transaction mode
- Status
- ยอดบิล
- จ่ายแล้ว
- ค้างจ่าย

ต้องแยก `วันที่บิล` ออกจาก `วันที่สร้างรายการ` และ `วันที่ครบกำหนด`

## Row Detail / Drilldown

กด row ควรเปิด read-only detail:

- PB document data
- supplier/branch
- total/paid/balance
- aging/due date
- payment refs ที่ใช้ตัดยอด
- link ไป `/purchase/bills` และ `/purchase/payments`

## API Contract

`GET /api/finance/ap` รับ query:

- `q`
- `supplierId`
- `branchId`
- `status`
- `bucket`
- `from`
- `to`
- `page`
- `pageSize`
- `sortKey`
- `sortDirection`
- `format=json|xlsx`

Response ควรรวม:

- `rows`
- `bySupplier`
- `byBucket`
- `summary`
- `filters`
- `pagination`

## Business Rules

- AP page ต้องไม่สร้างหรือแก้ `PMA/PMT`
- ยอดจ่ายที่ cancelled ต้องไม่ลด AP balance
- ถ้า PB ถูกยกเลิกหรือ supplier swap cancelled ต้องไม่แสดงเป็น payable active
- Filter `to` ต้องรวมข้อมูลทั้งวันของวันที่ผู้ใช้เลือก ไม่ใช่หยุดที่เวลา `00:00:00`
- Due date target ต้องรองรับ bill due date / supplier credit term ไม่ใช่ hardcode credit term 0 ระยะยาว
- Aging ต้องหยุดนับเมื่อยอดค้างเป็น 0

## Dev Verification Spec: AP Missing Same-Day Bills

### Background

พบเคสวันที่ 2026-06-26 ที่หน้า `/purchase/bills` มีบิลค้างจ่ายสถานะ workflow `รอจ่าย` แต่หน้า `/finance/ap` ไม่แสดงครบเมื่อเลือกช่วงวันที่ `2026-06-01` ถึง `2026-06-26`

สาเหตุที่ต้องตรวจ: date range filter ของ AP ใช้ `to <= normalizeDate(to)` ซึ่งเท่ากับเที่ยงคืนต้นวัน ทำให้บิลที่สร้างระหว่างวันของ `to` ถูกตัดออก

### Affected Routes

| Area | Route/API | File |
|---|---|---|
| AP page | `/finance/ap` | `apps/next/src/components/purchase-flow/AccountsPayablePageClient.tsx` |
| AP API | `GET /api/finance/ap` | `apps/next/src/app/api/finance/ap/route.ts` |
| Purchase bills page | `/purchase/bills` | `apps/next/src/components/daily/TransactionBillsPageClient.tsx` |
| Purchase bills API | `GET /api/purchase/bills` | `apps/next/src/app/api/purchase/bills/route.ts` |

### Reproduction Data

Use date range:

- From: `2026-06-01`
- To: `2026-06-26`

Known same-day PB rows:

| PB | Created time (BKK) | Supplier | Workflow | Total | Payable |
|---|---:|---|---|---:|---:|
| `PB012606-0014` | `2026-06-26 13:02` | `Fukugen Business` | `รอจ่าย` / active PMA | `43,000.00` | `43,000.00` |
| `PB012606-0013` | `2026-06-26 13:02` | `Fukugen Business` | `รอจ่าย` / active PMA | `43,000.00` | `43,000.00` |

### Expected Result

For AP date range `2026-06-01` through `2026-06-26`, AP should include all unpaid PB rows created on 2026-06-26, including rows created after midnight.

Expected AP summary for the known data set:

| Metric | Expected |
|---|---:|
| AP bills | `11` |
| AP suppliers | `9` |
| AP total | `3,360,862.45` |

The previous incorrect output was:

| Metric | Incorrect |
|---|---:|
| AP bills | `9` |
| AP suppliers | `8` |
| AP total | `3,274,862.45` |

Difference:

- Missing bills: `PB012606-0014`, `PB012606-0013`
- Missing amount: `86,000.00`

### Acceptance Criteria

- `GET /api/finance/ap?from=2026-06-01&to=2026-06-26` includes PB rows created any time on `2026-06-26`.
- AP `summary.total` matches the sum of payable balances for active purchase bills in the selected date range.
- AP `summary.bills` matches active PB count with payable balance greater than zero.
- AP `summary.suppliers` counts distinct suppliers after grouping all active payable rows.
- Rows with active PMA but no PMT remain visible in AP if `payable_balance > 0`.
- Cancelled PB rows remain excluded.
- Paid PB rows with `payable_balance <= 0.01` remain excluded.
- XLSX export uses the same date filtering as JSON response.

### Implementation Rule

Use an exclusive upper bound for `to`:

```ts
date: {
  gte: normalizeDate(from),
  lt: new Date(normalizeDate(to).getTime() + 24 * 60 * 60 * 1000),
}
```

Do not use `lte: normalizeDate(to)` for timestamp-backed document dates.

### Regression Checks

- Compare `/purchase/bills` and `/finance/ap` for the same date range.
- In `/purchase/bills`, page size only controls visible rows per page; total rows may span multiple pages.
- In `/finance/ap`, `pageSize` must not affect `summary`, `bySupplier`, or `byBucket`; it should affect only `rows`.
- Test a same-day bill created after `12:00` and confirm it appears when `to` equals that date.
- Test export `.xlsx` and confirm same rows as API JSON.

## Current Implementation / Gap

- มี read/export baseline จาก `purchase_bills` และ `payments`
- current AP due date ยังใช้ `purchase_bills.date` + credit term 0
- ต้องเพิ่ม created-date display ใน list/detail/export
- ต้องยืนยัน payment allocation source หลัง dedicated allocation facts ครบ
- ต้องเพิ่ม source links ไป PB/PMA/PMT ให้ครบใน detail

## Related Notes

- [[Document Aging Policy]]
- [[Payment Flow]]
- [[Purchase Bills Page Flow]]
- [[Finance Bank Statement Page Flow]]
