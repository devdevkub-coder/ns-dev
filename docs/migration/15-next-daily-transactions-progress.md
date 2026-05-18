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
| `/purchase/bills` | purchase bill flow | Placeholder | Batch D: purchase transaction header/lines; requires stock/AP reconciliation |
| `/sales/bills` | sales bill flow | Placeholder | Batch D/E: sales transaction header/lines; requires FIFO/profit permission |
| `/sales/stock-issue` | pending sale / issue flow | Placeholder | Batch E: stock issue before sales invoice |
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

Tasks:
- Do not start heavy bill rewrite until Batch A/B are stable.
- Split header/line behavior carefully and preserve existing business flow.
- Define reconciliation for bill count, totals, paid/received amounts, stock movements, and linked ledger rows.

### Batch E: Pending Sale / Stock Issue

Scope:
- `/sales/stock-issue`

Tasks:
- Implement after stock transfer and sales bill assumptions are stable.
- Reconcile issued stock against later sales invoice links.

## Current Status as of 2026-05-18

- Current git checkpoint before daily work: `65a42bc fix: simplify payment and remittance masters`.
- Planning checkpoint: `3b32499 docs: plan next daily transactions`.
- Batch A implementation checkpoint: `24ab600 feat: add daily cash expense baseline`.
- Batch B implementation checkpoint: `64bcde3 feat: add daily payment receipt baseline`.
- Batch C implementation checkpoint pending commit after this doc update.
- Next daily Batch A routes now have real Next pages and API routes.
- Next daily Batch B payment/receipt routes now have baseline pages and API routes.
- Next daily Batch C stock transfer/audit routes now have baseline pages and API routes.
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
