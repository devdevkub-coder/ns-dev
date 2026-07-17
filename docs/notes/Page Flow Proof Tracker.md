---
title: Page Flow Proof Tracker
tags:
  - page-flow
  - verification
  - migration
status: draft
updated: 2026-06-11
---

# Page Flow Proof Tracker

เอกสารนี้ตอบคำถามว่า “เหลือหน้าไหนต้องทำอีก” หลังจากสร้างและขยาย page-flow รายหน้าแล้วครบ 107 active menu routes

## Current State

| Work | Status |
|---|---|
| สร้าง page-flow file ครบทุกหน้าในเมนูใหม่ | Done: 107/107 |
| ใส่ minimum detailed contract ทุกหน้า | Done: 107/107 |
| ใส่ `### Current API` หรือ no-API declaration ทุกหน้า | Done: 107/107 |
| Master Data current code accepted as baseline | Done: see [[Master Data Current Code Baseline]] |
| P3 Admin/System proof against current code | Done: 6/6 admin/system menu pages |
| P2 Reports/Tracking/Trading/Dual Costing/Finance Accounting proof against current code | Done for the tracked P2 menu set; Finance Accounting currently includes the `Accounting Periods` and `Posting Rules` policy pages; see [[P2 Report Current Code Baseline]] |
| P1 Finance/Production/Daily read models proof against current code | Done: 12/12 P1 menu pages; see [[P1 Finance Production Current Code Baseline]] |
| P0 Transaction/Stock/Payment proof against current code | Done: 20/20 P0 menu pages; see [[P0 Transaction Stock Payment Current Code Baseline]] |
| พิสูจน์กับ current Next code/API ทีละหน้า | Done for P0/P1/P2/P3 active menu proof groups |
| พิสูจน์กับ legacy ทีละหน้าเมื่อ current code/doc ยังไม่ครบ | Pending |
| สรุป API ที่ต้องเพิ่ม/แก้หลังพิสูจน์ | Pending |

สรุป: ไม่เหลือหน้าที่ “ยังไม่ได้เขียนตั้งต้น” แล้ว เหลืองาน proof/reconciliation เพื่อพิสูจน์ว่า flow/API/side effect ที่เขียนไว้ตรงกับ code และ legacy จริง

## Proof Method

1. อ่าน page-flow รายหน้าใน `docs/notes/page-flows/`
2. อ่าน current page/component/API ใน `apps/next`
3. ถ้า current implementation ยังไม่ครบ ให้อ่าน legacy เป็น baseline ตั้งต้น
4. อัปเดต page-flow เฉพาะจุดที่พบ drift
5. บันทึก API gap, side-effect gap, validation gap, และ data/model gap
6. ห้ามแก้ runtime ก่อน proof เสร็จในหน้านั้น เว้นแต่ user สั่งแก้เฉพาะหน้า

## P0 Proof Result: Transaction / Stock / Payment

P0 ทำ proof กับ current code/API แล้ว ดู [[P0 Transaction Stock Payment Current Code Baseline]]

ผล proof:

- P0 active menu pages ทั้ง 20 หน้า mark เป็น `accepted-baseline`
- accepted baseline หมายถึงพิสูจน์กับ current implementation แล้ว ไม่ได้แปลว่า target-complete ทุกหน้า
- critical runtime gaps ที่ต้องทำต่อ: Sales Bill stock-out, Sales Stock Issue write/convert/reversal, hold-aware stock availability, PB append/reversal hardening, และ PMA/PMT cancellation/payment-cycle lock proof
- กลุ่มนี้ยังเป็น runtime hardening priority สูงสุด เพราะมี side effect กับเงินจริง, stock, AP/AR, allocation, หรือเอกสารต่อเนื่อง

