# 22 Next Design Audit Plan

## Purpose

แผนนี้ใช้ตรวจทุกหน้าของ active Next app ว่าตรงกับ `docs/design.md` และรูปแบบหน้ามาตรฐานของระบบหรือไม่ โดยแยกงานออกจาก functional QA เพื่อให้ตรวจได้ครบโดยไม่ปนกับการแก้ business logic.

## Scope

- Target app: `apps/next/`
- Design source of truth: `docs/design.md`
- Route baseline:
  - `apps/next/src/lib/navigation.ts`
  - `docs/page-inventory-checklist.csv`
  - `docs/migration/18-next-system-sitemap.md`
- Existing historical visual audit: `docs/migration/12-frontend-visual-audit-checklist.md`

Current inventory checkpoint on 2026-07-01:

- `docs/page-inventory-checklist.csv` has 118 rows.
- Active/app page files under `apps/next/src/app/**/page.tsx` include newer app-only pages that may not be fully reflected in the older sitemap.
- The audit should treat catch-all, login, reset password, direct detail pages, and hidden retained pages separately from active sidebar business pages.

## What "Matches Design" Means

Each business page should be checked against these items:

1. Page shell and hierarchy
   - Title/subtitle match navigation and page-flow meaning.
   - Page content is dense ERP style, not landing-page style.
   - No unnecessary nested cards or extra outer card around KPI groups.

2. Filters and actions
   - Filter wrapper, gaps, and control heights follow `docs/design.md`.
   - Primary action buttons align right on desktop.
   - Mobile filters do not overflow or compress labels.
   - List pages with document/item statuses have a status segmented filter.
   - Status options are page-specific and must match the real flow; do not copy statuses from another page when the page does not support them.

3. Tables and mobile layout
   - Desktop tables use soft lined table style.
   - Primary table/list comparison should use `/daily/weight-ticket-list`: `min-w-full divide-y divide-slate-200`, `border-slate-200`, `px-3 py-3` cells, sortable/resizable headers, `minWidth` for every resizable column, and final-column auto-stretch.
   - Numeric columns keep values and units readable.
   - Long customer/supplier/product/document labels do not collide with numbers.
   - Heavy tables have mobile card layout where required, following `/daily/weight-ticket-list`: document/date header, light grouped info box, and footer summary section.
   - Column headers describe the business meaning clearly; avoid vague `เลขที่` / `วันที่` when the page should say `เลขที่ RV`, `วันที่เอกสาร`, `วันที่สร้าง`, `วันที่รับเงิน`, etc.
   - If several date meanings matter, each gets its own named column.

4. KPI and summary cards
   - KPI cards use the approved compact card style.
   - Mobile KPI layout uses two columns where readable.
   - Zero money values are neutral, not success/error colors.
   - KPI cards are present only when they help the user decide or act; remove cards that duplicate `พบทั้งหมด X รายการ` or simple table aggregates.
   - For list pages where users mainly inspect table rows and row actions, table content should be the primary surface.

5. Modals and forms
   - Detail modals use the current dark-header/grouped-card pattern where applicable.
   - Forms wrap before labels or values become cramped.
   - Money, identifiers, quantities, and business codes use the correct field type behavior from `docs/design.md`.

6. Typography, contrast, and spacing
   - User-facing UI uses Noto Sans Thai.
   - No 10px/11px UI text.
   - Dark mode borders and badges remain readable.
   - Text, units, and numbers do not overlap.

7. Wording and business meaning
   - Thai labels match page-flow docs.
   - Document/status wording is consistent across list, detail, modal, print, and export surfaces.
   - Any intentional design override is documented.

8. Row actions
   - Hide unavailable row actions by default instead of showing disabled buttons.
   - Show disabled actions only when the lock itself is important and the UI explains why.

## Suggested Audit Order

Start with user-facing operational pages before admin/support pages:

