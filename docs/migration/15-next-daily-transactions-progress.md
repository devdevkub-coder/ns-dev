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
- Done on 2026-05-27: added persistent `payment_approvals` snapshot flow for AP purchase bills.
- Done on 2026-05-27: `/daily/payment-approval` now writes approval snapshots and returns persisted `pending`/`approved` rows instead of UI-only selection state.
- Done on 2026-05-27: `/purchase/payments` now reads approved snapshots only and links payment rows back with `payments.payment_approval_id`.
- Done on 2026-05-27: approved AP rows become read-only in the approval UI and supplier-payment bank display prefers approval snapshot over supplier master live fields.
- Updated on 2026-05-28: `/purchase/payments` is the active queue surface and each approved row now has `ทำจ่าย` and `ยกเลิก`. This `ยกเลิก` cancels the queued payment item before payment and returns the bill to `/daily/payment-approval`.
- Updated on 2026-05-28: payment history remains read-only, but the business model is now “one payment item, many statuses”. Snapshot history must keep cancelled rows too, not only successful posted vouchers.
- Done on 2026-05-28: `/api/purchase/payment-history` now includes `payment_approvals.status='voided'` rows with no linked payments as `ยกเลิกแล้ว` snapshots, so cancelling a queued payment item from `/purchase/payments` produces visible history without fabricating a payment row.
- Done on 2026-05-28: `payment_approvals` now separates UUID `id` from user-facing `doc_no`. Approval snapshots use `PMA{branchCode}{YYMM}-NNNN`, and each new approval cycle must create a new `PMA` number. Cancelled approval snapshots stay in history as their own rows with status `ยกเลิกแล้ว`; re-approving the same bill later must create a fresh approval snapshot with a fresh `PMA`, not reuse the old `doc_no`.
- Done on 2026-05-28: local dev-target applied `20260528190000_restore_payment_approval_doc_no_unique.sql`. Duplicate PMA rows from the temporary reuse experiment were renumbered safely and `payment_approvals.doc_no` is unique again at the database level.
- Clarified on 2026-05-28: re-approving after `ยกเลิกรายการรอจ่าย` must rebuild the approval snapshot from current `purchase_bills` + current selected destination bank account, not by cloning the cancelled `payment_approvals` row.
- Clarified on 2026-05-28: the `ยังไม่อนุมัติ` queue is live data, not snapshot data. Editing a purchase bill before approval must update the queue immediately, and any approval created after a cancel must still snapshot from the latest bill state.
- Done on 2026-06-08: enforced purchase-bill locking after approval/payment-cycle start. `PATCH /api/purchase/bills` rejects edit/cancel when the source PB has active `payment_approvals.status in ('approved','paid')` or any non-cancelled `payments` row, and the list disables `แก้ไข` / `ยกเลิก` from the same server-derived lock flags.
- Done on 2026-06-08: fixed PMT save collision after cancelled payment splits. `PMA012606-0012/2` exposed that cancelled `PMT012606-0002` left reversed `payment_account_splits` rows for `BST2606-0002` / `BST2606-0003` while the actual `bank_statement` rows were removed, so the next PMT reused `BST2606-0002` and collided with unique `payment_account_splits.split_key`. PMT bank-statement numbering now considers historical split `bank_statement_doc_no` values, locks `bank_statement.doc_no` during PMT statement number generation, and writes split keys as `PMTSPLIT-{PMT doc no}-{BST doc no}`.
- Done on 2026-06-08: superseded visible PMA suffix numbering. Split approval items no longer stamp `PMA.../1`, `PMA.../2`, etc. The approval POST path now allocates a consecutive set of normal running PMA doc numbers for the split count and stores each split as its own `PMA{branchCode}{YYMM}-NNNN` document. The generator remains backward-compatible when scanning existing historical suffix rows.
- Ops checkpoint on 2026-06-08: dev-target transaction/document data was cleared after the PMA/PMT numbering fixes. The cleanup used a transaction-table whitelist only, checked FK cascade scope before execution, and verified all 51 cleared transaction tables returned `0` rows afterward while master data counts remained intact. This intentionally removes old test PMA suffix rows from dev data rather than adding runtime compatibility for them.
- Done on 2026-06-08: `/purchase/bills` now has the complete payment-workflow segmented filter for `ยังไม่อนุมัติ`, `รอจ่าย`, `ชำระบางส่วน`, `เสร็จสิ้น`, and `ยกเลิก`. API/UI/export share one derived state model: `cancelled -> paid -> partial_paid -> pending_payment -> pending_approval`, where `partial_paid` comes from real PMT/payment activity while `payable_balance` remains, and partial ADV allocation with remaining payable stays in `ยังไม่อนุมัติ`.
- Closed batch on 2026-06-08: the purchase-bill list now uses workflow status as the main `สถานะเอกสาร` column, shows related `PMA / PMT` doc numbers, filters by the same derived workflow state, sorts status by workflow rank, and calculates list/export totals after workflow filtering.
- Done on 2026-06-08: `/daily/payment-approval` once again exposes cancelled queued approval items. The API includes `payment_approvals.status='voided'` in the approval workbench read model, the UI adds filter/status `ยกเลิกแล้ว`, and pending source rows do not subtract voided PMA amounts.
- Done on 2026-06-08: `/daily/payment-approval` status filter now follows the shared list-page segmented filter design from `docs/design.md`: `สถานะ:` label, `ทั้งหมด` reset segment first, slate active/inactive styling, default active `ยังไม่อนุมัติ` queue, and multi-select toggle behavior for `ยังไม่อนุมัติ`, `อนุมัติแล้ว`, and `ยกเลิกแล้ว`. This is a UI filter behavior/design alignment; the payment approval API contract is unchanged.
- Done on 2026-06-08: `/purchase/payments` waiting-payment queue now follows the shared list-page visual baseline from `docs/design.md`: white KPI cards, compact `h-9` search/sort controls, clear filter only when PMA search/sort is active, page controls matching the page-size selector height, shared loading/empty padding, and lucide copy/check icons for account-copy actions. This is a UI-only design alignment; the supplier payment API, PMA queue model, and PMT settlement validation are unchanged.
- Done on 2026-06-09: `/purchase/payment-history` now follows the shared filter/table baseline for the payment-history surface: search/date/account filters sit in the white filter shell, clear filter appears only when active, status uses the slate segmented style with user-facing statuses `จ่ายแล้ว` and `ยกเลิก`, table loading/empty padding matches the shared baseline, and the `รายละเอียด` row button/action column was removed for payment rows. Clicking a payment-history row now opens an in-page detail modal on the table page, backed by `/api/purchase/payment-history/{PMT/PMA doc no}`. The user-facing `/purchase/payments/{id}` detail page is removed, `voucher_id` is not displayed or used in outward URLs, voided PMA history rows without PMT fall back to a PMA snapshot modal, and PMT/PMA timelines follow the `/purchase/po-buy` `ประวัติ POB` latest-first pattern.
- Done on 2026-06-09: ประวัติการจ่ายเงินถูกย้ายเข้า `/purchase/payments` เป็นแท็บ `ประวัติ` ข้างแท็บ `จ่ายเงิน Supplier`. แท็บรอจ่ายยังใช้ `/api/purchase/payments`; แท็บประวัติยังใช้ read-model `/api/purchase/payment-history`; route เก่า `/purchase/payment-history` redirect ไป `/purchase/payments?tab=history`; sidebar เอาเมนูประวัติแยกออกเพื่อให้ผู้ใช้เข้าจุดเดียว.
- Done on 2026-06-08: `/purchase/advance-payments` status model now supports `อนุมัติแล้วบางส่วน` (`partially_approved`) when active PMA covers only part of the ADV amount, and removes `รอคืนเงิน` / `คืนเงินแล้ว` from the runtime status set and list filter. Migration `20260608093000_add_supplier_advance_partially_approved_status.sql` normalizes old refund statuses out of `supplier_advance_payments.status`, recalculates current rows from active PMA/PMT/allocation facts, and hardens the check constraint to `pending_approval`, `partially_approved`, `approved`, `paid`, `partially_allocated`, `allocated`, and `cancelled` only.
- Flow-doc sync on 2026-06-08: `Payment Flow` and `Supplier Advance Payment Flow` Mermaid diagrams now show the ADV partial-approval branch, void PMA recalc, cancel PMT re-approval loop, allocation outcomes, and the Supplier refund future-flow boundary outside the active ADV status/filter set.
- New analysis/design batch on 2026-05-28: add `advance payment / deposit` support to Purchase Flow. Needed behavior: create advance-payment transactions before final purchase bill, then let `/purchase/bills` select and allocate those advance entries so the bill’s remaining payable is reduced before it enters `/daily/payment-approval`.
- Clarified on 2026-05-28: after creating a purchase bill with allocated advance payments, the bill should stay `ยังไม่อนุมัติ` only when net payable remains. If advances fully cover the bill, the bill should become `เสร็จสิ้น` immediately and skip payment approval.
- Clarified on 2026-05-28: over-advance is not treated as carry-forward supplier credit in the target system right now. Excess advance above the final bill amount must be refunded first; using it to offset another bill stays outside the system for now.
- Clarified on 2026-05-28: this over-advance refund must live in a Supplier-specific refund flow/menu, not in the customer/sales refund menu.
- Clarified on 2026-05-28: advance-payment creation must support large-scale source fields (large-scale doc no, in/out dates, plate, optional vehicle photo, customer, product, in/out/net weights, price per kg, operator/sender/driver, and advance amount). The resulting advance-payment item must then enter the same approval queue, which should now be named `อนุมัติจ่ายเงิน`.
- Clarified on 2026-05-28: this approval surface must be treated as `อนุมัติจ่ายเงิน` conceptually because one queue now needs to accept `บิลรับซื้อ`, `จ่ายเงินล่วงหน้า / มัดจำ`, and `ค่าใช้จ่าย`.
- New requirement on 2026-05-28: approval must support split items in one cycle. A single payable source can be split into many approval rows by payment method/account; each split must create its own `payment_approvals` row and then appear as its own queued row in `/purchase/payments`.
- Documentation split on 2026-05-28: `docs/notes/Payment Flow.md` is now the canonical note for payment approval, queued payment items, payment history, advance payment, and supplier advance-refund rules. `docs/notes/Purchase Flow.md` remains canonical for purchase-side source documents and bill-state rules.
- Implementation slice on 2026-05-28: `/purchase/advance-payments` now starts the active `ADV` document surface for supplier deposit / advance payment capture. The first additive DB slice creates `supplier_advance_payments` and `supplier_advance_allocations`, and the page/API captures Supplier, branch, payment method/account intent, amount, and large-scale source fields. Payment posting, purchase-bill allocation, and supplier refund remain follow-up tasks.
- Vehicle-photo input follow-up on 2026-05-29: `/purchase/advance-payments` now uses a browser file picker for `รูปภาพรถ` instead of a URL textbox. This slice stores selected filenames in `supplier_advance_payments.vehicle_photo_names`; it does not upload binaries to Supabase Storage yet.
- Date-time input follow-up on 2026-05-29: `/purchase/advance-payments` now captures `วันที่เข้า` and `วันที่ออก` as day + time fields with default values set to the moment the create form opens. `supplier_advance_payments.in_date` and `out_date` were upgraded from `date` to `timestamptz` so the entered time is preserved on save in the target schema/API.
- Detail/edit/cancel follow-up on 2026-05-29: `/purchase/advance-payments` list rows now open a detail modal with document summary, allocation usage, and timeline. The page now supports editing and cancelling ADV rows that are still mutable, and `/api/purchase/advance-payments/[id]` was added for read/update/cancel plus audit-timeline retrieval. Rows already allocated/paid/cancelled remain locked with user-visible reasons.
- Timeline follow-up on 2026-06-06: `/purchase/advance-payments` now uses dedicated `supplier_advance_status_logs` and `supplier_advance_allocation_logs` for the ADV detail timeline. Create/edit/cancel, PMA approve/void, PMT paid/reversed, and PB allocation/release paths append business events, while the read model no longer treats `app_audit_logs` or active `supplier_advance_allocations` as the timeline source of truth.
- Rule update on 2026-05-29: ADV rows are now editable/cancellable only while status is `pending_approval` (`ยังไม่อนุมัติ`). Approved ADV rows are read-only even if they have not yet been allocated or paid.
- Done on 2026-05-29: active wording/menu now uses `อนุมัติจ่ายเงิน` on the Next surface instead of `อนุมัติโอนเงิน`.
- Superseded by 2026-06-08 ADV status recalc: newly approved ADV rows no longer blindly set `supplier_advance_payments.status='approved'`; they derive `partially_approved` or `approved` from active PMA totals, and later PMT/allocation facts can derive `paid`, `partially_allocated`, or `allocated`.
- Superseded by 2026-06-08 ADV status recalc: cancelling/voiding a queued PMA item for `advance_payment` now recalculates the source ADV from active PMA/PMT/allocation facts, so it can return to `pending_approval` or remain `partially_approved` if another active PMA still covers part of the amount.
- Done on 2026-05-30: `/daily/payment-approval` summary tables no longer expose checkbox selection, destination-bank column, or inline `ยอดที่จะจ่าย` editing in the grid. Users now open a row-level detail modal from the table; the AP modal carries the single-row `ยอดที่จะจ่าย` field plus `อนุมัติรายการนี้`, while expense rows open as read-only approval detail for now.
- Done on 2026-05-30: the AP modal on `/daily/payment-approval` now supports true split approval items. Pending source rows can be split into many destination lines, each with its own approved amount and destination choice. Destination options now include supplier bank-account destinations plus a cash option when the payment-method master has an active cash method.
- Done on 2026-05-30: `/api/daily/payment-approval` no longer accepts a flat one-row approval payload only. The API now accepts one source document plus many split rows, validates the summed approved amount against the remaining pending balance, and creates one `payment_approvals` row per split item inside the same approval cycle.
- SUPERSEDED on 2026-06-08: the 2026-05-30 rule that split approval items receive visible PMA suffixes like `PMA.../1`, `PMA.../2` is no longer current. Split rows still appear as separate approval items, but new rows must use normal running PMA numbers without suffixes.
- Done on 2026-05-30: `/purchase/payments` waiting-payment list now shows the PMA item doc no as the primary queue document and keeps the source purchase-bill doc no as secondary reference text, so split approvals from one bill stay distinguishable before `ทำจ่าย` or `ยกเลิก`.
- Done on 2026-05-30: `/daily/payment-approval` now also reads `payment_approvals.status='voided'` into the approval workbench. Cancelled approval items show under a dedicated `ยกเลิกแล้ว` filter as read-only snapshot rows, while pending balances still subtract only active `approved` items so cancelled splits return their amount to the pending queue correctly.
- Correction note on 2026-05-30 after checking the canonical Purchase Flow again: queued-item cancel in `/purchase/payments` is still required. `PMA final / no queued-item cancel` is not the current rule.
- Done on 2026-05-30: restored the queued-item cancel path in active code. `/purchase/payments` now shows `ทำจ่าย` + `ยกเลิก`, `/api/purchase/payments/cancel-approved` voids approved queue items that have no payment yet, and `/api/purchase/payment-history` again synthesizes `ยกเลิกแล้ว` history rows from `payment_approvals.status='voided'`.
- Done on 2026-05-30: `Purchase Flow.md` state/use-case matrix is corrected back to the queue-cancel model. `/purchase/payments` remains the waiting-payment queue, but it still allows cancelling the queue item before payment execution.
- Browser smoke required on 2026-05-30 after the correction, superseded route wording on 2026-06-09: verify `PMA approved -> /purchase/payments -> ยกเลิก -> source returns to /daily/payment-approval -> /purchase/payments?tab=history shows ยกเลิก`.
- Done on 2026-05-29: `MoneyMovementPageClient` no longer hardcodes `เงินสด / โอน / เช็ค / PromptPay` for `/purchase/payments` and `/sales/receipts`. Both routes now read payment-method options from `public.payment_methods`, and the customer receipt form now uses a payment-method select sourced from that master instead of a free-text field.
- Done on 2026-05-31: `/sales/receipts` receipt-mode layout in `MoneyMovementPageClient` was cleaned up to match the active design shell. The page no longer renders a duplicate in-body Receipt Voucher action row; the `+ รับเงิน Customer` CTA now sits in the white filter toolbar, compact toolbar controls use the shared sizing baseline, and the receipt history count/pagination row now lives inside the same white table shell above the list.
- Done on 2026-06-08: `/sales/receipts` now splits receipt entry and receipt history into tabs. The `รับเงิน Customer` tab shows the compact create action, while `ประวัติการรับเงิน` keeps the existing history filters, pagination, and table without changing the sales receipts API contract.
- Done on 2026-06-08: `/daily/transfer` modal now hides auto-managed `เลขที่`, auto date, and `ผู้ทำรายการ` fields. The transfer date remains auto-filled in the existing payload, and `ผู้ทำรายการ` continues to come from authenticated `created_by`; the page adds standard count/page-size/pagination above the table and modal field-level validation focus while preserving the `/api/daily/transfers` write contract.
- Done on 2026-06-08: `/daily/transfer` modal account selects now show the current balance in each `บัญชีต้นทาง` / `บัญชีปลายทาง` option label, matching the supplier payment modal pattern `ชื่อบัญชี (คงเหลือ ...)`. The outer list filters keep account-name-only labels.
- Done on 2026-06-08: `/daily/transfer` modal `จำนวนเงิน` and `ค่าธรรมเนียม` now follow the design money input pattern with editable draft text while focused and formatted money display on blur. `หมายเหตุ` is now a textarea instead of a single-line input.
- Fixed on 2026-06-08: `/api/daily/transfers` save now generates both `TRF` and paired `BST` document numbers through the active transaction client (`tx`) instead of the global Prisma client, preventing the local/dev single-connection transaction failure that surfaced as `POST /api/daily/transfers 400` when pressing save.
- Done on 2026-06-08: `/daily/transfer` table rows now open a transfer detail modal with summary amounts, source/destination accounts, note, actor, and paired Bank Statement impact. Row action buttons stop propagation, and the disabled destructive action is now labelled `ยกเลิก` instead of `ลบ` until a reviewed reversal flow exists.
- Done on 2026-05-29: supplier payment-account rendering in `/purchase/payments` no longer branches on a direct `เงินสด` string check. Account visibility now follows payment-method grouping resolved from the active `payment_methods` master, matching the supplier master-data cleanup already applied elsewhere.
- Done on 2026-05-29: `/daily/payment-approval` removed its hardcoded payment-method fallback for destination account rows, so the queue no longer displays a baked-in transfer method when snapshot/master data is available.
- Done on 2026-05-30: `/daily/expense` create/edit modal no longer exposes `เลขที่เอกสาร`, `วันที่เอกสาร`, or helper hint copy before save. Superseded on 2026-06-08 for date only: the document number remains generated server-side at save time, while `วันที่จ่าย` is now user-editable and submitted through `expenseFormSchema.date`.
- Done on 2026-05-31: `/daily/expense` status model is normalized to the ADV-style workflow vocabulary `pending_approval`, `approved`, `paid`, `cancelled`. The page/API/filter/export/detail now read and write document `status` as the primary business state, while `paid_status` is kept only as a compatibility mirror (`paid` vs `unpaid`) for downstream legacy queries.
- Done on 2026-06-07: `/daily/expense` create/edit modal now supports legacy-style multi-line `รายการค่าใช้จ่าย` with per-line VAT/WHT amounts, keeps the status field out of create mode, shows active `หมวดค่าใช้จ่าย` choices directly without a separate `ประเภทค่าใช้จ่าย` dropdown, and moves `สรุปก่อนบันทึก` from the right-side column to a bottom four-tile summary so the modal can widen to `max-w-6xl` and give the line table more horizontal space. The change preserves the existing save contract by storing line detail in `expenses.items` and header totals in `amount`, `vat`, `wht`, and `net_amount`.
- Superseded on 2026-06-08: the 2026-06-07 `/daily/expense` payee lookup that suggested Customer, Supplier, Sale, and employee names is no longer current. The create/edit payee suggestions now come from active Supplier master rows only, while saving continues to write the selected/manual text value to `expenses.payee`.
- Done on 2026-06-07: `/daily/expense` create/edit modal no longer shows `บัญชีที่ใช้ทำจ่าย`; account selection remains outside this modal and existing account values can still appear in the list/filter read surface.
- Fixed on 2026-06-08: `/api/daily/expenses` create now generates the new `EXP` doc no through the active transaction client and locks `expenses.doc_no` with `pg_advisory_xact_lock`, preventing the local/dev single-connection transaction deadlock pattern that surfaced as a save failure on `/daily/expense` after transaction data was cleared.
- Done on 2026-06-08: `/daily/expense` line-item `หมวดค่าใช้จ่าย` now uses the shared searchable combobox, so users can type-search category code/name/type text inside the multi-line modal while the payload continues to submit the existing optional `lines[].categoryId` value.
- Done on 2026-06-08: `/daily/expense` create/edit modal now shows required `วันที่จ่าย` and submits it through the existing `expenseFormSchema.date` field. `/api/daily/expenses` uses that selected date for `expenses.date` and new `EXP` year/month sequencing, while the document number itself remains generated server-side at save time.
- Done on 2026-06-08: `/daily/expense` list now labels the table date column as `วันที่จ่าย` and makes each row clickable to the existing `/daily/expense/{docNo}` detail page. Inline `แก้ไข` / `ยกเลิก` buttons keep their current behavior by stopping row navigation.
- Docs/flow sync on 2026-06-08: `REQUIREMENTS_TARGET_SYSTEM.md` and `docs/notes/Payment Flow.md` now document the current `EXP` source rules: user-selected `วันที่จ่าย`, server-owned EXP doc number, multi-line expense items, searchable categories, VAT/WHT totals, approval/payment-owned status transitions, row-click detail navigation, and pending-only edit/cancel behavior.
- Done smoke on 2026-05-29: local validation passed (`npm run type-check --workspace @ns-scrap-erp/next`, `npm run lint --workspace @ns-scrap-erp/next`, `npm run build --workspace @ns-scrap-erp/next`, `git diff --check`) and browser smoke passed for `/purchase/payments`, `/sales/receipts`, and `/daily/payment-approval`.
- Open task batch on 2026-05-28 for approval-item implementation:
  - rename active wording/menu to `อนุมัติจ่ายเงิน`
  - add advance-payment source documents into the same queue design
  - redesign `/daily/payment-approval` so one source row can produce many split approval items
  - update `/api/daily/payment-approval` to persist one row per split item
  - update `/purchase/payments` to operate at approval-item level
  - verify bill lock/unlock semantics when some split items are cancelled or paid
