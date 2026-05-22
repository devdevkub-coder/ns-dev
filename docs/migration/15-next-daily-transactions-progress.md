# 15 Next Daily Transactions Progress

## Objective

ติดตามงานดึงหน้ากลุ่ม `รายการประจำวัน` จาก legacy source เข้าสู่ Next.js พร้อม API, DB wiring, validation, permission guard และ reconciliation เบื้องต้น

## Reporting Rule

- อัปเดตเอกสารนี้หลังจบแต่ละ batch หรือเมื่อเปลี่ยน schema/API contract
- Push git เป็นระยะหลัง validation ผ่านในแต่ละ checkpoint
- ใช้ `old-apps/legacy/` และ `old-apps/vue/` เป็น reference เท่านั้น ห้าม route/import runtime กลับไปหา legacy
- DB migration ต้องไม่ลบข้อมูลเดิม และต้องใช้ additive change เป็นค่าเริ่มต้น
- ทุกฟอร์มและ API write ต้อง validate syntax ด้วย Zod หรือ schema layer ที่ใช้ร่วมกัน
- ธุรกรรมที่กระทบเงิน/สต๊อกต้องบันทึก side effect และ reconciliation query ให้ชัด

## Legacy Inventory

| Route | Legacy Component | Current Next Status | Target Notes |
|---|---|---|---|
| `/purchase/bills` | purchase bill flow | Batch D+ Create/Edit Done | Purchase transaction list/filter/export and create modal writes header + relational line items; stock/FIFO posting still follow-up |
| `/sales/bills` | sales bill flow | Batch D Read Baseline Done | Sales transaction read surface; create/post/FIFO follow-up |
| `/sales/stock-issue` | pending sale / issue flow | Batch E Read Baseline Done | Pending sale / stock issue read surface; post/convert follow-up |
| `/daily/payment-approval` | `view-paymentApproval` | Batch B Done | Approval workbench over AP and expenses |
| `/purchase/payments` | supplier payment flow | Batch B Done | Supplier payments + bank statement |
| `/purchase/receipt-vouchers` | receipt voucher flow | Batch B Done | Purchase receipt voucher read surface |
| `/sales/receipts` | customer receipt flow | Batch B Done | Customer receipts + bank statement |
| `/daily/transfer` | `view-transfer` | Batch A Done | Transfer CRUD + two-sided bank statement |
| `/daily/expense` | `view-expense` | Batch A Done | Expense voucher list/form + VAT/WHT + payment status baseline |
| `/daily/petty-advance` | `view-pettyAdvance` | Batch A Done | Petty cash/director advance baseline |
| `/daily/expense-dashboard` | `view-expenseDashboard` | Batch A Done | Read-only dashboard from expenses |
| `/stock/transfer` | stock transfer flow | Batch C Done | Inventory movement via `stock_ledger` |
| `/daily/bill-swap-history` | `view-billSwapHistory` | Batch C Done | Read-only bill supplier-change audit |
| `/finance/ap` | `view-ap` | Batch F Read Baseline Done | AP aging from purchase bills and supplier payments |
| `/stock/ledger` | `view-stockLedger` | Batch F Read Baseline Done | Stock movement inspection, default PB view |
| `/trading/matching` | `view-tradingMatching` | Batch F Read Baseline Done | Trading PB/SB and deal matching read surface |
| `/purchase/po-buy` | `view-poBuy` | Batch G Read Baseline Done | PO Buy source for purchase bill PO receipt |
| `/po-reports/outstanding` | `view-poOutstanding` | Batch G Read Baseline Done | Outstanding PO Buy/Sell with costing-only exclusion |
| `/tracking/supplier` | `view-supplierTracking` | Batch H Read Baseline Done | Supplier 360 from purchase bills and supplier payments |

## Batch Plan

### Batch A: Cash / Expense Foundation

Scope:
- `/daily/transfer`
- `/daily/expense`
- `/daily/petty-advance`
- `/daily/expense-dashboard`

Status: Done baseline on 2026-05-18.

Tasks:
- Done: added real Next pages and client components:
  - `/daily/transfer`
  - `/daily/expense`
  - `/daily/petty-advance`
  - `/daily/expense-dashboard`
- Done: added API routes:
  - `/api/daily/transfers`
  - `/api/daily/expenses`
  - `/api/daily/petty-advances`
  - `/api/daily/petty-advances/returns`