1. Daily transaction pages: Purchase Bill, Sales Bill, WTI/WTO, payments, receipts, expense, transfer.
2. Stock pages: balance, ledger, transfer, status convert, grade convert, adjust.
3. Finance and debt: AR, AP, bank, cash position, supplier/customer advance.
4. Production: orders, dashboard, reports, yield/loss, cost, reconciliation.
5. Dual costing, trading, PO reports.
6. Main dashboards, tracking, reports.
7. Master data and company data.
8. Finance/accounting management reports.
9. Admin, settings, support pages.
10. Hidden/direct/detail/auth pages.

## Finding Format

Use this format for each issue:

```text
DESIGN-AUDIT: [P0/P1/P2/P3]
Page:
Area:
Expected:
Actual:
Risk:
Suggested fix:
Evidence:
```

Severity:

- P0: Blocks use, unreadable/overlapping critical UI, or broken page.
- P1: Design mismatch that affects daily operation, data entry, or review accuracy.
- P2: Consistency issue, mobile discomfort, or non-critical layout drift.
- P3: Polish, wording, spacing, or low-risk visual cleanup.

## Browser QA Policy

For this audit, browser checks should be run only after the route batch is selected. Each checked route should cover:

- Desktop viewport.
- Mobile viewport.
- Console/network errors.
- Main table/list state.
- Main modal/form state if the page has one.

Do not use browser automation for Plane. This audit only targets the local or deployed Next app.

## Deliverables

Recommended lightweight deliverables:

1. A route matrix with status: `not checked`, `pass`, `issue found`, `needs browser`, `not active`, `hidden/direct`.
2. A ranked issue list using the finding format above.
3. One fix batch at a time, grouped by module or shared component.

## Notes

Do not change runtime business behavior during design fixes unless the mismatch is caused by wrong wording or wrong field behavior documented in the relevant page flow.

## Page Findings Draft

## Static Sidebar Audit Checkpoint - 2026-07-01

Scope checked in this pass:

- Parsed `apps/next/src/lib/navigation.ts` as the current sidebar source of truth.
- Found 106 unique sidebar hrefs after collapsing duplicate parent/child links.
- Found direct `page.tsx` files for 104 routes.
- This pass is a static code/design scan only. No browser/DOM pass was run yet; browser checks should run after selecting a route batch.

Design rules used for this pass:

- `docs/design.md`
- `docs/agent-rules/ui.md`
- Primary table/list reference: `/daily/weight-ticket-list`
- Existing design plan findings below in this file

### P1 Active Sidebar Routes That Are Still Placeholders

These are visible sidebar routes but do not have a direct page file and currently fall through to the catch-all scaffold page:

- `/finance-accounting/accounting-periods` - add the policy page or hide it from sidebar until ready.
- `/finance-accounting/posting-rules` - add the policy page or hide it from sidebar until ready.

Evidence:

- `apps/next/src/app/[...slug]/page.tsx`

### P2 Shared Design Drift To Fix In Batches

1. Transaction/detail modals still drift from the `rounded-md` / dark-header / `border-0` modal baseline.
   - Affected page families:
     - `/sales/bills`
     - `/purchase/po-buy`
     - `/sales/po-sell`
     - `/daily/expense`
     - `/purchase/payments`
     - `/sales/receipts`
   - Typical source files:
     - `apps/next/src/components/daily/TransactionBillsPageClient.tsx`
     - `apps/next/src/components/purchase-flow/PoBuyPageClient.tsx`
     - `apps/next/src/components/sales/PoSellPageClient.tsx`
     - `apps/next/src/components/daily/DailyExpensePageClient.tsx`
     - `apps/next/src/components/daily/MoneyMovementPageClient.tsx`
   - Expected: `DialogContent` baseline should use `rounded-md`, `border-0`, `!p-0`/`p-0`, `overflow-hidden`, dark header where applicable, and no outer/focus border leakage.

