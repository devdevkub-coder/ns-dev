---
title: Tracking 360 Flow
tags:
  - tracking
  - page-flow
status: draft
updated: 2026-06-14
---

# Tracking 360 Flow

เอกสารนี้เป็นภาพรวมหมวด `Tracking 360` สำหรับ active Next menu เท่านั้น ครอบคลุม:

- `/tracking/customer`
- `/tracking/supplier`
- `/tracking/product`

## Business Boundary

Tracking 360 เป็น read-model/report surface สำหรับดูประวัติและภาพรวมของ entity หลัก ไม่ใช่จุดสร้าง/แก้ transaction:

- Customer Tracking อ่านยอดขาย, รับเงิน, ลูกหนี้, GP จาก `sales_bills` และ `receipts`
- Supplier Tracking อ่านยอดซื้อ, จ่ายเงิน, เจ้าหนี้ จาก `purchase_bills` และ `payments`
- Product Tracking อ่านยอดซื้อ, ยอดขาย, GP, production/allocation/lifecycle signal, และ stock/WAC source facts จาก `purchase_bills`, `sales_bills`, production/allocation facts, และ `stock_ledger`; target UI หลักต้องตัดส่วนที่ผู้ใช้กากบาทออกจากตาราง/สรุปหลัก
- ทุกหน้าใช้ `year/month` เป็น cutoff หลัก และ export ด้วย filter เดียวกับหน้าจอ
- ทุกหน้าใช้ business code เป็น outward id ใน UI/filter/export เมื่อ resolve ได้

## Requirement Update 2026-06-13

User-provided screenshots clarify that Tracking 360 is a business decision surface, not only a numeric aggregate report.

### Customer Tracking

- Purpose: ติดตามพฤติกรรมลูกค้า ยอดซื้อ/ขาย กำไร เครดิต และ movement ทั้งหมดของ customer
- Required source groups: Sales Bill, Receipt, margin, Return, Pending AR
- Decision questions: ลูกค้าคนไหนซื้อเยอะ, margin ดีไหม, จ่ายช้าไหม, มี return บ่อยไหม
- Business decisions supported: เพิ่มเครดิต, ลดเครดิต, ต้นยอดขาย, blacklist
- Target gap from local/legacy comparison: legacy has customer row drilldown with SB/RCP/product/monthly detail; current Next now exposes SB/RCP/product/monthly drilldown plus pending AR, credit utilization, and margin decision signals through `detailId`; channel breakdown and Return frequency remain pending.

### Supplier Tracking

- Purpose: ติดตาม supplier ด้านต้นทุน คุณภาพ และ reliability
- Required source groups: Purchase Bill, WT/WTI, Grade Adjust, Payment, Return
- Decision questions: supplier ไหนต้นทุนดี, ส่งครบไหม, quality ดีไหม, จ่ายดีไหม
- Business importance: ธุรกิจ scrap ต้องเห็น supplier quality เพราะ supplier แต่ละรายไม่เท่ากัน
- Target gap from local/legacy comparison: legacy has supplier row drilldown with PB/PMT/product/monthly detail; current Next now provides server-side supplier/search filters, PB/payment/product/monthly drilldown, WTI delivery/deduction signals, Grade Adjust count, and payment reliability through `detailId`; Return frequency remains pending.

### Product Tracking

- Purpose: track lifecycle และ profitability ของสินค้าแต่ละชนิด/หมวด
- Required source groups: stock, sales, production, allocation, WAC
- Decision questions: สินค้าไหนกำไรดี, stock หมุนเร็วไหม, loss สูงไหม, yield ดีไหม
- Business importance: ใช้ optimize product mix ของโรงงาน
- Target visible table from latest screenshot should focus on `Code`, `สินค้า`, `หมวด`, `ซื้อ`, `มูลค่าซื้อ`, `ซื้อเฉลี่ย`, `ขาย`, `ยอดขาย`, `ขายเฉลี่ย`, `COGS`, `GP`, and `GP%`. Columns/sections marked with red cross in the screenshot, specifically `Stock` and `WAC` on the far right, must be removed from the main visible table and primary export.
- Target filters should include buyer/seller context where useful: Supplier ฝั่งซื้อ and Customer ฝั่งขาย in addition to year/month/category/product.
- Target gap from local/legacy comparison: legacy has product drilldown with purchase lines, sales lines, stock movement, and monthly detail; current Next now exposes purchase/sales drilldown through `detailId` and removes crossed-out Stock/WAC from the main surface, while stock support detail, allocation, production/yield/loss, and monthly detail are still pending.

## Active Pages