- Done: used existing DB tables for `transfers`, `bank_statement`, `expenses`, `expense_categories`, and `accounts`.
- Done: added missing target tables with additive migration only:
  - `petty_advances`
  - `petty_advance_returns`
- Done: preserved key legacy side effects:
  - transfer writes two deterministic `bank_statement` rows
  - paid expense writes deterministic `BS-EXP-*` bank statement row
  - petty advance writes `PADV` money-out bank statement row
  - petty advance return writes `PRET` money-in bank statement row
- Done: added frontend search/filter/sort/count for normal page use.
- Done: added server-side Zod validation for all new write APIs.
- Done: added route permission mapping for `/daily/*` and `/api/daily/*` using `finance.cash.view` during transition.

Validation:
- Passed: `npm run prisma:generate --workspace @ns-scrap-erp/next`
- Passed: `npm run type-check --workspace @ns-scrap-erp/next`
- Passed: `npm run lint --workspace @ns-scrap-erp/next`
- Passed: `npm run build`
- Build confirmed routes generated:
  - `/daily/transfer`
  - `/daily/expense`
  - `/daily/petty-advance`
  - `/daily/expense-dashboard`
  - `/api/daily/transfers`
  - `/api/daily/expenses`
  - `/api/daily/petty-advances`
  - `/api/daily/petty-advances/returns`
- Pending: authenticated browser/API smoke against Vercel/local session.

### Batch B: Payment / Receipt Operations

Scope:
- `/daily/payment-approval`
- `/purchase/payments`
- `/purchase/receipt-vouchers`
- `/sales/receipts`

Status: Done baseline on 2026-05-18.

Tasks:
- Done: built payment approval queue from unpaid purchase bills and pending expense vouchers.
- Done: added supplier payment page/API using `payments`, `purchase_bills`, `suppliers`, and `accounts`.
- Done: added customer receipt page/API using `receipts`, `sales_bills`, `customers`, and `accounts`.
- Done: supplier payment writes deterministic `BS-PMT-*` bank statement row.
- Done: customer receipt writes deterministic `BS-RCP-*` bank statement row.
- Done: added receipt voucher read page/API using `receipt_vouchers`.
- Follow-up: approval persistence/printing is still a baseline read queue, not a full cashier approval document workflow yet.

Validation:
- Passed: `npm run type-check --workspace @ns-scrap-erp/next`
- Passed: `npm run lint --workspace @ns-scrap-erp/next`
- Passed: `npm run build`
- Build confirmed routes generated:
  - `/daily/payment-approval`
  - `/purchase/payments`
  - `/purchase/receipt-vouchers`
  - `/sales/receipts`
  - `/api/daily/payment-approval`
  - `/api/purchase/payments`
  - `/api/purchase/receipt-vouchers`
  - `/api/sales/receipts`
- Pending: AP/AR aggregate reconciliation after authenticated smoke data entry.

### Batch C: Stock Transfer and Daily Audit

Scope:
- `/stock/transfer`
- `/daily/bill-swap-history`

Status: Done baseline on 2026-05-18.

Tasks:
- Done: implemented stock transfer page/API using existing `stock_ledger` as source of truth.
- Done: stock transfer POST creates paired `ST` stock ledger rows:
  - `โอนระหว่างสาขา-ออก`
  - `โอนระหว่างสาขา-เข้า`
- Done: implemented bill swap history read page/API using existing `bill_swap_history`.
- Follow-up: stock transfer cost currently records `unit_cost = 0` until WAC/lot cost source is confirmed for Next.
- Follow-up: cancel/void action is not implemented yet; financial/stock traceability decision is still pending.

Validation:
- Passed: `npm run type-check --workspace @ns-scrap-erp/next`
- Passed: `npm run lint --workspace @ns-scrap-erp/next`
- Passed: `npm run build`
- Build confirmed routes generated:
  - `/stock/transfer`
  - `/daily/bill-swap-history`
  - `/api/stock/transfer`
  - `/api/daily/bill-swap-history`

### Batch D: Purchase / Sales Bills

Scope:
- `/purchase/bills`
- `/sales/bills`

Status: Read baseline done on 2026-05-18.