| Route | Page | Why P0 | Page Flow |
|---|---|---|---|
| `/purchase/po-buy` | PO Buy | POB commitment, allocation ไป PB/WTI | [[page-flows/daily-transactions-purchase-po-buy]] |
| `/purchase/bills` | บิลรับซื้อ | PB owns AP + stock-in + WTI/PO/ADV allocation | [[page-flows/daily-transactions-purchase-bills]] |
| `/purchase/advance-payments` | จ่ายเงินล่วงหน้า / มัดจำ | ADV payment source + PB allocation | [[page-flows/daily-transactions-purchase-advance-payments]] |
| `/daily/payment-approval` | อนุมัติจ่ายเงิน | PMA approval/split/void and source lock | [[page-flows/daily-transactions-daily-payment-approval]] |
| `/purchase/payments` | จ่ายเงิน Supplier | PMT, bank statement, payment history | [[page-flows/daily-transactions-purchase-payments]] |
| `/purchase/receipt-vouchers` | ใบสำคัญรับเงิน | printable/payment source read model | [[page-flows/daily-transactions-purchase-receipt-vouchers]] |
| `/daily/expense` | ค่าใช้จ่าย | EXP approval/direct payment, VAT/WHT | [[page-flows/daily-transactions-daily-expense]] |
| `/daily/transfer` | โอนเงินระหว่างบัญชี | paired bank statement movements | [[page-flows/daily-transactions-daily-transfer]] |
| `/daily/petty-advance` | เงินสำรองจ่าย / กู้กรรมการ | PADV/PRET/BST timing | [[page-flows/finance-debt-daily-petty-advance]] |
| `/daily/weight-ticket-list` | รายการใบรับ-ส่งของ | WTI/WTO usage lock, evidence, pending_out gap | [[page-flows/daily-transactions-daily-weight-ticket-list]] |
| `/sales/po-sell` | PO Sell | POS commitment/allocation | [[page-flows/daily-transactions-sales-po-sell]] |
| `/sales/bills` | บิลขาย | SB owns AR + stock-out + POS/WTO usage | [[page-flows/daily-transactions-sales-bills]] |
| `/sales/receipts` | รับเงิน Customer | RCP, bank statement, AR settlement | [[page-flows/daily-transactions-sales-receipts]] |
| `/sales/stock-issue` | เบิกออกรอบิล | removed target flow; legacy PSALE reference only | [[page-flows/daily-transactions-sales-stock-issue]] |
| `/stock/balance` | สต๊อกคงเหลือ | on hand / pending_out / available model | [[page-flows/stock-stock-balance]] |
| `/stock/ledger` | Stock Ledger | stock movement source of truth | [[page-flows/stock-stock-ledger]] |
| `/stock/transfer` | โอนสินค้าระหว่างสาขา | paired stock movement | [[page-flows/stock-stock-transfer]] |
| `/stock/status-convert` | ปรับสถานะสินค้า | status bucket movement | [[page-flows/stock-stock-status-convert]] |
| `/stock/convert` | Grade Adjustment / ปรับเกรด | product/grade conversion and cost | [[page-flows/stock-stock-convert]] |
| `/stock/adjust` | นับสต๊อก / Stock Count Adjust | physical count adjustment | [[page-flows/stock-stock-adjust]] |

## P1 Proof Result: Finance, Production, Daily Read Models

P1 ทำเสร็จตาม current-code baseline แล้ว ดู [[P1 Finance Production Current Code Baseline]]

ผล proof:

- P1 active menu pages ทั้ง 12 หน้า mark เป็น `accepted-baseline`
- Finance pages ใช้ `finance.cash.view` และเป็น read/export surfaces เป็นหลัก
- Production report/order pages ใช้ `production.operations.view`
- `/production/output-categories` เป็น simple master-data write surface ตาม current code
- `/daily/expense-dashboard` ยังไม่มี page-specific aggregate API; baseline ปัจจุบันต้องอ่านจาก expense source API หรือเพิ่ม aggregate API ในอนาคตเมื่อปรับ runtime

| Route | Page | Page Flow |
|---|---|---|
| `/daily/expense-dashboard` | Dashboard ค่าใช้จ่าย | [[page-flows/daily-transactions-daily-expense-dashboard]] |
| `/finance/ar` | ลูกหนี้ (AR) | [[page-flows/finance-debt-finance-ar]] |
| `/finance/ap` | เจ้าหนี้ (AP) | [[page-flows/finance-debt-finance-ap]] |
| `/finance/bank` | Cash / Bank Statement | [[page-flows/finance-debt-finance-bank]] |
| `/finance/cash-position` | Cash Position | [[page-flows/finance-debt-finance-cash-position]] |
| `/finance/customer-advance` | รับล่วงหน้าจาก Customer | [[page-flows/finance-debt-finance-customer-advance]] |
| `/production/orders` | ใบสั่งผลิต | [[page-flows/production-production-orders]] |
| `/production/output-categories` | หมวดหมู่ผลผลิต | [[page-flows/production-production-output-categories]] |
| `/production/dashboard` | Production Dashboard | [[page-flows/production-production-dashboard]] |
| `/production/report` | รายงานการผลิต / Yield | [[page-flows/production-production-report]] |

## P2 Proof Result: Reports / Tracking / Trading / Dual Costing / Finance Accounting

P2 ทำเสร็จตาม current-code baseline แล้ว ดู [[P2 Report Current Code Baseline]]

ผล proof:

- P2 active menu pages ทั้ง 45 หน้า mark เป็น `accepted-baseline`
- current APIs เป็น read-model/report `GET` surface เป็นหลัก
- permission family แยกชัดเป็น `reports.reports.view`, `finance.cash.view`, และ `finance.financials.view`
- `/owner-daily` และ `/daily-report` เป็น alias ไปที่ dashboard API handler ใน current code
- งานที่เหลือไม่ใช่ missing page-flow แต่เป็น formula/source/cutoff/drilldown reconciliation เมื่อ user ต้องการปรับตัวเลขหรือพบ discrepancy

