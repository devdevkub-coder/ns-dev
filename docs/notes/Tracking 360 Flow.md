---
title: Tracking 360 Flow
tags:
  - tracking
  - page-flow
status: accepted-baseline
updated: 2026-06-15
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
- Product Tracking อ่านยอดซื้อ, ยอดขาย, GP, production/allocation/lifecycle signal จาก `purchase_bills`, `sales_bills`, production facts, และ allocation facts; target UI หลักตัดส่วนที่ผู้ใช้กากบาท (`Stock`, `WAC`) ออกจากตาราง/สรุปหลักแล้ว
- ทุกหน้าใช้ `year/month` เป็น cutoff หลัก และ export ด้วย filter เดียวกับหน้าจอ
- ทุกหน้าใช้ business code เป็น outward id ใน UI/filter/export เมื่อ resolve ได้

## Requirement Update 2026-06-13

User-provided screenshots clarify that Tracking 360 is a business decision surface, not only a numeric aggregate report.

### Customer Tracking

- Purpose: ติดตามพฤติกรรมลูกค้า ยอดซื้อ/ขาย กำไร เครดิต และ movement ทั้งหมดของ customer
- Required source groups: Sales Bill, Receipt, margin, Pending AR; customer return is intentionally not a separate tracking source and should use Sales Bill void/cancel instead
- Decision questions: ลูกค้าคนไหนซื้อเยอะ, margin ดีไหม, จ่ายช้าไหม, มี void/cancel เอกสารผิดปกติไหมใน source flow
- Business decisions supported: เพิ่มเครดิต, ลดเครดิต, ต้นยอดขาย, blacklist
- Target gap from local/legacy comparison: legacy has customer row drilldown with SB/RCP/product/monthly detail; current Next now exposes SB/RCP/product/monthly/channel drilldown plus pending AR, AR aging, credit utilization, and margin decision signals through `detailId`. Customer Return frequency is removed by requirement because corrections use void/cancel documents.

### Supplier Tracking

- Purpose: ติดตาม supplier ด้านต้นทุน คุณภาพ และ reliability
- Required source groups: Purchase Bill, WT/WTI, Grade Adjust, Payment, Return
- Decision questions: supplier ไหนต้นทุนดี, ส่งครบไหม, quality ดีไหม, จ่ายดีไหม
- Business importance: ธุรกิจ scrap ต้องเห็น supplier quality เพราะ supplier แต่ละรายไม่เท่ากัน
- Target gap from local/legacy comparison: legacy has supplier row drilldown with PB/PMT/product/monthly detail; current Next now provides server-side supplier/search filters, PB/payment/product/monthly drilldown, WTI delivery/deduction signals, Grade Adjust count, AP aging, and payment reliability through `detailId`; Return frequency remains held.

### Product Tracking

- Purpose: track lifecycle และ profitability ของสินค้าแต่ละชนิด/หมวด
- Required source groups: stock, sales, production, allocation, WAC
- Decision questions: สินค้าไหนกำไรดี, stock หมุนเร็วไหม, loss สูงไหม, yield ดีไหม
- Business importance: ใช้ optimize product mix ของโรงงาน
- Target visible table from latest screenshot should focus on `Code`, `สินค้า`, `หมวด`, `ซื้อ`, `มูลค่าซื้อ`, `ซื้อเฉลี่ย`, `ขาย`, `ยอดขาย`, `ขายเฉลี่ย`, `COGS`, `GP`, and `GP%`. Columns/sections marked with red cross in the screenshot, specifically `Stock` and `WAC` on the far right, must be removed from the main visible table and primary export.
- Target filters should include buyer/seller context where useful: Supplier ฝั่งซื้อ and Customer ฝั่งขาย in addition to year/month/category/product.
- Target gap from local/legacy comparison: legacy has product drilldown with purchase lines, sales lines, stock movement, and monthly detail; current Next now exposes purchase/sales/monthly drilldown plus allocation and production/yield/loss signals through `detailId`, removes crossed-out Stock/WAC from the main surface, and links to Stock Balance as a separated support owner page.