Tasks:
- Done: added read-only Next pages and APIs for purchase and sales bills.
- Done: pages read real `purchase_bills` and `sales_bills` data with supplier/customer, branch, warehouse, channel, totals, paid/received, and balances.
- Done: converted transaction list loading from frontend filtering over all rows to server-side pagination/filter/sort/count/sum for `/purchase/bills` and `/sales/bills`; default page size is 50 rows to handle monthly bill volume.
- Deferred by design: create/edit/post/void and line refactor, because they affect stock ledger, AP/AR, FIFO/COGS, and profit permissions.
- Follow-up: split header/line behavior carefully and preserve existing business flow.
- Follow-up: define reconciliation for bill count, totals, paid/received amounts, stock movements, and linked ledger rows.

Validation:
- Passed: `npm run type-check --workspace @ns-scrap-erp/next`
- Passed: `npm run lint --workspace @ns-scrap-erp/next`
- Passed: `npm run build`
- Passed: server-side transaction list update validation with `npm run type-check --workspace @ns-scrap-erp/next`, `npm run lint --workspace @ns-scrap-erp/next`, and `npm run build --workspace @ns-scrap-erp/next`
- Build confirmed routes generated:
  - `/purchase/bills`
  - `/sales/bills`
  - `/api/purchase/bills`
  - `/api/sales/bills`

### Batch D+ Follow-up: Purchase Bill Create Modal

Scope:
- `/purchase/bills`
- `/api/purchase/bills`

Status:
- Restored purchase filter bar with search, date range, transaction mode, and source filters.
- Restored `+ บิลรับซื้อใหม่` action and added a Next modal for creating purchase bills.
- Added item rows inside the modal with `+ เพิ่มรายการ`, product selection, quantity, price, and discount.
- Added Zod syntax validation for purchase bill create payload through `purchaseBillFormSchema`.
- Added XLSX export for purchase bills.
- Follow-up update: expanded the Next purchase bill modal to mirror legacy card structure before later trimming:
  - `1. ประเภทบิล`: STOCK/TRADING, trading info, mixed Spot + PO note, Quick Load PO selector.
  - `2. ข้อมูลบิล`: doc no, supplier ref no, date, supplier, branch, warehouse, purchase channel, license plate, contact phone, salesperson, source, VAT mode.
  - `3. รายการสินค้า`: product, display name, per-line PO, gross weight, tare/deduct weight, net weight, price, salesperson display price, discount, line amount.
  - `4. VAT & ยอดรวม`: VAT toggle, bill-level discount, total weight, subtotal, after-discount, VAT, grand total.
  - VAT invoice tracking: received flag, VAT invoice no, VAT invoice date.
  - Notes card.
- Follow-up update: `/api/purchase/bills` now accepts and stores legacy-compatible header fields on `purchase_bills` and line fields inside `items` JSON:
  - `po_buy_id`, `license_plate`, `contact_phone`, `sales_id`, `discount_total`, `vat_invoice_received`, `vat_invoice_no`, `vat_invoice_date`, `note`
  - item `displayName`, `poBuyId`, `grossWeight`, `deductWeight`, `qty` as net weight, `salesPrice`
- Follow-up update: options payload now includes active/open PO buys and active salespersons for the create modal.
- Follow-up update: purchase bill document number is no longer user-editable in the create modal. `/api/purchase/bills` now generates `PB{branchCode}{YYMM}-{runningNo}` at save time only inside a DB transaction, uses `pg_advisory_xact_lock` to serialize new purchase bill number assignment, returns the generated `docNo`, and retries on `doc_no` unique conflict.
- Follow-up update: purchase bill document number format now includes branch code. Branch codes are normalized as `01 = สมุทรสาคร` and `02 = นครสวรรค์`, so examples look like `PB012605-3074`. The running number continues from the highest purchase bill running number in that month, including both old `PB2605-####` and new `PB012605-####`/`PB022605-####` formats.
- Follow-up update: added additive unique indexes for `purchase_bills.doc_no` and `sales_bills.doc_no`. Migration fails fast if duplicate document numbers already exist; it does not delete or merge data. Dev-target purchase bills were reconciled on 2026-05-18 by backing up all current rows, setting all current purchase bills to `BR002/WH002` (สมุทรสาคร), and renumbering them to unique `PB012605-0001` through `PB012605-0409`; unique indexes were then applied successfully.
- Follow-up update: purchase bill table rows now open `/purchase/bills/[id]` detail page. Detail page reads `supplier_id` as the FK and displays supplier name from master data relation `suppliers.name`; transaction rows should keep FK/id and not store ad hoc supplier display text as the source of truth.
- Follow-up update: purchase bills can now be edited from the `/purchase/bills` table even when supplier payments already exist. This intentionally differs from the old legacy lock rule. Edit keeps existing `payments` untouched, recomputes `paid_amount`, `payable_balance`, and `status` from payment rows, and regenerates `stock_ledger.ref_type = PB` for `STOCK` bills only.