- New documentation follow-up on 2026-05-28: `docs/notes/Purchase Flow.md` now needs to be treated as the canonical state/use-case matrix for purchase AP flow, covering at least `ยังไม่อนุมัติ`, `รอจ่าย`, `ยกเลิกรายการรอจ่าย`, `อนุมัติใหม่`, `จ่ายสำเร็จ`, and the resulting edit/cancel lock rules on purchase bills.
- Done smoke on 2026-05-27: local browser/API path verified `PB012605-0035 -> PMA012605-0001 -> PMT012605-0291`; after payment the approval row left both `/daily/payment-approval` and `/purchase/payments`, DB showed `payment_approvals.status='paid'`, and `purchase_bills.payable_balance` reached `0`.
- Done on 2026-05-27: purchase flow is now treated as closed through supplier payment history for the AP purchase-bill path. The next batch should verify inbound-stock behavior end-to-end: `WTI -> Purchase Bill -> stock_ledger -> stock balance`, plus `cancel Purchase Bill -> reverse stock`.
- Done on 2026-05-27: created `docs/notes/Purchase Flow Test Matrix.md` as the dedicated QA/UAT checklist for Purchase Flow. Use this note for executing and recording use cases instead of expanding `Purchase Flow.md`, which remains the business/dependency decision document.
- New follow-up batch required on 2026-05-28 for purchase payment history hardening:
  - Done baseline, wording superseded on 2026-06-09: history page includes explicit status filters; current visible filters are `ทั้งหมด`, `จ่ายแล้ว`, and `ยกเลิก`.
  - Done baseline: history remains read-only.
  - Done/superseded wording on 2026-06-09: cancelled queue items from `/purchase/payments` persist into the same history surface as `ยกเลิก` snapshots.
  - Follow-up: keep any later re-approve/re-pay as a new voucher/payment row rather than overwrite the cancelled one.
  - Follow-up: audit downstream accounting/bank-posting/report queries and confirm they consume only successful payment rows everywhere, not just in the purchase-payment surfaces.