## Active Pages

| Page | Route | Purpose | Detailed doc |
|---|---|---|---|
| Customer Tracking | `/tracking/customer` | วิเคราะห์ลูกค้าจากยอดขาย รับเงิน ลูกหนี้ GP และ monthly trend | [[page-flows/tracking-360-tracking-customer|Customer Tracking Page Flow]] |
| Supplier Tracking | `/tracking/supplier` | วิเคราะห์ผู้ขายจากบิลรับซื้อ จ่ายเงิน เจ้าหนี้ ราคาเฉลี่ยซื้อ และ product mix | [[page-flows/tracking-360-tracking-supplier|Supplier Tracking Page Flow]] |
| Product Tracking | `/tracking/product` | วิเคราะห์สินค้าจากซื้อ/ขาย/COGS/GP, lifecycle, production/allocation signal, and source drilldown | [[page-flows/tracking-360-tracking-product|Product Tracking Page Flow]] |

## หมวดหมู่ 360 Contract

หมวด `Tracking 360` เป็นหน้ารายงานเชิงตัดสินใจสำหรับมอง entity รอบด้าน ไม่ใช่หน้าทำรายการหรือแก้ข้อมูลต้นทาง:

- Customer 360: ดูยอดขาย, รับเงิน, ลูกหนี้, margin, channel, monthly movement, AR aging, credit utilization, และ source link ไป Sales Bill/Receipt
- Supplier 360: ดูยอดรับซื้อ, จ่ายเงิน, เจ้าหนี้, product mix, WTI delivery/deduction, Grade Adjust, AP aging, payment reliability, และ source link ไป PB/PMT/WTI/Grade Adjust
- Product 360: ดูซื้อ/ขาย/COGS/GP, production/yield/loss, allocation/cost source, monthly movement, source link ไป PB/SB/production/allocation, และ link แยกไป Stock Balance

ทุกหน้าในหมวดนี้ต้องรักษาสัญญาร่วมกัน:

- Read-only เท่านั้น: ห้ามสร้าง แก้ ยกเลิก post reverse allocate หรือแก้ master/transaction จาก Tracking 360
- ใช้ permission `reports.reports.view`
- ใช้ branch scope จาก source evidence ของเอกสารจริง ไม่ใช้ master data global เป็นตัวตัดสินสิทธิ์เพียงอย่างเดียว
- JSON response และ XLSX export ต้องใช้ filter เดียวกัน
- UI/filter/export ใช้ business code เป็น outward id เมื่อ resolve ได้
- Detail/source link เปิดไป owner flow ของเอกสารนั้น เช่น Sales, Purchase, Payment, Stock, Production
- ห้ามเอาคอลัมน์ที่ user ตัดออกกลับมาใน primary table/export โดยเฉพาะ Product `Stock` และ `WAC`

## Completion Status 2026-06-15

| Area | Status | Notes |
|---|---|---|
| Customer Tracking | Done | Row/card detail, SB/RCP/product/channel/monthly drilldown, AR aging, pending AR, credit utilization, margin signals, and source links are documented as current baseline. Customer Return is intentionally removed; correction uses Sales Bill void/cancel. |
| Supplier Tracking | Mostly done | Supplier/search filters, PB/PMT/product/monthly drilldown, WTI/Grade Adjust/AP aging/payment reliability, and source links are documented as current baseline. Supplier Return remains HOLD until purchase-return source ownership/schema is confirmed. |
| Product Tracking | Done for current req | Primary table/export focuses on buy/sell/COGS/GP, removes crossed-out Stock/WAC, adds Supplier/Customer filters, and exposes purchase/sales/production/allocation detail plus Stock Balance support link. |
| Shared API/export | Done for current req | Tracking APIs are read-only, branch-scoped, and export the same filtered row sets as JSON. |
| Remaining held items | HOLD | Supplier Return source, future Supplier AP due-date/credit-term upgrade, and any future stock availability columns require separate source-contract approval before implementation. |

## Current API Snapshot