Important boundary:
- Current create/edit path writes `purchase_bills` header + `purchase_bill_items` relational line rows, updates AP balance fields, and writes `stock_ledger` rows for `STOCK` bills. The old `purchase_bills.items` JSONB column has been removed from the target schema.
- `TRADING` remains a PB document but does not create stock ledger.
- Purchase bill document remains editable after supplier payments exist by current business decision. Existing payment rows are preserved and AP balance/status is recomputed from current payment totals.
- Existing supplier payments are not rewritten by purchase-bill edit. If totals change after payment, AP balance is recalculated from current payment rows.
- Full void/reversal and PO remaining-qty reconciliation still need a separate transaction batch.

Validation:
- Passed: `npm run type-check --workspace @ns-scrap-erp/next`
- Passed: `npm run lint --workspace @ns-scrap-erp/next`
- Passed: `npm run build --workspace @ns-scrap-erp/next`

### Batch E: Pending Sale / Stock Issue

Scope:
- `/sales/stock-issue`

Status: Read baseline done on 2026-05-18.

Tasks:
- Done: added read-only Next page/API for `stock_issues`.

### Batch F: Purchase Bill Linked Flow Surfaces

Scope:
- `/finance/ap`
- `/stock/ledger`
- `/trading/matching`

Status: Read baseline done on 2026-05-18.

Tasks:
- Done: added AP aging page/API from legacy `view-ap` behavior using `purchase_bills` + `payments`.
- Done: AP API computes live paid amount from supplier payments instead of trusting stale `paid_amount` only.
- Done: added Stock Ledger page/API from legacy `view-stockLedger` read surface, defaulting the UI to `refType = PB` so purchase-bill movements are visible first.
- Done: added Trading Matching page/API from legacy `view-tradingMatching` read surface using `purchase_bills.transaction_mode = TRADING`, `sales_bills.transaction_mode = TRADING`, and `trading_deals`.
- Done: added route/API permission mapping for `/api/finance/*`, `/api/stock/*`, `/api/trading/*`, `/finance/*`, `/stock/*`, and `/trading/*`.

Important boundary:
- These three pages are DB-connected read surfaces first. They intentionally do not create approval records, stock reversals, trading deals, or edit existing bills yet.
- Purchase bill create now posts `stock_ledger.ref_type = PB` only for `transaction_mode = STOCK`; `TRADING` remains a PB document but does not create stock ledger.

Validation:
- Passed: `npm run type-check --workspace @ns-scrap-erp/next`
- Passed: `npm run lint --workspace @ns-scrap-erp/next`
- Passed: `npm run build --workspace @ns-scrap-erp/next`
- Build confirmed routes generated:
  - `/finance/ap`
  - `/stock/ledger`
  - `/trading/matching`
  - `/api/finance/ap`
  - `/api/stock/ledger`
  - `/api/trading/matching`

### Batch G: PO Buy and Outstanding Flow Surfaces

Scope:
- `/purchase/po-buy`
- `/po-reports/outstanding`

Status: Read baseline done on 2026-05-18.

Tasks:
- Done: added PO Buy page/API from legacy `view-poBuy` read surface using real `po_buys`, suppliers, and product lookups.
- Done: PO Buy page separates delivery PO from costing-only PO via `require_delivery`.
- Done: added PO Outstanding page/API from legacy `view-poOutstanding` read surface using `po_buys` and `po_sells`.
- Done: PO Outstanding excludes `require_delivery = false` rows, matching legacy behavior where costing-only PO does not enter outstanding delivery tracking.
- Done: added permission mapping for `/api/po-reports/*`.

Important boundary:
- These pages are DB-connected read surfaces first. Create/edit/toggle between Delivery and Costing-only still needs a separate write batch with validation, audit, and purchase-bill cut reconciliation.