2. Tracking, trading, and stock operation detail modals need border/header review.
   - Affected routes:
     - `/tracking/customer`
     - `/tracking/supplier`
     - `/tracking/product`
     - `/trading/matching`
     - `/trading/dashboard`
     - `/stock/status-convert`
     - `/stock/convert`
     - `/stock/adjust`
   - Typical source files:
     - `apps/next/src/components/tracking/CustomerTrackingPageClient.tsx`
     - `apps/next/src/components/purchase-flow/SupplierTrackingPageClient.tsx`
     - `apps/next/src/components/tracking/ProductTrackingPageClient.tsx`
     - `apps/next/src/components/purchase-flow/TradingMatchingPageClient.tsx`
     - `apps/next/src/components/trading/TradingDashboardPageClient.tsx`
     - `apps/next/src/components/stock/StockOperationPageClient.tsx`
   - Expected: detail modal content should follow the same dark-header/grouped-card pattern and explicitly avoid border leakage.

3. Field type matrix review is needed where `type="number"` appears in money/price/tax-like contexts.
   - Confirm each field against the `Field Input Decision Matrix` before changing it. Some hits are valid quantity/percent exceptions; do not blanket-replace.
   - Affected route families:
     - `/sales/bills`
     - `/purchase/advance-payments`
     - `/purchase/payments`
     - `/sales/receipts`
     - `/stock/transfer`
     - `/stock/status-convert`
     - `/stock/convert`
     - `/stock/adjust`
     - `/finance-accounting/working-capital`
     - `/finance-accounting/stock-finance`
     - `/finance-accounting/profit-leak`
     - `/master-data/customers`
   - Expected: money/price/value/VAT/WHT/discount fields use the money input pattern; quantity/weight/percent fields may stay as number exceptions with spinner hidden and correct `step`.

4. Dual Costing has font baseline drift.
   - Affected routes:
     - `/dual-costing/cost-allocator`
     - `/dual-costing/waiting-allocations`
     - `/dual-costing/cost-allocation-ledger`
     - `/dual-costing/report`
   - Evidence sources:
     - `apps/next/src/app/dual-costing/cost-allocator/page.tsx`
     - `apps/next/src/components/dual-costing/CostAllocatorPageClient.tsx`
     - `apps/next/src/components/dual-costing/DualCostingManagementPageClient.tsx`
   - Expected: remove explicit `font-sans` from UI surfaces and inherit the app baseline `Noto Sans Thai`.

5. Finance/accounting report pages use older filter/card styling and compact controls that should be normalized when those pages are touched.
   - Affected routes:
     - `/finance-accounting/working-capital`
     - `/finance-accounting/stock-finance`
     - `/finance-accounting/profit-leak`
     - `/finance-accounting/tax-vat-wht`
   - Expected: filter wrapper, gaps, and controls should match `rounded-md bg-white p-3 shadow`, `gap-2`, and `h-9`/`h-10` control sizing unless the page has a documented override.

### P3 Consistency Cleanup Queue

- Several operational pages still use compact `h-7`/`h-8` controls in filter/action areas. Review when fixing the surrounding page instead of doing a noisy standalone sweep.
- Some row actions render disabled edit/cancel controls. Design baseline says hide unavailable row actions unless the disabled lock itself matters and is explained.
- Generic table headers such as `เลขที่` and `วันที่` are widespread. Fix page-by-page using the real business meaning: `เลขที่ RV`, `เลขที่บิลขาย`, `วันที่เอกสาร`, `วันที่สร้าง`, `วันที่รับเงิน`, etc.
- Master data shared pages mostly fall into wording cleanup, not urgent layout risk, unless a specific page is selected for UI polish.

### Suggested Fix Order

1. Resolve the two active placeholder sidebar routes: implement minimal policy pages or remove from sidebar until ready.
2. Finish the remaining high-confidence operational findings already drafted below: `/purchase/payments` and `/sales/receipts`; `/sales/po-sell`, `/sales/bills`, `/purchase/receipt-vouchers`, and `/production/report` have local code/layout checkpoints and still need browser QA.
3. Normalize shared modal surfaces in one batch per component family: transaction bills, PO Buy/Sell, daily expense, money movement, stock operation, then tracking/trading.
4. Review the field input matrix only inside the touched form batch; do not blanket-convert all `type="number"` hits.
5. Polish finance/accounting report filter/card styling after operational transaction pages are stable.
6. Run browser QA per selected batch on desktop and mobile before claiming visual completion.