| Route | API | Permission | Current behavior |
|---|---|---|---|
| `/tracking/customer` | `GET /api/tracking/customer` | `reports.reports.view` | อ่าน active customers จาก non-cancelled sales bills/receipts ที่อยู่ใน allowed branch scope; filter `year/month/customerId/q`; export `format=xlsx` |
| `/tracking/supplier` | `GET /api/tracking/supplier` | `reports.reports.view` | อ่าน active suppliers จาก allowed-branch purchase bills, payments, WTI, Grade Adjust; filter `year/month/supplierId/q`; export `format=xlsx` |
| `/tracking/product` | `GET /api/tracking/product` | `reports.reports.view` | อ่าน active products, purchase bills, sales bills, production facts, allocation facts constrained by allowed branch evidence; filter `year/month/productId/metalGroup/branchId/supplierId/customerId/q`; export `format=xlsx` |

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

- Customer/Supplier/Product row drilldown is implemented through `detailId`: Customer has SB/RCP/product/channel/monthly detail, Supplier has PB/payment/WTI/Grade Adjust/product/monthly detail, and Product has PB/SB/production/allocation/monthly detail.
- Customer Tracking now includes channel breakdown in detail; monthly detail, pending AR, AR aging buckets, overdue AR, credit utilization, and margin decision signals are implemented in the detail view. Customer Return frequency is intentionally removed; use void/cancel documents in the Sales flow instead.
- Supplier Tracking server-backed `supplierId`/`q` filtering is implemented for aggregate rows, product mix, monthly, summary, and export; supplier detail now includes monthly purchase/payment trend, WTI delivery/deduction, Grade Adjust count, AP aging buckets, overdue AP, payment reliability signals, settlement-aware paid amount, and confirmed source links for PB/PMT/WTI/Grade Adjust. Return frequency remains held.
- Product Tracking now removes crossed-out `Stock` and `WAC` from the main list/export, supports Supplier ฝั่งซื้อ / Customer ฝั่งขาย filters in aggregate rows/monthly/top/export, and exposes monthly detail plus production/yield/loss/allocation signals in product detail. Product detail links confirmed owner docs for PB/SB/production order/allocation source PB/allocation sales doc and the separated Stock Balance owner page.
- Product Tracking COGS/GP now uses durable Sales Bill line facts: Trading matched COGS and direct WTO-backed SB stock ledger cost are combined at line level without item JSON COGS fallback. PSALE cost is legacy-only data repair/migration input, not a new target runtime source.
- Product Tracking availability/hold-aware `พร้อมใช้` remains owned by Stock Balance and is reached from Product detail through a support-only link, not by adding Stock/WAC columns back to the main profitability table.
- Customer AR aging and Supplier AP aging now use [[Document Aging Policy]] financial buckets. Customer AR uses Sales Bill due date or credit term fallback; Supplier AP currently uses Purchase Bill document date because current PB/supplier schema has no confirmed due-date or supplier credit-term source.
- Further formula/source reconciliation is required only if Sales/Stock COGS ownership changes again.
- Design/QA checkpoint 2026-06-15: Customer/Supplier/Product Tracking now place KPI/summary surfaces before the filter shell, use compact `h-9` filter/export controls per `docs/design.md`, and authenticated browser QA verifies desktop row detail, dense mobile cards, source links, XLSX export, and no page-level mobile overflow.
- Branch-scope checkpoint 2026-06-15: Customer/Supplier/Product Tracking APIs now restrict source facts and customer/supplier filter options to the current user's allowed branch evidence. Product Tracking rejects out-of-scope `branchId` by returning an empty scoped row set, and allocation facts are visible only when linked to visible PB/SB source documents.

## Pending Handoff 2026-06-15

- Previously shipped to `new-origin/dev` and `new-origin/uat`: Tracking row/detail drilldowns, Customer movement/channel signals, Supplier reliability/monthly signals, Product production/allocation signals, crossed-out Product `Stock`/`WAC` removal, PB/SB source links, and read-only Sales Bill detail.
- Current local follow-up, not pushed yet: RCP/PMT/WTI/Grade Adjust owner links, Product production owner links, Product allocation source/sales document links, URL query bootstrap for Product Tracking and Production Orders, authenticated Tracking 360 browser QA, and branch-scope hardening for Tracking 360 read APIs.
- Customer Return is intentionally removed; correction uses Sales Bill void/cancel.
- Supplier Return is HOLD until purchase-return source ownership/schema is confirmed.
- Remaining work before closing Tracking 360: held Supplier Return after source ownership/schema confirmation and future Supplier AP due-date/credit-term upgrade if the source fields are added.