| Page | Route | Purpose | Detailed doc |
|---|---|---|---|
| Customer Tracking | `/tracking/customer` | วิเคราะห์ลูกค้าจากยอดขาย รับเงิน ลูกหนี้ GP และ monthly trend | [[page-flows/tracking-360-tracking-customer|Customer Tracking Page Flow]] |
| Supplier Tracking | `/tracking/supplier` | วิเคราะห์ผู้ขายจากบิลรับซื้อ จ่ายเงิน เจ้าหนี้ ราคาเฉลี่ยซื้อ และ product mix | [[page-flows/tracking-360-tracking-supplier|Supplier Tracking Page Flow]] |
| Product Tracking | `/tracking/product` | วิเคราะห์สินค้าจากซื้อ/ขาย/COGS/GP, lifecycle, production/allocation signal, and source drilldown | [[page-flows/tracking-360-tracking-product|Product Tracking Page Flow]] |

## Current API Snapshot

| Route | API | Permission | Current behavior |
|---|---|---|---|
| `/tracking/customer` | `GET /api/tracking/customer` | `reports.reports.view` | อ่าน active customers, non-cancelled sales bills, non-cancelled receipts; filter `year/month/customerId/q`; export `format=xlsx` |
| `/tracking/supplier` | `GET /api/tracking/supplier` | `reports.reports.view` | อ่าน active suppliers, non-cancelled purchase bills, non-cancelled payments; filter `year/month`; export `format=xlsx` |
| `/tracking/product` | `GET /api/tracking/product` | `reports.reports.view` | อ่าน active products, purchase bills, sales bills, stock ledger; filter `year/month/productId/metalGroup/branchId/q`; export `format=xlsx` |

## Shared Rules

- Read-only: no transaction, stock ledger, bank statement, AP/AR settlement, or source status mutation.
- Cancelled source documents are excluded from active tracking totals.
- Export must use the same rows/filter as the JSON response.
- Date filter uses source document date/payment date/receipt date according to each source table.
- Tracking pages may expose drilldown links, but source documents remain owned by their own flows.
- Created date, document date, due date, and as-of date must remain separate when aging views are added.

## Source Ownership

| Source | Owner flow | Tracking use |
|---|---|---|
| `sales_bills` | [[Sales Flow]] | Customer revenue, receivable, COGS/GP; Product sales/COGS/GP |
| `receipts` | [[Sales Flow]], [[Payment Flow]] | Customer received amount |
| `purchase_bills` | [[Purchase Flow]] | Supplier purchase/payable; Product buy amount/qty |
| `payments` | [[Payment Flow]] | Supplier paid amount |
| `stock_ledger` | [[Stock Ledger and Stock Balance]] | Future/separated support-only stock facts; latest Product Tracking main table/export removes crossed-out Stock/WAC |
| master data | [[Master Data Current Code Baseline]] | Customer/Supplier/Product name/code/filter options |

## Current Gaps

- Customer/Supplier/Product row drilldown is partially implemented through `detailId`: Customer has SB/RCP/product detail, Supplier has PB/payment/product detail, and Product has PB/SB source lines.
- Customer Tracking still lacks channel breakdown and Return frequency; monthly detail, pending AR, credit utilization, and margin decision signals are implemented in the detail view.
- Supplier Tracking server-backed `supplierId`/`q` filtering is implemented for aggregate rows, product mix, monthly, summary, and export; supplier detail now includes monthly purchase/payment trend, WTI delivery/deduction, Grade Adjust count, and payment reliability signals. Return frequency is still pending.
- Product Tracking now removes crossed-out `Stock` and `WAC` from the main list/export and supports Supplier ฝั่งซื้อ / Customer ฝั่งขาย filters in aggregate rows/monthly/top/export.
- Product Tracking availability/hold-aware `พร้อมใช้` remains owned by stock balance docs and is not represented in the main profitability table.
- Aging buckets for receivable/payable/slow stock should be added only after [[Document Aging Policy]] and stock hold policy are finalized.
- Formula/source reconciliation is still required when COGS/WAC behavior changes in Sales/Stock flows.

## Local Audit 2026-06-13

Files inspected:

- API: `apps/next/src/app/api/tracking/customer/route.ts`, `apps/next/src/app/api/tracking/supplier/route.ts`, `apps/next/src/app/api/tracking/product/route.ts`
- UI: `apps/next/src/components/tracking/CustomerTrackingPageClient.tsx`, `apps/next/src/components/purchase-flow/SupplierTrackingPageClient.tsx`, `apps/next/src/components/tracking/ProductTrackingPageClient.tsx`
- Legacy baseline: `old-apps/legacy/index.html` components `view-customerTracking`, `view-supplierTracking`, `view-productTracking`
- Design baseline: `docs/design.md` list page/filter/table/card/detail-modal conventions

Local route smoke:

- `/tracking/customer`, `/tracking/supplier`, `/tracking/product` redirect to login when unauthenticated, as expected for protected report pages.
- Current local UI/API shape is confirmed from source code; authenticated browser QA should be run after implementation with a valid local session.

## Implementation Task Breakdown

### Batch T360-1: Shared API Contract

- [ ] Define shared detail response conventions for Tracking 360: `rows`, `filters`, `summary`, `monthly`, `detail`, `sourceLinks`, and `export`.
- [ ] Keep every Tracking API read-only and guarded by `reports.reports.view`.
- [ ] Ensure JSON and XLSX export use identical filters.
- [ ] Keep business-facing ids as customer/supplier/product `code`; internal ids stay server-side.
- [ ] Do not add fallback logic for malformed legacy item JSON; unresolved source data must be fixed at source/migration level.

