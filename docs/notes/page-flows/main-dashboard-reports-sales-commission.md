---
title: Sales Tracking Dashboard Page Flow
tags:
  - page-flow
  - menu
status: accepted-baseline
updated: 2026-06-11
route: /sales-commission
---

# Sales Tracking Dashboard Page Flow

## Scope

| Field | Value |
|---|---|
| Menu section | Main Dashboard / Reports |
| Route | `/sales-commission` |
| Page | Sales Tracking Dashboard |
| Current Next | accepted code baseline |

## Canonical References

[[Main Dashboard Reports Flow]], [[Sales Flow]], [[Purchase Flow]]

## Flow Baseline

Sales Tracking Dashboard เป็น report สำหรับดู performance ของ salesperson/supplier/customer assignment และ commission-readiness ตาม current read model

## Page Responsibilities

- โหลด sales tracking/commission read model จาก server
- แสดงยอดตาม salesperson หรือ assignment ที่ helper `buildSalesCommission()` ส่งกลับ
- ใช้เป็น dashboard ตรวจงาน ไม่ใช่ payroll posting

## Non-Responsibilities

- ไม่สร้าง commission payable
- ไม่แก้ salesperson master หรือ supplier/customer owner
- ไม่เขียน PB/SB/payment/receipt

## Lifecycle / Read Flow

| Step | User action | System result |
|---|---|---|
| 1 | เปิดหน้า | `GET /api/sales-commission` |
| 2 | ดูสรุป | UI แสดง payload จาก `buildSalesCommission()` |
| 3 | Drilldown | ไปหน้า PB/SB/salesperson/supplier ที่เกี่ยวข้องเมื่อมี link |

## API / Data Contract

### Current API

- `GET /api/sales-commission`
- permission: `reports.reports.view`
- server helper: `buildSalesCommission()` from `main-sales-control`

### Response Schema

The server helper `buildSalesCommission()` returns the following payload:

```json
{
  "billRows": [
    {
      "amount": 12500.50,
      "date": "2026-06-25",
      "docNo": "PB012606-0004",
      "facePrice": 0,
      "id": "PB012606-0004",
      "price": 25.00,
      "productName": "ทองแดง, เหล็ก",
      "qty": 500,
      "salesId": "S001",
      "status": "รอจ่าย",
      "supplierName": "Supplier A"
    }
  ],
  "filters": {
    "dateFrom": "2026-06-01",
    "dateTo": "2026-06-27",
    "periods": ["today", "week", "month", "quarter", "year"]
  },
  "salesRows": [
    {
      "avgPrice": 25.00,
      "billCount": 1,
      "code": "SL001",
      "commission": 1500,
      "eligible": true,
      "id": "S001",
      "name": "พนักงานขาย A",
      "phone": "0812345678",
      "progressPct": 100,
      "purchaseAmt": 1500000,
      "qty": 60000,
      "remainingToTarget": 0,
      "supplierCount": 5
    }
  ],
  "sourceState": {
    "basis": "Sales Commission read/design baseline from purchase bills, salespersons, and supplier owner assignments.",
    "limitations": [
      "Period changes, CSV export, supplier assignment, bulk assignment, and persisted commission closing remain disabled until authorization and audit are designed."
    ],
    "writeActionsEnabled": false
  },
  "suppliers": [
    {
      "code": "SUP001",
      "id": "SUP001",
      "name": "Supplier A",
      "phone": "0898765432",
      "salesId": "S001"
    }
  ],
  "totals": {
    "bills": 1,
    "purchaseAmt": 1500000,
    "qty": 60000
  }
}
```

## Commission Formula & Transaction Handoff

### Commission Formula
- **Target Threshold:** 1,000,000 Baht of purchase amount in the period.
- **Eligibility:** A salesperson is eligible for commission only when `purchaseAmt >= 1,000,000`.
- **Commission Calculation:** Calculated in steps of 500,000 Baht.
  `commission = Math.floor(purchaseAmt / 500,000) * 500` if target is met; otherwise `0`.

### Transactional Payable Handoff Design
If commission becomes transactional in the future, the system will implement the following:
1. **Durable Ledger (`sales_commissions`):**
   A new database table will store approved commission results:
   `id`, `period` (e.g. `2026-06`), `salesperson_id`, `total_purchase_amount`, `calculated_commission`, `approved_by`, `approved_at`, `status` (`pending`, `posted`, `paid`), `payment_voucher_ref`.
2. **Monthly Closing / Posting Action:**
   An authorized role (e.g. Financial Manager) executes the "Close Period & Post Commission" action, which:
   - Freezes/snapshots the sales commission record for the period.
   - Automatically writes a corresponding Petty Advance or Payment voucher of type `COMMISSION` payable to the salesperson, creating an AP posting link.
   - Prevents recalculation of commission for that period even if the underlying purchase bills are edited (immutable snapshot).

## Validation / Status Rules

- commission formula must be documented before write/payroll behavior is added
- salesperson ownership source must be explicit: master assignment, PB/SB field, or snapshot
- cancelled/reversed source rows must follow report definition

## Side Effects

- read-only; no commission payout, payment, payroll, PB/SB or master-data writes

## Implementation Checklist

- [x] Verify current API endpoint
- [x] Document no-payroll/no-write boundary
- [x] Inspect and document exact `buildSalesCommission()` response shape when runtime changes
- [x] Define commission formula and payable handoff, if commission will become transactional