### Routes With No High-Confidence Static Finding Yet

The absence of a static finding is not a visual pass. These still need browser review for overlap, mobile layout, dark mode, and real data states. Static scan did not raise a high-confidence issue for several dashboard/report/admin pages, especially pages that are mostly read-only or share already-normalized components.

### `/purchase/receipt-vouchers`

- 2026-07-01 implementation checkpoint: the RV list now uses page-specific filter/search wording (`เลขที่ RV`, `วันที่ออกเอกสาร`), status segmented filters (`ทุกสถานะ / ใช้งาน / ยกเลิก`), resizable desktop table with final action-column auto-stretch, dense mobile cards, normal-sized clear-filter controls, and right-aligned desktop create action. Cancelled rows keep print available while unavailable edit/cancel actions are hidden. The create/edit, detail, and cancel modal headers now follow the dark-header baseline, and the detail modal groups document and amount/contact facts into cards. Browser QA remains pending because this batch was local code/layout validation only.

### `/sales/bills`

- 2026-07-01 implementation checkpoint: the Sales Bill list now uses page-specific table wording (`เลขที่บิลขาย`, `วันที่สร้าง`, `รายการ`, `สถานะรับเงิน`), hides unavailable edit/cancel row actions, keeps the compact VAT invoice indicator (`vatInvoiceNo` or `ยังไม่ออก`), uses normal clear-filter sizing, shows mobile filter count for date/type/status filters, uses dense mobile cards, and lets the desktop final action column auto-stretch like `/daily/weight-ticket-list`. The Sales Bill detail modal now follows the dark-header `rounded-md` baseline, moves the SB number/customer into the header/title/subtitle, avoids repeating customer inside the document card, and uses white grouped cards for the main document/status/item sections. The cancel dialog keeps the mobile bottom sheet but uses desktop `rounded-md` modal radius. Browser QA remains pending because this batch was local code/layout validation only.

### `/sales/po-sell`

- 2026-07-01 implementation checkpoint: the PO Sell list already had the page-specific Thai headers and hidden unavailable edit/cancel actions; this pass finished the remaining table/modal drift by aligning the desktop table shell with the lined table baseline, letting the final action column auto-stretch, replacing fixed `colSpan={15}` with the column definition count, and normalizing the create/edit, cancel, and detail dialogs to the `rounded-md` dark-header modal baseline with no outer border/outline leakage. The detail subtitle now keeps readable slate-300 contrast in dark mode. Browser QA remains pending because this batch was local code/layout validation only.
- Remaining follow-up: run desktop/mobile browser QA for PO Sell when the selected visual batch reaches browser verification.

### `/production/report`

- 2026-07-01 implementation checkpoint: adjusted `ProductionReportPageClient` so report KPI cards render above the filter, the `ทั้งหมด` quick range no longer shows stale date values as active filters, KPI values append deterministic units where possible, and the tab spacing is tighter. Follow-up corrections removed the duplicate order-count KPI and the ambiguous cost/kg KPI; row count now stays in the table toolbar, while KPI cards focus on analytic production metrics. The WIP and product-summary tabs were also normalized to the same toolbar + table shell as `รายการใบสั่งผลิต`, including `colgroup`, `ResizableTableHead`, sortable headers, resizable column handles, final-column auto-stretch, and reset-width controls instead of separate card headers/badges. The detail table now exposes status, RM, Process, total cost, Loss Value, RM baht/kg, and production cost baht/kg columns explicitly, and the product-summary tab groups from actual `outputProducts` facts rather than the order header product. Browser QA remains pending because this batch is code/layout adjustment only.
- Keep KPI cards because this is an analytic report page; the cards summarize production performance and are not just duplicating `พบทั้งหมด X รายการ`.
- Move KPI summary cards to the very top of the page, above the filter section, to comply with the standard List Page Pattern.
- Remove the outer gray wrapper/background from the KPI cards and use the floating grid layout (AcexPOS style) as per design docs.
- Keep customer-requested production metric terms as English: `Input`, `Output`, `WIP`, `Loss`, and `Yield`.
- Rename vague main table headers:
  - `เลขที่` -> `เลขที่ใบสั่งผลิต`.
  - `วันที่` -> `วันที่สร้าง` when the column represents production-order creation/order date.
  - `Total Cost` -> `ต้นทุนรวม`; cost terms that are not customer-requested metric terms should be Thai.