| Group | Routes |
|---|---|
| Main Dashboard / Reports | `/owner-daily`, `/anomaly-detector`, `/daily-report`, `/dashboard-overview`, `/profit-cost-analysis`, `/sales-plan`, `/sales-commission`, `/cash-flow-calendar`, `/business-calendar`, `/cash-others-summary` |
| Tracking 360 | `/tracking/customer`, `/tracking/supplier`, `/tracking/product` |
| Trading / PO Reports | `/trading/dashboard`, `/trading/matching`, `/po-reports/outstanding` |
| Dual Costing | `/dual-costing/cost-pool`, `/dual-costing/cost-allocator`, `/dual-costing/waiting-allocations`, `/dual-costing/cost-allocation-ledger`, `/dual-costing/report`, `/dual-costing/match-log`, `/dual-costing/deal-margin`, `/dual-costing/compare-margin` |
| General Reports | `/reports` |
| Finance Accounting | `/finance-accounting/financial-dashboard`, `/finance-accounting/cash-flow-analysis`, `/finance-accounting/cf-forecast-calendar`, `/finance-accounting/working-capital`, `/finance-accounting/stock-finance`, `/finance-accounting/profit-leak`, `/finance-accounting/tax-vat-wht`, `/finance-accounting/pl-statement`, `/finance-accounting/balance-sheet`, `/finance-accounting/cash-flow-statement`, `/finance-accounting/asset-register`, `/finance-accounting/depreciation`, `/finance-accounting/asset-disposal`, `/finance-accounting/loan-contracts`, `/finance-accounting/loan-dashboard`, `/finance-accounting/asset-overview`, `/finance-accounting/equity-maint`, `/finance-accounting/opening-balance`, `/finance-accounting/accounting-periods`, `/finance-accounting/posting-rules`, `/finance-accounting/historical-data` |

## P3 Proof Result: Master Data / Admin / System

P3 ทำเสร็จตาม current-code baseline แล้ว:

- Master Data: current `apps/next` code เป็น accepted baseline ดู [[Master Data Current Code Baseline]]
- Admin/System: proof แล้วจาก current page components และ API routes ณ 2026-06-11
- งานต่อของ P3 คือ sync docs เมื่อ code เปลี่ยน ไม่ใช่ legacy proof

| Group | Routes |
|---|---|
| Master Data | Accepted baseline: `/master-data/customers`, `/master-data/salespersons`, `/master-data/suppliers`, `/master-data/products`, `/master-data/product-types`, `/master-data/product-units`, `/master-data/impurities`, `/master-data/branches`, `/master-data/warehouses`, `/master-data/accounts`, `/master-data/payment-methods`, `/master-data/account-subtypes`, `/master-data/bank-names`, `/master-data/channels`, `/master-data/expense-categories`, `/master-data/expense-types`, `/master-data/directors`, `/master-data/machines`, `/master-data/machine-types`, `/master-data/production-lines`, `/master-data/currencies`, `/master-data/beneficiaries`, `/master-data/remittance-purposes` |
| Admin / System | `/admin/system-settings`, `/admin/company-profile`, `/admin/transaction-ledger`, `/admin/migration-tools`, `/admin/audit`, `/admin/users-permissions` |
Admin/System proof notes:

- `/admin/system-settings` uses `GET/POST /api/master-data/vat-settings` and `GET/POST /api/master-data/wht-settings`; no page-specific `/api/admin/system-settings` route exists.
- `/admin/company-profile` uses `GET /api/admin/company-profile` and `PUT /api/admin/company-profile`, protected by `system.settings.manage`.
- `/admin/transaction-ledger` uses `GET /api/admin/transaction-ledger` and `format=xlsx`, protected by `finance.cash.view`.
- `/admin/migration-tools` has a page component but no page-specific API route in current code.
- `/admin/audit` uses `GET /api/admin/auth-events`, protected by `system.audit.view`; `/api/activity` is support ingest, not the list source for this page.
- `/admin/users-permissions` uses users list/create/update/status/invite APIs, protected by `system.users.manage`.

## Next Recommended Batch

Proof coverage ครบทุกกลุ่มแล้ว รอบถัดไปควรเริ่ม runtime hardening จาก P0 ตามลำดับนี้:

1. `/sales/bills` stock-out + WTO usage/lock reconciliation
2. replace legacy `/sales/stock-issue` PSALE QA/report references with WTO-backed SB coverage
3. `/stock/balance` pending_out-aware availability source
4. `/purchase/bills` append/reversal hardening review
5. `/daily/payment-approval` + `/purchase/payments` cancellation/payment-cycle lock review

เหตุผล: เส้นนี้ครอบคลุมจุดที่ proof พบว่า target flow ยังเสี่ยงหรือยังไม่ครบใน current runtime

หมายเหตุ:

- P0 proof ไม่ต้องรอแล้ว แต่ P0 runtime hardening ยังเป็นคิวหลัก
- P2 ไม่ต้องรอแล้วในรอบถัดไป เพราะ Reports/Tracking/Trading/Dual Costing/Finance Accounting ถูกบันทึกเป็น current-code baseline แล้ว
- P1 ไม่ต้องรอแล้วในรอบถัดไป เพราะ Finance/Production/Daily read-model pages ถูกบันทึกเป็น current-code baseline แล้ว
- P3 ไม่ต้องรอแล้วในรอบถัดไป เพราะ Master Data และ Admin/System ถูกบันทึกเป็น current-code baseline แล้ว