### Batch T360-2: Customer Tracking API

- [x] Extend `GET /api/tracking/customer` to support row detail for selected customer without changing write-side flows.
- [x] Add customer detail payload: SB lines, RCP lines, and product breakdown.
- [x] Add monthly movement and receivable/pending AR signal.
- [ ] Add return signal after source ownership is confirmed.
- [ ] Keep `year`, `month`, `customerId`, and `q` filters consistent for summary, rows, detail, and export.
- [ ] Add source-link fields using business doc numbers for SB/RCP.

### Batch T360-3: Customer Tracking UI

- [ ] Update `CustomerTrackingPageClient.tsx` to follow `docs/design.md` list pattern: KPI cards first, filter shell, tabs, desktop table, dense mobile cards.
- [x] Make desktop rows and dense mobile cards clickable to open a detail modal/view.
- [x] Add detail sections for SB list, RCP list, and product breakdown.
- [x] Add mobile cards and keyboard-open mobile card controls.
- [x] Add monthly movement and decision signals.
- [ ] Add channel/return signals after source contracts are confirmed.
- [ ] Keep actions read-only; source document links navigate to owner pages when available.

### Batch T360-4: Supplier Tracking API

- [x] Add server-side `supplierId` and `q` filters to `GET /api/tracking/supplier`.
- [x] Add supplier detail payload: PB lines, payment lines, and product mix.
- [x] Add monthly purchase/payment trend.
- [x] Add reliability/quality signal fields from owned source facts: WTI completeness/deduction, Grade Adjust count, and Payment reliability.
- [ ] Add Return signal after purchase return source ownership/schema is confirmed.
- [x] Ensure product mix can be scoped to the selected supplier, not only global period.

### Batch T360-5: Supplier Tracking UI

- [x] Move Supplier filter/search to server-backed filter behavior and export href.
- [x] Make supplier table rows/mobile cards clickable to open detail.
- [x] Add detail sections for PB list, payment list, and product mix.
- [x] Add quality/reliability signals for WTI, Grade Adjust, and Payment reliability.
- [x] Add monthly trend.
- [ ] Add Return signal after source contract is confirmed.
- [ ] Apply `docs/design.md` dense card/mobile table behavior and avoid nested card surfaces.

### Batch T360-6: Product Tracking API

- [x] Add target filters to `GET /api/tracking/product`: `supplierId` for buy-side lines and `customerId` for sell-side lines.
- [x] Remove crossed-out `Stock` and `WAC` from primary export columns.
- [x] Keep stock/WAC calculations out of the primary row contract unless added later as separated support-only detail.
- [x] Add product detail payload: purchase lines and sales lines.
- [ ] Add allocation/cost-source refs and production/yield/loss signals when source contracts are ready.
- [ ] Keep COGS/GP source formulas traceable to sales bill item facts and documented fallbacks.

### Batch T360-7: Product Tracking UI

- [x] Update main Product table columns to match screenshot: `Code`, `สินค้า`, `หมวด`, `ซื้อ`, `มูลค่าซื้อ`, `ซื้อเฉลี่ย`, `ขาย`, `ยอดขาย`, `ขายเฉลี่ย`, `COGS`, `GP`, `GP%`.
- [x] Remove crossed-out `Stock` and `WAC` from the main visible table and primary export.
- [x] Add Supplier ฝั่งซื้อ and Customer ฝั่งขาย filters in the filter shell.
- [x] Make product desktop rows and dense mobile cards clickable to open detail.
- [x] Add detail sections for purchase lines and sales lines.
- [ ] Add allocation, production/yield/loss, and source links.

### Batch T360-8: Design And QA

- [ ] Use `docs/design.md` filter shell: `rounded-md bg-white p-3 shadow`, compact `h-9` controls, export button on the right.
- [ ] Use AcexPOS-style KPI grid without extra outer card wrappers.
- [ ] Use desktop table with `overflow-x-auto rounded-md bg-white shadow`, `text-sm`, `bg-slate-100` header, `p-2` cells.
- [x] Add dense mobile card lists for Customer, Supplier, and Product; cards open the same detail as desktop rows.
- [ ] Verify no text overflow/overlap on mobile and desktop.
- [ ] Run validation: targeted lint for changed Tracking files, full type-check, build if API/data contracts change, and authenticated browser QA for all three routes.

## Implementation Direction

- Keep Tracking 360 APIs read-only and deterministic.
- Add drilldown payloads or detail APIs as separate read endpoints if row detail becomes too heavy.
- Keep source document links business-facing: customer/supplier/product code, PB/SB/receipt/payment doc numbers.
- Implement the latest requirement as a UI/API slice per page: first add detail payload/source links, then add Customer/Supplier/Product-specific decision filters and table columns.
- Do not add runtime fallback for malformed legacy item JSON; fix source data or migration if product/customer/supplier references cannot resolve.