## Local Audit 2026-06-13

Files inspected:

- API: `apps/next/src/app/api/tracking/customer/route.ts`, `apps/next/src/app/api/tracking/supplier/route.ts`, `apps/next/src/app/api/tracking/product/route.ts`
- UI: `apps/next/src/components/tracking/CustomerTrackingPageClient.tsx`, `apps/next/src/components/purchase-flow/SupplierTrackingPageClient.tsx`, `apps/next/src/components/tracking/ProductTrackingPageClient.tsx`
- Legacy baseline: `old-apps/legacy/index.html` components `view-customerTracking`, `view-supplierTracking`, `view-productTracking`
- Design baseline: `docs/design.md` list page/filter/table/card/detail-modal conventions

Local route smoke:

- `/tracking/customer`, `/tracking/supplier`, `/tracking/product` redirect to login when unauthenticated, as expected for protected report pages.
- Current local UI/API shape is confirmed from source code; earlier sessions required authenticated browser QA after implementation.
- 2026-06-14 unauthenticated smoke: the three Tracking pages returned `307` to `/login?redirect=...`, and `GET /api/tracking/{customer,supplier,product}` returned `401`.
- 2026-06-15 authenticated browser QA now passes through `npm run qa:tracking-360-browser --workspace @ns-scrap-erp/next`, covering Customer/Supplier/Product desktop detail, mobile card detail, source links, XLSX exports, and page-level mobile overflow.

## Implementation Task Breakdown

### Batch T360-1: Shared API Contract

- [x] Define shared detail response conventions for Tracking 360: `rows`, `filters`, `summary`, `monthly`, `detail`, source href fields, and export.
- [x] Keep every Tracking API read-only and guarded by `reports.reports.view`.
- [x] Enforce user branch scope for Tracking source facts and partner filter options.
- [x] Ensure JSON and XLSX export use identical filters for implemented filter contracts.
- [x] Keep business-facing ids as customer/supplier/product `code`; internal ids stay server-side.
- [x] Do not add fallback logic for malformed legacy item JSON; unresolved source data must be fixed at source/migration level.

### Batch T360-2: Customer Tracking API

- [x] Extend `GET /api/tracking/customer` to support row detail for selected customer without changing write-side flows.
- [x] Add customer detail payload: SB lines, RCP lines, and product breakdown.
- [x] Add monthly movement and receivable/pending AR signal.
- [x] Add read-only AR aging buckets, overdue AR amount/count, and oldest AR age from Document Aging Policy.
- [x] Remove Customer Return as a separate signal; void/cancel Sales documents are the correction mechanism.
- [x] Keep `year`, `month`, `customerId`, and `q` filters consistent for summary, rows, detail, and export.
- [x] Add source-link fields using business doc numbers for SB.
- [x] Add source-link fields using business doc numbers for RCP.

### Batch T360-3: Customer Tracking UI

- [x] Update `CustomerTrackingPageClient.tsx` to follow `docs/design.md` list pattern: KPI cards first, filter shell, tabs, desktop table, dense mobile cards.
- [x] Make desktop rows and dense mobile cards clickable to open a detail modal/view.
- [x] Add detail sections for SB list, RCP list, and product breakdown.
- [x] Add mobile cards and keyboard-open mobile card controls.
- [x] Add monthly movement and decision signals.
- [x] Add AR aging bucket section and overdue/oldest-age columns in row/detail views.
- [x] Add channel breakdown from Sales Bill channel facts.
- [x] Keep actions read-only; SB source document links navigate to owner pages when available.
- [x] Add RCP source document links after the receipt owner route contract is confirmed.