- Tune report table widths so long business headers such as `เลขที่ใบสั่งผลิต` and `ต้นทุนผลผลิต ฿/กก.` are readable, while product/machine cells may truncate.
- Cost and value metrics should use neutral color by default; they are not inherently success states. Keep red/green only for meaningful good/bad metrics such as Loss/Yield where applicable.
- Filter order should follow list-page convention: search first, date range second, export action right aligned on desktop. Use `ล้างตัวกรอง` and show it only when a filter is active.
- Filter wording must match behavior: search should include production order number, product, machine/type, and branch if the placeholder says so; date range should be labelled `วันที่สร้าง:`.
- Production/Yield requires segmented filters in the same filter card:
  - `ช่วงเวลา: ทั้งหมด / วันนี้ / 7 วัน / เดือนนี้`
  - `สถานะผลิต: ทุกสถานะ / ยังไม่เริ่ม / กำลังผลิต / เสร็จบางส่วน / เสร็จสิ้น / ยกเลิก`
  - selecting a manual date range should become custom and must not falsely highlight a quick range.
- Structure the report tables as line tabs instead of stacked tables. Expected tabs: `รายการใบสั่งผลิต`, `WIP คงเหลือ`, and `สรุปตามสินค้า`.
- Do not repeat the selected tab label as a separate heading above the table. The count/pagination row should sit close to the table as the table toolbar.
- Main report table should follow `/daily/weight-ticket-list` table mechanics: resizable columns with `defaultWidth` and `minWidth`, sortable `ResizableTableHead`, final-column auto-stretch, reset button in the pagination toolbar, and dense mobile cards grouped by document/date, production descriptors, and metric summary.

## Detailed Static Sidebar Design Audit Checkpoint - 2026-07-01

Scope of this pass:

- Re-parsed `apps/next/src/lib/navigation.ts` as the active sidebar source of truth.
- Checked 106 unique sidebar routes.
- Found 104 direct `page.tsx` routes and 2 visible sidebar routes that still fall through to the catch-all scaffold.
- Reviewed page/component code against `docs/design.md`, `docs/agent-rules/ui.md`, and the closest active references, especially `/daily/weight-ticket-list` and the corrected `/production/report`.
- This is still a static code/design audit only. No browser/DOM UAT was run in this pass because project rules say browser testing should run only when explicitly requested or after selecting a route batch.

Refined static scan counts:

- P1 visible sidebar route without direct page: 2 routes.
- P2 table exists but does not use `ResizableTableHead` / `useResizableColumns`: 24 routes.
- P2 table page without a clear mobile card/list alternate after accounting for `md:hidden` and `lg:hidden`: 3 routes.
- P2 explicit `font-sans` override against the Noto Sans Thai baseline: 4 routes.
- P2 pages with `type="number"` that need Field Input Decision Matrix review before changing: 21 routes.
- P2 routes with dialog/modal surfaces that should be reviewed against the dark-header/grouped-card modal baseline: 50 routes.
- P2 routes with row actions that render disabled edit/cancel-like controls instead of hiding unavailable actions: at least 5 route families.
- P3 wording/header specificity is widespread; static scan found many generic `เลขที่` / `วันที่` occurrences. Fix page-by-page using the real business meaning rather than blanket replacing.

### P1 Visible Sidebar Routes Still Showing Scaffold

These are visible in `navigation.ts` but have no direct `apps/next/src/app/**/page.tsx`, so they resolve through `apps/next/src/app/[...slug]/page.tsx` and show `Next.js route scaffold`.

- `/finance-accounting/accounting-periods`
- `/finance-accounting/posting-rules`

Suggested fix:

- Either implement minimal policy/readiness pages now, or hide these two entries from the sidebar until the policy pages are ready.

### P2 Table Mechanics Still Older Than The Design Reference

Expected:

