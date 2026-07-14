---
title: PO ซื้อ/ขาย คงเหลือ Page Flow
tags:
  - page-flow
  - menu
  - po-report
status: accepted-baseline
updated: 2026-06-11
route: /po-reports/outstanding
---

# PO ซื้อ/ขาย คงเหลือ Page Flow

## Scope

| Field | Value |
|---|---|
| Menu section | Trading / PO Reports |
| Route | `/po-reports/outstanding` |
| Page | PO ซื้อ/ขาย คงเหลือ |
| Current Next | accepted code baseline |
| Canonical overview | [[Trading Flow]] |

## Canonical References

- [[Trading Flow]]
- [[PO Buy Page Flow]]
- [[PO Sell Flow]]
- [[Purchase Flow]]
- [[Sales Flow]]
- [[Document Aging Policy]]
- [[Menu Page Flow Catalog]]

## Legacy Baseline

Legacy `view-poOutstanding`:

- แบ่ง tab `PO ซื้อ คงเหลือ` และ `PO ขาย คงเหลือ`
- PO Buy outstanding แสดง POB ที่ยังต้องรับของจริง (`requireDelivery !== false`) และมี `remainingQty > 0`
- PO Sell outstanding แสดง POS ที่ยังต้องส่งของจริงและมี remaining quantity
- มี filter supplier/customer/product และ export CSV
- PO Buy legacy มี checkbox `ตัดต้นทุน` / `costDeducted` เพื่อกันนับใน Cost Pool; target ต้องแยกให้ชัดว่า action นี้เป็น cost/dual-costing ownership ไม่ใช่ report mutation ธรรมดา

## Page Responsibilities

- แสดง POB ค้างรับตาม item remaining quantity/value
- แสดง POS ค้างส่งตาม item remaining quantity/value
- ใช้เป็น operational aging/pending report ของ commitment ที่ยังไม่ถูก downstream document ใช้หมด
- แยก PO ที่ต้องส่งของจริงออกจาก costing-only PO ด้วย `require_delivery`
- Drilldown target ควรเปิด PO Buy/PO Sell และ downstream usage ที่เกี่ยวข้อง

## Non-Responsibilities

- ไม่สร้าง/แก้/ยกเลิก PO
- ไม่ close-short PO
- ไม่ตัด stock และไม่เขียน stock ledger
- ไม่เขียน AP/AR, payment, receipt, bank statement
- ไม่ mutate cost pool จาก report read API

## Current API

### `GET /api/po-reports/outstanding`

Permission: `reports.reports.view`

Query:

- Current API ยังไม่มี query filter; filtering/export ถ้ามีใน UI ต้องตรวจแยกจาก client implementation

Source tables:

- `po_buys` include `suppliers`
- `po_sells` include `customers`
- `products` for product code/name resolution

Include rules:

| Side | Include | Exclude |
|---|---|---|
| Buy | `require_delivery != false`, item `remainingQty > 0.001` | `Cancelled`, `cancelled`, `Received`, `received` |
| Sell | `require_delivery != false`, item `remainingQty > 0.001` | `Cancelled`, `cancelled`, `Canceled`, `canceled`, `Closed`, `closed`, `Completed`, `completed`, `Fully Matched`, `fully matched`, `Received`, `received` |

Response:

| Field | Meaning |
|---|---|
| `buyRows` | POB item rows: date, docNo, expectedDelivery, partnerName, product, qty, receivedQty, remainingQty, remainingValue, status, unitPrice |
| `sellRows` | POS item rows: date, docNo, expectedDelivery, partnerName, product, qty, soldQty, remainingQty, remainingValue, status, unitPrice |
| `summary` | buy/sell count, remaining qty, remaining value |

## Calculation Rules

- `items` JSON is preferred when present; otherwise fallback to header product/qty/remaining/unit price fields.
- Remaining value = `remainingQty * unitPrice`.
- Buy received qty = `qty - remainingQty`.
- Sell sold qty = `qty - remainingQty`.
- Product code must pass `requireBusinessCode` when resolved from `products`.
- Rows with `remainingQty <= 0.001` are not shown.

## Lifecycle / Read Flow

| Step | User action | System result |
|---|---|---|
| 1 | เปิดหน้า | API loads all outstanding POB/POS rows |
| 2 | ดู Buy tab | User sees POB pending receipt by supplier/product/expected delivery |
| 3 | ดู Sell tab | User sees POS pending shipment by customer/product/expected delivery |
| 4 | Drilldown | Target opens PO detail and downstream WTI/WTO/PB/SB usage |
| 5 | Export/filter | Target must use same row inclusion rules as report |

## Aging Rules

- PO operational aging should use `expected_delivery` when present.
- If expected delivery is missing, fallback to document date for operational pending aging.
- Created date must remain visible separately where UI supports it.
- Stop counting when PO line remaining is zero or PO is closed/cancelled/received/completed according to side-specific status.

## Validation Rules

- PO report must not double count downstream usage; remaining must come from source allocation facts or maintained remaining fields.
- Costing-only PO (`require_delivery = false`) must not appear in outstanding delivery report.
- Cancelled/closed/completed/received PO must not appear as active outstanding.
- Buy and Sell sides have different terminal statuses; do not reuse one status filter blindly.
- If close-short is implemented, it belongs to PO Buy/PO Sell write flow, not this report.

## Side Effects

- Current API: read-only
- Target export/print: read-only
- Target close-short/cost-deducted actions must be separate audited write flows owned by PO/Dual Costing docs

## Current Gap

- Current API has no server-side supplier/customer/product/date filters and no export.
- Current API does not return source usage detail links to WTI/WTO/PB/SB.
- Need final target for `costDeducted`: if kept, move to Dual Costing/Cost Pool audited flow rather than report mutation.
- Need reconcile remaining source: whether `remaining_qty` is authoritative or should be derived from allocation facts for every PO item.
- Need aging buckets and UI display according to [[Document Aging Policy]].

## Implementation Checklist

- [x] Verify current API source tables and response shape
- [x] Record legacy tab/filter/export baseline
- [x] Mark report as read-only and no stock/AP/AR side effect
- [ ] Add server-side filters/export if UI requires them
- [ ] Add source usage drilldown to PO/WTI/WTO/PB/SB
- [ ] Reconcile remaining qty source with PO allocation facts
- [ ] Define close-short and cost-deducted ownership outside this report

## 2026-07-12 Table consistency checkpoint

`/po-reports/outstanding` now widens long PO/partner/product/remaining/delivery columns, leaves the final status column available for auto-stretch, and uses canonical `p-3` body density for both buy and sell tables. What is what: the two line tabs remain read-only outstanding PO directions. Why it stays this way: full headers and values must remain readable without changing remaining-quantity formulas, filters, export behavior, APIs, permissions, database schema, or DB state.