- Remaining follow-up block for payment approval workflow:
- Remaining correction block after 2026-05-30 decision:
  - Verify all remaining write/read paths no longer depend on `payment_approvals.status='voided'`.
  - Re-test lock semantics with the new rule `approved PMA is final`.
  - Done on 2026-06-08: `/purchase/payments` now reads valid approved PMA items from `purchase_bill`, `advance_payment`, and `expense` sources, and PMT save still requires full settlement of every selected PMA.
  - Done on 2026-06-08: `/purchase/payments` Payment Voucher modal now uses React/Zod validation instead of browser-native blocking, so missing `บัญชีจ่าย` or split-total mismatch is shown inside the modal. `PMA012606-0011/2` was checked in dev-target as approved/unpaid against `ADV012606-0001`; expected settlement at the default 3% WHT is cash 1,940.00 + WHT 60.00 = PMA 2,000.00.
  - Done on 2026-06-08: expense-side approval write flow is enabled in `/api/daily/payment-approval`; `EXP` approvals create `PMA approved` snapshots and appear in the payment queue/history flow.
  - Done on 2026-06-08: `/api/purchase/payment-history` includes expense PMA voided snapshots and resolves paid EXP PMT rows from `payment_approvals.party_name_snapshot` when `payments.supplier_id` is null.
  - Done on 2026-06-08: cancelling a PMT now refreshes EXP source payment state through `expenses.status`, `expenses.paid_status`, and `expenses.paid_at`, so reversed EXP amounts return to the source-derived pending approval model.
  - Deeper browser smoke is still required for: split approve one source end-to-end -> PMA item rows show in `อนุมัติแล้ว` -> `/purchase/payments` shows matching PMA item rows -> save/cancel PMT updates queue/history correctly.
  - Add print payload/view for `ใบอนุมัติโอนเงิน` from approval snapshot.
  - `ReceiptVouchersPageClient` print preview still has a user-visible fallback text `รับเงินสด` when `receipt_vouchers.payment_method` is blank; keep this as the next payment-method cleanup batch before broader cash/bank inference work in dashboard/calendar surfaces.
  - Legacy compare checkpoint (from `old-apps/legacy/index.html`):
    - Legacy stores approvals in `db.paymentApprovals`.
    - Legacy row shape is minimal: `id`, `refType`, `refId`, `approvedAmount`, `status`, `approvedBy`, `approvedAt`, `note`.
    - Legacy supports direct `unapprove()` by deleting the approval row; target policy is stricter and should not expose unapprove as a normal user path.
    - Legacy print sheet reads live supplier bank account fields; target policy must upgrade this to snapshot-driven printing.

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
- Done on 2026-05-31: realigned `/stock/transfer` to the active design shell. The page now uses the shared filter/action row, count + page-size + pagination row above the table, the shared lined table, and a larger sectioned create modal instead of the earlier compact local modal layout.
- Done on 2026-05-31: stock transfer create validation now follows the central required-field error pattern from `docs/design.md` with red field state, inline error text, and focus on the first invalid field after submit.
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
- Follow-up on 2026-06-07: `/purchase/bills` now filters by active branch through the standard searchable `ทุกสาขา` control and sends the outward branch code to the server-side list/export query. The list and Excel export also expose `เลขที่ใบรับของ` from the unique WTI document references stored on purchase-bill items.
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
- Follow-up update on 2026-05-29: purchase-bill supplier options now also carry the supplier master caretaker name, and the blue `WTI` summary strip in `/purchase/bills` shows `ผู้ดูแล` after users pick supplier + receipt. Source of truth is `suppliers.sales_rep`, with `salespersons` lookup fallback from `sales_id`.
- Follow-up update on 2026-05-29: removed the purchase-bill VAT physical-invoice receipt block from the `/purchase/bills` modal UI. The form still computes VAT totals, but it no longer asks or shows guidance about having received the paper tax invoice.
- Follow-up update on 2026-05-29: the stock purchase validation issue `ราคา/กก. ต้องมากกว่า 0` now points to `items.N.price` instead of the whole item list, so `/purchase/bills` highlights the exact price input in red and auto-focuses that field on save.
- Follow-up update on 2026-05-29: the shared transaction-bill field helpers were tightened so validated fields use the same submit-fail pattern more broadly: red field state, inline error text, and focus by `data-error-key`. `docs/design.md` now records this as the active cross-form validation convention, not just a page-local fix.
- Follow-up update on 2026-05-30: `PoBuyPageClient` no longer loses server-side validation context on save. `dailyFetchJson()` now preserves API `fieldErrors` through `ApiError`, and the PO Buy form catches those `400` responses to mark the exact field in the modal instead of leaving the user with only a generic failed request banner.
- Follow-up update: purchase bill document number is no longer user-editable in the create modal. `/api/purchase/bills` now generates `PB{branchCode}{YYMM}-{runningNo}` at save time only inside a DB transaction, uses `pg_advisory_xact_lock` to serialize new purchase bill number assignment, returns the generated `docNo`, and retries on `doc_no` unique conflict.
- Follow-up update: purchase bill document number format now includes branch code. Branch codes are normalized as `01 = สมุทรสาคร` and `02 = นครสวรรค์`, so examples look like `PB012605-3074`. The running number continues from the highest purchase bill running number in that month, including both old `PB2605-####` and new `PB012605-####`/`PB022605-####` formats.
- Follow-up update: added additive unique indexes for `purchase_bills.doc_no` and `sales_bills.doc_no`. Migration fails fast if duplicate document numbers already exist; it does not delete or merge data. Dev-target purchase bills were reconciled on 2026-05-18 by backing up all current rows, setting all current purchase bills to `BR002/WH002` (สมุทรสาคร), and renumbering them to unique `PB012605-0001` through `PB012605-0409`; unique indexes were then applied successfully.
- Follow-up update: purchase bill table rows now open `/purchase/bills/[id]` detail page. Detail page reads `supplier_id` as the FK and displays supplier name from master data relation `suppliers.name`; transaction rows should keep FK/id and not store ad hoc supplier display text as the source of truth.
- Follow-up update: purchase bills can now be edited from the `/purchase/bills` table even when supplier payments already exist. This intentionally differs from the old legacy lock rule. Edit keeps existing `payments` untouched, recomputes `paid_amount`, `payable_balance`, and `status` from payment rows, and regenerates `stock_ledger.ref_type = PB` for `STOCK` bills only.