- Main data tables should follow `/daily/weight-ticket-list`: lined desktop table, `colgroup`, `ResizableTableHead`, sortable headers where useful, resize handles, explicit column min widths, final-column auto-stretch, reset-width control, and dense mobile card/list view for heavy tables.

Routes/components with high-confidence table mechanics drift:

- Main dashboard/report pages:
  - `/business-calendar`
  - `/cash-flow-calendar`
  - `/cash-others-summary`
  - `/profit-cost-analysis`
  - `/sales-plan`
  - `/sales-commission`
- Dual Costing:
  - `/dual-costing/cost-allocator`
  - `/dual-costing/cost-pool`
  - `/dual-costing/deal-margin`
- Finance / Accounting:
  - `/finance-accounting/asset-disposal`
  - `/finance-accounting/asset-overview`
  - `/finance-accounting/asset-register`
  - `/finance-accounting/balance-sheet`
  - `/finance-accounting/cash-flow-analysis`
  - `/finance-accounting/cash-flow-statement`
  - `/finance-accounting/cf-forecast-calendar`
  - `/finance-accounting/depreciation`
  - `/finance-accounting/equity-maint`
  - `/finance-accounting/historical-data`
  - `/finance-accounting/loan-contracts`
  - `/finance-accounting/loan-dashboard`
  - `/finance-accounting/opening-balance`
  - `/finance-accounting/pl-statement`
- Lower-priority playground:
  - `/daily/design-mockup`

Notes:

- Many finance-accounting pages already have mobile card/list alternates, so the primary issue is desktop table mechanics and old compact `text-xs` table style, not only mobile behavior.
- `/dual-costing/cost-allocator` and `/dual-costing/cost-pool` are heavier because they also lack clear mobile card/list alternate signals.

### P2 Dual Costing Font And Mixed-Language Drift

Affected routes:

- `/dual-costing/cost-allocation-ledger`
- `/dual-costing/cost-allocator`
- `/dual-costing/report`
- `/dual-costing/waiting-allocations`

Expected:

- Do not add explicit `font-sans`; controls/cards/tables should inherit the app baseline `Noto Sans Thai`.
- Thai-first business table headings should be used unless the business term is intentionally English.

Observed examples:

- `CostAllocatorPageClient.tsx` includes a button with `font-sans`.
- Dual Costing tables still show mixed headers such as `Customer`, `Counterparty`, `Source`, `Available`, `Matched`, `Revenue`, `Avg Cost`, and `Match Status`.

Suggested fix:

- Remove `font-sans` overrides first.
- Normalize Dual Costing table shell and headers in one focused batch rather than patching each label ad hoc.

### P2 Operational Pages With Modal / Action / Wording Drift

High-impact route families:

- `/purchase/bills` and `/sales/bills`
  - `/sales/bills` has a 2026-07-01 local design checkpoint for table wording/actions, mobile filter count, final-column auto-stretch, Sales Bill detail grouped cards, and Sales Bill/cancel modal radius normalization.
  - `/purchase/bills` shares the transaction list/action table mechanics, but its purchase detail/form modal surfaces still need a separate page pass before marking the purchase side visually complete.
- `/purchase/payments` and `/sales/receipts`
  - Tables are mostly resizable and have mobile cards.
  - Money/WHT/discount fields still use `type="number"` in payment/receipt entry rows; review through the Field Input Decision Matrix before changing.
  - History actions still show disabled buttons for cancelled rows in some places.
- `/purchase/receipt-vouchers`
  - 2026-07-01 design polish completed for the high-confidence static findings: page-specific headers/filter wording, final-column auto-stretch, desktop action alignment, hidden unavailable edit/cancel actions, and dark-header modal surfaces.
  - Remaining: browser QA for desktop/mobile visual confirmation.
- `/sales/po-sell`
  - 2026-07-01 design polish completed for the high-confidence static findings: table wording/action visibility is aligned, the final action column auto-stretches, and create/edit, cancel, and detail dialogs now follow the `rounded-md` dark-header modal baseline.
  - Remaining: browser QA for desktop/mobile visual confirmation.
