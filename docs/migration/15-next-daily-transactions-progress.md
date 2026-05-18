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
| `/daily/payment-approval` | `view-paymentApproval` | Placeholder | Batch B: approval workbench over AP and expenses |
| `/purchase/payments` | supplier payment flow | Placeholder | Batch B: payments + bank statement |
| `/purchase/receipt-vouchers` | receipt voucher flow | Placeholder | Batch B: purchase receipt voucher/print surface |
| `/sales/receipts` | customer receipt flow | Placeholder | Batch B: receipts + bank statement |
| `/daily/transfer` | `view-transfer` | Placeholder | Batch A: transfer CRUD + two-sided bank statement |
| `/daily/expense` | `view-expense` | Placeholder | Batch A: expense voucher list/form + VAT/WHT + payment status baseline |
| `/daily/petty-advance` | `view-pettyAdvance` | Placeholder | Batch A: petty cash/director advance baseline |
| `/daily/expense-dashboard` | `view-expenseDashboard` | Placeholder | Batch A2: read-only dashboard from expenses |
| `/stock/transfer` | stock transfer flow | Placeholder | Batch C: inventory movement with branch/warehouse reconciliation |
| `/daily/bill-swap-history` | `view-billSwapHistory` | Placeholder | Batch C: read-only bill supplier-change audit |

## Batch Plan

### Batch A: Cash / Expense Foundation

Scope:
- `/daily/transfer`
- `/daily/expense`
- `/daily/petty-advance`
- `/daily/expense-dashboard`

Tasks:
- Add real Next pages and client components.
- Add API routes under `/api/daily/...`.
- Use existing `transfers`, `bank_statement`, `expenses`, `expense_categories`, `accounts`, and related target tables where available.
- Create missing target tables only if required for petty advance, using additive migrations only.
- Preserve legacy side effects:
  - transfer writes two deterministic `bank_statement` rows
  - expense voucher keeps VAT/WHT/net pay fields traceable
  - petty advance tracks amount, spent, returned, remaining
- Add frontend search/filter/sort/pagination/count for normal page use.
- Add server-side validation for all writes.
- Add permission guard using `finance.cash.view`/future write permissions during transition.

Validation:
- `npm run prisma:generate --workspace @ns-scrap-erp/next` if Prisma schema changes
- `npm run type-check --workspace @ns-scrap-erp/next`
- `npm run lint --workspace @ns-scrap-erp/next`
- `npm run build`
- API/page smoke for touched routes
- DB spot check for bank statement rows created by transfer

### Batch B: Payment / Receipt Operations

Scope:
- `/daily/payment-approval`
- `/purchase/payments`
- `/purchase/receipt-vouchers`
- `/sales/receipts`

Tasks:
- Build approval queue from unpaid purchase bills and pending expense vouchers.
- Add payment/receipt pages using existing `payments`, `receipts`, `purchase_bills`, `sales_bills`, `suppliers`, `customers`, and `accounts`.
- Write bank statement rows deterministically where money actually moves.
- Keep print/export surfaces as follow-up unless legacy flow requires them for UAT.

Validation:
- AP/AR paid amount and remaining balance aggregate checks.
- Bank statement totals by ref type.

### Batch C: Stock Transfer and Daily Audit

Scope:
- `/stock/transfer`
- `/daily/bill-swap-history`

Tasks:
- Implement stock transfer page/API only after current stock ledger fields are mapped.
- Add read-only bill swap history first if table is already present.
- Define reconciliation query for stock movement count/quantity by product and warehouse.

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
- Next daily routes still resolve through placeholder catch-all.
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
- Petty advance target table/model still needs confirmation before implementation.

## Open Decisions

- Final naming for petty advance table: likely `petty_advances` plus optional return/allocation table if legacy behavior cannot fit existing expense/payment tables.
- Whether daily write permissions should use one temporary `finance.cash.manage` permission or split into transfer/expense/payment-specific permissions.
- Whether delete actions in legacy should become cancel/void actions in Next for financial traceability.