Important boundary:
- Current create/edit path writes `purchase_bills` header + `purchase_bill_items` relational line rows, updates AP balance fields, and writes `stock_ledger` rows for `STOCK` bills. The old `purchase_bills.items` JSONB column has been removed from the target schema.
- Product master no longer exposes stock receipt status (`products.item_status`) or `ประเภทคลังที่จะรับเข้า`. Purchase bill `STOCK` create/edit must not read stock category from product master; stock ledger `output_category` comes from the transaction write path.
- Warehouse master still has `warehouses.type` with RM/WIP/FG/SCRAP choices as master metadata. Purchase bill stock routing is branch RM based: the warehouse field is auto-selected from the selected branch's RM warehouse and locked, and the API writes that warehouse to `purchase_bills.warehouse_id` and `stock_ledger.warehouse_id`.
- DB migration apply is pending. `supabase migration list --db-url "$SUPABASE_DB_URL"` on 2026-05-23 showed remote-only migration `20260519044843` plus multiple local-only migration history gaps, so dev-target needs migration history repair/pull before `20260523000100_add_warehouse_type.sql` can be pushed cleanly.
- `TRADING` remains a PB document but does not create stock ledger.
- Purchase flow requirement clarified on 2026-05-25: inbound weighing/receiving is the business `ใบรับของ / Weight Ticket In` with document number `WTI{branchCode}{YYMM}-NNNN` for Stock purchases only. Outbound delivery uses `ใบส่งของ / Weight Ticket Out` with document number `WTO{branchCode}{YYMM}-NNNN`. There is no plain `WT` document number. Stock purchase bills must come from `WTI` and may be PO or Spot/No PO; Trading purchase bills do not use `WTI`, require quantity/weight entry in `/purchase/bills`, do not create stock ledger, and cut PO only for Trading + PO. The target design must support many-to-many allocation: one `WTI` can cut multiple PO, and one PO can have multiple `WTI`.
- Purchase bill stock form follow-up on 2026-05-25: `/purchase/bills` now treats the selected `WTI` as a locked upstream context. After choosing WTI in `STOCK`, the form disables `ประเภทบิล`, `สาขา`, `ผู้ขาย`, and `ใบรับของ`; users must explicitly click `ล้างใบรับของ` to reset downstream data before changing those fields. This replaces the older silent-reset behavior that risked inconsistent form state.
- Purchase bill pricing follow-up on 2026-05-25: in the `รายการจากใบรับของ` table, choosing `PO Buy` now auto-fills `ราคา/กก.` from `po_buys.unit_price` and locks the price field against manual edits. Choosing `Spot Buy` leaves the price editable. The same WTI table no longer renders a line-level discount field; stock receipt lines calculate row totals directly from `qty * price`, while only `ส่วนลดท้ายบิล` remains editable at the bill level.
- Purchase bill WTI allocation update on 2026-05-26: after moving receipt sourcing to `WTI product summaries`, `/purchase/bills` now supports split-allocation within one product summary. One `receiptSummaryId` can expand into multiple bill rows, users see in-form PO remaining after draft allocations, and can continue the same WTI product with another `PO` or `Spot Buy`. Business rule was then clarified further: `Spot Buy` must not force the remaining WTI weight to be billed in the same purchase bill. Partial save is valid, and the system should only block over-allocation against WTI remaining or PO remaining; WTI state then moves among `รับของแล้ว`, `ออกบิลแล้วบางส่วน`, and `เสร็จสิ้น` according to real active-bill usage.
- Purchase bill allocation/data-model checkpoint on 2026-05-26: the next schema step was completed. `purchase_bill_receipt_allocations` and `purchase_bill_po_allocations` now exist as explicit fact tables for WTI-summary usage and PO cuts; `/api/purchase/bills` create/edit/cancel writes them and refreshes WTI from those facts. `/purchase/bills/[id]` now renders `สรุปต่อสินค้า` above `รายละเอียด allocation รายแถว` and shows explicit trace from WTI document, WTI summary, and PO/Spot source.
- PO Buy hardening checkpoint on 2026-05-26: `/purchase/po-buy` now reconciles header remaining/status from active `purchase_bill_po_allocations`, not only cached header values. Additive schema now includes short-close metadata on `po_buys` and append-only `po_buy_status_logs`. The UI/API support `ปิดรับไม่ครบ`, expose the new status in filters/detail, and show status history in the detail modal. `/api/purchase/bills` now reconciles referenced PO before validate/save and after create/edit/cancel, so fully used or short-closed PO stop appearing in PO selection immediately.
- Browser smoke on 2026-05-26: authenticated local-browser verification passed for `WTI -> PB partial`, `WTI -> multiple PB`, and `cancel PB -> recalc WTI`. The tested local path used `WTI012605-0002`, created `PB012605-0415` (PO partial) and `PB012605-0416` (Spot partial), verified WTI state/doc references after each save, then cancelled both PBs and confirmed WTI returned to `รับของแล้ว`.
- WTI status wording update on 2026-05-26: inbound `WTI` no longer collapses partial/full billing together in the UI. The list/detail flow now treats `received = รับของแล้ว`, `partially_billed = ออกบิลแล้วบางส่วน`, and `billed = เสร็จสิ้น` as separate states so office can distinguish usable partial receipts from fully billed receipts.
- Purchase bill cancel behavior update on 2026-05-26: PB cancel now has an explicit design rule in docs. The intended behavior is status+stock reversal plus receipt recalculation, not field-by-field writeback. After cancelling a PB with no payments, the system should recalculate referenced `WTI` and `weight_ticket_product_summaries` from the remaining active purchase bills so receipts move back to `รับของแล้ว`, `ออกบิลแล้วบางส่วน`, or stay `เสร็จสิ้น` according to real remaining usage.
- WTI data-layer implementation follow-up on 2026-05-26: `WTI/WTO` now has a concrete repo-level three-layer design and implementation path. New schema objects `weight_ticket_product_summaries` and `weight_ticket_product_summary_lines` were added to Prisma plus migration SQL `20260526103000_create_weight_ticket_product_summaries.sql` with backfill logic from existing `weight_ticket_lines`. `/api/daily/weight-tickets` now rebuilds per-product summaries on save/update, and `/api/purchase/bills` now reads/validates `WTI` by summary rows so same-product lots in one receipt become one operational purchase-bill row with aggregated weight. Remaining operational gap: this migration has not yet been applied to the active `dev-target` DB from the current shell because the local Supabase CLI context is not linked to that project.
- WTI/WTO persistence update on 2026-05-25: `/daily/weight-tickets` now writes real records to `/api/daily/weight-tickets` backed by `public.weight_tickets` and `public.weight_ticket_lines`. Document number, document date/time, and entered-by are still generated on save only. `/daily/weight-ticket-list` now reads the real API, no longer uses sample/localStorage fallback rows, and supports detail modal actions `แก้ไข` / `ยกเลิก` until the document is referenced by purchase/sales bill allocation.
- WTI/WTO vehicle-image follow-up on 2026-05-25: the form now places `รูปภาพรถส่งของ` beside `ทะเบียนรถ`, stores vehicle image names separately from product-line image names in persisted weight-ticket tables, opens newly uploaded images in a preview dialog, keeps existing filenames visible during edit, and hides the deduction value input when the line deduction mode is `ไม่หัก`.
- WTI/WTO DB hotfix on 2026-05-25: after confirming runtime error `42P01 relation "public.weight_tickets" does not exist`, additive SQL `supabase/migrations/20260525103000_create_weight_tickets.sql` was applied directly to the active dev DB so `/api/daily/weight-tickets` can load successfully.
- Sales-side WTO design follow-up on 2026-05-26: `docs/notes/Sales Flow.md` now treats `WTO` as the outbound source document on the sales side with a dedicated sequence `WTO -> Sales Bill -> Receipt`, an explicit use-case map, and the target business statuses `ส่งของแล้ว`, `ออกบิลแล้ว`, and `ยกเลิก`. Once a `WTO` is used to create a sales bill, the target policy is to lock edit/cancel and show `ออกบิลแล้ว`.
- WTI mobile form stability follow-up on 2026-05-26: `/daily/weight-tickets` no longer generates a random first-line id during SSR, preventing hydration mismatch in searchable product fields. Shared input/select/combobox primitives now use a touch-safe mobile font baseline, uploaded image filenames are truncated to avoid stretching the mobile form, and the impurity deduction-mode control has been moved off the browser-native select path so spacing/trigger behavior can be tuned in line with the shared dropdown pattern.
- Cost Pool clarification on 2026-05-25: only copper/brass products (`ทองแดง`, `ทองเหลือง`, `copper`, `brass`) enter Cost Pool. PO Buy needs a `ปิดรับไม่ครบ` action for short delivery; it must remove/release only the remaining undelivered eligible quantity from Cost Pool candidate/availability and preserve actual received/billed stock rows.
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
- Done on 2026-06-07: Stock Ledger and related stock read routes no longer include full product rows after `products.item_status` was removed. `/api/stock/ledger`, stock balance snapshot, grade convert, status convert, and stock transfer now select only product display fields needed by the payload, while stock category/status display comes from `stock_ledger.output_category`.
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
- Supplier payment save now refreshes the linked purchase bill AP fields in the same transaction: `paid_amount`, `payable_balance`, and `status` are recomputed from active `payments` rows by `bill_id`; overpayment is rejected and edits that move a payment to another bill refresh both old and new bills. Data dictionary updated at `docs/data-dictionary/purchase-bills.md`, and a dev-target schema-only snapshot was dumped to `reports/db_audit/dev_target_schema_20260522.sql`.
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