Validation:
- Passed: `npm run type-check --workspace @ns-scrap-erp/next`
- Passed: `npm run lint --workspace @ns-scrap-erp/next`
- Passed: `npm run build --workspace @ns-scrap-erp/next`
- Build confirmed routes generated:
  - `/purchase/po-buy`
  - `/po-reports/outstanding`
  - `/api/purchase/po-buy`
  - `/api/po-reports/outstanding`

### Batch H: Supplier Tracking Surface

Scope:
- `/tracking/supplier`

Status: Read baseline done on 2026-05-18.

Tasks:
- Done: added Supplier Tracking page/API from legacy `view-supplierTracking`.
- Done: API reads real `suppliers`, `purchase_bills`, and `payments`.
- Done: supports year/month query, monthly purchase trend, supplier totals, paid amount, payable balance, average buy price, and bill/payment counts.
- Done: added route/API permission mapping for `/tracking/*` and `/api/tracking/*`.

Important boundary:
- This is a DB-connected read surface. It does not yet include detail drilldown/export XLSX or product breakdown modal from legacy.

Validation:
- Passed: `npm run type-check --workspace @ns-scrap-erp/next`
- Passed: `npm run lint --workspace @ns-scrap-erp/next`
- Passed: `npm run build --workspace @ns-scrap-erp/next`
- Build confirmed routes generated:
  - `/tracking/supplier`
  - `/api/tracking/supplier`
- Deferred by design: create/post/convert-to-bill flow until sales bill and stock ledger write rules are reconciled.
- Follow-up: reconcile issued stock against later sales invoice links.

Validation:
- Passed with Batch D validation above.
- Build confirmed routes generated:
  - `/sales/stock-issue`
  - `/api/sales/stock-issue`

## Current Status as of 2026-05-18

- Current git checkpoint before daily work: `65a42bc fix: simplify payment and remittance masters`.
- Planning checkpoint: `3b32499 docs: plan next daily transactions`.
- Batch A implementation checkpoint: `24ab600 feat: add daily cash expense baseline`.
- Batch B implementation checkpoint: `64bcde3 feat: add daily payment receipt baseline`.
- Batch C implementation checkpoint pending commit after this doc update.
- Batch C implementation checkpoint: `32ff488 feat: add daily stock transfer audit baseline`.
- Batch D/E read baseline checkpoint pending commit after this doc update.
- Next daily Batch A routes now have real Next pages and API routes.
- Next daily Batch B payment/receipt routes now have baseline pages and API routes.
- Next daily Batch C stock transfer/audit routes now have baseline pages and API routes.
- Next daily Batch D/E transaction read routes now have baseline pages and API routes.
- Purchase bill create/edit flow now writes header + relational line items in `purchase_bill_items`, generates branch/month document numbers at save time, recalculates AP status from payments, and writes stock ledger only for `STOCK` bills. The old `purchase_bills.items` JSONB column has been removed from the target schema. The modal reads the active VAT percent from `vat_settings`, displays that percent in the VAT summary, calculates with that rate, and stores the applied percent in `purchase_bills.vat_rate_percent`.
- Purchase bill linked read surfaces now exist for AP aging, stock ledger, trading matching, PO buy, outstanding PO, and supplier tracking.
- Legacy daily UI/reference exists under:
  - `old-apps/legacy/index.html`
  - `old-apps/vue/src/views/daily/`
- Prisma already has target models for:
  - `transfers`
  - `bank_statement`
  - `expenses`
  - `payments`
  - `receipts`
  - `bill_swap_history`
- Petty advance target tables added in `dev-target` and migration file:
  - `supabase/migrations/20260518052409_create_petty_advance_tables.sql`
  - Prisma models: `petty_advances`, `petty_advance_returns`

## Open Decisions

- Whether daily write permissions should use one temporary `finance.cash.manage` permission or split into transfer/expense/payment-specific permissions.
- Whether delete actions in legacy should become cancel/void actions in Next for financial traceability. Batch A currently avoids destructive delete actions.
- Petty advance `spent` is currently `0` in Next baseline until expense-to-advance allocation is wired.
- Payment approval persistence/print sheet is not fully ported yet; current Batch B is an actionable queue/read surface plus payment/receipt write APIs.
- Stock transfer uses `stock_ledger` directly; no separate header table has been created yet.
- Sales bill page remains read baseline. Purchase bill create/edit is active baseline but full void/reversal, PO remaining-qty reconciliation, and header/line table refactor are still pending.
- Whether purchase bill edit after payment should stay unrestricted in UAT, or require audit/re-approval for finance control.