### Batch T360-4: Supplier Tracking API

- [x] Add server-side `supplierId` and `q` filters to `GET /api/tracking/supplier`.
- [x] Add supplier detail payload: PB lines, payment lines, and product mix.
- [x] Add monthly purchase/payment trend.
- [x] Add reliability/quality signal fields from owned source facts: WTI completeness/deduction, Grade Adjust count, and Payment reliability.
- [x] Add read-only AP aging buckets, overdue AP amount/count, and oldest AP age from current PB payable facts.
- [ ] HOLD: Add Return signal after purchase return source ownership/schema is confirmed.
- [x] Ensure product mix can be scoped to the selected supplier, not only global period.

### Batch T360-5: Supplier Tracking UI

- [x] Move Supplier filter/search to server-backed filter behavior and export href.
- [x] Make supplier table rows/mobile cards clickable to open detail.
- [x] Add detail sections for PB list, payment list, and product mix.
- [x] Add quality/reliability signals for WTI, Grade Adjust, and Payment reliability.
- [x] Add AP aging bucket section and overdue/oldest-age columns in row/detail views.
- [x] Add monthly trend.
- [ ] HOLD: Add Return signal after source contract is confirmed.
- [x] Apply `docs/design.md` dense card/mobile table behavior and avoid nested card surfaces.

### Batch T360-6: Product Tracking API

- [x] Add target filters to `GET /api/tracking/product`: `supplierId` for buy-side lines and `customerId` for sell-side lines.
- [x] Remove crossed-out `Stock` and `WAC` from primary export columns.
- [x] Keep stock/WAC calculations out of the primary row contract unless added later as separated support-only detail.
- [x] Add product detail payload: purchase lines and sales lines.
- [x] Add allocation/cost-source refs and production/yield/loss signals when source contracts are ready.
- [x] Keep COGS/GP source formulas traceable to durable Sales Bill line facts and owned cost facts without item JSON cost fallback.

### Batch T360-7: Product Tracking UI

- [x] Update main Product table columns to match screenshot: `Code`, `สินค้า`, `หมวด`, `ซื้อ`, `มูลค่าซื้อ`, `ซื้อเฉลี่ย`, `ขาย`, `ยอดขาย`, `ขายเฉลี่ย`, `COGS`, `GP`, `GP%`.
- [x] Remove crossed-out `Stock` and `WAC` from the main visible table and primary export.
- [x] Add Supplier ฝั่งซื้อ and Customer ฝั่งขาย filters in the filter shell.
- [x] Make product desktop rows and dense mobile cards clickable to open detail.
- [x] Add detail sections for purchase lines and sales lines.
- [x] Add allocation, production/yield/loss, monthly detail, and PB/SB source links.

### Batch T360-8: Design And QA

- [x] Use `docs/design.md` filter shell: `rounded-md bg-white p-3 shadow`, compact `h-9` controls, export button in the filter shell.
- [x] Place KPI/summary surfaces before filters across Customer, Supplier, and Product Tracking.
- [x] Use desktop table with `overflow-x-auto rounded-md bg-white shadow`, `text-sm`, `bg-slate-100` header, `p-2` cells.
- [x] Add dense mobile card lists for Customer, Supplier, and Product; cards open the same detail as desktop rows.
- [x] Verify no page-level mobile overflow or detail-card navigation regressions on authenticated browser QA.
- [x] Run validation: targeted lint, full type-check, full build, `git diff --check`, and authenticated route/browser QA.
- [x] Authenticated browser QA for all three routes after the Playwright profile/session is available.

## Implementation Direction

- Keep Tracking 360 APIs read-only and deterministic.
- Add drilldown payloads or detail APIs as separate read endpoints if row detail becomes too heavy.
- Keep source document links business-facing: customer/supplier/product code, PB/SB/receipt/payment doc numbers.
- Implement the latest requirement as a UI/API slice per page: first add detail payload/source links, then add Customer/Supplier/Product-specific decision filters and table columns.
- Do not add runtime fallback for malformed legacy item JSON; fix source data or migration if product/customer/supplier references cannot resolve.