- `/daily/expense`, `/daily/transfer`, `/daily/payment-approval`, `/production/orders`, stock operation pages, tracking pages, and trading pages
  - These are mainly modal-surface review items: normalize detail/form dialog header, border/radius, grouped card layout, and avoid border leakage.
  - Do not change business behavior during these visual passes.

### P2 Field Input Matrix Review Queue

Do not blanket replace these. Check each field against the `Field Input Decision Matrix` in `docs/design.md` when the page is in the selected fix batch.

Affected route families:

- `/daily/weight-ticket-list`
- `/dual-costing/cost-allocator`
- `/finance-accounting/profit-leak`
- `/finance-accounting/stock-finance`
- `/finance-accounting/working-capital`
- `/master-data/customers`
- `/purchase/advance-payments`
- `/purchase/bills`
- `/purchase/payments`
- `/sales/bills`
- `/sales/receipts`
- `/sales-plan`
- `/sales-commission`
- `/stock/adjust`
- `/stock/convert`
- `/stock/status-convert`
- `/stock/transfer`
- `/tracking/customer`
- `/tracking/product`
- `/tracking/supplier`
- `/trading/dashboard`

Expected:

- Money/price/value/VAT/WHT/discount fields should use the money pattern.
- Quantities, weights, percentages, and intentionally numeric counts may remain number inputs only when the matrix allows it and spinner clutter is hidden.

### Pages That Are Closer To Current Design

- `/daily/weight-ticket-list`
  - Remains the primary list/table reference.
  - It has desktop resizable/sortable table, mobile filters, mobile card list, table shell, and pagination/reset controls.
- `/production/report`
  - After the latest correction, the report, WIP, and product-summary tables now share the same toolbar/table mechanics and mobile card pattern.
  - Browser QA remains pending.
- `/purchase/receipt-vouchers`
  - After the latest correction, the list table/action/filter wording and RV modal surfaces follow the active baseline more closely.
  - Browser QA remains pending.
- `/sales/bills`
  - After the latest correction, the Sales Bill list table/action/filter and detail/cancel modal surfaces follow the active baseline more closely.
  - Browser QA remains pending.
- `/sales/po-sell`
  - After the latest correction, the PO Sell list table/action and form/cancel/detail modal surfaces follow the active baseline more closely.
  - Browser QA remains pending.
- Master data shared pages under `/master-data/*`
  - Most shared pages use `MasterDataPageClient`, which already has resizable desktop table, mobile toolbar/filter bottom sheet, mobile card list, and dark-header form modal.
  - Remaining work is mostly modal polish, wording cleanup, and field-specific validation/presentation, not a full table rewrite.
- `/finance/ar` and `/finance/ap`
  - Both have resizable desktop tables and mobile card lists.
  - Remaining work is mostly wording (`Customer`/`Supplier`, `วันที่`, `Due`, `Current`) and AP/AR-specific detail/modal/card polish already tracked in the implementation tasklist.

### Updated Suggested Fix Order

1. Fix the two scaffold sidebar routes: `/finance-accounting/accounting-periods` and `/finance-accounting/posting-rules`.
2. Finish remaining high-confidence operational inconsistencies users will notice immediately: `/purchase/payments` and `/sales/receipts` (PO Sell, Sales Bills, and RV static findings are fixed; browser QA still pending).
3. Normalize shared operational modal surfaces by component family: `TransactionBillsPageClient`, `MoneyMovementPageClient`, `PoBuyPageClient`, `PoSellPageClient`, `DailyExpensePageClient`, `StockOperationPageClient`, tracking pages, then trading pages.
4. Bring Dual Costing tables up to the table reference, starting with `/dual-costing/cost-allocator` and `/dual-costing/cost-pool` because they combine table mechanics drift with mobile/table density risk.
5. Normalize Finance / Accounting table mechanics in shared component batches: fixed assets, financial statements, cash-flow planning, loans/equity.
6. Review `type="number"` only inside the touched page batch using the design matrix; do not run a broad replacement sweep.
7. Run browser QA desktop + mobile for the selected batch before claiming visual completion.
