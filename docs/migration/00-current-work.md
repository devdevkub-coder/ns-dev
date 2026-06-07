# 00 Current Work

## Current Status

Date: 2026-05-22
Active app: `apps/next`
Primary remote: `new-origin`
Last pushed checkpoint: Runtime Prisma transaction-pooler normalization
Runtime purchase-bill list branch filter and WTI reference checkpoint on 2026-06-07: `/purchase/bills` now has a searchable `ทุกสาขา` filter in the standard filter row. The selected outward branch code is sent to `/api/purchase/bills`, applied server-side through the `branches.code` relation, reset by the shared clear-filter action, and included in Excel export requests. The purchase-bill table and Excel export now also include `เลขที่ใบรับของ`, derived as the unique WTI document numbers referenced by the bill's relational item snapshots; bills without WTI references display `-`.
Runtime sidebar detail-parent checkpoint on 2026-06-07: sidebar active-state resolution now supports explicit parent mappings for detail routes whose URL is not a slash child of the visible menu route. `/purchase/payment-approvals/[id]` resolves to the main `/daily/payment-approval` menu, while normal detail paths such as `/purchase/bills/[id]`, `/purchase/payments/[id]`, `/purchase/advance-payments/[id]`, `/daily/expense/[id]`, and `/daily/weight-ticket-list/[id]` continue to resolve through slash-bounded prefix matching.
Git safety checkpoint: `origin` / `https://github.com/sirimasth/ns-scrap-erp.git` is legacy read-only reference material only. Never push, force-push, branch, tag, PR, delete, or otherwise mutate that repo; use it only for read operations.
Runtime environment checkpoint on 2026-06-04: dev-target DB password for project `fhglqymcdmrgbsbadnwr` was rotated. Local `apps/next/.env.local` `DATABASE_URL` was updated for the current machine, local `next dev` on `http://localhost:3000` reconnected successfully, Vercel production `DATABASE_URL` for `new-ns-scrap-erp` was updated, and a new production deployment was completed and verified via `/api/health` = `200` and `/api/auth/me` unauthenticated = `401`. Do not record or commit the password itself; if connection errors recur, re-check local `.env.local` and Vercel env after any future password reset.
Runtime DB connection checkpoint on 2026-06-07: `/api/auth/me`, `/api/activity`, and `/api/master-data/impurities` reported shared `500` failures while Supabase session pooler returned `EMAXCONNSESSION max clients reached in session mode`. This was not an impurity-table schema issue. `apps/next/src/lib/server/prisma.ts` now resolves runtime DB URLs from `DATABASE_RUNTIME_URL` / `DATABASE_PRISMA_URL` / `DATABASE_URL` and normalizes Supabase pooler URLs from session port `5432` to transaction-pooler port `6543` before creating the shared `pg` pool. It also recreates the pool/client if the runtime URL changes, keeping local/Vercel from holding stale session-pooler connections after env or HMR changes. Validation passed with transaction-pooler `psql` smoke, `npm run type-check --workspace @ns-scrap-erp/next -- --pretty false`, `npm run lint --workspace @ns-scrap-erp/next`, `npm run build --workspace @ns-scrap-erp/next`, and `git diff --check`.
Runtime PO Buy allocation-key checkpoint on 2026-06-07: `POB012605-0005` exposed a stale-reconciliation bug in the purchase-bill PO allocation flow. The DB still showed `po_buys.status = Open` and `remaining_qty = 120`, while active `purchase_bill_po_allocations` already consumed `240` kg through `PB012605-0420`, `PB012605-0421`, and `PB012606-0010`. Root cause was not a UI selector issue: old `po_buys.items` rows stored product keys as business codes such as `SKU001`, while `purchase_bill_po_allocations.purchase_bill_items.product_id` stores canonical internal bigint ids such as `3`; `reconcilePoBuys()` compared these mismatched keys and therefore did not reduce remaining qty/status. Migration `20260607111513_normalize_po_buy_item_product_keys.sql` now backfills resolvable `po_buys.items.productIdInternal` from current `products.code` without guessing legacy `P###` values, and dev-target migration history was repaired as applied. `reconcilePoBuys()` now requires canonical internal product ids for JSON item rows instead of falling back to `productId`/code, persists `productIdInternal` back into item snapshots, and `/api/purchase/bills` validates PO remaining qty by `PO + product` rather than header-level remaining qty. PO options now use the first remaining canonical item for display/filtering; legacy non-canonical PO rows are not offered as active options instead of breaking the page or falling back. Dev-target reconciliation refreshed 2 canonical allocated PO rows. Post-check for `POB012605-0005`: status is `Partially Received`, total qty `120`, `SKU001/productIdInternal=3` remaining `0`, `SKU003/productIdInternal=5` remaining `20`, cut amount `1000`, and remaining amount `600`. Existing over-allocation evidence remains visible in `purchase_bill_po_allocations` (`SKU001` active allocations total `240`) and was not deleted automatically. Validation passed with `npm run type-check --workspace @ns-scrap-erp/next -- --pretty false`, `npm run lint --workspace @ns-scrap-erp/next`, `npm run build --workspace @ns-scrap-erp/next`, and `git diff --check`.
Runtime dev-target transaction cleanup checkpoint on 2026-06-07: dev-target test transaction/document data was cleared after the PO allocation-key fix so runtime does not need fallback or hard-coded support for bad test rows. The cleanup used one explicit `TRUNCATE ... RESTART IDENTITY CASCADE` transaction against public transaction/document/ledger/history tables only, including purchase, PO, WTI, payment/PMA/PMT, sales, stock, production, trading, finance transaction logs, and related status/usage/allocation logs. Master/config/auth tables were intentionally excluded. Post-check: `po_buys`, `purchase_bills`, `purchase_bill_items`, `purchase_bill_po_allocations`, `weight_tickets`, `payments`, `payment_approvals`, `bank_statement`, `supplier_advance_payments`, and `stock_ledger` all have `0` rows; master sanity counts remain `products = 232`, `suppliers = 1888`, `customers = 51`, and `accounts = 11`. This was a dev data cleanup, not a schema migration or production cleanup.
Runtime purchase-bill warehouse selector checkpoint on 2026-06-07: `/purchase/bills` Stock create/edit now requires the user to choose a warehouse from a dropdown filtered by the selected branch. The UI resets `warehouseId` when branch changes, hides/clears it for Trading, locks `warehouseId` after a WTI is selected, and shows field-level validation on `warehouseId`. `/api/purchase/bills` no longer auto-picks a warehouse from `RM/WIP/FG/SCRAP` naming hints; POST/PATCH resolve `warehouseId` through `warehouses.code -> warehouses.id`, require an active warehouse for Stock, validate that the warehouse branch code matches the selected bill branch, and write that warehouse to both `purchase_bills.warehouse_id` and every Stock `stock_ledger.warehouse_id` row. This keeps warehouse selection explicit and avoids runtime fallback based on warehouse names. Validation passed with `npm run type-check --workspace @ns-scrap-erp/next -- --pretty false`, `npm run lint --workspace @ns-scrap-erp/next`, `npm run build --workspace @ns-scrap-erp/next`, and `git diff --check`. Browser smoke on local `/purchase/bills` logged in, opened the create modal, found `select[data-error-key="warehouseId"]`, confirmed the initial placeholder `เลือกสาขาก่อน`, and saw no console errors.
Runtime purchase-bill warehouse selector UI polish on 2026-06-07: the Stock warehouse selector now follows `docs/design.md` required-select conventions: the required `*` is red, the empty placeholder is a disabled option, and the control text is `text-slate-400` while no warehouse is selected.
Runtime purchase-bill warehouse auto-default follow-up on 2026-06-07: `/purchase/bills` Stock create/edit now auto-selects the active `RM` warehouse for the selected branch instead of leaving `warehouseId` blank after branch selection. The active purchase payload now carries warehouse `type` so the UI can resolve the default from branch-scoped master data rather than guessing from name or code. Validation passed with `npm run type-check --workspace @ns-scrap-erp/next`, `npm run lint --workspace @ns-scrap-erp/next`, `npm run build --workspace @ns-scrap-erp/next`, and `git diff --check`. Playwright smoke on `http://localhost:3000/purchase/bills` redirected to `/login?redirect=%2Fpurchase%2Fbills`, so authenticated in-page QA still needs a logged-in browser session.
Runtime purchase-bill WTI allocation UX follow-up on 2026-06-07: in `/purchase/bills` Stock receipt allocation, pressing `+ เพิ่มแถว` from a PO-selected row now creates the next row as `Spot Buy` and pre-fills `qty` with the remaining unallocated WTI product-summary weight in the draft. This keeps the common "PO does not cover all receipt weight" path explicit without forcing the user to recalculate residual weight manually.
Runtime purchase/sales bill discount-field design follow-up on 2026-06-07: `/purchase/bills` and `/sales/bills` now treat `ส่วนลดท้ายบิล` as a money input per `docs/design.md` instead of a raw `type=number` field. The shared transaction helper uses `type="text"` with `inputMode="decimal"`, sanitizes to numbers with at most 2 decimal places, shows editable draft text on focus, formats with comma + 2 decimals on blur, and keeps the field right-aligned.
Runtime purchase-bill scope checkpoint on 2026-06-06: the immediate blocker "บันทึกบิลรับซื้อไม่ได้" is fixed in `/api/purchase/bills`. The stock PB write contract now treats `item.productId` as outward `products.code` only, resolves it once to internal `products.id`, and validates WTI receipt summaries by that resolved internal id without reparsing or falling back to legacy/internal ids. A follow-up UI save bug was also fixed: `/purchase/bills` options expose `receiptTicketId = weight_tickets.doc_no`, summary ids as `${doc_no}:${productCode}:${lineCount}`, and line ids as `${doc_no}:${line_no}`, so the API now resolves those outward keys back to internal bigint ids before writing `purchase_bill_receipt_allocations`; it no longer parses client receipt keys as bigint. Dev-target data cleanup followed the same rule instead of adding code fallback: 4 old test `purchase_bill_items.source_snapshot` rows (`PB012606-0001` through `PB012606-0004`) were backfilled from internal WTI/summary/line ids to outward WTI doc/composite keys, and the post-check count for numeric `source_snapshot.receiptTicketId` is now `0`. Live smoke evidence created `POB012606-0010`, `WTI012606-0007`, `PB012606-0005`, and `PB012606-0006`; PO status moved `Partially Received -> Received`, WTI status became `billed`, and both PB rows reached the approval queue. The same smoke then failed later at `/api/purchase/payments` with a PMT save/database error; that is Payment Flow scope and is intentionally not mixed into the purchase-bill fix. Current report is [testpurchaseflow_date.md](/Users/watcharathatsrithanesiganon/Documents/GitHub/ns-scrap-erp/testpurchaseflow_date.md).
Runtime supplier-payment PMA split checkpoint on 2026-06-06: `/purchase/payments` now treats approved PMA rows as the UI/API selection identity, while the source PB/ADV document remains an explicit reference. Root cause for `PMA012605-0011/2` being unable to save was twofold: the payment queue exposed split PMAs from the same PB with the same row id/source doc key, and the shared daily doc-number schema rejected `/` even though PMA split documents are valid business doc numbers (`.../1`, `.../2`). `/api/purchase/payments` now returns PMA doc no as `id`/`approvalId`, requires `payment_approvals.source_doc_no_snapshot` as the PB/ADV reference instead of falling back to source table doc no, and resolves supplier party ids from either internal bigint id or valid supplier code without falling back to junk display values. The payment modal converts the selected PMA back to `sourceDocNo` only for the POST `billId`, keeps `lines[].approvalId` as the PMA doc no, and initializes single-account split amount in state instead of silently filling it during submit normalization. Browser QA on `localhost:3000/purchase/payments` for `PMA012605-0011/2` verified GET `/api/purchase/payments` = `200`, row supplier/ยอด `1,000.00` correct, modal split total `1,000.00` matches net cash out, and an intercepted POST payload contains `billId = PB012605-0387`, `supplierId = SU0506`, `accountId = AC-MOVBEKA2NLYD`, `lines[0].approvalId = PMA012605-0011/2`, `lines[0].billId = PB012605-0387`, and `splits[0].amount = 1000`. The POST was intentionally aborted by Playwright to avoid creating a real PMT in dev data. Validation passed with `npm run type-check --workspace @ns-scrap-erp/next -- --pretty false`, `npm run lint --workspace @ns-scrap-erp/next`, `npm run build --workspace @ns-scrap-erp/next`, and `git diff --check`.
Runtime supplier-payment PMT checkpoint on 2026-06-07: the same `PMA012605-0011/2` was pushed through the real PMT write path in dev-target. The remaining POST `500 DATABASE_ERROR` root cause was transaction timeout `P2028`: `/api/purchase/payments` called `nextDailyDocNos('bank_statement', ...)` inside an interactive transaction, but the helper used the global Prisma client instead of the transaction client; with the local pool at `max=1`, generating the `BST` doc no waited on the active transaction until timeout. `nextDailyDocNo()` / `nextDailyDocNos()` now accept an optional Prisma client/transaction and `/api/purchase/payments` passes `tx` for the bank-statement doc numbers. Real browser QA then created `PMT012606-0001` from `PMA012605-0011/2` using account `AC-MOVBEKA2NLYD`; POST returned `200` with `paymentId = 311`. DB verification: `payment_approvals.PMA012605-0011/2` is `paid` with `payment_id = 311`; `payments.311` is active amount/net `1000`; `bank_statement.BST2606-0001` references voucher `PMT-599bcbbe-5965-417c-8ff6-6b104aaa94ff` and `PMT012606-0001` with `amount_out = 1000`; `purchase_bills.PB012605-0387` refreshed to `status = partial`, `paid_amount = 1000`, `payable_balance = 1712.6`; and `purchase_bill_status_logs` recorded `payment_recorded`. `/api/purchase/payment-history` returned `200` and includes payment `311`, `PMA012605-0011/2`, and `PB012605-0387`. Validation passed with `npm run type-check --workspace @ns-scrap-erp/next -- --pretty false`, `npm run lint --workspace @ns-scrap-erp/next`, `npm run build --workspace @ns-scrap-erp/next`, and `git diff --check`.
Runtime payment-approval source-derived pending checkpoint on 2026-06-07: `/daily/payment-approval` now treats `ยังไม่อนุมัติ` as source-derived rows from `PB / ADV / EXP`, not `PMA pending`. Migration `20260607014615_remove_pending_payment_approvals.sql` voided the 150 legacy `payment_approvals.status = pending` placeholder rows, added PMA status logs with action `legacy_pending_placeholder_voided`, changed `payment_approvals.status` default to `approved`, and hardened the DB constraint to allow only `approved`, `paid`, and `voided`. Source write paths for PB, ADV, and EXP no longer create or delete pending PMA placeholder rows; `payment-approval-pending.ts` now only owns PMA doc-number generation and source lock checks for `approved/paid` PMA rows. `/api/daily/payment-approval` GET computes pending balance from source current state: PB uses `purchase_bills.payable_balance - approved PMA amount` to avoid double-hitting paid PMAs, while ADV/EXP use source amount minus approved/paid PMA amount because those source tables do not carry the same payable-balance contract. POST now accepts source doc no as `approvalId`, looks up the source by `sourceType + doc_no`, and creates new `PMA approved` rows for the submitted split amounts instead of updating a pending PMA row. UI wording changed from `PMA pending` to `source รออนุมัติ`. DB verification after migration shows statuses `approved = 14`, `paid = 3`, `voided = 155`, column default `approved`, and constraint `payment_approvals_status_chk` allows only `approved/paid/voided`. Authenticated Playwright QA on `localhost:3000/daily/payment-approval` returned `/api/daily/payment-approval = 200`, no console errors, `source รออนุมัติ` visible, and `PMA pending` absent. Partial approval smoke used dev data `PB012605-0411`: before approval pending balance was `10.80`; POST approved `5.00` to `PMA012605-0162`; subsequent GET still shows source pending `PB012605-0411` with balance `5.80` and approved tab/source rows include `PMA012605-0162`. Validation passed with `npm run type-check --workspace @ns-scrap-erp/next -- --pretty false`, `npm run lint --workspace @ns-scrap-erp/next`, `npm run build --workspace @ns-scrap-erp/next`, and `git diff --check`.
Runtime expense approval split checkpoint on 2026-06-07: `EXP` now follows the same split-approval UI contract as `PB/ADV` in `/daily/payment-approval`. Migration `20260607025327_normalize_expense_status_contract.sql` normalized legacy `expenses.status` values from `pending`/blank to `pending_approval`, set `expenses.status` default to `pending_approval`, made it `not null`, and added `expenses_status_chk` for `pending_approval`, `approved`, `paid`, and `cancelled`; dev-target verification shows both current expense rows are `pending_approval`. Prisma now matches that status contract, and expense API mutation guards no longer treat `pending` or blank as valid pending states. `/api/daily/payment-approval` now returns active account destination options for pending expense rows, and `PaymentApprovalPageClient` uses the same split section for `PB/ADV/EXP`: select destination account, edit approval amount, add/remove split rows, and submit `splits[]` instead of auto-approving the full expense amount. Browser QA on `localhost:3000/daily/payment-approval` confirmed the expense tab has 2 rows, `EXP2605-0002-B` opens a modal with `แบ่งรายการอนุมัติจ่าย`, destination account select, amount input, and adding a second split row works without console errors. Validation passed with `npm run prisma:generate --workspace @ns-scrap-erp/next`, `npm run type-check --workspace @ns-scrap-erp/next -- --pretty false`, `npm run lint --workspace @ns-scrap-erp/next`, `npm run build --workspace @ns-scrap-erp/next`, and `git diff --check`.
Runtime sidebar detail-route checkpoint on 2026-06-07: `AppNavigation` now treats a route as active when the current path equals the menu href or is a slash-bounded child of that href. This fixes purchase bill detail URLs such as `/purchase/bills/PB012606-0010` so the sidebar highlights the main `บิลรับซื้อ` menu instead of losing the active state, and it also auto-expands the section containing the active route.
Runtime impurity master schema/API checkpoint on 2026-06-07: `/master-data/impurities` root cause was a schema/API drift after the bigint identifier cutover. Dev-target DB and Prisma use `public.impurities.id bigint generated by identity` as the internal FK key and `code` as the business key, but the active API still generated legacy string ids such as `IMP-###` into `id` and omitted `code` from read responses. Migration `20260607102230_normalize_impurity_code_contract.sql` normalizes existing codes, sets `impurities.code` to `not null`, and adds `impurities_code_not_blank`; dev-target verification shows `id bigint identity not null`, `code text not null`, `impurities_code_key` unique index, and `1/1` impurity rows with valid codes. API contract now returns `id` as a serialized internal bigint string for WTI/WTO FK payloads and returns required `code` separately; create inserts `(code, name, active)` and lets DB generate `id`, while edit/toggle parses route/form id strictly as bigint. No fallback to business code or display text was added for FK writes. Validation passed with `npm run prisma:generate --workspace @ns-scrap-erp/next`, `npm run type-check --workspace @ns-scrap-erp/next -- --pretty false`, `npm run lint --workspace @ns-scrap-erp/next`, `npm run build --workspace @ns-scrap-erp/next`, and `git diff --check`.
Runtime Cost Pool docs checkpoint on 2026-06-07: `docs/notes/Cost Pool.md` is now the canonical Cost Pool/Dual Costing rule note. It records copper/brass-only eligibility via `products.metal_group`, and narrows source eligibility to only `PO Buy` plus `Stock Spot Buy / No PO purchase bill`; PB lines that reference PO do not create an additional Cost Pool source. The note also records short-close/reversal rules, backend API contract, and the current implementation gap where `/api/dual-costing/cost-pool` still lacks `metal_group` filtering and still treats purchase bill items too broadly. `docs/notes/Purchase Flow.md` now links to the dedicated Cost Pool note instead of carrying the full rule inline, and `docs/notes/_Index.md` plus `docs/migration/00-doc-index.md` include the new canonical entry.
Runtime Cost Pool display checkpoint on 2026-06-07: `/api/dual-costing/cost-pool` now resolves PO Buy item display names from `products.name` by product code before falling back to item snapshots. This keeps the `/dual-costing/cost-pool` table column `สินค้า` showing the product name instead of a product code/snapshot value when master data is available.
Runtime PMA/PMT timeline checkpoint on 2026-06-07: PMA/PMT now have dedicated business timeline tables and fact tables. Migration `20260607005615_add_payment_approval_and_payment_timeline_logs.sql` adds `payment_approval_status_logs`, `payment_status_logs`, `payment_allocations`, and `payment_account_splits`, with backfill from existing `payment_approvals`, `payments`, and `bank_statement` rows. PMA approve, PMA void-before-payment, PMT post, PMT bank-post, and PMT cancel now append timeline events; PMT save also writes allocation/split facts, and PMT cancel reverses those facts. Policy correction: cancelling a PMT no longer puts the old PMA back to `approved` for reuse; it voids the affected PMA unless another active payment still fully settles it, forcing source amounts back through approval as a new PMA. `/purchase/payment-history` now links PMT rows to `/purchase/payments/[id]` and shows PMA links to `/purchase/payment-approvals/[...id]`; both detail pages aggregate their dedicated logs/facts into timelines. Dev-target apply used direct `psql` against `apps/next/.env.local` `DATABASE_URL` because `supabase db push --dry-run` found many older local migrations missing from remote history; do not run `--include-all` casually for this repo. Apply output backfilled `29` PMA status logs, `293` PMT status logs, `4` payment allocation facts, and `307` account split facts, then `supabase migration repair 20260607005615 --status applied --db-url "$DATABASE_URL"` marked the remote migration history. Local validation passed with `npm run prisma:generate --workspace @ns-scrap-erp/next`, `npm run type-check --workspace @ns-scrap-erp/next`, `npm run lint --workspace @ns-scrap-erp/next`, `npm run build --workspace @ns-scrap-erp/next`, and `git diff --check`.
Runtime WTI cancel/reuse checkpoint on 2026-06-06: `WTI012605-0004` was verified after cancelling related PB rows. The root issue was stale dev-target allocation facts left behind by cancelled purchase bills, not a need for runtime fallback. Migration [20260606080820_cleanup_cancelled_purchase_bill_allocations.sql](/Users/watcharathatsrithanesiganon/Documents/GitHub/ns-scrap-erp/supabase/migrations/20260606080820_cleanup_cancelled_purchase_bill_allocations.sql) deletes `purchase_bill_receipt_allocations` and `purchase_bill_po_allocations` tied to `purchase_bills.status = cancelled`, then refreshes WTI billed/remaining/status from active allocations. Dev-target apply removed 5 cancelled receipt allocations and 5 cancelled PO allocations. Post-check: cancelled allocation counts are `0`, `WTI012605-0004` has `status = received`, `billed_weight = 0`, `remaining_weight = 70`, and authenticated `/api/purchase/bills` receipt options include `WTI012605-0004` with `remainingWeight = 70`. UI wording on `/purchase/bills` now says `จัดสรรในบิลนี้ครบแล้ว` so users do not confuse draft allocation with database usage status.
Runtime WTI full-allocation checkpoint on 2026-06-06: the Stock purchase-bill save path now enforces the superseded rule that every selected WTI product summary must be fully allocated in the PB before save. `apps/next/src/components/daily/TransactionBillsPageClient.tsx` blocks client submit when the draft summary total is under/over the selected `remainingWeight`, highlights/focuses the affected qty field, and shows a field-level Thai error. `apps/next/src/app/api/purchase/bills/route.ts` now rejects API POST/PATCH when requested summary qty is lower than the current available WTI summary qty, while still rejecting over-allocation and PO over-use. Validation passed with `git diff --check`, `npm run type-check --workspace @ns-scrap-erp/next`, `npm run lint --workspace @ns-scrap-erp/next`, and `npm run build --workspace @ns-scrap-erp/next`. Browser smoke on `http://127.0.0.1:3000/purchase/bills` using an isolated unauthenticated profile reached the expected login redirect; authenticated form UAT for `UC-PUR-07/08` still needs a browser session with test login if deeper click-path evidence is required.
Runtime WTI usage-history checkpoint on 2026-06-06: `weight_ticket_usage_logs` is now the append-only usage history layer for `WTI -> PB`. Migration [20260606093408_add_weight_ticket_usage_logs.sql](/Users/watcharathatsrithanesiganon/Documents/GitHub/ns-scrap-erp/supabase/migrations/20260606093408_add_weight_ticket_usage_logs.sql) creates typed allocation/release event rows with `event_key`, WTI doc no, target document, product snapshots, allocated gross/deduct/net weights, before/after remaining weight, actor, note, and FK links. Dev-target apply succeeded against `fhglqymcdmrgbsbadnwr` with 14 backfilled active allocation rows; `supabase migration repair 20260606093408 --status applied` then marked the migration history as applied to avoid future reapply drift. Sample verification showed `WTI012606-0007 -> PB012606-0005/PB012606-0006` with running remaining weight `30 -> 0`. `/api/purchase/bills` now appends WTI usage logs on PB create, PB edit diff, and PB cancel release before active allocation rows are replaced/deleted. `/api/daily/weight-tickets/[id]` returns `usageTimeline`, and `WeightTicketDetailPageClient` shows a `ประวัติการใช้งานใบรับของ` table for WTI detail pages. Validation passed with `npm run prisma:generate --workspace @ns-scrap-erp/next`, `npm run type-check --workspace @ns-scrap-erp/next -- --pretty false`, `npm run lint --workspace @ns-scrap-erp/next`, `npm run build --workspace @ns-scrap-erp/next`, and `git diff --check`. Browser QA on `http://127.0.0.1:3000/daily/weight-ticket-list/WTI012606-0007` reached the expected login redirect because the test browser had no authenticated session, so authenticated visual confirmation of the table remains pending.
Runtime WTI document-timeline checkpoint on 2026-06-06: `weight_ticket_status_logs` is now the append-only status/lifecycle history layer for `WTI/WTO`, and WTI detail timeline no longer uses `app_audit_logs` as document timeline. Migration [20260606121841_add_weight_ticket_status_logs.sql](/Users/watcharathatsrithanesiganon/Documents/GitHub/ns-scrap-erp/supabase/migrations/20260606121841_add_weight_ticket_status_logs.sql) creates status event rows with `event_key`, `from_status`, `to_status`, WTI/WTO doc snapshot, weight snapshots, actor, note, and metadata. Dev-target apply via direct `psql` succeeded with `17` created baseline rows and `7` current-status sync rows, then `supabase migration repair 20260606121841 --status applied --db-url "$DATABASE_URL"` marked migration history. `/api/daily/weight-tickets` appends created logs, `/api/daily/weight-tickets/[id]` appends edit/cancel logs, and `/api/purchase/bills` appends `usage_status_changed` when PB create/edit/cancel recalculates WTI status from active allocations. `/api/daily/weight-tickets/[id]` now aggregates `weight_ticket_status_logs` + `weight_ticket_usage_logs` into `timeline`, while keeping `usageTimeline` for the WTI usage table. Verification for `WTI012605-0002`: DB status is `billed`, product summaries all have `remaining_weight = 0`, status timeline has `created received` and `status_synced received -> billed`, and combined timeline has 7 events including `PB012606-0009` plus previous `PB012605-0417` allocations. Direct unauthenticated API curl returned expected `401`, so authenticated browser/API payload verification remains pending.
Runtime PB receipt-item weight checkpoint on 2026-06-06: `PB012606-0009` exposed a display/data mismatch where active `purchase_bill_receipt_allocations` correctly allocated `WTI012605-0002` for `1,950` kg, but the related `purchase_bill_items` row still kept full WTI summary gross weight `2,060` kg in `gross_weight` and `source_snapshot.grossWeight`. `/api/purchase/bills` now builds Stock-from-WTI item gross/deduct weights proportionally from the selected WTI product summary and the line `qty`, so split WTI summary rows mirror their allocated receipt weights in the line display table while `purchase_bill_receipt_allocations` remains the allocation source of truth. Migration [20260606123631_normalize_purchase_bill_receipt_item_weights.sql](/Users/watcharathatsrithanesiganon/Documents/GitHub/ns-scrap-erp/supabase/migrations/20260606123631_normalize_purchase_bill_receipt_item_weights.sql) normalized the 5 dev-target mismatched rows and repaired migration history; post-check mismatch count between PB item weights and receipt allocation weights is `0`. Current sample: `PB012606-0009` item and allocation both show gross `1,950`, deduct `0`, qty `1,950`, while linked `WTI012605-0002` remains `billed` with all summary remaining weights `0`.
Runtime partial-status wording question on 2026-06-06: user observed that wording/state around `รับของแล้วบางส่วน` can still appear, so docs now mark it as an unresolved business-rule question instead of confirmed target behavior. Current working assumption is that `รับบางส่วน` belongs to `POB` receiving progress, while `WTI` should represent a saved receipt document and use partial wording only as `ออกบิลแล้วบางส่วน` based on active PB usage. Because new PB writes now require selected WTI/summary remaining weight to be fully allocated before save, the open decision is whether to remove/hide WTI partial states from new UI/API paths entirely, leaving `WTI.partially_billed` only for legacy active partial usage or edit/cancel recalculation that still has true partial usage.
Runtime ADV timeline checkpoint on 2026-06-06: `supplier_advance_status_logs` and `supplier_advance_allocation_logs` are now the append-only business timeline for `ADV`. Migration [20260606093705_add_supplier_advance_timeline_logs.sql](/Users/watcharathatsrithanesiganon/Documents/GitHub/ns-scrap-erp/supabase/migrations/20260606093705_add_supplier_advance_timeline_logs.sql) creates typed status/allocation event rows with stable `event_key`, ADV/PB doc snapshots, before/after remaining amount, status transition fields, actor, note, and metadata. `appendSupplierAdvanceStatusLog()` records ADV create/edit/cancel, PMA approve/void, PMT paid/reversed, and allocation-status sync events; `appendSupplierAdvanceAllocationLogs()` records ADV allocation/release from purchase bills before active allocation facts are refreshed. `/api/purchase/advance-payments/[id]` now reads the detail timeline from these dedicated tables instead of fabricating history from `app_audit_logs` or current allocation rows. Dev-target apply succeeded via direct `psql` over `apps/next/.env.local` `DATABASE_URL`, backfilling `3` status rows and `0` allocation rows for the current ADV data set; `supabase migration repair 20260606093705 --status applied` then marked the remote migration history as applied. Sample rows include `ADVLOG-ADV012605-0001-0001|created|ADV012605-0001` and `ADVLOG-ADV012605-0001-0002|approved|ADV012605-0001`. Local validation passed with `npm run prisma:generate --workspace @ns-scrap-erp/next`, `npm run type-check --workspace @ns-scrap-erp/next -- --pretty false`, `npm run lint --workspace @ns-scrap-erp/next`, `npm run build --workspace @ns-scrap-erp/next`, and scoped `git diff --check`.
Runtime document timeline policy checkpoint on 2026-06-06: the target architecture now treats every user-facing business document with a document number (`doc_no`, `document_no`, `voucher_no`, or `ref_no`) as requiring timeline/history. [Document Timeline Policy](/Users/watcharathatsrithanesiganon/Documents/GitHub/ns-scrap-erp/docs/notes/Document%20Timeline%20Policy.md) records the rule: current document tables hold latest state, append-only event logs hold history, detail pages must expose timeline/history, event rows need stable `event_key`, and runtime code must not fabricate history from internal ids or fallback around bad data.
Runtime document history design checkpoint on 2026-06-06: the table design is now explicit that NS Scrap ERP should not use one generic `document_events` table as the source of truth for business timeline. [Document History Table Design](/Users/watcharathatsrithanesiganon/Documents/GitHub/ns-scrap-erp/docs/notes/Document%20History%20Table%20Design.md) sets the target: keep status/usage/allocation history separated by document or business flow (`weight_ticket_status_logs`, `weight_ticket_usage_logs`, `po_buy_allocation_logs`, `supplier_advance_status_logs`, `payment_approval_status_logs`, `payment_status_logs`, etc.), keep typed fact tables for enforceable details, and let UI/read services aggregate per-document timeline views. This is docs/design only; no schema migration was applied in this checkpoint.
Runtime document timeline coverage audit on 2026-06-06: current implementation is not complete against the new policy. Confirmed covered at first level: `po_buys` via `po_buy_status_logs`, `purchase_bills` via `purchase_bill_status_logs`, `weight_tickets` via `weight_ticket_status_logs` plus `weight_ticket_usage_logs` for `WTI -> PB`, `supplier_advance_payments` via `supplier_advance_status_logs` + `supplier_advance_allocation_logs`, `payment_approvals`/`PMA` via `payment_approval_status_logs` + `payment_allocations`, and `payments`/`PMT` via `payment_status_logs` + `payment_allocations` + `payment_account_splits`. Remaining partial gap for `weight_tickets`: `WTO -> SB` usage history is still future work. `stock_ledger` has `ledger_key` but still needs source-event trace. Missing dedicated document timelines: `po_sells`, `stock_issues`, `sales_bills`, `receipts`, `expenses`, `transfers`, `bank_statement`, `petty_advances`, `petty_advance_returns`, `receipt_vouchers`, `stock_adjustments`, `grade_adjustments`, `production_orders`, and `loan_payments`.
Runtime UI checkpoint on 2026-06-04: `/stock/status-convert` removed the extra in-page usage banner and now follows the shared list-page baseline more closely. The list adds header-click sorting, the standard count/page-size/pagination row above the table, and keeps the search/refresh/create actions in the shared filter shell. Current implementation is frontend pagination/sort over the loaded dataset only; no API-side paging or mutation behavior was changed.
Runtime schema checkpoint on 2026-06-05: Group A simple master migration is now complete for `bank_names`, `payment_methods`, `product_units`, and `product_types`. Each table keeps business-facing `code` as the UI/API identifier while the database primary key is now `id bigint generated by identity`. `apps/next/src/lib/server/simple-master-tables.ts` now supports code-keyed simple masters so the shared master-data pages still edit/toggle by `code`, and `public.payment_methods` consumers such as `/api/purchase/advance-payments` no longer leak internal bigint ids back to the client. Local validation passed with `npm run prisma:generate --workspace @ns-scrap-erp/next`, `npm run type-check --workspace @ns-scrap-erp/next`, `npm run lint --workspace @ns-scrap-erp/next`, `npm run build --workspace @ns-scrap-erp/next`, and `git diff --check`.
Runtime Wave 2 fallout checkpoint on 2026-06-05: the focused ledger / PO reconciliation / purchase settlement fallout from the all-bigint DB cutover is now adapted in code. `apps/next/src/app/api/admin/transaction-ledger/route.ts` now resolves referenced records by internal bigint ids while still exporting outward strings/doc numbers, `apps/next/src/lib/server/purchase-bill-settlement.ts` now accepts bigint bill/advance ids, `apps/next/src/lib/server/po-buy-reconciliation.ts` now reconciles PO buys and status logs with bigint owner ids / bigint relation keys, and `apps/next/tmp-po-reconcile-test.ts` now calls the reconcile helper with bigint ids. Verification for this scoped batch: the active `type-check` output no longer reports these four files when filtered for `transaction-ledger`, `purchase-bill-settlement`, `po-buy-reconciliation`, and `tmp-po-reconcile-test`; broader daily/finance/report fallout remains pending outside this batch.
Runtime Wave 2 fallout checkpoint on 2026-06-05: the focused `dual-costing + trading` API batch is also adapted to bigint internals. `apps/next/src/app/api/dual-costing/cost-allocator/route.ts`, `cost-pool/route.ts`, `deal-margin/route.ts`, `match-log/route.ts`, `apps/next/src/app/api/trading/dashboard/route.ts`, and `trading/matching/route.ts` now keep bigint ids inside Prisma queries/maps, stringify only outward ids, and stop using internal ids as display fallbacks for product/party labels. Verification for this scoped batch: filtering `npm run type-check --workspace @ns-scrap-erp/next -- --pretty false` output for those six route paths returns no matches.
Runtime Wave 2 weight-ticket fallout checkpoint on 2026-06-05: `apps/next/src/app/api/daily/weight-tickets/route.ts`, `apps/next/src/app/api/daily/weight-tickets/[id]/route.ts`, and `apps/next/src/lib/server/weight-tickets.ts` now conform to the DB-first bigint schema for WTI/WTO. The routes no longer seed manual string ids such as `WT-*` / `WTL-*` / `WTS-*`; `weight_tickets`, `weight_ticket_lines`, `weight_ticket_product_summaries`, and `weight_ticket_product_summary_lines` now use DB-generated bigint ids internally, while outward JSON stringifies ids only at the API boundary. Scoped lookup now resolves route params by bigint `id` or business `doc_no`, product/impurity refs are parsed to bigint before query/write, and product-summary bridges are rebuilt from persisted line/summarized rows instead of fake string ids. Scoped verification passed: `npm run type-check --workspace @ns-scrap-erp/next -- --pretty false 2>&1 | rg "weight-tickets"` returned no matches, and `git diff --check -- apps/next/src/app/api/daily/weight-tickets/route.ts apps/next/src/app/api/daily/weight-tickets/[id]/route.ts apps/next/src/lib/server/weight-tickets.ts` passed.
Runtime Wave 2 sales-route fallout checkpoint on 2026-06-05: `apps/next/src/app/api/sales/bills/route.ts`, `apps/next/src/app/api/sales/po-sell/route.ts`, and `apps/next/src/app/api/sales/receipts/route.ts` now conform to the DB-first bigint schema for `sales_bills`, `po_sells`, and `receipts`. The routes no longer seed manual string ids such as `SB-*`, `POS-*`, or `RCP-*`; channel/product/bill/account/receipt refs are parsed to bigint before query/write; and outward JSON now stringifies only contract ids while keeping customer/branch/warehouse display fields on business code or display text only. Sales bill and PO Sell item snapshots no longer fall back to internal product ids for outward names, and customer receipt bank-statement linkage now uses the persisted bigint receipt id only as an internal string reference instead of pretending the receipt PK itself is a string. Scoped verification passed: `npm run type-check --workspace @ns-scrap-erp/next -- --pretty false 2>&1 | rg "sales/bills|sales/po-sell|sales/receipts"` returned no matches, and `git diff --check -- apps/next/src/app/api/sales/bills/route.ts apps/next/src/app/api/sales/po-sell/route.ts apps/next/src/app/api/sales/receipts/route.ts` passed.
Runtime PO Buy event-log checkpoint on 2026-06-05: `po_buy_status_logs` has now been upgraded in-place from a minimal append-only status table to a structured event log. `apps/next/prisma/schema.prisma` and `supabase/migrations/20260605153000_upgrade_po_buy_status_logs_to_event_log.sql` add `event_key`, `action`, `from_status`, `to_status`, and `po_buy_doc_no` on the existing table and backfill legacy rows. `apps/next/src/lib/server/po-buy-reconciliation.ts` now writes PO Buy history through the structured event-log contract, and `/api/purchase/po-buy` now records create, edit, reconcile/receive, short-close, and cancel events with transition metadata instead of exposing raw bigint log ids. `PoBuyPageClient` detail history now renders action labels plus `from -> to` transition text using `event_key` as the outward row key. This keeps `po_buys` as current state and `po_buy_status_logs` as append-only history in the same table family without fallback to internal ids.
Runtime B5 account-selector closure checkpoint on 2026-06-05: the remaining active account-reference leak in supplier advance payments is now closed. `apps/next/src/lib/server/advance-payments.ts` now returns `fundingAccountId = accounts.code`, and `apps/next/src/app/api/purchase/advance-payments/[id]/route.ts` resolves the edited funding account by `accounts.code` instead of trying to parse client input as an internal bigint id. With this follow-up, the active `B5 accounts + finance cash/payment selectors` scope is now consistent: daily/payment write paths, finance bank/foreign selectors, cash-position summaries, and ADV read/write flows all use outward `accounts.code` while internal `accounts.id bigint` stays server-side only.
Validation note on 2026-06-05: the final `B5` rerun initially exposed one compile-time gap because `findActiveAccountReferenceByCode()` did not yet return `accounts.type`; the shared resolver was expanded to include `type`, after which `npm run type-check --workspace @ns-scrap-erp/next -- --pretty false`, `npm run lint --workspace @ns-scrap-erp/next`, `npm run build --workspace @ns-scrap-erp/next`, and `git diff --check` all passed.
Runtime Batch C checkpoint on 2026-06-05: the first support/history identity slice is now closed for `bill_swap_history`. `apps/next/prisma/schema.prisma` and `supabase/migrations/20260605170000_add_event_key_to_bill_swap_history.sql` add a persisted `event_key` with DB default on `public.bill_swap_history`, backfill existing rows, and keep `id bigint` plus bigint supplier/bill refs internal-only. `apps/next/src/app/api/daily/bill-swap-history/route.ts` now reads `event_key` directly instead of fabricating `{billDocNo}:{itemIndex}:{swapDate}` keys, while outward supplier and bill refs stay on supplier code / purchase-bill doc no. Validation passed with `npm run prisma:generate --workspace @ns-scrap-erp/next`, `npm run type-check --workspace @ns-scrap-erp/next -- --pretty false`, `npm run lint --workspace @ns-scrap-erp/next`, `npm run build --workspace @ns-scrap-erp/next`, and `git diff --check`. Remaining Batch C follow-up is now centered on `supplier_advance_allocations` and other support/history rows that still need a schema-level decision on outward business/event keys.
Runtime Batch C checkpoint on 2026-06-05: `supplier_advance_allocations` is now closed as the second support/history identity slice. `apps/next/prisma/schema.prisma` and `supabase/migrations/20260605173000_add_allocation_key_to_supplier_advance_allocations.sql` add persisted `allocation_key` on `public.supplier_advance_allocations`, backfill existing rows, and keep `id bigint`, `advance_payment_id`, and `purchase_bill_id` internal-only. `apps/next/src/lib/server/advance-payments.ts` now exposes allocation rows with `id = allocation_key`, timeline allocation events derive stable ids from `allocation_key`, and `apps/next/src/app/purchase/advance-payments/[id]/page.tsx` now resolves the ADV detail route by `doc_no` only and links purchase bills by `doc_no` instead of internal bigint ids. Validation passed with `npm run prisma:generate --workspace @ns-scrap-erp/next`, `npm run type-check --workspace @ns-scrap-erp/next -- --pretty false`, `npm run lint --workspace @ns-scrap-erp/next`, `npm run build --workspace @ns-scrap-erp/next`, and `git diff --check`.
Runtime Batch C checkpoint on 2026-06-05: `/purchase/bills/[id]` detail now follows the same strict `doc_no outward, internal id inward` contract. The page resolves the bill by `purchase_bills.doc_no` only, allocation rows use `${bill.doc_no}:lineNo` instead of `purchase_bill_items.id`, product summary fallback keys use business composites instead of item ids, payment timeline grouping no longer falls back to `payments.id`, and the WTI allocation section no longer shows internal `weight_ticket_product_summary_id`. Validation passed with `npm run type-check --workspace @ns-scrap-erp/next -- --pretty false`, `npm run lint --workspace @ns-scrap-erp/next`, `npm run build --workspace @ns-scrap-erp/next`, and `git diff --check`.
Runtime Batch C checkpoint on 2026-06-05: `purchase_bill_status_logs` is now implemented as the purchase-bill history layer. `apps/next/prisma/schema.prisma` and `supabase/migrations/20260605180000_add_purchase_bill_status_logs.sql` add the new append-only table with `event_key`, `action`, `from_status`, `to_status`, `purchase_bill_doc_no`, and backfill baseline created/payment/cancel rows for existing bills. `apps/next/src/lib/server/purchase-bill-history.ts` now centralizes log writes, `/api/purchase/bills` writes structured events for create/edit/cancel, `/api/purchase/payments` and `/api/purchase/payments/cancel` write payment-recorded/payment-reversed events, `/api/purchase/bills` create/update responses now return `id = doc_no`, and `/purchase/bills/[id]` reads the structured event log as the bill timeline instead of fabricating history from raw internal payment ids. Local validation passed with `npm run prisma:generate --workspace @ns-scrap-erp/next`, `npm run type-check --workspace @ns-scrap-erp/next -- --pretty false`, `npm run lint --workspace @ns-scrap-erp/next`, `npm run build --workspace @ns-scrap-erp/next`, and `git diff --check`. Dev-target apply also completed on 2026-06-05 by executing this migration directly over `DATABASE_URL` because `supabase db push --include-all` hit existing remote migration-history drift (`20260518035804_create_product_units_master.sql` failed on legacy `KG` text ids before reaching the new file). Direct `psql` apply succeeded with `CREATE TABLE`, `CREATE INDEX`, `CREATE INDEX`, and `INSERT 0 728`, and a follow-up query confirmed rows such as `PBLOG-PB012605-0362-0001`.
Runtime Batch C planning checkpoint on 2026-06-05: the remaining identifier/business-key cleanup is now decomposed into explicit reviewable follow-up batches instead of one open-ended “support/history later” bucket. The next execution order is `C6 purchase bridge/detail contract` (`purchase_bill_items`, `purchase_bill_receipt_allocations`, `purchase_bill_po_allocations`), then `C7 weight-ticket bridge/detail contract` (`weight_ticket_lines`, `weight_ticket_product_summaries`, `weight_ticket_product_summary_lines`), then `C8 finance/support history contract` (`fx_gain_loss`, `payment_approvals`, `stock_ledger`, `bank_statement`, and remaining report/helper read rows), and finally `C9 support/admin declaration` for tables that should stay internal-only. Each batch must first decide persisted business/event key vs internal-only status at schema level, then close route/page/report leaks under that decision without adding fallback debt.
Runtime Batch C checkpoint on 2026-06-05: `C6 purchase bridge/detail contract` is now closed. Decision for this slice is explicit: `purchase_bill_items`, `purchase_bill_receipt_allocations`, and `purchase_bill_po_allocations` remain internal-only bridge/detail rows and do not receive new persisted outward keys. The outward contract now stays on `purchase_bills.doc_no`, `po_buys.doc_no`, and parent-derived line/composite ids only. `apps/next/src/app/api/purchase/bills/route.ts` now resolves PO references by `doc_no` only instead of accepting bigint compatibility at the API boundary, and `apps/next/src/lib/server/purchase-bill-items.ts` now reads `poBuyId` from the stored outward snapshot (`po_buy.doc_no`) instead of leaking `po_buy_id bigint` through shared purchase line-item helpers. Local validation passed with `npm run type-check --workspace @ns-scrap-erp/next -- --pretty false`, `npm run lint --workspace @ns-scrap-erp/next`, `npm run build --workspace @ns-scrap-erp/next`, and `git diff --check`.
Runtime Batch C checkpoint on 2026-06-06: `C7 weight-ticket bridge/detail contract` is now closed. Decision for this slice is explicit: `weight_ticket_lines`, `weight_ticket_product_summaries`, and `weight_ticket_product_summary_lines` remain internal-only bridge/detail rows and do not receive new persisted outward keys. The outward contract now stays on `weight_tickets.doc_no`, `${doc_no}:${line_no}` for line ids, and `${doc_no}:${productCode}:${lineCount}` for summary ids. `apps/next/src/app/api/daily/weight-tickets` and `apps/next/src/app/api/daily/weight-tickets/[id]` now resolve `products.code` at the API boundary instead of parsing bigint product ids from the client, `apps/next/src/lib/server/weight-tickets.ts` now maps line/summary product refs back out as `products.code`, and `/api/purchase/bills` receipt option payloads now derive `sourceLineIds` from outward line composites instead of `weight_ticket_line_id`. Local validation passed with `npm run type-check --workspace @ns-scrap-erp/next -- --pretty false`, `npm run lint --workspace @ns-scrap-erp/next`, `npm run build --workspace @ns-scrap-erp/next`, and `git diff --check`.
Runtime Batch C checkpoint on 2026-06-06: `C8 finance/support history contract` advanced again and removed remaining compatibility fallback in active finance support reads. `apps/next/src/app/api/finance/customer-advance/route.ts` and `apps/next/src/app/api/finance/supplier-advance/route.ts` now resolve counterparties from `customer.code` / `supplier.code` only and no longer fall back to fuzzy name matching from statement descriptions. `apps/next/src/app/api/finance/foreign/fx-gain-loss-report/route.ts` now returns `bank_statement.ref_no` when a business reference exists and otherwise emits `-`, instead of falling back to raw `ref_id` / `ref_type`. `apps/next/src/app/api/admin/transaction-ledger/route.ts` was also normalized so duplicate grouping and linked-bill payloads stay on `doc_no` / `ref_no` only, while ledger row ids and bigint refs remain internal-only. Local validation passed with `npm run type-check --workspace @ns-scrap-erp/next -- --pretty false`, `npm run lint --workspace @ns-scrap-erp/next`, `npm run build --workspace @ns-scrap-erp/next`, and `git diff --check`.
Runtime Batch C declaration checkpoint on 2026-06-06: `C9 support/admin internal-only` now has an explicit shortlist for tables that will not receive outward business keys in this wave unless a user-facing flow emerges later. The current declared internal-only bucket is `audit_logs`, `deletion_log`, `deletion_tombstones`, `company_profiles`, `roles`, `user_profiles`, `app_users`, and `app_auth_events`; `auth.*` / Supabase identity-layer UUID tables remain out of scope for Batch C business-flow cutover. Remaining Batch C work should therefore stay focused on user-visible support/history surfaces such as `payment_approvals`, `stock_ledger`, and any report/helper rows that still need a `doc_no` / `ref_no` / `event_key` contract.
Runtime Batch C checkpoint on 2026-06-06: `C8 finance/support history contract` is now closed. `apps/next/prisma/schema.prisma` and `supabase/migrations/20260606100000_add_ledger_key_to_stock_ledger.sql` add persisted `ledger_key` on `public.stock_ledger`, backfill existing rows, and keep bigint PK/FK refs internal-only. `apps/next/src/app/api/stock/ledger/route.ts` now uses `ledger_key` as outward row identity instead of fabricating row ids from `ref_type/ref_no/product/date/lot/status`, while document linkage still stays on `ref_no` / `doc_no`. The migration was applied directly to `dev-target` via `psql` with `1844` rows backfilled. Together with the earlier payment-approval, bank-statement, FX, customer/supplier advance, anomaly, and admin-ledger cleanup, this closes the active `C8` bucket; remaining Batch C work is now outside active id/code cleanup and sits in later support/history design follow-ups only.
Runtime master-data hardening checkpoint on 2026-06-06: a follow-up schema batch now hardens business keys for active masters after the identifier cutover. `public.customers.code`, `salespersons.code`, `suppliers.code`, `products.code`, `accounts.code`, `currencies.code`, `purchase_channels.code`, and `sales_channels.code` are being locked to `NOT NULL`, while `customers/salespersons/suppliers/products` also receive explicit unique DB indexes so the runtime `code outward -> bigint inward` contract is enforced by the database, not only by API assumptions. The same batch removes `public.users.password` and `public.user_profiles.branch_ids` because auth source-of-truth is already `auth.users` + `app_users/app_user_branch_access`.
Runtime supplier bank-truth checkpoint on 2026-06-06: supplier receiving-bank master data now uses `supplier_bank_accounts` as the only DB truth. `apps/next/prisma/schema.prisma` and `supabase/migrations/20260606043000_move_supplier_banks_to_supplier_bank_accounts.sql` add `supplier_bank_accounts.bank_name_id -> bank_names.id`, backfill `1469` existing child rows, drop `supplier_bank_accounts.bank_name`, and drop duplicated `suppliers.bank_name / bank_account / bank_account_name`. Runtime read/write paths in supplier master-data, supplier import/export, payment approval, and purchase payments now derive primary bank display fields from the child accounts table plus `bank_names` relation only; no active code path persists or reads supplier-level bank columns anymore. Validation passed with `npm run prisma:generate --workspace @ns-scrap-erp/next`, `npm run type-check --workspace @ns-scrap-erp/next -- --pretty false`, `npm run lint --workspace @ns-scrap-erp/next`, `npm run build --workspace @ns-scrap-erp/next`, direct `psql` apply to `dev-target`, and `git diff --check`.
Runtime supplier page verification checkpoint on 2026-06-06: `/master-data/suppliers` initially still failed even after the bank-truth refactor, but the root cause was not the UI or route logic. The active dev database behind `apps/next/.env.local` was missing migration `20260605143000_add_doc_no_to_petty_advance_returns_and_code_to_supplier_bank_accounts.sql`, so `supplier_bank_accounts.code` did not exist yet and `/api/master-data/suppliers?all=1` failed with Prisma `P2022 ColumnNotFound`. Applying that existing migration to the current DB backfilled `supplier_bank_accounts.code` for `1754` rows and immediately restored the page. Post-fix browser verification confirmed `suppliers?all=1`, `salespersons`, `bank-names`, and `payment-methods` all return `200`; the supplier list renders without the error banner; and the `เพิ่มผู้ขาย` form opens with `วิธีจ่าย/รับเงิน` and `ธนาคารรับเงิน` selectors loading from master data correctly.
Runtime master-data contract hardening checkpoint on 2026-06-06: shared `simple-master-tables` now correctly separates `code-backed` masters from `auto-bigint` masters. `account_subtypes`, `directors`, `expense_types`, and `production_output_categories` now use outward `id = code` and update by `code`, while `machine_types`, `machines`, `production_lines`, `vat_settings`, and `wht_settings` stringify internal bigint ids on the way out and coerce them back to bigint on save/status update. This removes the `Expected string, received bigint` validation failure that was breaking `/master-data/directors`, `/master-data/machine-types`, `/master-data/machines`, and `/master-data/production-lines`. In the same batch, master-data UI configs were audited so pages that already have business codes but were not showing them now expose `code` again in form/list for `currencies`, `channels`, `accounts`, and `account-subtypes`. Validation passed with `npm run type-check --workspace @ns-scrap-erp/next -- --pretty false`, `npm run lint --workspace @ns-scrap-erp/next`, `npm run build --workspace @ns-scrap-erp/next`, and `git diff --check`.
Runtime purchase/support route recovery checkpoint on 2026-06-06: `/purchase/bills`, `/purchase/advance-payments`, and `/daily/bill-swap-history` all regressed in the active local app, but the root cause was DB drift instead of route logic. The database from `apps/next/.env.local` already had `purchase_bill_status_logs` and `stock_ledger.ledger_key`, but it was still missing `bill_swap_history.event_key` and `supplier_advance_allocations.allocation_key`, so Prisma queries for those routes failed before response mapping. Applying existing migrations `20260605170000_add_event_key_to_bill_swap_history.sql` and `20260605173000_add_allocation_key_to_supplier_advance_allocations.sql` to that same DB restored the required columns without code rollback. Follow-up browser verification with a logged-in session confirmed `/purchase/bills`, `/purchase/advance-payments`, and `/daily/bill-swap-history` all load successfully with no API responses `>= 400`; the temporary GET-route debug logging added during investigation was then removed.
Runtime PO Buy recovery checkpoint on 2026-06-06: `/purchase/po-buy` later failed for the same category of reason: the local app database still had the legacy `po_buy_status_logs` shape (`status/note/meta/...`) and had never received `20260605153000_upgrade_po_buy_status_logs_to_event_log.sql`, so `/api/purchase/po-buy` broke when the active route tried to read `event_key`, `action`, `from_status`, `to_status`, and `po_buy_doc_no`. Applying that existing migration to the database referenced by `apps/next/.env.local` backfilled `495` PO status-history rows and immediately restored the page. Browser verification with a logged-in session confirmed `/purchase/po-buy` loads successfully with no API responses `>= 400`.
Runtime dual-costing ledger checkpoint on 2026-06-06: `/dual-costing/cost-allocation-ledger` was still rendering duplicate React row keys because `apps/next/src/lib/server/dual-costing-management.ts` used `trading_deals.deal_no` as both the user-visible `matchId` and the table-row `id`, even though one deal can legitimately fan out into multiple ledger rows. The runtime fix keeps `matchId = deal_no` for business display but changes `row.id` to a deterministic composite of `deal_no + saleDocNo + sourceNo + productCode + allocatedAt + status + sorted-row-index`, eliminating duplicate-key collisions without leaking internal bigint ids back to the client. Validation passed with `npm run type-check --workspace @ns-scrap-erp/next -- --pretty false`, `npm run build --workspace @ns-scrap-erp/next`, and `git diff --check`.
Runtime dual-costing match-log checkpoint on 2026-06-06: `/dual-costing/match-log` had the same duplicate-key bug for the same reason, but the leak lived in the route instead of the shared builder. `apps/next/src/app/api/dual-costing/match-log/route.ts` was returning `id = deal_no`, which is a business match/group id and not unique per rendered row. The route now keeps `matchId = deal_no` for display/export/filtering and emits `id` as a deterministic composite of `deal_no + target + sourceNo + product + date + status + sorted-row-index`, so React row identity stays unique while no internal bigint ids leak outward. Validation passed with `npm run type-check --workspace @ns-scrap-erp/next -- --pretty false`, `npm run build --workspace @ns-scrap-erp/next`, and `git diff --check`.
Runtime dual-costing deal-margin checkpoint on 2026-06-06: `/dual-costing/deal-margin` was the third page in the same `trading_deals` family still using `id = deal_no`, so duplicate React keys could still surface whenever multiple rows shared a single deal number. `apps/next/src/app/api/dual-costing/deal-margin/route.ts` now keeps `docNo = deal_no` for the business-facing column but emits a deterministic row `id` composed from `deal_no + customer + product + date + statusMatch + sorted-row-index`. This closes the duplicate-key leak across the remaining dual-costing read surfaces without exposing internal bigint ids. Validation passed with `npm run type-check --workspace @ns-scrap-erp/next -- --pretty false`, `npm run build --workspace @ns-scrap-erp/next`, and `git diff --check`.
Runtime finance bank recovery checkpoint on 2026-06-06: `/finance/bank` later failed with `โหลด Bank Statement ไม่ได้`, and `/finance/cash-position` started failing in the same session for the same root cause. The active local DB from `apps/next/.env.local` still lacked `public.bank_statement.doc_no`, even though the current Prisma schema plus `/api/finance/bank` and `/api/finance/cash-position` now treat `bank_statement.doc_no` as the outward business document key. Direct `psql` inspection confirmed the column was missing; applying existing migration `supabase/migrations/20260605133000_add_doc_no_to_bank_statement.sql` added the column, backfilled `362` rows, and restored the schema contract. Follow-up `psql` checks confirmed `bank_statement.doc_no` null count = `0` and `accounts.code` null count = `0`, so the active bank/cash routes now have the required key columns available in the local app DB again.
Runtime trading matching checkpoint on 2026-06-06: `/trading/matching` was another page still using `trading_deals.deal_no` directly as the rendered table-row `id`, so duplicate React keys could still appear for repeated deal numbers such as `TD-260516-0018`. `apps/next/src/app/api/trading/matching/route.ts` now keeps `dealNo = deal_no` as the business-facing reference but emits `id` as a deterministic composite of `deal_no + purchaseBillNo + salesBillNo + supplierName + customerName + productName + date + status + sorted-row-index`. This keeps the visible deal number unchanged while closing the remaining row-identity leak in the Trading Matching table. Validation passed with `npm run type-check --workspace @ns-scrap-erp/next -- --pretty false`, `npm run build --workspace @ns-scrap-erp/next`, and `git diff --check`.
Runtime Batch B1 checkpoint on 2026-06-05: first `branches + warehouses` boundary cleanup is now in progress as `B1.1 master-data branch selector code-first`. This slice does not change PK/FK yet. It changes the active Next master-data dependents that choose a branch (`warehouses`, `accounts`, `suppliers`, `machines`, `production_lines`) so their form/select layer uses `branches.code` outward while the server maps that value back to internal `branches.id` before save. Supporting helpers were added in `apps/next/src/lib/server/branch-reference.ts`; `/api/master-data/warehouses`, `/api/master-data/accounts`, supplier write mapping, and `simple-master-tables` machine/production-line saves now resolve branch code -> internal id and read back branch code for edit forms. Validation commands have not been rerun yet because the current machine hit a process-spawn limit again (`os error 35 / Resource temporarily unavailable`) during this slice; rerun `type-check`, `lint`, `build`, and `git diff --check` after the shell can create processes normally again.
Runtime operations checkpoint on 2026-06-05: the local machine is currently intermittently unable to spawn new shell processes (`os error 35 / Resource temporarily unavailable`), so even diagnostic commands such as `ps`, `lsof`, and validation scripts may fail before execution starts. The most likely active source is the local `tmux` + `next dev` stack (`ns-scrap-erp-dev`) and/or leftover `node`/Turbopack children from prior restarts, but this has not been reverified because the machine cannot create new processes reliably enough to inspect them. Before the next validation or migration slice, clear lingering local dev processes first, then rerun the blocked commands and continue from `B1.1`.
Runtime Batch B1 checkpoint on 2026-06-05: `B1.2 shared branch/warehouse reference surface` is now implemented and validated. This slice keeps database FK relations on internal ids, but moves more user-facing branch/warehouse boundaries to business `code` for the active Next app. Added `apps/next/src/lib/server/warehouse-reference.ts` plus `normalizeStockReferenceInput()` in `apps/next/src/lib/server/stock.ts` so stock routes can accept branch/warehouse code at the API boundary and resolve back to internal ids before querying or writing. `stockReferenceData()` now exposes branch options as `id=branches.code` and warehouse options as `id=warehouses.code` with `branchId=branches.code`; `POST /api/stock/adjust`, `/api/stock/convert`, `/api/stock/status-convert`, and `GET /api/stock/ledger` now normalize those values before DB access. Purchase-side follow-up in the same slice: `/api/purchase/po-buy` and `/api/purchase/advance-payments` now expose branch dropdown options by code and map incoming branch code back to internal `branches.id` before create/update; ADV detail mapping and PO Buy row edit payloads also read back branch code outward instead of leaking raw `branch_id`. Local validation passed with `npm run type-check --workspace @ns-scrap-erp/next`, `npm run lint --workspace @ns-scrap-erp/next`, `npm run build --workspace @ns-scrap-erp/next`, and `git diff --check`.
Runtime operations recovery checkpoint on 2026-06-05: the previously blocked validation commands now run successfully on the current machine. The earlier `os error 35 / Resource temporarily unavailable` spawn issue did not recur during `type-check`, `lint`, or `build` for `B1.2`, so the current blocker for Batch B1 is no longer shell process creation. Continue from the remaining `B1` carry-over work instead of retrying the old blocked validation step.
Runtime Batch B1 completion checkpoint on 2026-06-05: `branches + warehouses + branch/warehouse selectors` is now closed at the current code-first boundary stage. Follow-up carry-over in this final slice moved `/api/branches` and the topbar selector to outward `branches.code`, converted `/api/stock/transfer` branch/warehouse option payloads plus create writes to outward code with server-side code->internal-id resolution, and finished the remaining purchase/sales bill API surfaces so outward bill rows and option lists no longer leak raw `branch_id` / `warehouse_id`. `/api/purchase/bills` now reads and validates branch-linked ADV/receipt flows against internal ids after resolving incoming branch code, while `/api/sales/bills` maps branch/warehouse code back before save and returns edit/list payload branch/warehouse values by code. This satisfies the current B1 done definition: branch/warehouse option lists now return `id = code` at the active UI/API boundary, and purchase/stock flows no longer require text PK values from `branches.id` / `warehouses.id`. Local validation passed with `npm run type-check --workspace @ns-scrap-erp/next`, `npm run lint --workspace @ns-scrap-erp/next`, `npm run build --workspace @ns-scrap-erp/next`, and `git diff --check`.
Runtime Batch B1 master-data closure checkpoint on 2026-06-05: `/api/master-data/branches`, `/api/master-data/branches/[id]`, `/api/master-data/warehouses`, and `/api/master-data/warehouses/[id]` now follow the same outward code-first contract as the rest of the active B1 consumers. Branch/warehouse master rows now return outward `id = code`, branch/warehouse status routes resolve incoming code or legacy id back to the internal row before update, and master-data save routes resolve existing rows by code/id so edit flows no longer depend on raw text PK values at the client boundary. This closes the remaining B1 master-data API leak; the real schema pass to migrate `branches.id` / `warehouses.id` and downstream FKs to bigint is still pending as a separate Batch B step. Local validation passed with `npm run type-check --workspace @ns-scrap-erp/next`, `npm run lint --workspace @ns-scrap-erp/next`, `npm run build --workspace @ns-scrap-erp/next`, and `git diff --check`.
Runtime Batch B1 cutover audit checkpoint on 2026-06-05: a direct Prisma/schema flip of `branches.id` / `warehouses.id` and downstream `branch_id` / `warehouse_id` fields to `bigint` was attempted locally, then reverted before commit because the verified blast radius is larger than the original B1 boundary slice. `type-check` immediately showed required follow-up not only in purchase/stock/master-data, but also in admin users + `app_user_branch_access`, `/api/branches`, daily expense, WTI/WTO, finance AP/AR, dashboard/report helpers, supplier import/export, and shared auth-context/filter logic that still assume branch ids are text. The repo was restored to the validated boundary-only state after this audit, and future `B1 bigint cutover` work must be treated as a cross-module schema/runtime batch rather than a narrow master-data pass.
Runtime Batch B1 direct-cutover runtime checkpoint on 2026-06-05: the cross-module runtime follow-up for the local bigint schema flip is now green at compile/build level. `branch-reference` / `warehouse-reference` now accept bigint internal ids, `auth-context` and `/api/branches` now expose outward branch code while mapping branch access through bigint internally, and the affected admin, daily expense, WTI/WTO, stock, finance AP/AR, dashboard/report, supplier, and master-data helpers/routes in the active Next app were updated so branch/warehouse filters and writes no longer assume text internal ids. Local validation passed again with `npm run type-check --workspace @ns-scrap-erp/next`, `npm run lint --workspace @ns-scrap-erp/next`, `npm run build --workspace @ns-scrap-erp/next`, and `git diff --check`. Important: this is still runtime/schema-prep only; the actual DB-side PK/FK cutover for `branches` / `warehouses` has not been applied yet in this checkpoint.
Runtime outward-contract hardening checkpoint on 2026-06-05: active business-facing master/filter surfaces for `branches`, `warehouses`, `customers`, `suppliers`, and `salespersons` now stop hiding bad source rows with outward `code ?? id` fallbacks. Added `apps/next/src/lib/business-code.ts` and updated the touched master-data routes, domain mappers, and active sales/purchase/finance/tracking/dashboard filter payload builders so outward ids/codes now require real business `code` and fail visibly if a source row is missing it. Local validation passed with `npm run type-check --workspace @ns-scrap-erp/next`, `npm run lint --workspace @ns-scrap-erp/next`, `npm run build --workspace @ns-scrap-erp/next`, and `git diff --check`.
Runtime outward-contract cleanup checkpoint on 2026-06-05: the follow-up pass removed the remaining internal-id fallback leaks from active supplier/customer/branch outward refs in purchase and sales transaction helpers/routes, including `customer-reference`, `supplier-reference`, purchase `po-buy` / `bills` / `payments` / `payment-history` / `advance-payments`, stock transfer, and sales bill warehouse option payloads. Where a business code is unavailable at the outward boundary, the active contract now returns `null`/empty instead of silently leaking the internal id. Local validation passed again with `npm run type-check --workspace @ns-scrap-erp/next`, `npm run lint --workspace @ns-scrap-erp/next`, `npm run build --workspace @ns-scrap-erp/next`, and `git diff --check`.
Runtime Batch B3 checkpoint on 2026-06-05: purchase-facing supplier boundaries are now code-first for the active Next purchase flows. Added `apps/next/src/lib/server/supplier-reference.ts` so supplier selectors can accept business `suppliers.code` outward while server routes resolve back to internal `suppliers.id` before write. `/api/purchase/po-buy`, `/api/purchase/bills`, `/api/purchase/advance-payments`, `/api/purchase/advance-payments/[id]`, `/api/purchase/payments`, and `/api/purchase/payment-history` now expose supplier option ids and outward `supplierId` / `supplier_id` fields by supplier code instead of leaking internal supplier ids. Server-side consistency checks for ADV, receipt, PO Buy, and payment settlement were updated to validate against resolved internal supplier ids after code->id lookup. This closes the purchase-facing boundary slice of `B3 suppliers + purchase/payment/advance-payment flows`; DB relations still store internal `supplier_id` as before. Local validation passed with `npm run type-check --workspace @ns-scrap-erp/next`, `npm run lint --workspace @ns-scrap-erp/next`, `npm run build --workspace @ns-scrap-erp/next`, and `git diff --check`.
Runtime Batch B2 checkpoint on 2026-06-05: customer-facing sales/customer boundaries are now code-first for the active Next sales flows and reporting filters. Added `apps/next/src/lib/server/customer-reference.ts` and `apps/next/src/lib/server/salesperson-reference.ts` so customer/salesperson references can accept business code outward and still resolve back to internal ids before write. `/api/sales/po-sell`, `/api/sales/bills`, and `/api/sales/receipts` now expose customer option ids by `customers.code` and resolve incoming `customerId` back to internal `customers.id` before save; receipts also validate the selected bill against the resolved customer. Customer-facing analytics/filter surfaces now follow the same outward code contract: pending sales (`buildPendingSales`), profit/cost analysis, AR aging, customer tracking, and the main dashboard all return customer filter ids by code and resolve incoming `customerId` query params back to internal ids server-side. Customer import/save now also resolves optional salesperson references by code/id before write. This closes the current `B2 salespersons + customers + customer-facing sales filters` boundary slice without changing DB FK storage. Local validation passed with `npm run type-check --workspace @ns-scrap-erp/next`, `npm run lint --workspace @ns-scrap-erp/next`, `npm run build --workspace @ns-scrap-erp/next`, and `git diff --check`.
Runtime Batch B2/B3 master-data checkpoint on 2026-06-05: `customers`, `salespersons`, and `suppliers` master-data surfaces now follow the same code-first contract as their downstream transaction flows. `/api/master-data/customers`, `/api/master-data/customers/[id]/status`, `/api/master-data/customers/export`, `/api/master-data/salespersons`, `/api/master-data/salespersons/[id]`, `/api/master-data/suppliers`, `/api/master-data/suppliers/[id]`, and `/api/master-data/suppliers/export` now accept outward business codes for edit/status/filter paths, resolve back to internal ids before DB write, and return outward `id/code` plus salesperson references by business code instead of leaking internal FK values. Customer/supplier export sheets also no longer include a separate internal-id column. Local validation passed with `npm run type-check --workspace @ns-scrap-erp/next`, `npm run lint --workspace @ns-scrap-erp/next`, `npm run build --workspace @ns-scrap-erp/next`, and `git diff --check`.
Runtime finance/dashboard helper checkpoint on 2026-06-05: the bigint fallout pass for the finance/dashboard helper group is now green at scoped type-check level. Updated `cash-others-anomaly`, `finance-accounting-cashflow-planning`, `finance-accounting-dashboard`, `finance-accounting-statements`, `finance-accounting-working-capital`, `main-calendars`, `main-dashboards`, and `dual-costing-management` so internal PK/FK maps now use `bigint` where appropriate, outward helper rows stringify bigint ids explicitly, and no business/display field falls back to internal ids. Scoped verification: `npm run type-check --workspace @ns-scrap-erp/next 2>&1 | rg "cash-others-anomaly|finance-accounting-cashflow-planning|finance-accounting-dashboard|finance-accounting-statements|finance-accounting-working-capital|main-calendars|main-dashboards|dual-costing-management"` returned no matches, and `git diff --check` passed for the touched helper/doc files. Broader repo `type-check` still has fallout in other modules outside this helper batch.
Runtime master-data bigint fallout checkpoint on 2026-06-05: the active master-data `accounts / beneficiaries / channels / currencies / products` routes now conform to the DB-first bigint schema for internal ids while keeping outward business identifiers code-first wherever the table has a real business key. `accounts`, `sales_channels`, `currencies`, and `products` no longer treat internal ids as outward ids; they resolve incoming route/form ids by `code` or parsed bigint, write through internal bigint rows only, and return outward `id/code` from real business codes. Product export/import also dropped the outward internal-id column and now updates by `products.code` only. `overseas_recipients` still has no business `code` column in schema, so its outward `id` remains the stringified bigint row id instead of inventing a fake fallback code. Scoped verification: filtering `npm run type-check --workspace @ns-scrap-erp/next` for `master-data/accounts|master-data/beneficiaries|master-data/channels|master-data/currencies|master-data/products|lib/domain/product` returned no matches; broader repo `type-check` still fails in modules outside this batch such as `reports/aggregate` and `sales/receipts`.
Runtime Batch B2/B3 schema-runtime checkpoint on 2026-06-05: the active Next runtime now compiles cleanly after flipping the `customers` / `salespersons` / `suppliers` family to internal `bigint` ids in Prisma schema plus downstream FK typings. Follow-up in this slice updated the remaining active purchase/finance/report/dashboard/trading consumers that still mixed outward business codes with internal ids: purchase bills/payments/payment history, finance customer/supplier advances, aggregate reports, trading dashboards/matching, main sales commission/control, and related dual-costing/admin helpers now keep bigint ids internal for DB filters/comparisons while returning outward party references as business code or display strings only. Local validation passed again with `npm run type-check --workspace @ns-scrap-erp/next`, `npm run lint --workspace @ns-scrap-erp/next`, `npm run build --workspace @ns-scrap-erp/next`, and `git diff --check`. Actual DB migration/apply for these bigint id changes is still pending; this checkpoint only closes the Prisma/runtime fallout in the app code.
Runtime stock + sales-tracking fallout checkpoint on 2026-06-05: the scoped bigint repair pass for `stock + tracking` routes is now green at filtered type-check level. Updated `/api/stock/adjust`, `/api/stock/convert`, `/api/stock/ledger`, `/api/stock/status-convert`, `/api/stock/transfer`, `/api/tracking/customer`, `/api/tracking/product`, `/api/tracking/supplier`, and the directly-related `src/lib/server/stock.ts` helper so stock write paths stop seeding string ids into bigint tables, product refs are resolved to internal bigint ids before query/write, and outward rows/options keep using business `code` / `doc_no` without internal-id fallback in display fields. Scoped verification passed: `npm run type-check --workspace @ns-scrap-erp/next 2>&1 | rg "stock/adjust|stock/convert|stock/ledger|stock/status-convert|stock/transfer|tracking/customer|tracking/product|tracking/supplier|src/lib/server/stock\\.ts"` returned no matches, and `git diff --check` passed after the batch.
Runtime Batch B4 checkpoint on 2026-06-05: the active `products + product-dependent refs` runtime cleanup is now green for the current purchase/sales/dual-costing/trading/report scope. `/api/purchase/bills`, `/api/purchase/po-buy`, `purchase-bill-items`, `/api/sales/bills`, `/api/sales/po-sell`, `/api/sales/receipts`, `/api/dual-costing/cost-allocator`, `/api/dual-costing/cost-pool`, `/api/trading/dashboard`, `dual-costing-management`, `po-buy-reconciliation`, `production-reports`, `cash-others-anomaly`, and `/api/reports/aggregate` now keep internal `products.id bigint` inside Prisma/maps only while outward item rows, selectors, filters, and report payloads use `products.code` or document `doc_no` at the boundary. This pass also removed the remaining verified product-name / product-id display fallbacks to internal ids in the touched scope; when legacy JSON lacks a business code the outward contract now returns empty or `-` instead of leaking the internal bigint. Local validation passed with `npm run type-check --workspace @ns-scrap-erp/next -- --pretty false`, `npm run lint --workspace @ns-scrap-erp/next`, `npm run build --workspace @ns-scrap-erp/next`, and `git diff --check`.
Runtime Batch C checkpoint on 2026-06-05: the first low-risk `document families` outward-contract cleanup is now green for read/report surfaces that already have a stable `doc_no`. `/api/purchase/receipt-vouchers` now returns voucher `id = doc_no` and purchase-bill linkage by `purchase_bill_doc_no` instead of leaking bigint ids. `buildCashFlowAnalysis()` in `finance-accounting-cashflow-planning` now exposes AR/AP drill-down rows with `id = doc_no` for sales and purchase bills. `ADV` helper/route follow-up also moved outward `id` usage to `doc_no` for list/detail/create flows: `mapAdvancePaymentRow()` now returns `id = doc_no`, allocation rows use purchase-bill `doc_no`, and `POST /api/purchase/advance-payments` returns `{ docNo, id: docNo }` while audit/entity internals still keep bigint ids server-side. Local validation passed with `npm run type-check --workspace @ns-scrap-erp/next -- --pretty false`, `npm run lint --workspace @ns-scrap-erp/next`, `npm run build --workspace @ns-scrap-erp/next`, and `git diff --check`.
Runtime Batch C checkpoint on 2026-06-05: the next document-family pass is now green for `payments`, `stock issue`, `daily expenses`, and `petty advances`. `/api/purchase/payments` payment rows now expose `id = payments.doc_no`, and approval ids are serialized only as internal action refs where the payment queue still needs cancel/approval flows. `/api/sales/stock-issue` list rows now expose `id = doc_no`. `/api/daily/expenses` and `/api/daily/petty-advances` now expose document `id = doc_no` in list/create/update responses, while `/api/daily/expenses/[id]` cancel and `/api/daily/petty-advances/returns` resolve the target document by either `doc_no` or internal bigint during the transition so the existing edit/cancel/return screens keep working without leaking internal ids outward. Local validation passed with `npm run type-check --workspace @ns-scrap-erp/next -- --pretty false`, `npm run lint --workspace @ns-scrap-erp/next`, `npm run build --workspace @ns-scrap-erp/next`, and `git diff --check`.
Runtime Batch C checkpoint on 2026-06-05: `daily/transfers` and `daily/payment-approval` now follow the same outward document-key contract. `/api/daily/transfers` now exposes `id = doc_no` in list/create/update responses and resolves edit targets by either `doc_no` or internal bigint server-side. `/api/daily/payment-approval` now exposes pending source rows by business document number (`purchase bill`, `ADV`, and `expense` all use `sourceDocNo` / `docNo` outward), approved rows use approval `doc_no` where available, and approval POST now resolves incoming `sourceId` by `doc_no` or bigint before loading the real source record. Existing approval writes still persist internal bigint ids inside `payment_approvals.source_id`, but no outward queue/action payload in the touched scope needs those internal ids anymore. Local validation passed with `npm run type-check --workspace @ns-scrap-erp/next -- --pretty false`, `npm run lint --workspace @ns-scrap-erp/next`, `npm run build --workspace @ns-scrap-erp/next`, and `git diff --check`.
Runtime Batch C checkpoint on 2026-06-05: the `sales/receipts` route now follows the same strict no-fallback document-key policy as the other cleaned document families. Receipt list rows now expose `id = receipts.doc_no`, receipt create/update returns `{ id: doc_no }`, and receipt edits now resolve the target by `doc_no` only instead of accepting bigint receipt ids. Internal receipt ids remain only in DB writes and bank-statement linkage. Local validation passed with `npm run type-check --workspace @ns-scrap-erp/next -- --pretty false`, `npm run lint --workspace @ns-scrap-erp/next`, `npm run build --workspace @ns-scrap-erp/next`, and `git diff --check`.
Identifier mission policy checkpoint on 2026-06-05: from this point forward, `B1/B2/B3` must be executed as schema-first cutovers by table family, not fallback-driven boundary cleanup. Required rule: set DB + Prisma schema to the intended target shape first, then fix app code to conform; do not preserve or add outward fallbacks from business/display fields back to internal ids just to keep runtime green. In dev, visible breakage is preferred over hidden fallback debt because it localizes the real remaining work. `B1/B2/B3` must not be marked complete while any outward payload, display field, export field, or filter still falls back to internal `id`/FK values.
Runtime outward-display cleanup checkpoint on 2026-06-05: the next cleanup pass removed the remaining verified `String(id)` / `stringifyBusinessValue(id, ...)` style leaks from active B1/B2/B3 outward display/detail/report surfaces. Follow-up touched purchase bill detail, advance-payment detail, daily bill-swap history, daily expense detail, dual-costing cost pool/deal margin/match log, transaction-ledger payee mapping, trading dashboard search/display, supplier domain output, advance-payment output, and dashboard branch summaries so visible `branchName` / `supplierName` / `customerName` / `partnerName` / outward supplier code fields now return business display data, business code, `-`, or empty instead of internal ids. Internal bigint/text ids are still used where required for server-side grouping/joins/lookups, but no new outward fallback to internal ids was added in this pass. Local validation passed with `npm run type-check --workspace @ns-scrap-erp/next`, `npm run lint --workspace @ns-scrap-erp/next`, `npm run build --workspace @ns-scrap-erp/next`, and `git diff --check`.
Runtime purchase-bills hotfix checkpoint on 2026-06-05: `/api/purchase/bills` had a post-cutover runtime regression where `optionsPayload()` still returned internal `bigint` salesperson ids (`salespersons[].id` and `suppliers[].sales_id`) directly in the JSON payload. That made the route fail at response serialization and blocked `/purchase/bills` from loading. The route now maps both outward fields to business `salesperson.code` instead, preserving the active `code outward, id inward` contract. Local validation passed with `npm run type-check --workspace @ns-scrap-erp/next`, `npm run build --workspace @ns-scrap-erp/next`, and `git diff --check`.
Runtime Wave 2 daily/finance fallout checkpoint on 2026-06-05: the first post-cutover repair pass for the daily/finance route group is now in place for `/api/daily/expenses`, `/api/daily/expenses/[id]`, `/api/daily/payment-approval`, `/api/admin/company-profile`, and the local helper `src/lib/server/daily.ts`. These routes no longer assume string PK/FK values for `expenses.id`, `accounts.id`, `company_profiles.id`, supplier bank-account ids, or purchase/advance source ids after the DB-first bigint cutover. Company profile is now treated as a singleton row located by `findFirst/orderBy` instead of the legacy string id `default`; expense create/edit now resolves bigint account/category/branch refs before write and returns outward ids as strings; payment approval now stringifies outward row ids for JSON while storing supplier code snapshots instead of internal supplier ids in `party_id`; and transfer helper rows no longer try to seed bigint `bank_statement.id` manually. Validation for this checkpoint is scoped: the touched files disappeared from `type-check` output, but full repo `type-check` still fails in other daily/weight-ticket/petty-advance/dashboard modules outside this batch.
DB-first identifier cutover checkpoint on 2026-06-05: the migration strategy is now explicitly reset to `DB-first`. A direct `dev-target` audit confirmed the current runtime failure is not a stale dev-server issue but a real DB/schema mismatch: Prisma now expects `BigInt` for the active `B1/B2/B3` family, while `public.branches`, `warehouses`, `customers`, `salespersons`, `suppliers`, and their downstream refs in `dev-target` are still `text`. New tracker [21-db-first-identifier-cutover.md](/Users/watcharathatsrithanesiganon/Documents/GitHub/ns-scrap-erp/docs/migration/21-db-first-identifier-cutover.md) records the reset policy, full inventory snapshot, and cutover waves. Wave 1 is the foundation family: `branches`, `warehouses`, `customers`, `salespersons`, `suppliers`, plus every verified `branch_id` / `warehouse_id` / `customer_id` / `supplier_id` / `sales_id` reference that must move with them. Migration scaffold `supabase/migrations/20260605080737_db_first_identifier_wave1_foundation_masters.sql` has been created and is now the active DB work item.
DB-first identifier cutover checkpoint on 2026-06-05 (Wave 1 applied): migration `20260605080737_db_first_identifier_wave1_foundation_masters.sql` was applied successfully to `dev-target`. `branches`, `warehouses`, `customers`, `salespersons`, and `suppliers` now use `id bigint` as the live PK, while old business/string ids are preserved as `legacy_id`. Verified downstream refs such as `purchase_bills.branch_id/warehouse_id/supplier_id/sales_id`, `sales_bills.branch_id/customer_id/warehouse_id/sales_id`, `supplier_advance_payments.branch_id/supplier_id`, `weight_tickets.branch_id/customer_id/supplier_id`, and `app_user_branch_access.branch_id` are now `bigint`, with `*_legacy_id` companions preserving old text values. Post-apply validation passed with `npm run type-check --workspace @ns-scrap-erp/next`, `npm run lint --workspace @ns-scrap-erp/next`, `npm run build --workspace @ns-scrap-erp/next`, and `git diff --check`. Anonymous `GET /api/branches` and `GET /api/purchase/bills` now return `401` instead of `500`, which confirms the previous `BigInt mismatch` root cause was removed for this foundation family.
DB-first identifier cutover checkpoint on 2026-06-05 (Wave 2 applied): migration `20260605082953_db_first_identifier_wave2_remaining_text_ids.sql` was applied successfully to `dev-target` and closes the remaining `public.id text` inventory. After apply, direct DB audit shows `public.id text = 0`, `public.id int8 = 74`, and `public.id uuid = 10`. The same wave also backfilled missing business-key columns where the old string PK was already serving that role (`accounts.code`, `currencies.code`, `impurities.code`, `purchase_channels.code`, `sales_channels.code`, `overseas_remittance_purposes.code`) and added `loans.contract_no` plus a non-unique interim `trading_deals.deal_no`. Prisma was then re-synced from the live DB with direct `prisma db pull` using sourced `apps/next/.env.local`, and `npm run prisma:generate --workspace @ns-scrap-erp/next` passed.
Runtime fallout checkpoint on 2026-06-05 after Wave 2: the active blocker has moved fully from DB/schema mismatch to app/runtime conformity. `npm run type-check --workspace @ns-scrap-erp/next` now fails with widespread bigint fallout across daily/finance/report/purchase server code that still assumes these converted ids are `string`, including `admin/company-profile`, `admin/transaction-ledger`, daily expenses/payment approval, `purchase-bill-settlement`, `po-buy-reconciliation`, `main-sales-control`, `profit-cost-analysis`, `production-reports`, and `stock`. No new DB migration is currently pending before those runtime fixes; continue by closing the TypeScript fallout slice-by-slice against the now-canonical bigint schema.
DB-first identifier cleanup checkpoint on 2026-06-05: Wave 1 was closed fully, not just cut over. Cleanup migration `20260605082330_drop_wave1_legacy_identifier_columns.sql` was applied to `dev-target`, all temporary `legacy_id` / `*_legacy_id` compatibility columns were removed from `public`, and post-cleanup validation still passed with `npm run type-check --workspace @ns-scrap-erp/next`, `npm run lint --workspace @ns-scrap-erp/next`, `npm run build --workspace @ns-scrap-erp/next`, and `git diff --check`. The active foundation family now matches the intended target shape directly: internal `bigint id` only, outward business `code` only, with no DB-side legacy-id fallback fields left behind.

## Current Batch

`Batch SYS: System and Cleanup`

Goal:

- Finish remaining system/admin/report placeholders and then run a full navigation QA pass.
- Implement self-service password change through Supabase Auth only; never store or migrate password values into application tables.
- Keep migration/backup/reset tools as safe read/design baselines until destructive actions have explicit confirmation, audit, backup, RLS, and rollback design.
- Build `/reports` as an index/search surface over active report routes before duplicating report-specific query logic.
- During this and future clone batches, keep the legacy/Vue screen as the visual baseline first. Preserve cards, colors, banners, tables, button placement, labels, spacing, and compact density unless a documented deviation is approved. If Vue has been simplified or has known layout/column drift, use `old-apps/legacy/` as the stronger baseline before improving the data wiring.
- Current docs slice: SYS0 System/Admin module overview is implemented, validated, and pushed. It maps `/admin/change-password`, `/admin/migration-tools`, `/reports`, admin polish, full-route QA order, permissions, and destructive-action safety constraints.
- Current implementation slice: SYS1 `/admin/change-password` self-service Supabase Auth flow is implemented, validated, and pushed. It preserves legacy UI, validates password syntax/confirmation/current-password, verifies current password with Supabase Auth, updates via `updateUser`, and does not store password in app tables.
- Current implementation slice: SYS2 `/admin/migration-tools` safe read/design baseline is implemented, validated, and pushed. It preserves legacy Backup/Restore cards while disabling export, restore, cloud migration, user migration, reset, snapshot cleanup, and auto-backup actions until destructive-action design is approved.
- Current polish slice: SYS3 `/admin/audit` and `/admin/users-permissions` polish is implemented, validated, and pushed. Audit now has current-page CSV export; Users & Permissions now has summary cards for active, branch-scoped, pending Auth link, and must-change-password users. Branch-scope enforcement remains a SYS5/auth hardening follow-up.
- Current QA slice: SYS5 full system cleanup route QA is implemented, validated, and pushed. It confirmed all active navigation routes have dedicated pages, protected routes redirect unauthenticated users, SYS routes render authenticated desktop/mobile without page-level overflow, and the retrospective legacy UI parity backlog is now queued.
- Current sales cleanup slice: `/sales/po-sell` moves its explanatory PO Sell copy to the app topbar, removes the in-page info banner and Top 5/outstanding panels, enables the `+ PO Sell ใหม่` form/API create path, and aligns the create modal with the compact PO Buy modal. `/sales/bills` moves its explanatory copy to the app topbar, removes the in-page sales hero and Pending Sale warning strip, enables the `+ บิลขายใหม่` form/API create path, uses one `สาขา/คลัง` dropdown from branch master in the modal, aligns item/VAT/summary/note sections with the purchase bill modal, and enables filtered Excel export. Validation passed locally: `npm run type-check --workspace @ns-scrap-erp/next`, `npm run lint --workspace @ns-scrap-erp/next`, `npm run build --workspace @ns-scrap-erp/next`, and `git diff --check`.
- Current topbar auth follow-up: the active Next topbar account trigger now shows the signed-in user's roles under the email address and repeats the same role summary inside the account dropdown. `AuthStatus` reads `roles` from `/api/auth/me`, falls back to the Supabase session email if the profile request fails, and keeps the existing change-password/logout actions unchanged. `getCurrentAuthContext()` now also falls back to a single case-insensitive `app_users.email` match when the current Supabase Auth user has not yet been linked into `app_users.auth_user_id`, so existing role assignments such as `admin` still resolve during the pending-auth-link stage. The `/admin/change-password` page is no longer listed in the sidebar and remains accessible from the topbar account dropdown only.
- Current warehouse weighing document decision: per user clarification on 2026-05-25, the target system must not use a plain `WT` document number and must not use `GR/DN` as the main document numbers. Inbound receiving issues `ใบรับของ / Weight Ticket In` as `WTI{branchCode}{YYMM}-NNNN`; outbound delivery issues `ใบส่งของ / Weight Ticket Out` as `WTO{branchCode}{YYMM}-NNNN`. Prefix/direction identify in/out; status is lifecycle only.
- Current WTI/WTO menu naming decision: per user clarification on 2026-05-25, the create/weighing page should be named `ชั่งสินค้า / รับ-ส่งของ`, and the list/search page should be named `รายการใบรับ-ส่งของ`. The list page must include both WTI and WTO and support filtering by document type/status/branch/party/vehicle for office follow-up and bill selection.
- Current WTI/WTO entry-point follow-up: `/daily/weight-tickets` remains the create/edit route and page title `ชั่งสินค้า / รับ-ส่งของ`, but it is no longer shown as a standalone sidebar menu. Users should enter this page from the `เพิ่ม` action on `/daily/weight-ticket-list` or from document edit actions instead of navigating to it directly from the main menu.
- Current purchase flow documentation update: per user clarification on 2026-05-25, inbound stock receiving uses the business document `ใบรับของ / WTI` for Stock purchases only; there is no plain `WT` document. `docs/notes/Purchase Flow.md` now separates four modes: Stock + PO, Stock + Spot Buy / No PO, Trading + PO, and Trading + Spot. Stock modes use `WTI` before purchase bill and can create stock ledger; Trading modes do not enter stock, do not use `WTI` as the weight source, require quantity/weight entry in `/purchase/bills`, and cut PO only when the source is PO. Stock receipt-to-PO cuts happen through purchase-bill allocation and must be many-to-many.
- Current Trading purchase source clarification: per user clarification on 2026-05-25 after checking legacy behavior, `Stock/Trading` and `PO/Spot Buy` are separate axes. `Stock/Trading` controls stock behavior; `PO/Spot Buy` controls whether the purchase line references/cuts a PO. `Spot Buy` in Trading means no PO only, not stock entry. Target docs now require source selection at purchase-bill line level and derive header source as `SPOT_BUY`, `PO_RECEIPT`, or `MIXED`.
- Current `ใบรับของ` detail update: per user clarification on 2026-05-25, the receipt document must auto-stamp document number, document date, creation time, and entered-by user from system/auth data only after save; the form must not preview or display those generated values before save. The operator enters vehicle plate, selects branch/product, enters weight, chooses impurity deduction mode (`ไม่หัก`, `หัก`, `หัก%`), selects an active impurity from `/master-data/impurities` when the line has a deduction, adds image evidence per product line, and then the system issues the receipt document. `/daily/weight-tickets` now persists real WTI/WTO records through `/api/daily/weight-tickets`, keeps simplified labels such as `ผู้ขาย`, red required asterisks, no Ready Check / after-save helper aside panel, no sticky top weight summary, a bottom-positioned `เพิ่มสินค้า` button after the item list, and a fixed save footer that summarizes item count/gross/deduction/net while offsetting on desktop so it does not overlap the app sidebar.
- Current weight-ticket topbar follow-up on 2026-05-31: `/daily/weight-tickets` now moves its explanatory copy (`ระบบจะออกเลขเอกสาร วันที่ เวลา และผู้กรอกหลังบันทึก` on create, and the edit-mode mutation note) into the app topbar via `PageTitleOverride` and removes the duplicate in-page title/subtitle block from the main card header.
- Current line-image validation update: per user clarification on 2026-05-25, each product line in WTI/WTO must have at least one image before saving. Images are no longer treated as one document-level attachment bucket; persisted records store image count/names on each product line and aggregate totals at the document header for listing.
- Current vehicle-image follow-up: per user request on 2026-05-25, `/daily/weight-tickets` now has document-level `รูปภาพรถส่งของ` upload beside the `ทะเบียนรถ` field. Vehicle image names are stored separately from product-line image names in `weight_tickets.vehicle_image_names`, existing filenames remain visible when editing, and product image rows still show an `เปิดรูปภาพ` action only for images uploaded in the current browser session. When deduction mode is `ไม่หัก`, the deduction value input is hidden instead of disabled.
- Current `รายการใบรับ-ส่งของ` implementation update: `/daily/weight-ticket-list` now reads real data from `/api/daily/weight-tickets` backed by `public.weight_tickets` and `public.weight_ticket_lines`, no longer falls back to sample/localStorage rows, supports search/type/status/branch/date filters, opens a dedicated detail page by row click, and allows `แก้ไข` / `ยกเลิก` until the document is referenced by purchase/sales bill allocation. The list pagination summary bar is no longer rendered as a card.
- Current `รายการใบรับ-ส่งของ` tab/filter update: per user clarification on 2026-05-26, `/daily/weight-ticket-list` now separates `WTI` and `WTO` with shadcn-style line tabs instead of a shared type dropdown. Each tab owns its own status filter set so users only see statuses valid for that document direction, and the branch filter now uses the shared `BranchSelectCombobox` instead of a page-local select.
- Current WTI/WTO detail/create UX update: per user clarification on 2026-05-25, the old detail modal is no longer sufficient because one document can contain 30+ product lines. Row click from `/daily/weight-ticket-list` must open a full detail page instead of a modal, the detail page must show product notes, image sections, and a document edit/cancel timeline from `app_audit_logs`, and the create/edit page must switch from one long repeated line-card stack to a two-pane item navigator + active-line editor so long documents remain workable.
- Current WTI/WTO outbound document-action update: `/daily/weight-ticket-list` now has a `แชร์` action in the table for both `WTI` and `WTO`. The current implementation shares a concise LINE message consisting of document type + document number, seller/customer, branch, document timestamp, net weight, and the detail-page link. `WTI` print remains available separately; `WTO` print is still follow-up.
- Current outbound design documentation update: `docs/notes/Sales Flow.md` now documents `WTO` as the outbound source document for the sales side with an explicit use-case map, a dedicated `Flow ใบส่งของ / WTO` sequence, and the target business status set `ส่งของแล้ว`, `ออกบิลแล้ว`, and `ยกเลิก`. Once a `WTO` is used to create a sales bill, the document is considered `ออกบิลแล้ว` and should no longer allow edit/cancel in the target policy.
- Current WTI print slice: `/daily/weight-ticket-list/[id]` and `/daily/weight-ticket-list` now show `พิมพ์ใบรับสินค้า` for `WTI` only. The action fetches active company-profile data from `/api/admin/company-profile` and opens a print-ready receipt document using the real WTI data. The current print layout intentionally follows the old legacy weighing-ticket baseline more than the legacy purchase-bill template, because WTI needs weight/impurity/net/vehicle-oriented fields, not purchase price/amount columns. `WTO` print and LINE share remain follow-up work.
- Current WTO print slice: the shared weight-ticket print helper now supports `WTO` too. `/daily/weight-ticket-list` and `/daily/weight-ticket-list/[id]` both expose a print action for outbound documents, reusing the same real company-profile source and table/summary/signature layout while switching headings/party labels/signature labels to the outbound wording (`ใบส่งของ`, `ลูกค้า/ผู้รับสินค้า`, `ผู้ส่งของ`, `ผู้รับของ`).
- Current shared table-standard follow-up: `docs/design.md` now defines central table variants instead of treating `/purchase/bills` as the implicit baseline. The active baseline is split into `Table / Plain` (no row dividers, spacing + hover separation) and `Table / Lined` (light slate row separators). `/daily/weight-ticket-list` is the first active consumer explicitly aligned to `Table / Plain`.
- Current typography baseline follow-up: active Next user-facing surfaces now use `Noto Sans Thai` as the global font baseline instead of `Sarabun`. `apps/next/src/app/globals.css` was updated for body/form controls, and active print/preview templates that previously hardcoded Sarabun (`WTI/WTO` print, company-profile print preview, receipt-voucher print preview) now use the same `Noto Sans Thai` baseline so screen and document output no longer drift.
- Current WTI mobile form hardening update: `/daily/weight-tickets` now avoids SSR hydration mismatch by using a deterministic first line id on initial render instead of generating a random UUID on the server. Shared `Input`, `Select`, and `SearchCombobox` mobile font sizing were raised to a safer touch baseline, long uploaded image filenames are truncated instead of stretching the mobile layout, and the line-level impurity deduction mode field moved away from the browser-native select so its trigger text/layout can be tuned consistently with the shared form controls. The current received-status wording shown in WTI surfaces is `รับของแล้ว`.
- Current WTI/WTO line-id hardening update: the deterministic client placeholder `line-1` is now treated as UI-only for hydration-safe first render. Server persistence no longer trusts client line ids for `weight_ticket_lines.id`; the API generates fresh `WTL-*` ids on save/update so new `WTI/WTO` documents do not collide on repeated placeholder values.
- Current WTI/WTO save-return follow-up: after save/edit, `/daily/weight-tickets` now routes back to `/daily/weight-ticket-list` with the saved document type in the query string so `WTO` returns directly to the outbound tab and `WTI` returns to the inbound tab. Remaining server/image fallback text in this flow was also tightened so entered-by falls back to auth user id instead of a generic Thai placeholder, and raw data-image attachments no longer use the hardcoded display name `รูปภาพแนบ`.
- Current WTI status wording update: per user clarification on 2026-05-26, inbound `WTI` now keeps `ออกบิลแล้วบางส่วน` separate from full completion in UI/filtering. `received` remains `รับของแล้ว`, `partially_billed` now displays as `ออกบิลแล้วบางส่วน`, `billed` now displays as `เสร็จสิ้น`, and the inbound list tab exposes all three states separately instead of collapsing partial/full billing together.
- Current WTI product-summary implementation slice: repo schema, API, and purchase-bill form now implement the new `WTI/WTO` three-layer model from `docs/notes/WTI Product Summary Design.md`. `weight_tickets` remains the header total layer, `weight_ticket_lines` remains the raw lot layer, and new tables `weight_ticket_product_summaries` + `weight_ticket_product_summary_lines` now exist in `apps/next/prisma/schema.prisma` and `supabase/migrations/20260526103000_create_weight_ticket_product_summaries.sql`. `/api/daily/weight-tickets` save/update now rebuild per-product summaries from raw lots, `/api/purchase/bills` receipt options now expose and validate against per-product summary rows instead of mapping raw receipt lines 1:1, and the Stock purchase-bill UI now renders one row per product summary with aggregated gross/deduct/net and source lot count. On 2026-05-26 this migration was applied to the database used by local `apps/next` through `apps/next/.env` (`DATABASE_URL`), and local save flow for `POST /api/daily/weight-tickets` was re-verified successfully after the apply. Separate note remains: the current shell still does not have a linked/authenticated Supabase CLI context for explicitly targeting project `fhglqymcdmrgbsbadnwr` by project reference.
- Local runtime hardening on 2026-05-26: after adding the WTI product-summary Prisma models, local `next dev` could keep a stale Prisma client instance in memory and throw `Cannot read properties of undefined (reading 'createMany')` on the new summary delegates. `apps/next/src/lib/server/prisma.ts` now validates the concrete delegate methods (`createMany`) for `weight_ticket_product_summaries` and `weight_ticket_product_summary_lines` before reusing the cached client, and drops/recreates the cached Prisma client if those delegates are missing. `apps/next/src/app/daily/weight-ticket-list/page.tsx` also switched to a relative component import to avoid the Turbopack alias-resolution failure that was breaking the post-save redirect to `/daily/weight-ticket-list` during the same local debug cycle.
- Current system-menu wording decision: per user clarification on 2026-05-25, `ข้อมูลบริษัท (สำหรับใบพิมพ์)` belongs under `ตั้งค่าระบบ`, not `ข้อมูลหลัก`. Active navigation now nests `/admin/company-profile` under `/admin/system-settings`, and the system-settings page links directly to the company-profile screen so system-wide print data is managed from one place.
- Current WTI/WTO persistence checkpoint: additive DB table pair `public.weight_tickets` + `public.weight_ticket_lines` is now defined in `supabase/migrations/20260525103000_create_weight_tickets.sql`, reflected in `apps/next/prisma/schema.prisma`, and applied directly to the active dev DB on 2026-05-25 after confirming the runtime error `42P01 relation "public.weight_tickets" does not exist`. This fixed the immediate `โหลดรายการใบรับ-ส่งของไม่ได้` API failure.
- Current WTI/WTO UI validation checkpoint: after the line-level image requirement and impurity-master dropdown wiring, `npm run lint --workspace @ns-scrap-erp/next`, `npm run type-check --workspace @ns-scrap-erp/next`, `npm run build --workspace @ns-scrap-erp/next`, and `git diff --check` passed. Browser smoke confirmed the protected `/daily/weight-tickets` route redirects to login when the Playwright browser has no session; after build, the login surface shows no warning/error console messages. Authenticated form interaction smoke still needs a test login/session in the browser. OpenAPI now documents the concrete `/api/master-data/impurities` contract used by the WTI/WTO deduction dropdown, including impurity list/write/status schemas.
- Current Stock purchase bill allocation update: per user clarification on 2026-05-25, after a `ใบรับของ` exists, office creates the Stock purchase bill by selecting branch, supplier, and receipt. The system must display product/weight details from the receipt. The user then selects PO lines to cut qty/weight from PO. If receipt weight exceeds the selected PO, the user must add another product/bill line from the same receipt and choose `Spot Buy` or another PO so the bill allocation covers the full receipt amount being billed. The active `/purchase/bills` form now locks `ประเภทบิล`, `สาขา`, `คลัง`, `ผู้ขาย`, and `ใบรับของ` after a WTI is selected; users must click `ล้างใบรับของ` before changing upstream context, preventing mismatched supplier/branch/warehouse/receipt edits mid-form.
- Current Stock purchase-bill allocation update after WTI product-summary design: `/purchase/bills` now lets one `receiptSummaryId` split into multiple purchase-bill rows inside the Stock form. When a selected `PO Buy` does not cover the full WTI product-summary weight, the user can add another row under the same summary and continue with another `PO` or `Spot Buy`; the in-form PO remaining indicator decrements against draft allocations, and PO-priced lines still re-derive `price` from the selected PO on save/edit instead of trusting client payloads. On 2026-05-26 the business rule was clarified again: `Spot Buy` must not force the remaining WTI weight to be billed in the same PB. Partial PB save is valid as long as each row does not exceed current WTI remaining and each selected PO does not exceed current `remaining_qty`; WTI must then move between `รับของแล้ว`, `ออกบิลแล้วบางส่วน`, and `เสร็จสิ้น` based on real active-bill usage.
- Current Stock purchase-bill allocation rule supersession on 2026-06-06: the 2026-05-26 partial-save rule above is superseded for new PB writes. When a user selects a WTI/product summary into a Stock purchase bill, the selected summary's current `remainingWeight` must be fully allocated in that PB before save. PO lines may cover any portion up to PO remaining; if PO allocation still leaves residual WTI weight, the user must add an explicit `Spot Buy` line or another PO line for the residual. Runtime must block save when the selected WTI/summary is under-allocated or over-allocated: `under-allocated/ขาด` means draft line total is less than selected summary `remainingWeight`, and `over-allocated/เกิน` means draft line total is greater than selected summary `remainingWeight`. Do not add fallback code to silently leave residual allocation outside the PB.
- Current purchase-bill allocation/data-model checkpoint on 2026-05-26: the target allocation fact tables are now implemented in repo and local dev DB: `purchase_bill_receipt_allocations` for WTI product-summary usage and `purchase_bill_po_allocations` for PO cuts. `/api/purchase/bills` create/edit/cancel now writes/deletes these rows and refreshes WTI status/remaining from allocation facts rather than only line snapshots. `/purchase/bills/[id]` now shows both `สรุปต่อสินค้า` and `รายละเอียด allocation รายแถว` with explicit trace from `WTI / summary / PO`.
- Current PO Buy hardening checkpoint on 2026-05-26: `PO Buy` now has short-close state and append-only status logs. Dev-target/local DB received additive fields `short_closed_qty`, `short_closed_amount`, `short_closed_note`, `short_closed_at`, `short_closed_by` plus new table `po_buy_status_logs`. `/api/purchase/po-buy` now reconciles `remaining_qty`, `remaining_amount`, `cut_amount`, and status from active `purchase_bill_po_allocations` instead of trusting stale header values; status transitions are `Open -> Partially Received -> Received`, `Short Closed`, and `Cancelled`. The UI adds `ปิดรับไม่ครบ`, filter support for that state, and a status-history section in the PO detail modal. `/api/purchase/bills` now reconciles referenced PO before validate/save and after create/edit/cancel so a fully used PO disappears from PO options immediately.
- Current purchase-bill smoke-test checkpoint on 2026-05-26: local browser-session verification was completed against `localhost:3000` after applying `supabase/migrations/20260526143000_add_purchase_bill_allocation_tables.sql` directly to the DB from `apps/next/.env`. Verified path:
  - create PB partial from `WTI012605-0002` via PO -> `PB012605-0415`
  - create second PB partial from the same WTI via Spot Buy -> `PB012605-0416`
  - WTI moved to `ออกบิลแล้วบางส่วน`, tracked both PB doc numbers, and summary billed/remaining values updated
  - cancel `PB012605-0415` -> WTI recalc kept only `PB012605-0416`
  - cancel `PB012605-0416` -> WTI returned to `รับของแล้ว` and summary billed/remaining reset correctly
- Current purchase-bill cancel/recalc rule: cancelling a purchase bill must not blindly “write back” WTI values. The target rule is recalculation from remaining active purchase bills only. On cancel, the system changes PB status to `cancelled`, removes PB-created `stock_ledger`, then recalculates `WTI` header status plus each `weight_ticket_product_summary` billed/remaining value from all non-cancelled purchase bills that still reference the receipt. PB cancel must be blocked if any payment already exists on that bill.
- Current purchase item price update: per user clarification on 2026-05-25, purchase bill item section must include `ราคาหน้าใบ` per line. The value maps to the line-level sale-facing price, currently `purchase_bill_items.sales_price` or equivalent, and feeds Sale Tracking / commission calculation. This checkpoint is documentation-only.
- Current purchase discount update: per user clarification on 2026-05-25, purchase bills must have only one header-level `ส่วนลดท้ายใบ`; no line-item discount is allowed in the target flow. Header discount must post as expense/separate entry and must not reduce product cost, stock ledger cost, WAC, or Cost Pool. The active `/purchase/bills` Stock-from-WTI table now removes the line discount input entirely; only the bill footer/header discount remains editable.
- Current purchase PO price autofill update: per user clarification on 2026-05-25, when a purchase-bill line references `PO Buy`, the system must auto-fill `ราคา/กก.` from the selected PO and prevent manual override on that line. `Spot Buy` lines still allow manual price entry. `/api/purchase/bills` options payload now returns `po_buys.unit_price` and product linkage so the form can auto-fill the locked PO price.
- Current purchase/Cost Pool rule update: per user clarification on 2026-05-25, Cost Pool is only for copper/brass products (`ทองแดง`, `ทองเหลือง`, `copper`, `brass`). Stock purchases for other product groups still enter stock/WAC but must not enter Cost Pool. PO Buy must support `ปิดรับไม่ครบ` for supplier short delivery; the action records a reason, stops receiving the remaining PO quantity, leaves already received/billed stock untouched, and removes only the remaining eligible copper/brass PO quantity from Cost Pool candidate/availability.
- Current Trading sales bill update: per user clarification on 2026-05-25, a Trading sales bill must start by selecting purchase bills, and the user can select multiple purchase bills in one sales bill. The system must auto-fill sale item lines from selected purchase bills, allow the user to add extra stock item lines manually, cut stock only for stock-sourced lines, and cut PO Sell at sales-bill-line level. This checkpoint is documentation-only.
- Current master data cleanup slice: master data `สาขา/คลัง` wording is split. `/master-data/branches` now labels the entity as `สาขา`, and new `/master-data/warehouses` uses the existing `warehouses` table with branch linkage, generic master data UI, list/create/update/status API routes, and navigation entry under `ข้อมูลหลัก`.
- Current supplier payment numbering follow-up: `/api/purchase/payments` now derives `payments.branch_id` from the linked purchase bill first and the payment account second, then generates supplier payment document numbers as `PMT{branchCode}{YYMM}-NNNN` (for example `PMT012605-0271`). The running number scan includes both old `PMT2605-*` and new branch-aware `PMT012605-*` rows in the same month so numbering continues instead of restarting.
- Current supplier payment UI follow-up: `/purchase/payments` topbar now shows `จ่ายเงิน Supplier-บันทึกเงินออกจากบัญชีและประวัติ voucher จ่าย Supplier`, while the in-page payment banner is removed. The page shows a merged `บิล Supplier ทั้งหมด` table above Payment Voucher history using legacy headers: เลขบิล, วันที่, Supplier, เลขบัญชี, ยอดรวม, จ่ายแล้ว, คงเหลือ, อายุ(วัน), and action. The table includes unpaid, partial, paid, and cancelled purchase bills from `purchase_bills`, has status/search filters, client-side pagination with the standard `พบทั้งหมด ... รายการ` footer pattern, and a `ทำจ่าย` row action only while `payable_balance > 0`. The payment modal follows the legacy Payment Voucher flow while hiding system-managedเลขที่/วันที่/สาขา fields: method selector, split-capable `บัญชีจ่าย` section with account balances, multi-line `รายการจ่าย` table with `+ เพิ่มบรรทัด` and bill search datalist, and final note field. If opened from a bill row, the modal locks the first bill row as read-only instead of asking the user to select it again. Required fields are marked with `*`; payment lines, account split, method, supplier, and amount cannot submit empty/null. WHT is read-only in the modal and is computed from the active `wht_settings` rate; the API recomputes WHT before saving so users only enter the cash amount they want to pay. Payment account splits now write one `bank_statement` row per account while `payments.account_id` keeps the first account for compatibility; multiple payment lines share the same voucher/document number and create one `payments` row per bill line.
- Current supplier payment navigation follow-up: payment history is now split into its own menu/page at `/purchase/payment-history` with label `ประวัติการจ่ายเงิน`. `/purchase/payments` keeps the bill list and payment-entry workflow only. The history page now reads from dedicated `GET /api/purchase/payment-history` instead of sharing the entry-screen API contract.
- Current UI radius follow-up: `apps/next/src` now uses `rounded-md` as the active shared radius baseline for controls and surfaces. Shared primitives (`Button`, `Input`, `Select`, `input-group`, `combobox`, popover/date-picker wrappers) are aligned to `rounded-md`, and a sweep normalized raw `rounded` / `rounded-lg` / `rounded-xl` / `rounded-2xl` usage in active Next pages/components so topbar branch select, date-picker controls, pagination buttons, filter controls, cards, and modal/section shells follow the same radius convention. Validation passed locally: `npm run type-check --workspace @ns-scrap-erp/next`, `npm run lint --workspace @ns-scrap-erp/next`, `npm run build --workspace @ns-scrap-erp/next`, and `git diff --check`.
- Current form-select follow-up: active Next form selects now have a shared placeholder pattern via `apps/next/src/components/ui/FormSelectField.tsx`. Required form selects show a placeholder before selection, then hide that placeholder row from the dropdown after a real value is chosen, matching the desired `คำนำหน้า` behavior. The pattern is now applied across customer/supplier form selects (title, market scope, Thai address hierarchy, supplier owner, supplier bank), the generic `MasterDataPageClient` select generator, and required helper-form selects in `MoneyMovementFieldHelpers` / `TransactionBillsFieldHelpers`. Empty-value filter selects and searchable comboboxes are intentionally left on their existing patterns so users can still reselect `ทุก...` / empty filters and type into combobox inputs. Validation passed locally: `npm run type-check --workspace @ns-scrap-erp/next`, `npm run lint --workspace @ns-scrap-erp/next`, `npm run build --workspace @ns-scrap-erp/next`, and `git diff --check`.
- Current shell navigation follow-up: sidebar sections now support collapse/expand state per top-level section in `AppNavigation`, with section-open state persisted in session storage and current-route sections reopened automatically. The main section label is now `Dashboard & Reports`. Topbar account status now uses a shared shadcn-style dropdown menu (`apps/next/src/components/ui/dropdown-menu.tsx`) instead of a plain logout button, showing the signed-in email plus `เปลี่ยนรหัสผ่าน` and `ออกจากระบบ` actions from `AuthStatus`. Validation passed locally: `npm run type-check --workspace @ns-scrap-erp/next`, `npm run lint --workspace @ns-scrap-erp/next`, `npm run build --workspace @ns-scrap-erp/next`, and `git diff --check`.
- Current topbar/title follow-up: the global `AppShell` topbar now supports a second subtitle line sourced from navigation metadata (`pageSubtitle`) or page-level title override events. The first sweep moves informational hero-copy out of page bodies and into the topbar for active routes such as `/sales/stock-issue`, `/reports`, `/finance/ap`, `/stock/balance`, `/tracking/customer`, `/tracking/supplier`, `/tracking/product`, `/trading/dashboard`, `/po-reports/outstanding`, `/finance-accounting/financial-dashboard`, `/daily/petty-advance`, and `/daily/bill-swap-history`, while removing the duplicate in-page title cards from those screens. Action-heavy hero banners that still contain inline buttons/filters remain a follow-up batch.
- Current topbar/title follow-up batch 2: the action-heavy hero/banner group has been reduced on active routes that previously mixed title copy with inline buttons. `/trading/matching`, `/finance/bank`, `/stock/convert`, `/stock/adjust`, `/stock/status-convert`, `/sales/receipts`, `/finance-accounting/loan-contracts`, and `/finance-accounting/asset-register` now rely on topbar title/subtitle metadata while their disabled/create/export/import actions were moved into ordinary white action/filter rows inside the page body. This keeps behavior visible without duplicating the heading banner.
- Current stock status-convert cleanup on 2026-06-04: `/stock/status-convert` no longer shows the extra blue `วิธีใช้` info banner above the toolbar. The page now opens directly into the action/filter surface while keeping the existing topbar subtitle and write flow unchanged.
- Current stock status-convert design-alignment follow-up on 2026-06-04: `/stock/status-convert` now follows the active `docs/design.md` list-page baseline more closely. The page uses a standard white filter/action shell, search-first toolbar, clear-search button only when active, standard-height Refresh and create actions, and a compact count row above the table. Existing API behavior, modal write flow, and table columns remain unchanged.
- Current receipt-page design follow-up on 2026-05-31: `/sales/receipts` now aligns its active Next shell more closely with `docs/design.md` instead of the older hero-heavy parity slice. The duplicate in-page Receipt Voucher action row was removed, `+ รับเงิน Customer` now lives inside the white filter toolbar, toolbar controls were normalized to the shared compact control height, and the receipt history count/pagination now sits inside the same white table shell above the grid rather than floating as a separate strip.
- Current topbar/title follow-up batch 3: the remaining finance-accounting and dashboard hero-only surfaces now rely on topbar metadata too. `/finance-accounting/cash-flow-analysis`, `/finance-accounting/cf-forecast-calendar`, `/finance-accounting/working-capital`, `/finance-accounting/stock-finance`, `/finance-accounting/profit-leak`, `/finance-accounting/tax-vat-wht`, `/finance-accounting/pl-statement`, `/finance-accounting/balance-sheet`, `/finance-accounting/cash-flow-statement`, and `/dashboard` had their duplicate in-page title cards removed. The dark filter bar on `/dashboard` stays in place because it contains active controls, but the separate purple/pink hero was removed.
- Current topbar/title follow-up batch 4: the `main` sales-control routes now follow the same pattern. `/pending-sales`, `/sales-plan`, and `/sales-commission` use topbar title/subtitle metadata for the page heading, their top-level gradient heroes were removed, and `Sales Plan` moved its disabled `+ เพิ่มรายการ` action into the ordinary white filter/action row. Nested blue/indigo section heroes inside `Pending Sales` and `Sales Tracking` detail mode were reduced to compact info strips instead of full banners because they are in-page subviews, not separate routes.
- Current topbar/title follow-up batch 5: the remaining finance-accounting loan/equity/opening pages now use topbar metadata instead of standalone hero banners. `/finance-accounting/loan-dashboard`, `/finance-accounting/equity-maint`, and `/finance-accounting/opening-balance` had their duplicate top title cards removed while keeping their existing white control/content panels unchanged.
- Current topbar/title follow-up batch 6: the fixed-asset subpages now follow the same rule. `/finance-accounting/depreciation` and `/finance-accounting/asset-disposal` now rely on topbar title/subtitle metadata, while their disabled `Run ค่าเสื่อมงวดนี้` and `+ Disposal` actions were moved into ordinary white filter/action rows and the duplicate hero banners were removed.
- Current topbar/title follow-up batch 7: the remaining `main` analysis surfaces now follow the same pattern too. `/anomaly-detector` and `/profit-cost-analysis` moved their explanatory title copy into topbar subtitle metadata, their duplicate gradient page heroes were removed, and the disabled `Export CSV` action for Profit & Cost Analysis now lives in the white filter/control panel instead of inside the hero.
- Current topbar/title follow-up batch 8: the remaining main dashboard/calendar headers now rely on topbar metadata as well. `/owner-daily`, `/daily-report`, `/cash-flow-calendar`, and `/business-calendar` had their duplicate page banners removed; `Daily Report` moved its date navigation controls into a normal white action row while the other pages kept their existing control panels unchanged.
- Current topbar/title follow-up batch 9: `/cash-others-summary` now also uses topbar subtitle metadata instead of an in-page intro banner. The page keeps its existing white `As of` control row and KPI/dashboard surfaces, but the duplicate blue info strip was removed.
- Current purchase filter follow-up: `/purchase/po-buy` filter shell is now aligned with `/purchase/bills` styling while keeping PO-specific logic. The page now uses shared `DatePickerInput` for from/to dates, keeps search/date/clear/export/create in one top row, uses status segment chips (`ทุกสถานะ`, `เปิดอยู่`, `บางส่วน`, `รับครบ`, `ยกเลิก`) instead of the previous extra status dropdown, and preserves the existing PO-specific client-side filtering/sort/export behavior. The same pass also fixed malformed rounded utility classes in `PoBuyPageClient` and shared `input-group` so date-picker and PO badges render correctly under the global `rounded-md` baseline. Validation passed locally: `npm run type-check --workspace @ns-scrap-erp/next`, `npm run lint --workspace @ns-scrap-erp/next`, and `git diff --check`.
- Current date/filter consistency follow-up: active Next query/date surfaces were swept to finish the shared `DatePickerInput` migration and reduce filter race conditions. Direct native `<input type="date">` usage in active route components was removed in favor of the shared `DatePickerInput` pattern, while helper-backed `type="date"` fields already routed through shared wrappers were left as-is. This round added or extended stale-response guards on additional query-driven pages (`/production/orders`, production report views, `/finance/foreign/fx-gain-loss-report`, main dashboards with date-range filters, cash/anomaly/asset overview read views, and related finance dashboards) so older responses no longer overwrite newer filter results. Visible date cells in touched tables/cards were normalized to `dd/MM/yyyy` using `formatDateDisplay`, including production order/report surfaces and sales-control detail tables. Validation passed locally: `npm run type-check --workspace @ns-scrap-erp/next`, `npm run lint --workspace @ns-scrap-erp/next`, and `git diff --check`.
- Current transaction history design task: purchase-side documents need explicit status-history and precomputed summary layers instead of deriving everything from current rows during reads. Agreed direction for follow-up implementation:
  - `po_buys` and `purchase_bills` remain the current-state/source-of-truth tables for mutable workflow fields such as `status`, `remaining_qty`, `remaining_amount`, `paid_amount`, and `payable_balance`.
  - Add append-only business status logs (`po_buy_status_logs`, and later `purchase_bill_status_logs`) to drive detail-page history/timeline UI. These logs should store `from_status`, `to_status`, `action`, `reason`, `changed_by`, `changed_at`, and optional `metadata`.
  - Add maintained summary tables (starting with `po_buy_summary_current`) for KPI cards so read paths can fetch precomputed counts/totals instead of recounting thousands of rows.
  - Keep document snapshots complete enough that normal read/detail/print flows do not have to recompute prior business facts from changed master data. Current example already in place: purchase bills store `vat_rate_percent`, `vat_type`, `vat_amount`, `subtotal`, and `total_amount`; status-history and summary tables are still pending implementation.
  - Implement through controlled write paths only (API/service/DB trigger/function), so every create/update/cancel/receive transition updates current state, appends status history, and refreshes summary in one place.
  - Summary-table design baseline for the first implementation:
    - table name: `po_buy_summary_current`
    - purpose: precomputed KPI source for `/purchase/po-buy` cards and future dashboard/report reuse
    - scope model: one global row plus optional per-branch rows (`scope_type`: `all` or `branch`; `scope_key`: `all` or `branch_id`)
    - recommended columns: `scope_type`, `scope_key`, `total_rows`, `open_count`, `partial_count`, `received_count`, `cancelled_count`, `remaining_qty`, `remaining_amount`, `total_amount`, `updated_at`
    - source of truth: aggregate from `public.po_buys` only; do not derive summary from UI row lists
    - refresh contract: on every PO create/update/cancel and every downstream receive flow that mutates `po_buys.status` / `remaining_qty` / `remaining_amount`, refresh the affected global row and affected branch row in the same controlled write path
    - read contract: `/api/purchase/po-buy` should prefer summary-table reads for KPI cards and use row-list aggregation only as temporary fallback before migration apply
- Current sales flow design task: target sales-side document flow is now documented in `docs/notes/Sales Flow.md` using the same pattern as `docs/notes/Purchase Flow.md`. The target flow keeps `POS` for PO Sell, `PSALE` for Pending Sale/Stock Issue, `SB` for Sales Bill, and `RCP` for Receipt; if stock is issued before billing, `PSALE` is the stock movement source and the later sales bill must not cut stock again. Follow-up implementation should add sales status logs, summary tables, branch-aware numbering, and transaction-safe write services for PO Sell -> PSALE -> SB -> RCP.
- Current flow menu-map follow-up: `docs/notes/Purchase Flow.md` and `docs/notes/Sales Flow.md` now include a separate `มุมเมนูที่ใช้ในแต่ละขั้นตอน` section. It maps each manual step to the active navigation label and route, while marking automatic system updates as `ระบบอัตโนมัติ`.
- Current role/branch caveat follow-up: both Purchase Flow and Sales Flow now include a separate `มุมสิทธิ์และสาขา` section. The menu map is explicitly documented as a functional path, not a final permission contract; real access must come from the pending role matrix and `app_user_branch_access`, with `ทุกสาขา` meaning only branches allowed for the current user.
- Current account master follow-up on 2026-05-29: `/master-data/accounts` create/edit now sources the `ประเภท` dropdown from `/master-data/payment-methods` instead of hardcoded `cash/bank` options. The account form and `/api/master-data/accounts` now treat the selected payment-method name as the stored `type` value, while cash-vs-bank field behavior still derives from the selected method text through a small helper so existing bank/cash validation continues to work during the transition.

## Previous Batch M Notes

- Current docs slice: M0 Main Dashboards module overview is implemented, validated, and pushed. It maps all 11 remaining Main placeholder routes, their legacy/Vue visual baselines, shared data sources, write risks, and recommended implementation order.
- Current implementation slice: M1 `/dashboard`, `/owner-daily`, and `/daily-report` read/report baselines is implemented, validated, and pushed.
- Current implementation slice: M2 `/profit-cost-analysis` read/report baseline is implemented and validated locally. It preserves the legacy/Vue gradient hero, filter card, metal chips, KPI density, AP/AR row, Revenue/GP sections, Top Product/Top GP blocks, tabs, disabled export, and read-only product drill modal.
- Current implementation slice: M3 `/pending-sales`, `/sales-plan`, and `/sales-commission` read/design baselines is implemented and validated locally. LME save, sales plan lock/save, supplier assignment, bulk assignment, export, and all persistence remain disabled until target schemas, permissions, audit, and stock reservation semantics are designed.
- Current implementation slice: M4 `/cash-flow-calendar` and `/business-calendar` read/design baselines is implemented and validated locally. It preserves the legacy/Vue blue/purple banners, month controls, KPI card density, chart cards, calendar/table surfaces, today/negative/weekend markers, read-only cash drill modal, and business mode tables while keeping export/auto-sync/write actions disabled.
- Current implementation slice: M5 `/cash-others-summary` and `/anomaly-detector` read baselines is implemented and validated locally. It keeps Cash & Others legacy visual blocks and Anomaly Detector read-only scan behavior, with fix actions limited to active Next links.
- Current QA slice: M6 Main QA sweep is implemented, validated, and pushed. It confirmed 11/11 Main route/page/API coverage, unauth guards, authenticated API/page smoke, read-only/write-control constraints, sitemap status, and desktop/mobile no page-level overflow.

## Previous Batch A Notes

- Current implementation slice: A5 Financial Statements management/read baselines is implemented, validated, and pushed.
- Current implementation slice: A4 Tax / VAT / WHT transaction-derived read/design baseline is implemented, validated, and pushed.
- Current implementation slice: A2 Cash Flow Analysis + Forecast Calendar read baseline is implemented, validated, and pushed. It uses AR/AP/cash/bank/loan/tax schedule sources, preserves legacy UI first, and keeps forecast/payment/reclass writes disabled.
- Current implementation slice: A3 Working Capital + Stock Finance read baselines (`working-capital`, `stock-finance`, `profit-leak`) is implemented, validated, and pushed. It reuses AR/AP/stock/cash sources, preserves legacy UI first, and keeps financing/reclass/write actions disabled until accounting side effects are designed.
- Current implementation slice: A1 Financial Dashboard read baseline (`financial-dashboard`) is implemented, validated, and pushed. It reuses A2/A3/A5 helper outputs where practical, preserves legacy UI first, and keeps GL/statutory/write actions disabled.
- A6 Fixed Assets read baseline (`asset-register`, `depreciation`, `asset-disposal`) is implemented, validated, and pushed. Keep acquisition, depreciation posting/reverse, disposal status mutation, and GL posting disabled until accounting side effects are designed.
- A7 Loans / Equity / Opening / Historical read baseline is implemented, validated, and pushed. Keep loan schedule/payment generation, equity save, opening balance apply/lock, historical save/sync, and GL posting disabled until accounting side effects are designed.
- Current QA slice: A8 Accounting QA Batch is implemented, validated, and pushed. It confirmed 18/18 Finance / Accounting page/API coverage, unauth guards, authenticated route/API smoke, and disabled write controls.
- A5 must remain labeled as management/read baseline only. Do not claim statutory P&L/Balance Sheet/Cash Flow until GL journal header/line, COA mapping, closing period, retained earnings roll-forward, and cash-flow mapping are designed.

## Legacy UI Parity Retrospective

Status date: 2026-05-19

- Legacy/Vue UI parity became an explicit project rule at `59ba09f docs: require legacy ui parity for clone batches`.
- The rule was strengthened at `b2258d6 docs: strengthen legacy ui parity rule`, requiring clone/migration batches to preserve cards, colors, banners, tables, button placement, labels, spacing, and compact density; when Vue is simplified or inconsistent, `old-apps/legacy/` is the stronger baseline.
- Batches completed after `59ba09f` should be treated as implemented under the legacy UI parity rule. This includes the Foreign Finance baselines and the Finance / Accounting A6, A7, A5, and A4 batches already pushed.
- Batches completed before `59ba09f` were not guaranteed to have the same explicit visual parity standard. They should be queued for a retrospective UI parity audit/revise pass before being marked final for UAT, especially screens cloned from legacy/Vue with cards, dashboards, dense tables, or color-coded finance states.
- For future batches, do not redesign first. Clone the legacy visual surface first, wire active Next data second, then document any approved deviation.
- Current parity slice: `/finance/ap` was revised first after SYS. It restores the legacy AP red header, mega payable/aging/top supplier cards, colored KPIs, aging cards, red tabs, summary/detail table layout, Channel/Aging filters, and full-filter detail footer total while keeping export as active `.xlsx` behavior.
- Current parity slice: `/finance/ar` was revised after AP. It restores the legacy AR pending-sale banner, blue/cyan/teal dashboard cards, aging bars, Top 5 customer card, Channel/Aging filters, and detail table layout/colors while keeping export as active `.xlsx` behavior.
- Current parity slice: `/finance/cash-position` was revised after AR. It restores the legacy Cash Position dashboard cards, liquid composition donut, AR/AP bars, Top accounts list, colored summary cards, Net Cash strip, and account table columns/type badges.
- Current parity slice: `/finance/bank` was revised after Cash Position. It restores the legacy Bank Statement hero, account/date controls, four KPI cards, two chart panels, opening-balance row, dark gradient statement table header, colored amount columns, and disabled duplicate-cleanup button while keeping export as active `.xlsx` behavior.
- Current parity slice: `/stock/balance` was revised after Bank Statement. It restores the legacy Stock Balance hero, KPI/status cards, matrix/detail toggle, group/status/branch/product filters, selected-product inline panel, donut/top-group charts, metal-group matrix table, and detail table mode while keeping export as active `.xlsx` behavior.
- Current parity slice: `/stock/ledger` was revised after Stock Balance. It restores the legacy dense toolbar-first layout, product/branch/movement/date filters, balance-mode segmented control, negative-stock badge, disabled cleanup actions, legacy 12-column ledger table, colored movement/counterparty/balance cells, and active `.xlsx` export. Read-only bill/timeline modals and write actions such as grade fix or branch move remain deferred until permission/audit/write design is approved.
- Current parity slice: `/stock/convert` was revised after Stock Ledger. It restores the legacy Grade Adjustment hero/CTA, seven KPI cards, Source Type and Cost Status filters, red/green source-target table grouping, disabled Confirm Cost/Reverse actions, and source/target/loss/cost-flow modal grouping while keeping the existing simplified POST semantics unchanged. Full cost allocation, manual lot selection, reverse, and pending-cost workflows remain deferred.
- Current parity slice: `/stock/adjust` was revised after Stock Convert. It restores the legacy Stock Count Adjustment amber hero, note-only warning, five KPI cards, Quick Adjust toolbar with branch/type/date filters, disabled CSV placeholder, 13-column adjustment table, and usage guidance box while preserving the existing note-only stock ledger write semantics.
- Current parity slice: `/sales/po-sell` was revised after Stock Adjust. It restores the legacy PO Sell info banner, six KPI cards, Top 5 Customer and PO outstanding panels, match-status chips, compact filter bar, 12-column table, and disabled create/edit/cancel actions while preserving the read/export baseline and deferring PO Sell writes/reconciliation design.
- Current parity slice: `/trading/dashboard` was revised after PO Sell to close the first-10 post-SYS UI parity audit. It restores the legacy violet/fuchsia Trading Dashboard hero, date filter card, mega Trading Performance card, Trading AR/AP card, ten KPI cards, trend/matching/product panels, Trading Purchases/Sales tables, and Trading by Product table. The API remains read-only and now derives legacy dashboard totals from trading purchase/sales bills plus `trading_deals`; Trading Matching write actions remain deferred.
- Current parity slice: `/finance/supplier-advance` and `/finance/customer-advance` are being revised after the first-10 audit. They restore the legacy compact advance layout: amber/emerald info banner copy, two summary cards plus disabled blue create CTA, 11-column table with Rate and disabled cancel action, legacy empty-state wording, and active `.xlsx` export as a secondary Next capability. Create/cancel/allocation writes remain deferred until dedicated advance/allocation schema, audit, RLS, rollback, and reconciliation design are approved.
- Current parity slice: `/stock/status-convert` and `/stock/customer-return` was revised after finance advance and pushed as `8ea1bbc`. It restores the legacy purple/pink compact stock operation surfaces while keeping send-back/export/reverse/cost-policy/write hardening deferred.
- Current parity slice: Daily Reports / รายงานประจำวัน was revised after stock operations and pushed as `dc1c30b`. It restores read-only legacy visual/data surfaces only: owner daily due-today/gap/activity/pending panels, daily report date controls, group breakdown, cash movement by type/account, expense category bars, analytics/top tables, and print dialog trigger. No posting/write/mutation actions are enabled.
- Current parity slice: Tracking 360 was revised after Daily Reports and pushed as `d4bc621`. It restores the legacy colored hero surfaces, compact filter cards, summary/top panels, tabs, dense tracking tables, product/supplier/customer selectors where available, yearly comparison tables, and Product Tracking legacy revenue-first sort. This remains read/export only; customer/supplier/product drilldown and item JSON normalization are still deferred until the data contract is confirmed.
- Current parity slice: Batch D Group A was revised after Tracking 360 and pushed as `0c9df8e`. It restores the legacy PO Buy blue info banner, colored KPI cards, Top Supplier/outstanding panels, compact filter/status/purpose-tab layout, checkbox/action table shell, and Trading Matching fuchsia hero/action cluster, GP mega card, status donut, match-rate/monthly/top-pair panels, compact KPI row, two-tab layout, and unmatched split tables. All create/move/cancel/cleanup/pull/recalc/reverse/match actions remain disabled/read-only.
- Added to post-SYS parity queue per user request: `/admin/company-profile` (`https://new-ns-scrap-erp.vercel.app/admin/company-profile`). It already exists in the system sitemap and visual audit checklist, but now must be rechecked under the same legacy-first rule after the current Batch D parity slices finish.
- Current parity slice: Batch D Group B was revised after Group A and pushed as `488f7fa`. It restores the legacy Cost Pool warning copy/icons, compact filters, 12-column table, and Cost Allocator `①/②` step sequence, Auto Match button placement, Manual option shell, preview table, and disabled confirm-match surface. No allocation/match write behavior is enabled.
- Current parity slice: `/admin/company-profile` was revised after Batch D Group B per user request and pushed as `bebef00`. It restores the legacy company-profile action row, separate receipt/delivery preview buttons, usage note wording, field labels/placeholders, logo delete label, and compact form density while preserving existing API validation and `system.settings.manage` write guard.
- Current follow-up slice: `/admin/company-profile` form border/preview parity is being revised after user feedback. It makes form/input/logo borders explicit with legacy-like slate borders and changes the receipt/delivery preview buttons from no-sample alerts to printable sample document tabs generated from the current company profile. No DB/schema/API endpoint change is added.
- Current follow-up slice: global Next form-control border parity is being revised after code scan. The scan found plain `border` form controls across 39 active Next files, so `apps/next/src/app/globals.css` now defines the legacy baseline for text/date/number/search inputs, selects, and textareas: slate border, white default field background, blue focus ring, and slate read-only background only when no explicit `bg-*` class is present. Explicit `border-*`, `bg-*`, checkbox/radio/file controls, and semantic state fields remain locally controlled.
- Current follow-up slice: global Next font parity is being revised after user request. Legacy and old Vue load Google Font `Sarabun` weights 300/400/500/600/700 and apply it to body and form controls, so `apps/next/src/app/globals.css` now loads the same font and replaces the previous Arial/Helvetica baseline.
- Current audit slice: post-SYS legacy UI parity audit was expanded by user request to every active Next section except `ข้อมูลหลัก` and `ระบบ`. Remote legacy HTML was downloaded from `https://sirimasth.github.io/ns-scrap-erp/` for source comparison. New tracker `docs/migration/19-next-legacy-ui-parity-audit.md` records P0/P1/P2 routes and active execution order. P0 starts with Daily tools: `/daily/payment-approval`, `/daily/expense`, and `/daily/expense-dashboard`.
- Current parity slice: `/daily/payment-approval` was revised after the expanded post-SYS audit. It restores the legacy green Payment Approval hero, AP/expense tabs, dense filters, five KPI strip, amber selected-total action bar, AP/expense tables, checkbox selection, highlighted bank/account columns, and local-only pay amount state. Approval and print controls remain disabled until write/audit/print semantics are designed; no API/DB mutation was added.
- Current parity slice update: `/daily/payment-approval` was re-aligned to the active list-page design convention. The KPI strip remains, but action buttons moved below the cards and above the filter bar, the old approved-only checkbox was replaced by a segmented filter (`ทั้งหมด / ยังไม่อนุมัติ / อนุมัติแล้ว`), AP wording now uses Thai (`ผู้ขาย`, `บัญชีธนาคาร`), table status uses the shared `dot + text` pattern, and the heavy highlighted bank/account pills plus mono document styling were removed. Approval state is still UI-local selection only until approval write/audit flow is implemented.
- Current form-pattern follow-up: `docs/design.md` now defines a shared money-input convention. Editable money fields should prefer `type="text" + inputMode="decimal"` with component-level numeric filtering, no grouping while focused, and grouped `#,##0.00` formatting on blur; `type="number"` is allowed only as a documented exception when the field must stay browser-native and does not need comma formatting after edit.
- Current purchase follow-up slice: `/purchase/po-buy` now exposes `createdAt`, `updatedAt`, and `updatedBy` from `GET /api/purchase/po-buy`, shows the table column `อัพเดตล่าสุด` with fallback to create audit data for legacy rows, sorts by that column, and includes `UpdatedAt`/`UpdatedBy` in filtered Excel export.
- Current table/filter polish slice: `/sales/bills` and related transaction lists were aligned to the shared list-page conventions now documented in `docs/design.md`, including count/pagination placement, segmented type/status filters, and export action placement.
- Current parity slice: `/daily/expense-dashboard` was revised after Payment Approval. It restores the legacy rose/orange dashboard-only surface with 3/6/12 month selector, four KPI cards, anomaly/no-anomaly panels, category-by-month heatmap, footer totals, and anomaly rule note. It uses the existing expenses GET payload and legacy-compatible `amount + vat` dashboard math; no write/export/repair action or API endpoint change was added.
- Current parity slice: `/daily/expense` was revised after Expense Dashboard and later normalized back to the active list-page baseline in `docs/design.md`. The page now uses topbar subtitle copy instead of an in-page Expense Voucher banner, keeps compact KPI summary cards, uses one standard white filter shell with search/date/category/payee/account controls plus segmented payment-status filter, restores count/page-size/pagination above the table, and keeps the dense expense table with due date, ref doc, category, overdue state, Net Pay emphasis, VAT/WHT breakdown, and edit action. Destructive repair tools, delete, quick-pay, export, multi-line voucher writes, and dynamic category creation remain deferred.
- Current expense create/edit follow-up on 2026-05-30: `/daily/expense` no longer shows `เลขที่เอกสาร`, `วันที่เอกสาร`, or helper hint copy in the create/edit modal before save. For a new expense, both values are fully server-owned and are generated only when the record is saved. `/api/daily/expenses` now stamps the expense doc no and Bangkok business date on create, ignores client-supplied create values for those fields, and preserves the original generated doc no/date on edit.
- Current parity slice: `/production/orders` was revised after Daily P0. It restores the first legacy production operations surface: date/status/preset filters, card-grid order list with status colors, target-product focus, input/planned/output KPIs, yield bar, cost footer, and a read-only tabbed detail modal with status actions disabled, target product banner, lock/status banners, Header/Input/Output/Process Cost/Cost Allocation tabs, production variance panel, and allocation preview. Production input/output/reverse/recompute/status writes remain deferred.
- Current parity slice: `/production/dashboard` was revised after Production Orders. It restores the legacy purple/pink dashboard hero, range presets/custom dates, four colored KPI cards, daily and monthly chart panels, status panel, Top 10 products table with code/cost/avg cost, and Machine Utilization table. API additions are read-only aggregates only; no stock/cost/posting mutation was added.
- Current parity slice: `/production/production-cost-report` was revised after Production Dashboard and closes the P0 Production group. It restores the legacy date filter/export row, seven cost cards, gradient Total/Cost per Kg card, 13-column RM/Labor/Electricity/Machine/Fuel/Maintenance/Other Process table, legacy CSV columns, and cost allocation method field from the read helper. No cost recalculation, stock write, or posting behavior was added.
- Current parity slice: `/po-reports/outstanding` was revised after P0 Production. It restores the legacy purple hero, buy/sell tabs, active CSV export, colored KPI cards, partner/product filters, cost-deducted warning and read-only checkbox shell, received/sold columns, expected delivery columns, empty states, and footer totals. Cost-deducted remains disabled because it is a cost-pool write side effect requiring audit/permission design.
- Current parity slice: `/reports` was revised after PO outstanding. It restores the legacy tabbed aggregate report surface as the primary screen with date range, "เว้นว่างเพื่อดูทุกช่วงเวลา", active CSV export, five purchase/sales aggregate tabs, dense tables, totals footer, and a read-only `/api/reports/aggregate` endpoint over purchase/sales bills. The previous Next report catalog is retained only as a secondary shortcut section below the legacy surface; no schema/write/mutation behavior was added.
- Current parity slice: `/sales-plan` was revised after Reports. It restores the legacy amber/orange Sales Plan shell, LME reference strip, local month/group/channel filters, CSV placement, white KPI cards, editable-looking 12-column plan table shell, indigo product-analysis table with footer totals, and yellow remaining-to-lock table with totals. Add/remove/lock/edit persistence remains disabled/read-only until sales-plan schema, stock reservation, permission, audit, and rollback design are approved.
- Current parity slice: `/dashboard` visual shell was revised after Sales Plan. It restores the legacy dark period/filter bar, purple/pink hero, slate-blue dashboard container, six gradient KPI cards, chart/aging/channel/quick-insight cluster, alert bar, top supplier/customer rankings, trend/group panels, and four separate Purchase/Sales/Finance/Stock business blocks using the existing read payload only. Dashboard data parity follow-up remains queued for server-side filters, aging buckets, cash composition, stock-by-branch/group, and richer chart datasets.
- Current parity slice: `/purchase/bills` and `/sales/bills` were revised after Dashboard. Purchase restores the legacy blue list shell, KPI strip, action placement, dense status/type/VAT/creator/action table while preserving existing purchase GET/POST/PATCH. Sales restores the amber pending-sale warning, emerald list shell, disabled recalc/export/create controls, KPI strip, GP/margin/received/VAT/creator/action table, and extends `/api/sales/bills` only with existing read fields. No sales write endpoint, schema change, destructive action, print, supplier swap, cancel, delete, sync, repair, or bulk mutation was added.
- Current purchase bills UI follow-up: `/purchase/bills` now moves the purchase bill heading/description into the global topbar title and removes the duplicate blue heading card from the page body. The sidebar menu label stays short as `บิลรับซื้อ`.
- Current redirected architecture slice on 2026-06-05: runtime/UI cleanup is paused behind the `DB-first identifier cutover` because `dev-target` still stores the active `B1/B2/B3` family as legacy string ids while Prisma/runtime already expect internal bigint ids. Until Wave 1 in [21-db-first-identifier-cutover.md](/Users/watcharathatsrithanesiganon/Documents/GitHub/ns-scrap-erp/docs/migration/21-db-first-identifier-cutover.md) is applied, route failures such as `/api/branches` and `/api/purchase/bills` should be treated as schema mismatch fallout, not page-level bugs.
- Current UUID-cutover checkpoint on 2026-06-05: sub-agent inventory for the remaining `id uuid` models is now complete. The repo-owned `app/public` bucket can continue as a normal `DB-first` bigint migration wave (`equity`, `bill_swap_history`, `app_permissions`, `app_roles`, `app_users`, and the dependent app log/join tables), but `auth.users` plus the GoTrue-managed auth tables are not being treated as an ordinary in-place PK refactor. The app currently depends on `auth.users.id` as UUID directly in Prisma relations, SQL casts, audit helpers, invite flow, and Supabase Auth responses. Therefore the active execution decision is: continue cutting over repo-owned app/public UUID tables first; track any future rewrite of `auth.users.id` as a separate identity-layer replacement project, not as part of the ordinary business-schema bigint sweep. No fallback to internal ids is allowed while closing the resulting runtime fallout.
- Current UUID app-owned wave checkpoint on 2026-06-05: the repo-owned `app/public` UUID family is now cut over in `dev-target` and synced back into Prisma/runtime. Migration `20260605110000_convert_app_public_uuid_ids_to_bigint.sql` converted `equity`, `bill_swap_history`, `user_profiles.id`, `app_permissions`, `app_roles`, `app_users`, `app_role_permissions`, `app_user_roles`, `app_user_branch_access.user_id`, `app_activity_logs`, `app_audit_logs`, `app_auth_events`, and `audit_logs.id` to internal `bigint`, while intentionally keeping auth-provider links such as `app_users.auth_user_id`, `actor_auth_user_id`, `audit_logs.user_id`, and `user_profiles.user_id` as UUID. After `db pull`, the active Next runtime was adjusted to the new shape: admin user routes now parse bigint internal ids, auth/app logging writes use bigint for app-user refs and UUID only for auth-user refs, forgot-password/public reset audit writes target bigint app user ids, and `/api/daily/bill-swap-history` no longer leaks internal purchase bill ids outward. Validation passed with `npm run db:pull --workspace @ns-scrap-erp/next` (with `apps/next/.env.local` sourced), `npm run prisma:generate --workspace @ns-scrap-erp/next`, `npm run type-check --workspace @ns-scrap-erp/next -- --pretty false`, `npm run lint --workspace @ns-scrap-erp/next`, `npm run build --workspace @ns-scrap-erp/next`, and `git diff --check`.
- Current UUID runtime fallout checkpoint on 2026-06-05: the logging/audit/bill-swap slice for the `app/public UUID -> bigint` wave is now adapted without adding fallback debt. `apps/next/src/lib/server/auth-audit.ts` and `apps/next/src/lib/server/app-logging.ts` no longer cast `actor_app_user_id` / `target_app_user_id` as UUID; they now parse internal app-user ids to bigint for writes while keeping `auth.users.id` references as UUID. `apps/next/src/app/api/admin/auth-events/route.ts` now joins app-user targets via bigint (`target.id = target_id::bigint` guarded by a numeric regex) and no longer falls back to internal target ids for outward display labels. `apps/next/src/app/api/daily/bill-swap-history/route.ts` now stringifies bigint PKs only at the API boundary and no longer falls back from purchase-bill display fields to internal ids. `npm run prisma:generate --workspace @ns-scrap-erp/next` and `npm run lint --workspace @ns-scrap-erp/next` passed, `git diff --check` passed for the touched files, and the remaining `type-check` / `build` failures are currently isolated to `src/app/api/admin/users/[id]/invite/route.ts`, `src/app/api/admin/users/[id]/status/route.ts`, and `src/app/api/admin/users/[id]/route.ts`, which are outside this slice and still need their own bigint app-user follow-up.
- Current UUID/report-tracking closure checkpoint on 2026-06-05: sub-agent audit is now complete for the remaining `admin/auth/app-user` and `report/tracking/display` fallout after the `app/public UUID -> bigint` wave. The admin/auth scope (`/api/admin/users*`, `/api/admin/auth-events`, `/api/auth/forgot-password`, `/api/auth/password-changed`, `auth-context`, `auth-audit`, `app-logging`) required no further code changes: internal `app_users.id`/role ids already stay bigint-only, outward payloads stringify only at the boundary, and UUID remains only on intentional Supabase-auth links such as `auth_user_id` / `actor_auth_user_id`. The report/tracking scope now removes the remaining outward internal-id leaks from `main-dashboards`, `main-sales-control`, `profit-cost-analysis`, `finance-accounting-working-capital`, `main-calendars`, and `/api/tracking/{customer,supplier,product}`: outward ids now use business `code` / `doc_no`, display titles stop falling back to `category_id` / `loan_id` / product bigint ids, and internal bigint match keys remain inside maps only. Global validation passed again with `npm run type-check --workspace @ns-scrap-erp/next -- --pretty false`, `npm run lint --workspace @ns-scrap-erp/next`, `npm run build --workspace @ns-scrap-erp/next`, and `git diff --check`.
- Current UUID inventory checkpoint on 2026-06-05: after the app-owned UUID wave and the report/tracking cleanup, no active `public.id uuid` business table remains. The remaining UUID primary keys in `dev-target` are outside the ordinary business-schema cutover scope: `auth.*` GoTrue tables (including `auth.users`), one `maintenance.branch_id_remap_20260520_1720_user_profiles_branch_ids` helper table, plus platform schemas `realtime`, `storage`, and `vault`. The remaining UUID foreign-key-style columns inside `public` are all intentional auth-provider links (`app_users.auth_user_id`, `app_activity_logs.actor_auth_user_id`, `app_audit_logs.actor_auth_user_id`, `app_auth_events.actor_auth_user_id`, `audit_logs.user_id`, `user_profiles.user_id`). Treat any future rewrite of `auth.users.id` as a separate identity-layer replacement project, not as unfinished fallout of this bigint migration wave.
- Current global layout follow-up: active Next pages now render a compact breadcrumb row under the topbar, using navigation section and route labels while keeping long page-specific topbar titles out of the breadcrumb trail.
- Current purchase bill detail UI follow-up: `/purchase/bills/[id]` now sends the loaded bill `doc_no` to the global topbar as `รายละเอียดบิลรับซื้อ {doc_no}` and removes the duplicate detail heading/subcopy from the page body.
- Current purchase bill detail/schema cleanup: `/purchase/bills/[id]` no longer shows legacy fields that are not in the purchase bill form (`เลขอ้างอิง Supplier`, `ช่องทางซื้อ`, `ที่มา`, `เบอร์โทร`, and separate warehouse display), and labels the bill date as `วันที่สร้างรายการ` from `created_at`. `purchase_bills.contact_phone`, `purchase_bills.channel_id`, and the duplicate document `date` column are removed from the purchase bill payload/model/migration because the form no longer collects them and the document number already carries the document period.
- Current redirected work slice: `/purchase/po-buy` create/add-list is implemented after user paused Anomaly/GL follow-ups. It follows legacy `view-poBuy`: blue `+ PO Buy ใหม่` opens the amber purpose modal, supports Delivery vs Costing-only, multi-line product rows, live totals, and server-generated meaningful ids/doc numbers through `POST /api/purchase/po-buy`. PO issue time and document number are stamped/generated server-side at save time; the modal does not show editable PO issue date or document-number fields. The old purchase-channel input is removed from this flow because it duplicates branch/location usage. After the branch cleanup follow-up, the modal uses required active `branches`, writes `branch_id` directly, leaves `warehouse_id`/`channel_id` null for new rows, and generates new numbers as `POB{branchCode}{YYMM}-NNNN`. Edit/cancel/move-purpose and allocation side effects remain deferred.
- Current PO Buy UX follow-up: the `/purchase/po-buy` create modal Supplier field is now a searchable combobox over active suppliers. Users can type supplier name/code/id, choose a filtered row, or press Enter to select the first match; the saved payload still sends the validated `supplierId`.
- Current PO Buy table follow-up: `/purchase/po-buy` now shows PO notes in the list as a compact hover/focus `i` indicator instead of rendering long text in the row. Notes are included in client/server search and the Excel export, the detail modal shows the full note when present, the long `รายการ` column uses remaining table space with ellipsis plus an immediate table-style hover tooltip, and numeric columns are width-capped for tens-of-millions values with two decimals.
- Current PO Buy wording follow-up: `/purchase/po-buy` labels the PO date as `วันที่สร้างเอกสาร` and the delivery date as `วันที่กำหนดส่ง` in the table and detail modal.
- Current PO Buy table typography follow-up: `/purchase/po-buy` table body now uses the main table font size for document number, product, status, and row actions, while `อัพเดตล่าสุด` remains smaller as metadata.
- Current PO Buy table sizing follow-up: `/purchase/po-buy` locks the `เลขที่` PO column to fit long branch-aware numbers such as `POB012605-0003` without wrapping.
- Current PO Buy table sizing follow-up: `/purchase/po-buy` also locks the `วันที่สร้างเอกสาร` column to fit `YYYY-MM-DD` document dates without wrapping.
- Current PO Buy table sizing follow-up: `/purchase/po-buy` also locks the `วันที่กำหนดส่ง` column to fit `YYYY-MM-DD` delivery dates without wrapping.
- Current PO Buy table sizing follow-up: `/purchase/po-buy` locks `สถานะ` to fit status labels and `อัพเดตล่าสุด` to a compact metadata width.
- Current master-data follow-up: business-facing master codes and matching business IDs are now canonical uppercase. `/master-data/salespersons` uses `SA001`-`SA999`; manual input like `sales1`/`s1`/`sa1` normalizes to `SA001`, and new records use the generated `SA...` value for both `id` and `code`. `/master-data/suppliers` uses `SU0001`-`SU99999`; legacy-style `SUP1`/`s1`/`su1` inputs normalize to `SU0001`, and new records use the generated `SU...` value for both `id` and `code`.
- Dev-target data migration `20260520143001_uppercase_master_party_codes.sql` has remapped existing salespersons and suppliers so `id = code` in uppercase, changed supplier foreign keys to `ON UPDATE CASCADE`, and updated known `sales_id`/`supplier_id` references with zero orphan references after verification.
- Current supplier import follow-up: `/master-data/suppliers` now has an Excel import path that accepts the same `.xlsx` workbook produced by the supplier export sheet `ผู้ขาย`. Import is all-or-nothing, validates rows before write, maps `ผู้ดูแล` back to active salespersons by id/code/name, uses uppercase `SU...` as both `id` and `code`, and keeps address data in form/export/import while hiding the address column from the on-screen supplier table.
- Current customer/supplier round-trip follow-up: `/master-data/customers` now has Import Excel UI and `/api/master-data/customers/import`, matching the supplier import pattern. Customer and supplier imports accept the workbook produced by their export sheets, validate through the shared form schema, upsert by canonical business code/id, and generate new `CUS...` or `SU...` codes when a template row leaves the code blank.
- Current reference master cleanup: `/master-data/bank-names` and `/master-data/channels` no longer expose business code fields in the table/form/API response surface. Dev-target `public.bank_names`, `public.purchase_channels`, and `public.sales_channels` no longer keep separate `code` columns; their hidden primary keys remain for FK stability. Backup tables were created as `maintenance.reference_code_removal_backup_20260520090736_*`.
- Current supplier international-address follow-up: `public.suppliers` now has additive international address fields (`country_code`, `address_line1`, `address_line2`, `address_city`, `address_state_region`, `address_postal_code_intl`). `/master-data/suppliers` moves the domestic/foreign selector into the address section, requires visible country + address line 1 + city for foreign suppliers, keeps `country_code` internal/export-only when available, clears Thai address hierarchy fields for foreign writes, keeps `ที่อยู่เต็ม/หมายเหตุที่อยู่` as address metadata, removes the general supplier note field from the modal/export/import surface, and changes `ธนาคารรับเงิน` to a dropdown from `/master-data/bank-names`.
- Current supplier CSV replacement follow-up: dev-target supplier master was replaced from `nsscrap permission and master data   - ผู้ขาย.csv` as the source of truth. The import generated uppercase `SU0001...` ids/codes for 1,871 active CSV rows, preserved 17 referenced old rows as inactive to keep transaction FKs valid, added missing bank masters (`พร้อมเพย์`, `เงินสด`, `ธนาคารออมสิน`, `ธนาคารเพื่อการเกษตรและสหกรณ์การเกษตร`), defaulted blank owners to `PLOY`, and backed up the old supplier/FK state in `maintenance.supplier_replace_backup_20260520072518` and `maintenance.supplier_replace_fk_backup_20260520072518`. Follow-up repair restored bank/account values from the backup where the CSV was blank and name matching was reliable, and cleared all supplier tax IDs so the exported workbook can be keyed by users.
- Current supplier receiving-account follow-up: supplier credit term/limit has been removed from the supplier UI/API/Prisma model and dropped from `public.suppliers` after backup. Supplier receiving accounts now live in `public.supplier_bank_accounts` with `payment_method`: `เงินสด` stores no bank/account detail, while `โอนเงิน` requires a bank and digit-only account number. Dev-target normalization split 1,470 transfer rows, 282 cash rows, and 8 multi-account suppliers; cash markers were stripped from stored bank/account fields.
- Current supplier cleanup follow-up: unused `public.suppliers.notes` was dropped after backup `maintenance.supplier_notes_drop_backup_20260520121005`; supplier address metadata remains in `address` as `ที่อยู่เต็ม/หมายเหตุที่อยู่`.
- Current supplier cleanup follow-up: unused `public.suppliers.version` was dropped after backup `maintenance.supplier_version_drop_backup_20260520121147`; supplier saves do not currently implement row-version optimistic locking.
- Current supplier receiving-account follow-up: account-level `branch_code` was added to `public.supplier_bank_accounts` after backup `maintenance.supplier_bank_accounts_branch_code_backup_20260520122022`; supplier modal now stores `รหัสสาขา` inside each receiving account row.
- Current master-data follow-up: `/master-data/salespersons` form now auto-generates code and no longer exposes note, commission, or base salary fields. The target `salespersons` DB model no longer keeps `note`, `commission_pct`, or `base_salary`.
- Current master-data cleanup follow-up: customer master now follows the supplier-style party/address form and no longer uses contact person, bank account, or general notes. Product units/types no longer expose/store code; channels is now `ช่องทางขาย` over sales channels only; expense categories no longer use code or parent category; machines no longer use maintenance status and now use `/master-data/machine-types` as the DB-backed type source. Topbar branch selector now reads active `branches` through `/api/branches` instead of a placeholder/warehouse source, respecting current user branch scope where available. Supplier account copy uses a small inline SVG icon button with no CDN/dependency.
- i18n is recorded as a future separate architecture batch, not part of the current master-data cleanup, because it affects app-wide copy, validation messages, routing, and locale fallback.
- Current parity slice: `/sales/stock-issue` was revised after Transaction Bills. It restores the legacy amber/orange Pending Sale hero, four KPI cards, status filter, weight/cost/estimated-sale columns, status wording, and disabled convert/edit/cancel action shell. `/api/sales/stock-issue` only gained read status filtering and derived item quantity; no create/edit/convert/cancel/delete write behavior, stock-ledger reversal, or sales-bill generation was added.
- Current parity slice: `/purchase/payments` and `/sales/receipts` were revised after Pending Sale. The shared money-movement component now restores the first legacy Payment/Receipt Voucher shells with rose/emerald heroes, create CTAs, KPI cards, date/account/search filters, outstanding bill selector with party/amount prefill, voucher net summary, dense history table, footer totals, and disabled view/print action shell. Existing single-voucher POST behavior remains unchanged; multi-bill voucher, split accounts, print document generation, edit/delete/reverse, and allocation writes remain deferred.
- Current layout task: sidebar navigation scroll preservation was revised after user feedback. `AppNavigation` now restores saved sidebar scroll only once, avoids treating missing session storage as `0`, and suppresses programmatic scroll saves while still scrolling the selected route into view when needed.
- Current parity slice: `/purchase/receipt-vouchers` was revised after the sidebar task. It restores the first legacy Receipt Voucher read/print surface: blue info banner, compact search/create toolbar, KPI strip, seller/tax ID/purchase bill/weight/amount table columns, print/edit/delete action cluster with edit/delete disabled, legacy empty state, footer totals, and read-only print preview from existing DB fields. The API only exposes existing receipt voucher print/detail fields; create/edit/delete/save, purchase-bill prefill, company-profile print header wiring, and sync/write semantics remain deferred.
- Current receipt voucher design follow-up on 2026-05-31: `/purchase/receipt-vouchers` moved its explanatory Receipt Voucher copy to the app topbar and removed the in-page info banner. The list page now follows the active design shell more closely with summary KPI cards, one filter row (`ค้นหา`, `วันที่`, clear, disabled create action), count/page-size/pagination above the table, and a denser white table shell while keeping the existing read-only print preview and disabled edit/delete actions unchanged.
- Current parity slice: `/daily/petty-advance` was revised after Receipt Vouchers. It restores the legacy purple/pink hero, five KPI cards, Top 10 recipient panel, compact filter/action bar, type/status chips, used/returned/remaining/action table shape, return modal date/account/notes fields, and read-only detail modal with summary plus return history. Existing create/edit/return writes are preserved; delete, expense allocation, linked-expense schema assumptions, and destructive cleanup remain deferred.
- Current parity slice: `/daily/bill-swap-history` was revised after Petty Advance. It restores the legacy rose/pink before-VAT report shell, KPI strip, supplier/product/bill search, before/after supplier names, derived weight, old/new price columns, old/new before-VAT amount columns, diff coloring, footer totals, and legacy empty state. The API only adds read joins for supplier names and purchase bill doc numbers; full legacy oldItems/newItems parity remains deferred because the target schema stores compact row fields.
- Current bill swap history design follow-up on 2026-05-31: `/daily/bill-swap-history` keeps the existing read-only report data but now follows the active list-page shell more closely with a standard filter row (`ค้นหา`, `วันที่`, clear), count/page-size/pagination row above the table, and denser KPI/table spacing per `docs/design.md`. Browser verification for this route is currently masked by an unrelated existing Next build error from `/app/stock/transfer/page.tsx` importing a missing `@/components/daily/StockTransferPageClient`.
- Current parity slice: Production report polish was revised after Bill Swap History. `/production/wip-report` now has age-days sorting/highlighting, `/production/report` has the legacy product output summary block, `/production/yield-loss-report` has the amber explanation and P&L impact card trio, and `/production/machine-utilization` has the formula banner plus Est.Hrs/ต้นทุน columns. All changes are read-only/report polish; branch/machine/status server filters, exact multi-output aggregation, loss reason wiring, and production mutations remain deferred.
- Current parity slice: `/daily/transfer` was revised after Production report polish. It restores the legacy compact filter card, direction account placeholders, clear-filter button, all/today/7-days/month period chips, inline count/total summary, rounded table shell, and explicit edit/delete action column while preserving the existing create/edit transfer POST flow. Delete remains disabled until a reviewed DELETE/tombstone/bank-statement cleanup path exists in the active Next API.
- Current transfer UI cleanup on 2026-05-31: `/daily/transfer` no longer shows the extra blue info banner (`โอนเงินระหว่างบัญชี — สร้าง Bank Statement 2 ฝั่ง`) above the filter card. The page now opens directly into the working filter/list surface instead of repeating explanatory copy.
- Current transfer design-alignment follow-up on 2026-05-31: `/daily/transfer` now leans on the active shared UI baseline for list pages. The search field, account filters, clear/create actions, summary row, table shell, numeric alignment, and modal field sizing were normalized to the `docs/design.md` filter/table/form tokens instead of continuing with page-local spacing/button/input variants.
- Current expense dashboard cleanup on 2026-06-04: `/daily/expense-dashboard` no longer shows the duplicate in-page gradient hero (`Dashboard ค่าใช้จ่าย`) above the working dashboard content. The route now opens directly into the period filter, KPI cards, anomaly section, and heatmap table, while the same title/subtitle now come from the global topbar via `PageTitleOverride`. Existing read-only dashboard behavior remains unchanged.
- Current expense-category follow-up on 2026-06-05: `/master-data/expense-categories` now exposes `ประเภทค่าใช้จ่าย` again in the active app. The master list adds the new column, the create/edit form can store it as optional text, and additive schema support was restored via `expense_categories.type` without bringing back the removed parent-category field.
- Current expense-type master follow-up on 2026-06-05: `ประเภทค่าใช้จ่าย` is no longer a free-text stopgap. The active app now has `/master-data/expense-types` as a dedicated master page, `/master-data/expense-categories` selects from that master via dropdown, and `expense_categories` stores the linked expense-type id while still showing the readable type name in the list.
- Current group-A master code follow-up on 2026-06-05: `bank_names`, `payment_methods`, `product_units`, `product_types`, `expense_types`, and `expense_categories` now all have dedicated `code` columns in the active schema/Prisma model. The shared simple-master pages for `/master-data/bank-names`, `/master-data/payment-methods`, `/master-data/product-units`, `/master-data/product-types`, and `/master-data/expense-types` now show/edit `code`, while `/master-data/expense-categories` also shows its own `code` and sends `expense_types.code` through the dropdown/UI layer before mapping back to `expense_type_id` internally. Dev-target/local DB migration `20260605005110_add_codes_to_group_a_masters.sql` was applied locally and backfilled existing group-A rows (`expense_categories.code` became `EXC-###`; existing bank/payment/unit/type ids were copied into `code`).
- Current master-data navigation follow-up on 2026-06-05: sidebar master-data navigation now groups expense masters under one parent menu `ค่าใช้จ่าย`. `/master-data/expense-categories` and `/master-data/expense-types` remain the same routes, but they now appear as sub menu items `หมวดค่าใช้จ่าย` and `ประเภทค่าใช้จ่าย` under the shared expense parent instead of two separate top-level master-data entries.
- Current expense master bigint pilot on 2026-06-05: `expense_types.id` and `expense_categories.id` were migrated from legacy `text` PKs to internal `bigint` PKs, and `expenses.category_id` was migrated to `bigint` FK in dev/local through `20260605014935_convert_expense_master_ids_to_bigint.sql`. Follow-up cleanup `20260605021000_drop_expenses_category_legacy_id.sql` has now removed the temporary legacy text trace columns (`expense_types.legacy_id`, `expense_categories.legacy_id`, and `expenses.category_legacy_id`) from local/dev-target DB because the active app no longer uses them. Master-data and daily-expense flows continue to use `code` at the API/UI boundary and map to internal bigint ids inside the server. Project rule was also tightened in `docs/agent-rules/database.md`: new target-schema tables should default to `bigint id` plus separate business `code` / `doc_no` fields unless a documented exception is approved.
- Current expense status follow-up: `/daily/expense` now uses the same business status vocabulary as ADV (`pending_approval`, `approved`, `paid`, `cancelled`) instead of the old `pending/paid` pair. The expense list/filter/detail/export flow now reads `expenses.status` as the main business state and mirrors `paid_status` only for compatibility with older downstream queries.
- Current expense modal follow-up on 2026-05-31: `/daily/expense` create/edit modal now shows both `รายละเอียด` and `หมายเหตุ` as multi-line text areas instead of a single-line detail input. The modal writes to the existing `description` and `notes` fields only; no schema/API shape change was introduced.
- Current expense mutation follow-up on 2026-05-31: `/daily/expense` now allows `แก้ไข` and `ยกเลิก` only while the document is still `pending_approval`. The list shows both actions only for pending rows, the edit modal no longer exposes a writable status dropdown, `POST /api/daily/expenses` refuses updates once the row has moved past pending approval, and `PATCH /api/daily/expenses/[id]` handles pending-row cancellation by marking the document `cancelled`.
- Current purchase bill ADV follow-up on 2026-05-31: `/purchase/bills` create/edit modal now includes a dropdown for `เอกสารจ่ายเงินล่วงหน้า/มัดจำ` so office can select one ADV document to deduct before payment. The bill summary now shows `ยอดสุทธิก่อนหัก ADV` and `ยอดสุทธิที่ต้องจ่าย`. The API persists one active `supplier_advance_allocations` row per purchase bill for this flow, voids/replaces it on bill edit or bill cancel, refreshes `supplier_advance_payments.allocated_amount/remaining_amount/status`, and recalculates `purchase_bills.paid_amount/payable_balance/status` from both active ADV allocations and non-cancelled PMT rows so payment approval / supplier payment queues stay in sync.
- Current parity slice: `/stock/transfer` was revised after Daily Transfer. It restores the legacy compact filter bar with search/date/from-branch/to-branch controls, all/today/7-days/month period chips, inline count/weight summary, blue create CTA, seven-column table with disabled cancel shell, and red/emerald source-destination modal panels with sender/receiver/notes fields. Existing stock-ledger POST behavior is preserved; cancel/tombstone and sender/receiver persistence remain deferred until schema/write semantics are reviewed.
- Current stock transfer design-alignment follow-up on 2026-05-31: `/stock/transfer` now follows the active `docs/design.md` list/form baseline more closely instead of keeping page-local UI primitives. The page uses the shared filter shell (`Input`, `DatePickerInput`, shared buttons), a separate count/page-size/pagination row above the table, the shared lined table component, and a sectioned create modal (`ข้อมูลเอกสาร`, `ต้นทาง`, `ปลายทาง`, `รายการสินค้า`, `ผู้รับผิดชอบและหมายเหตุ`). Save validation now uses the central red-field pattern too: required/invalid fields show inline errors, red highlight, and auto-focus to the first invalid control.
- Current parity slice: `/pending-sales` was revised after Stock Transfer. It restores the legacy LME Reference Pricing form-like inputs, disabled LME save shell, LME percent details with product count and input-style percent fields, active client-side CSV export, formula parity for gain/diff using `avgPriceRemain`, and the Patch 28 `ตารางรอขาย` section with formula explanation, five KPI cards, shortage highlighting, footer totals, and CSV export. This remains read/report only; LME persistence, matching/allocation writes, and sales-plan locks remain deferred.
- Current parity slice: `/anomaly-detector` was revised after Pending Sales. It restores category count tags, severity-colored group badges/titles/counts, legacy-like hero-to-KPI ordering, compact As-of read-only toolbar, and honest checklist copy for the 18 active rule groups. Legacy 40-check coverage and record-level jump/highlight remain deferred until missing read rules and target route highlight contracts are designed.
- Current parity slice: `/dashboard` data parity follow-up was revised after Anomaly Detector. The dashboard date range controls now request `/api/dashboard?from=&to=`, AR/AP aging buckets are computed server-side, cash composition includes FCD/AR/AP/OD/net cash, stock-by-branch and stock-by-group use stock ledger balances, and monthly trend rows drive dashboard chart panels. Branch/supplier/customer/product/group server filters and historical monthly baseline merge remain follow-up work.
- Current parity slice: `/dashboard` filter parity follow-up was revised after the data payload pass. Dashboard branch/supplier/customer/product/group controls now reload `/api/dashboard` with query parameters and the server filters purchase/sales KPIs and analysis rows read-only. The API now exposes active branches/groups/products as filter options; historical monthly baseline merge and fuller supplier/customer option lists beyond visible in-period rows remain follow-up work.
- Current parity slice: `/dashboard` historical data follow-up was revised after server filters. The dashboard now merges `historical_monthly` rows into revenue/COGS/expense totals and monthly trend rows (`pnl/revenue`, `pnl/cogs`, and `expense`) and shows actual merged amounts/row count in the historical indicator. Supplier/customer filter options now come from active master data rather than only top in-period rows. Remaining dashboard work is design-level statutory/GL reconciliation, not a safe read-only UI parity patch.
- Current unmapped legacy slice: remote-legacy-only views are being restored after the sidebar fix. `/dual-costing/waiting-allocations`, `/dual-costing/cost-allocation-ledger`, and `/dual-costing/report` now have dedicated read-only Next pages/APIs and sidebar entries. `/finance-accounting/asset-overview` now restores `trackAssetOverview` / Net Worth Track Asset as a management/read dark-shell baseline from existing Financial Dashboard + Cash & Others sources. No allocation write, reverse, stock mutation, GL posting, statutory P&L, or statutory balance-sheet behavior is added. The current remote-snapshot unmapped list is now closed; remaining items are design-level follow-ups.
- Current parity slice: Batch D Group C was revised after Company Profile and pushed as `dcfa1c1`. It restores Match Log's legacy `📋` info box, PO Sell filter shell, visible-row summary cards, and disabled Reverse action column; Deal Margin's match-status donut/legend, `PO Sell`/`Sell Qty` table shape, and legacy empty state; and Compare Margin's legacy first-screen order with date filters/row stats reduced after the core cards. No reverse/allocation mutation is enabled; Deal Margin `sellQty` is exposed as current `trading_deals.matched_qty` and documented in OpenAPI until normalized PO Sell allocation logs are designed.
- Current dual-costing design alignment follow-up on 2026-05-31: `/dual-costing/cost-pool`, `/dual-costing/cost-allocator`, `/dual-costing/match-log`, `/dual-costing/deal-margin`, `/dual-costing/compare-margin`, `/dual-costing/waiting-allocations`, `/dual-costing/cost-allocation-ledger`, and `/dual-costing/report` now share the active Next list/report shell pattern instead of page-local card/filter/table wrappers. All eight routes move explanatory copy into the app top bar via `PageTitleOverride`, use consistent white filter cards and KPI cards, and keep the dual-costing-specific color accents only where the legacy flow depends on them. `Cost Pool` now restores search + date filters in the active shell; `Cost Allocator` restores the missing step `⓪` source selector shell before product selection; ledger/waiting/report management pages now use the same summary/filter/table rhythm as the other dual-costing pages. Validation passed locally: `npm run type-check --workspace @ns-scrap-erp/next`, `npm run lint --workspace @ns-scrap-erp/next`, `npm run build --workspace @ns-scrap-erp/next`, and `git diff --check`.
- Current follow-up slice: `/stock/ledger` row detail modal was implemented after UI-D3 and pushed as `181a2e5`. It turns the legacy `อ่าน` action into a read-only modal using the existing ledger row payload; duplicate/orphan cleanup stays disabled and no stock write behavior is added.
- Current follow-up slice: PO Buy branch/warehouse cleanup is implemented. `/purchase/po-buy` create flow now uses required active `branches` instead of `warehouses`, generates new document numbers as `POB{branchCode}{YYMM}-NNNN`, writes `branch_id` directly, and leaves `warehouse_id`/`channel_id` null for new PO Buy rows. The active `/master-data/warehouses` page/API/config has been removed; `/master-data/branches` is the business-facing `สาขา / คลัง` master. Dev-target branch IDs were remapped after backup to `BR001/code 01/สมุทรสาคร` and `BR002/code 02/นครสวรรค์`; old `BR003` references were cleared from public `branch_id` columns and `user_profiles.branch_ids`. The physical `warehouses` table is retained only for existing stock/purchase-bill history until a separate stock-location migration is designed.
- Current master-data cleanup slice: supplier receiving-account payment methods now come from `/master-data/payment-methods` instead of hardcoded options. Dev-target `bank_names` no longer contains `เงินสด`/`เงินโอน`, `payment_methods` no longer stores a code column, payment method names are bilingual such as `เงินสด (Cash)`, and supplier account rows use canonical `เงินโอน` while still accepting legacy `โอนเงิน` import text.
- Current purchase-bill modal follow-up: `/purchase/bills` now shows `ผู้ดูแล` in the blue WTI summary strip after selecting supplier + receipt, sourcing the name from the supplier master (`sales_rep`, with salesperson master fallback by `sales_id`) so office users can verify the responsible owner before pricing the bill.
- Current purchase-bill modal UI cleanup: the purchase VAT-invoice receipt toggle/help block was removed from `/purchase/bills` create/edit modal per user request. VAT amount calculation remains, but the UI no longer asks whether the physical tax invoice has been received.
- Current purchase-bill validation polish: stock purchase save now maps the `ราคา/กก. > 0` validation back to the exact row price field (`items.N.price`), so the invalid input gets the red border and receives focus immediately on save.
- Current shared validation UX follow-up: `docs/design.md` now defines the active form-validation error baseline. Required/invalid fields on submit must show red field state, inline error text, and automatic scroll/focus to the first invalid field, including row-level item paths such as `items.N.price`.
- Current supplier payment-method alignment follow-up on 2026-05-29: `/master-data/suppliers` and the supplier import/export/API/domain stack no longer hardcode only `เงินสด` and `เงินโอน`. Supplier receiving-account rows now list actual methods from `public.payment_methods.name`, use `payment_methods.type` to decide whether bank-detail fields are required or hidden, preserve the selected business-facing method name in `supplier_bank_accounts.payment_method`, and still normalize legacy cash/bank text into the active master rows during read/import.
- Current company-account wording follow-up: `/master-data/accounts` now uses business-facing wording where account `type` is labeled `วิธีจ่าย/รับเงิน` and account `subtype` is labeled `ประเภทบัญชี` in both the form and list columns. This keeps the page aligned with the clarified model that payment method and bank-account subtype are separate concepts.
- Current account-subtypes master follow-up: `บัญชีเงินบริษัท` now has a new submenu `/master-data/account-subtypes` named `ประเภทบัญชีธนาคาร`. The active Next app now has additive master table `public.account_subtypes` seeded with `SAVINGS`, `CURRENT`, `FCD`, and `OD`, plus a dedicated master-data page/API for maintaining sort order and active state. The `/master-data/accounts` form is intentionally not rewired to this new master in the same batch yet.
- Current payment-methods master follow-up: `/master-data/payment-methods` no longer uses its own direct `pg` SQL route. The page now goes through the shared Prisma-backed simple-master pipeline like other master-data pages, removing route-level hardcoded pool/query logic while keeping the same user-facing `ชื่อ` + `สถานะ` behavior.
- Current payment-method classification follow-up: `public.payment_methods` now carries a business classification field `type = cash|bank`. `/master-data/payment-methods` maintains this as `กลุ่มบัญชี`, and `/master-data/accounts` now uses the selected payment-method metadata instead of hardcoded `เงินสด/Cash` text matching to decide whether `ประเภทบัญชี` and bank fields should be shown.
- Current ADV payment-method follow-up: `/purchase/advance-payments` no longer derives `วิธีจ่าย` from distinct `accounts.type` values. The form now lists methods from `public.payment_methods.name` directly and uses `payment_methods.type` only to filter `บัญชีที่จ่าย`, so the UI stays aligned with the shared `วิธีจ่าย/รับเงิน` master.
- Current daily-payment-method follow-up on 2026-05-29: `/purchase/payments` and `/sales/receipts` no longer hardcode their method choices in the shared `MoneyMovementPageClient`. Both GET APIs now return active `public.payment_methods`, the payment/receipt form selects from that master directly, supplier bank-account display no longer infers cash from exact `เงินสด` text only, and `/api/daily/payment-approval` now normalizes supplier destination methods from `payment_methods` metadata instead of falling back to hardcoded `เงินโอน`.
- Current master-data cleanup slice: product and machine parent menu rows are now submenu toggles only. The working pages are labeled `/master-data/products` = `รายการสินค้า` and `/master-data/machines` = `รายการเครื่องจักร`, matching the user's request that `สินค้า` and `เครื่องจักร` act as submenu groups.
- Current accounts master-data follow-up: `/master-data/accounts` no longer infers `FCD/OD` from table display only. `public.accounts` now has additive field `subtype`; the accounts form includes required `ชนิดบัญชี` select and no longer exposes an `อื่น ๆ` bucket. The current closed option set is `เงินสด`, `ออมทรัพย์`, `กระแสรายวัน`, `FCD`, and `OD`. Existing legacy `bank/other` subtype values are normalized to `savings`, save flow derives broad `type` from subtype (`cash -> cash`, `savings/current/fcd/od -> bank`), and when `ประเภท = เงินสด` the form auto-fixes subtype to `เงินสด` and hides the subtype picker instead of letting users choose it manually.
- Current accounts validation follow-up: `/master-data/accounts` now enforces business-required field rules on both form submit and API save. For non-cash account subtypes, `ธนาคาร`, `เลขที่บัญชี`, and `สกุลเงิน` are required. `FCD` must use non-`THB` currency. `ออมทรัพย์`, `กระแสรายวัน`, and `OD` must use `THB`. `OD` also requires `วงเงิน OD > 0`.
- Current accounts cash-currency follow-up: cash accounts now still require `สกุลเงิน` even though they hide `ชนิดบัญชี`, `ธนาคาร`, `สาขาธนาคาร`, `เลขที่บัญชี`, and `วงเงิน OD`. The form no longer clears `currency` when switching to `เงินสด`, and the API rejects cash-account saves without currency.
- Current accounts form split follow-up: `/master-data/accounts` now renders different field sets for `เงินสด` vs `เงินโอน`. Cash accounts hide `ชนิดบัญชี`, `ธนาคาร`, `สาขาธนาคาร`, `เลขที่บัญชี`, `สกุลเงิน`, and `วงเงิน OD`; subtype is auto-fixed to `เงินสด`. Bank-transfer accounts show the full bank fields, and `วงเงิน OD` is shown only when subtype = `OD`.
- Current accounts entry-order follow-up: the create/edit form for `/master-data/accounts` now follows business entry order: `ประเภท -> สาขา -> ชื่อบัญชี -> ชนิดบัญชี -> ธนาคาร -> สาขาธนาคาร -> เลขที่บัญชี -> สกุลเงิน -> วงเงิน OD (when subtype=OD) -> ยอดเงินคงเหลือ`. Switching to `เงินสด` clears bank-specific values. Switching to bank subtypes auto-defaults `THB` for `ออมทรัพย์/กระแสรายวัน/OD`, clears `THB` when moving to `FCD`, and clears `OD` limit when leaving subtype `OD`.
- `ชนิดบัญชี` บนหน้า `/master-data/accounts` ถูกผูกเป็นตัวเลือกของ `เงินโอน` อย่างเดียวใน UI แล้ว; บัญชี `เงินสด` ไม่แสดง/ไม่ต้องเลือก subtype แม้ระบบจะยัง normalize ภายในเป็น `cash` เพื่อคุม validation และ backward compatibility.
- Current cash-account behavior follow-up: `/master-data/accounts` now hides `ประเภทบัญชี` until `วิธีจ่าย/รับเงิน` is selected, and keeps it hidden when the chosen payment method is `เงินสด`. Cash accounts still require `สกุลเงิน` because cash may exist in multiple currencies, while `ธนาคาร`, `สาขาธนาคาร`, `เลขที่บัญชี`, and `วงเงิน OD` remain hidden for cash. Save flow still auto-writes internal subtype `cash`.
- Current master-data cleanup slice: `currencies.code` and `overseas_remittance_purposes.code` were removed from dev-target after maintenance backups. Currency now uses internal `id` derived from uppercase `symbol`, and foreign-finance APIs still return a compatibility `code` value from the currency symbol for existing form consumers. Remittance purpose UI/API now exposes name/status only.
- Current system cleanup slice: Audit Log / Activity Log redesign was implemented and pushed as `7a07c7d`. Dev-target now has separate append-only `app_audit_logs` and `app_activity_logs` tables with RLS, `system.activity.view`, and append-only update/delete guards. Next writes user-management audit events to `app_audit_logs`, records page/branch activity through `/api/activity`, and `/admin/audit` reads a unified feed from the two new tables through the existing `/api/admin/auth-events` compatibility endpoint. Legacy `app_auth_events`, `audit_logs`, and deletion log tables are retained as history/compatibility sources, not the new source of truth.
- Current local runtime hardening follow-up on 2026-05-26: `/api/purchase/po-buy` and the PO options path inside `/api/purchase/bills` no longer run full `reconcilePoBuys()` passes across the whole PO set during ordinary GET/options page loads. Reconciliation remains on create/edit/cancel/short-close/write flows and on targeted PO validation before purchase-bill save, but read paths now trust stored `po_buys.remaining_*` / `status` values instead of recalculating thousands of rows per request. This removes the local `500` cascade where slow PO read-path reconciliation was causing `/api/auth/me`, `/api/activity`, and `/api/purchase/po-buy` to fail around the 5-second mark under concurrent dev-page loads. Remaining note: PO list reads are still heavier than ideal, but they now return successfully without the previous timeout/failure pattern.
- Current payment-approval bank-account selector follow-up on 2026-05-27: `/daily/payment-approval` AP rows now include supplier bank-account options from `supplier_bank_accounts`. When a supplier has more than one active bank account, the `บัญชีธนาคาร` column can switch the destination account directly from the table via a local selector. This is a UI-only choice for now; approval write flow/audit persistence has not been added yet.
- Current payment-approval bank-account fallback follow-up on 2026-05-27: `/api/daily/payment-approval` now synthesizes a fallback bank-account option from legacy `suppliers.bank_account` / `suppliers.bank_name` when `supplier_bank_accounts` has no matching row yet. This keeps the table-side dropdown usable during master-data transition instead of collapsing back to plain text because the normalized bank-account child rows are still incomplete.
- Current payment-approval workflow decision on 2026-05-27/28: the business flow is locked as `บิลรับซื้อ -> อนุมัติโอนเงิน -> จ่ายเงิน Supplier`. A newly created purchase bill with `payable_balance > 0` must appear in `/daily/payment-approval` first. Approval creates a persistent snapshot record, freezes the approved amount and destination bank account, and feeds `/purchase/payments` from approved snapshots only. `/purchase/payments` is the active queue surface: each approved row can either `ทำจ่าย` or `ยกเลิก` before payment. The resulting `รายการจ่าย` must be treated as one lifecycle with statuses `รอจ่าย`, `เสร็จสิ้น`, and `ยกเลิกแล้ว`; `/purchase/payment-history` is the read-only snapshot history of rows that have already left the queue.
- Current payment-approval implementation follow-up on 2026-05-27: dev-target now has `public.payment_approvals` plus `payments.payment_approval_id`, applied locally from `supabase/migrations/20260527103000_add_payment_approvals.sql`. `/api/daily/payment-approval` now writes persistent AP approval snapshots for `purchase_bills`, freezes the selected destination bank account and approved amount, and returns both `pending` and `approved` rows from persisted state instead of UI-only selection. `/purchase/payments` now reads only approved snapshots, links each payment row back through `payment_approval_id`, and marks the approval `paid` when its approved amount is fully settled. Important settlement rule: `approved_amount` is the AP settlement amount, so on payment save the sum of `cash amount + withholding tax + discount` must not exceed the approved amount. Local browser/API smoke passed with `PB012605-0035 -> PMA012605-0001 -> PMT012605-0291`; after payment, the approval disappeared from both `/daily/payment-approval` and `/purchase/payments`, and DB verification showed `payment_approvals.status='paid'` plus `purchase_bills.payable_balance=0`.
- Current supplier-payment queue rule on 2026-05-28: `/purchase/payments` top table is the only active queue surface for approved supplier payments. The row action pair is now `ทำจ่าย` + `ยกเลิก`; this `ยกเลิก` means cancel the queued approval item before payment exists, using the approval snapshot id, and it returns the purchase bill to `/daily/payment-approval` as `ยังไม่อนุมัติ`.
- Current supplier-payment snapshot rule on 2026-05-28: a queued supplier-payment item cancelled from `/purchase/payments` is still part of the same payment lifecycle and should be represented in `/purchase/payment-history` as a cancelled snapshot row, not treated as “no history”.
- Current supplier-payment history implementation follow-up on 2026-05-28: `/api/purchase/payment-history` now merges `payment_approvals.status='voided'` rows that never created a payment into the history read model as `ยกเลิกแล้ว` snapshot rows. Local browser/API verification passed with `PB012605-0417 / PMA012605-0004`: cancelling the queue item from `/purchase/payments` removed it from the payment queue, returned the bill to `/daily/payment-approval` as `pending`, and added a history row with doc no `PMA012605-0004`, amount `2689.00`, destination bank snapshot `ธนาคารกรุงไทย · 555555`, and status `cancelled`.
- Current approval doc-number follow-up on 2026-05-28: `payment_approvals` now has user-facing `doc_no` separate from the UUID `id`. Approval rows use `PMA{branchCode}{YYMM}-NNNN`, and each approval cycle must create a fresh snapshot row with a fresh `PMA` number. `payment_approvals.doc_no` should therefore remain unique. When a queued approval is cancelled, the old approval snapshot stays in history with status `ยกเลิกแล้ว`; when the bill is approved again later, the new approval snapshot must get a new `PMA` number instead of reusing the old one.
- Current re-approval source-of-truth clarification on 2026-05-28: when a queued payment item is cancelled from `/purchase/payments` and later approved again, the new `payment_approvals` row must be rebuilt from the current `purchase_bills` state plus the bank account the user selects at that time. The cancelled `payment_approvals` row is history only; it must not be cloned as the source of truth for the next approval cycle.
- Current approval doc-number repair checkpoint on 2026-05-28: `supabase/migrations/20260528190000_restore_payment_approval_doc_no_unique.sql` has now been applied to local dev-target. It renumbered the old duplicate PMA snapshot safely, restored `uq_payment_approvals_doc_no`, and verified the `PB012605-0417` approval chain as `PMA012605-0004` = cancelled, `PMA012605-0005` = cancelled, `PMA012605-0006` = current approved row.
- Current pending-approval queue clarification on 2026-05-28: rows still in `ยังไม่อนุมัติ` are not snapshots. `/daily/payment-approval` must keep reading them from the current `purchase_bills` state, so if a purchase bill is edited before approval, the queue must immediately reflect the latest payable amount, supplier details, and selectable destination bank accounts.
- Current purchase-bill lock rule on 2026-05-28: once a purchase bill has an active `payment_approvals.status='approved'`, the bill must be locked against edit and cancel. It becomes editable again only after the queued payment item is cancelled and the bill returns to the `ยังไม่อนุมัติ` queue. Re-approval after that must create a fresh `PMA` snapshot.
- Current purchase-bill list follow-up on 2026-05-28: `/purchase/bills` now needs an explicit payment-workflow status surface separate from ordinary payment status. The list/detail should make `ยังไม่อนุมัติ` vs `รอจ่าย` visible to users, and the same workflow state is the source for disabling `แก้ไข/ยกเลิก` actions on the bill.
- Current purchase-bill filter follow-up on 2026-05-28: the purchase-bill segmented status filter must be aligned to the payment-workflow state set, not only the raw bill settlement status. Required visible states are `ยังไม่อนุมัติ`, `รอจ่าย`, `ชำระบางส่วน`, `เสร็จสิ้น`, and `ยกเลิก`.
- Current purchase-bill segmented-filter batch on 2026-05-28: implementation still needs to finish `/purchase/bills` end-to-end so the API, segmented filter values, labels, and browser behavior all use the same derived payment-workflow state. Required derive order is `cancelled -> paid -> partial_paid -> pending_payment -> pending_approval`. This batch is not complete until the page can filter each of the 5 states correctly and validation passes again.
- New purchase-flow requirement on 2026-05-28: the target system must support `จ่ายเงินล่วงหน้า / มัดจำ` before final purchase billing. Example case: supplier sends one truck weighed only as a gross total on a large scale, detailed inbound weighing is not finalized yet, but the business still pays an advance first. Later, when creating the purchase bill, the form must allow selecting advance-payment entries so the bill can settle against them before sending only the remaining net payable into payment approval.
- Clarified on 2026-05-28: the advance-payment form needs real large-scale source fields, not just finance fields. Required minimum input now includes large-scale doc no, in/out dates, plate, optional vehicle photo, customer name, product name, in/out/net weights, price per kg, remark, scale operator, sender, driver, and the advance amount to pay, plus finance fields such as branch, supplier, payment date, payment method, and funding account.
- Clarified on 2026-05-28: after an advance-payment record is created, it must enter the same payment-approval queue (`อนุมัติจ่ายเงิน`) as ordinary payable items, because it still requires approval before actual payout.
- Clarified on 2026-05-28: this queue should now be treated as business-level `อนุมัติจ่ายเงิน`, not only `อนุมัติโอนเงิน`, because it must accept at least `บิลรับซื้อ`, `จ่ายเงินล่วงหน้า / มัดจำ`, and `ค่าใช้จ่าย` in one approval surface.
- Clarified on 2026-05-28: once a purchase bill is created with allocated advance payments, its initial workflow state depends on the remaining net payable after deducting those advances. If net payable remains, the bill starts at `ยังไม่อนุมัติ`; if the advances fully settle the bill, the bill goes straight to `เสร็จสิ้น` and must not enter payment approval.
- Clarified on 2026-05-28: if allocated advance payments exceed the final bill amount, the excess must go through an advance-refund flow first. The target system should not automatically carry that excess forward as supplier credit yet. Using the excess as a discount/offset against another bill is explicitly out of system for now.
- Clarified on 2026-05-28: advance-refund for overpayment belongs to a dedicated `Supplier` flow/menu. It should not reuse the refund surface from sales/customer receipt flows because the business direction and accounting semantics differ.
- New approval-queue requirement on 2026-05-28: approval must support `split payment approval`. A single payable source may be split into multiple approval items by payment method/account. Example target behavior: after a 1,000,000 bill has 800,000 advance already settled, the remaining 200,000 can be approved as 50,000 cash + 100,000 transfer account A + 50,000 transfer account B. Each split becomes its own `payment_approvals` row and its own `รอจ่าย` row.
- New implementation batch on 2026-05-28: convert approval from one-amount-per-document behavior into `approval item` behavior. `/daily/payment-approval` must allow mixed split items in one approval cycle, persist one `payment_approvals` row per split item, and make `/purchase/payments` show each split as its own queued row.
- Documentation split on 2026-05-28: payment/approval/advance/refund rules are now separated into `docs/notes/Payment Flow.md`. `Purchase Flow.md` remains canonical for PO/WTI/Purchase Bill/stock-side rules, while `Payment Flow.md` is canonical for `PMA/PMT`, approval queue, split approval items, advance payment, and supplier-side advance refund.
- Open task batch on 2026-05-28 for split approval / advance payment:
  1. rename queue/menu wording from `อนุมัติโอนเงิน` to `อนุมัติจ่ายเงิน` in active Next surfaces
  2. design additive schema for advance-payment header + later allocation-to-bill facts
  3. redesign `/daily/payment-approval` UI from single amount editor to split-item editor
  4. extend `/api/daily/payment-approval` write path so one approval cycle can create many `payment_approvals` rows
  5. adapt `/purchase/payments` to list and pay each split approval item independently
  6. preserve bill/workflow locking while any split item remains `approved`
  7. add browser smoke for mixed split methods: cash + two transfer accounts
- Current advance-payment implementation slice on 2026-05-28: `/purchase/advance-payments` is being added as the create/list surface for `จ่ายเงินล่วงหน้า / มัดจำ`. The additive schema starts with `supplier_advance_payments` for `ADV...` documents and `supplier_advance_allocations` for later many-to-many allocation into `purchase_bills`. This first slice stores source large-scale fields and finance intent only; it does not post bank statement rows and does not yet feed purchase-bill allocation.
- Current advance-payment/master-data follow-up on 2026-05-29: after correcting an earlier wrong direction, `/purchase/advance-payments` now uses `public.payment_methods` as the source of truth for `วิธีจ่าย`. The ADV form lists `payment_methods.name` directly, uses `payment_methods.type` only to filter `บัญชีที่จ่าย`, and keeps the account option label to `ชื่อบัญชี + ยอดคงเหลือ` without account code/type in the control.
- Current advance-payment vehicle-image follow-up on 2026-05-29: the `รูปภาพรถ` field on `/purchase/advance-payments` now mirrors the weight-ticket upload pattern instead of requiring a URL. The page stores selected filenames in `supplier_advance_payments.vehicle_photo_names` for now; actual binary upload/storage remains a follow-up slice.
- Current payment-method master follow-up on 2026-05-29: `/purchase/payments` and `/sales/receipts` no longer hardcode `เงินสด / โอน / เช็ค / PromptPay` in `MoneyMovementPageClient`. Both pages now load payment-method choices from `public.payment_methods`, the customer receipt form changed from a free-text payment-method field to a select sourced from that master, and supplier account display logic no longer infers cash/bank behavior by direct string matching on `เงินสด`.
- Current payment-approval fallback cleanup on 2026-05-29: `/daily/payment-approval` no longer falls back to a hardcoded transfer-style payment method when rendering destination account/payment-method data. The active queue now opens with destination account labels driven by approval snapshot/master data instead of a baked-in fallback wording.
- Current payment-approval/ADV queue follow-up on 2026-05-29: the active Next queue/menu wording is now `อนุมัติจ่ายเงิน`. Newly created `ADV` rows from `/purchase/advance-payments` now appear in `/daily/payment-approval` alongside purchase bills, can be approved from the same AP tab, and switch `supplier_advance_payments.status` from `pending_approval` to `approved`. If the queued approval item is cancelled before payment, the ADV source returns to `pending_approval`, so the document becomes editable/cancellable again under the existing ADV mutation rule.
- Current payment-approval detail-modal follow-up on 2026-05-30: `/daily/payment-approval` no longer edits/approves through checkbox + inline pay-amount columns in the list table. The AP/expense tables now act as compact summary lists; `checkbox`, destination-bank column, and inline `ยอดที่จะจ่าย` column were removed from the grid, and clicking a row opens a detail modal. The AP modal now shows source/bank/amount/status details and holds the single-row `ยอดที่จะจ่าย` input plus `อนุมัติรายการนี้` action for pending items.
- Current payment-approval split-item follow-up on 2026-05-30: the AP detail modal now supports real split approval rows. A pending source document can be broken into many approval items, each with its own destination choice (`เงินสด` when active in `payment_methods`, or supplier bank-account destinations) and approved amount. The API now accepts one source plus many split rows in one POST and creates many `payment_approvals` rows for the same cycle.
- Current payment-approval restore follow-up on 2026-05-31: `/daily/payment-approval` was restored back to the `f0fe8b2` approval-flow baseline after a later read-only regression. The page again uses the approval detail modal with split rows and `ยืนยันอนุมัติรายการนี้` for pending AP items instead of the later source-document link-only summary behavior.
- Current payment-approval layout cleanup follow-up on 2026-05-31: after the restore, the helper copy above the filters and the disabled `พิมพ์ใบอนุมัติส่ง Cashier` button were removed again from `/daily/payment-approval`. The active list shell should stay focused on filter + table + detail modal only until a real print flow is designed and approved.
- Current payment-approval status-filter follow-up on 2026-05-31: `/daily/payment-approval` now uses the shared `สถานะ:` multi-select segmented filter pattern from `docs/design.md` instead of the earlier single-select custom approval chips. `ทุกสถานะ` resets the filter, and `ยังไม่อนุมัติ` / `อนุมัติแล้ว` toggle in and out of the active status set using the same visual tokens as the other transaction list pages.
- Current ADV wording follow-up on 2026-05-31: `/purchase/advance-payments` now displays `paid` status as `เสร็จสิ้น` instead of `จ่ายแล้ว` so ADV status wording matches the current expense/payment-completion vocabulary in list filters, detail, and export labels while keeping the stored status value unchanged.
- Current payment-approval doc-no follow-up on 2026-05-30: split approval items now stamp PMA item doc numbers as `PMA.../1`, `PMA.../2`, ... while keeping the source document number as reference text. `/daily/payment-approval` under `อนุมัติแล้ว` now behaves as an approval-item list rather than a source-document list, and `/purchase/payments` now shows the PMA item doc no in the waiting-payment queue so split rows from one bill are distinguishable before `ทำจ่าย` / `ยกเลิก`.
- Current payment-approval cancelled-history follow-up on 2026-05-30: `/daily/payment-approval` now includes `ยกเลิกแล้ว` in the same approval workbench. The API read model returns `payment_approvals.status='voided'` as snapshot rows, the UI exposes a dedicated `ยกเลิกแล้ว` filter, and pending balance still subtracts only active `approved` items so cancelled split rows correctly release amount back into `ยังไม่อนุมัติ`.
- Current payment-approval validation checkpoint on 2026-05-30: local validation passed for the split-approval + cancelled-history slice (`npm run type-check --workspace @ns-scrap-erp/next`, `npm run lint --workspace @ns-scrap-erp/next`, `npm run build --workspace @ns-scrap-erp/next`, `git diff --check`). Browser smoke for split approve -> waiting-payment item visibility -> queued-item cancel -> `ยกเลิกแล้ว` visibility remains required before commit/push.
- Correction checkpoint on 2026-05-30 after re-checking Purchase Flow: `/purchase/payments` must still expose queued-item cancel for approval rows that have not produced payment yet. The `PMA final / no queued-item cancel` direction above is no longer current.
- Current AP queue correction on 2026-05-30: active code restores `ยกเลิก` on `/purchase/payments`, re-enables `/api/purchase/payments/cancel-approved` to void `payment_approvals.status='approved'` before any payment exists, and restores cancelled queue snapshots into `/api/purchase/payment-history` as `ยกเลิกแล้ว`.
- Current Purchase Flow documentation checkpoint on 2026-05-30: `docs/notes/Purchase Flow.md` state/use-case matrix now treats `/purchase/payments` as the waiting-payment queue that still allows `ทำจ่าย` and `ยกเลิก` before payment execution, while `PMT cancelled` remains the later lifecycle after payment exists.
- Current browser verification required on 2026-05-30: after restoring queued-item cancel, local browser smoke still needs to confirm `/purchase/payments` shows both `ทำจ่าย` and `ยกเลิก`, cancelled queue items drop from the waiting list, and `/purchase/payment-history` shows the PMA snapshot as `ยกเลิกแล้ว`.
- Current PO Buy validation follow-up on 2026-05-30: `PoBuyPageClient` now maps server-side `400 BAD_REQUEST fieldErrors` back into the create/edit form instead of showing only a generic request failure. `dailyFetchJson()` now throws `ApiError` with `fieldErrors`, and PO Buy save catches that payload so rules like `วันส่งมอบต้องไม่ก่อนวันที่ออก PO` highlight the offending field directly.
- New correction batch on 2026-05-30 for payment approval/payment queue:
  1. remove `ยกเลิก` action from `/purchase/payments`
  2. keep `/daily/payment-approval` filters aligned with the current split-approval model and decide separately whether `ยกเลิกแล้ว` belongs there or only in payment history
  3. keep `/purchase/payments` wording as `รายการรอออก PMT` but preserve queued-item cancel before payment execution
  4. verify `POST/GET /api/purchase/payments`, `cancel-approved`, and payment-history stay consistent for `approved -> voided -> re-approve` cycles
  5. verify `PB -> PMA -> PMT` is the canonical partial-payment path; `ADV` must remain only for real advance-payment source rows
- Current payment/receipt checkpoint on 2026-05-29: local validation passed for the active Next app after the payment-method cleanup (`npm run type-check --workspace @ns-scrap-erp/next`, `npm run lint --workspace @ns-scrap-erp/next`, `npm run build --workspace @ns-scrap-erp/next`, and `git diff --check`). Browser smoke also passed for `/purchase/payments`, `/sales/receipts`, and `/daily/payment-approval`; the visible follow-up still queued is `apps/next/src/components/daily/ReceiptVouchersPageClient.tsx`, where the print-preview fallback text still shows `รับเงินสด` when `receipt_vouchers.payment_method` is blank.
- Verified runtime on 2026-05-28: cancelling queued approval `PMA-f4dc071e-cc39-4733-b98a-88b49c24f919` for bill `PB012605-0417` moved the bill back from `รอจ่าย` to `ยังไม่อนุมัติ`, reopened `แก้ไข/ยกเลิก` in `/purchase/bills`, and left the bill settlement status itself as `ยังไม่ชำระเงิน`.
- Current purchase-bill cancel guard follow-up on 2026-05-27: `/api/purchase/bills` now blocks bill cancellation when the purchase bill still has `payment_approvals.status='approved'`. The required sequence is now `ยกเลิกการจ่ายเงิน` first so the linked approval can rollback out of the approved/paid state, then cancel the bill if no active payment remains. Bills cancelled before approval disappear from `/daily/payment-approval` automatically because the `ยังไม่อนุมัติ` queue excludes `purchase_bills.status='cancelled'`.
- Current payment-cancel rollback follow-up on 2026-05-27: posted supplier-payment vouchers still reverse by marking `payments.status='cancelled'`, deleting linked `bank_statement` rows for `ref_type='PMT'`, recalculating `purchase_bills.paid_amount/payable_balance/status`, and rolling the linked `payment_approvals` snapshot out of the `approved/paid` state. Browser/API smoke on local dev passed with `PMT012605-0292 -> PB012605-0419`: after cancel payment, the item reappeared in `/daily/payment-approval` as `ยังไม่อนุมัติ`, disappeared from `/purchase/payments`, and then `/api/purchase/bills` allowed cancelling `PB012605-0419`; after bill cancel, the approval-queue item disappeared.
- Current payment-history UI follow-up on 2026-05-27: `/purchase/payment-history` is treated as a snapshot/read-only surface again. The `ยกเลิก` button was removed from the table, and the payment-history dataset still contains recent paid vouchers such as `PMT012605-0291` through `/api/purchase/payment-history`; if a paid voucher appears missing on screen, check browser-side filters/search/page state before changing the write path.
- Current purchase-flow checkpoint on 2026-05-27: the active purchase flow is now considered complete through `บิลรับซื้อ -> อนุมัติโอนเงิน -> จ่ายเงิน Supplier -> ประวัติการจ่ายเงิน` for the purchase-bill/AP path. The next verification batch should move to stock impact: trace `WTI -> Purchase Bill -> stock_ledger -> stock balance`, then re-check `cancel Purchase Bill -> reverse stock` before treating inbound stock as closed.
- Current master-data cleanup slice: `/master-data/accounts`, `/master-data/machines`, and `/master-data/production-lines` no longer expose business code fields. Dev-target `public.accounts`, `public.production_machines`, and `public.production_lines` dropped `code` after maintenance backups. Branch references on accounts/machines/production lines now use branch ids while showing branch names, and user-facing labels are `สาขา/คลัง`.
- Current master-data import/export slice: customer phone is optional for round-trip import/export, supplier export includes `รหัสผู้ดูแล` and robust receiving-account text, and `/master-data/products` now has import support. Product business codes were normalized in dev-target from legacy group codes to `SKU001...` after backup while preserving product internal ids for transaction references.
- Current purchase-bill modal follow-up: `/purchase/bills` no longer shows modal fields for `เลขที่บิล`, `วันที่`, `ช่องทางซื้อ`, `เซลที่ดูแล`, VAT type, or the VAT checkbox in the bill-info section. Purchase bill numbers and the create timestamp are system-generated on save, new bill document dates derive from `created_at` in Bangkok time, branch selection shows branch names without codes, Stock bills now show an explicit branch-filtered `คลัง` dropdown, the supplier field is searchable, saved `sales_id` derives from supplier master data, and item rows now wrap so `Gross` and later quantity/price fields start on the next line under product/PO.
- Current purchase-bill status normalization follow-up: per user clarification on 2026-05-25, purchase-bill unpaid status must use `unpaid` as the single canonical value instead of mixing `open` and `unpaid`. `/purchase/bills` status chip `ยังไม่จ่าย` now filters only canonical `unpaid`, `/api/purchase/bills` normalizes any legacy incoming `open` query value to `unpaid`, new/updated purchase bills now persist `unpaid` when unpaid, and the active dev DB was updated on 2026-05-25 to convert existing `purchase_bills.status='open'` rows to `unpaid`.
- Current purchase-bill DB hardening follow-up: repo schema and migration now match the unpaid-status normalization. `apps/next/prisma/schema.prisma` sets `purchase_bills.status` default to `unpaid`, and `supabase/migrations/20260525143000_normalize_purchase_bill_unpaid_status.sql` persists the DB-side update (`open -> unpaid`), default change, and a `purchase_bills_status_chk` constraint limited to `unpaid`, `partial`, `paid`, and `cancelled`.
- Current tax config follow-up: dev-target now has configurable `vat_settings` and `wht_settings` master/config tables seeded with VAT 7% and WHT 3%. `/admin/system-settings` manages both active rates under the System module. `/purchase/bills` reads the active VAT percent from DB, displays that percent in the modal summary, calculates VAT from that rate instead of hardcoded `7`, and stores the rate used in `purchase_bills.vat_rate_percent`. `/purchase/payments` now reads active WHT config for supplier payments, displays WHT as read-only, and recomputes WHT in the API before save.
- Current UI pattern note: shared list/filter/table/pagination/button/wording conventions now live in `docs/design.md`. Add or change reusable UI rules there instead of recording them only in this worklog.
- Current UI foundation follow-up: the active Next app now has a shadcn-style component foundation under `apps/next/` (`components.json`, `src/lib/utils.ts`, `src/components/ui/Button.tsx`, `Input.tsx`, `Select.tsx`, `Table.tsx`, `Tooltip.tsx`, `Dialog.tsx`, and upgraded `Card.tsx`) while keeping NS Scrap ERP colors and density. `/purchase/bills` and `/sales/bills` now consume shared UI components for filter/search/date/page-size/actions, the main list table shell, export tooltip, and the cancel-bill confirmation dialog instead of page-local class strings.
- Current UI foundation follow-up 2: `/purchase/payments`, `/purchase/payment-history`, and `/purchase/po-buy` now also consume the shared shadcn-style UI layer for high-reuse shells: search/date/account filters, page-size selectors, previous/next pagination actions, primary/secondary/export buttons, main list table containers, and amber tooltip behavior. `PoBuyCancelModal` now uses the shared dialog primitive; larger data-entry/detail modals still keep their existing flow for now to avoid widening the change set.
- Current UI foundation follow-up 3: modal/form adoption is now partially expanded too. `MoneyMovementPageClient` local form helpers (`BillSelect`, `Field`, summary select fields, modal action buttons) now sit on top of shared `Button/Input/Select`. `PoBuyFormModal` and `PoBuyDetailModal` now use the shared `Dialog` + `Table` + `Button` + `Input/Select` primitives instead of page-local modal shells, while keeping the existing wording, colors, and dense ERP spacing.
- Current UI foundation follow-up 4: `MoneyMovementPageClient` payment entry modal itself now sits inside the shared `Dialog` primitive, and its inner line-item grid/split controls use shared `Input/Select/Table/Button` much more consistently. `SupplierSearchCombobox` in `PoBuyPageClient` now uses the shared `Input` base too, so both list pages and modal entry surfaces are converging on one primitive set instead of only the outer page chrome.
- Current UI foundation follow-up 5: `MoneyMovementPageClient` now has the payment modal split into smaller feature-level sections (`PaymentSplitsSection`, `PaymentLinesSection`) instead of one giant render block, and `apps/next/src/components/ui/SearchCombobox.tsx` now exists as a reusable base primitive. `PoBuyPageClient` supplier search now consumes that shared combobox base rather than maintaining its own dropdown/input behavior inline.
- Current UI foundation follow-up 6: the payment modal section extraction is now a real file-level split under `apps/next/src/components/daily/MoneyMovementFormSections.tsx` rather than local helper functions, and numeric tooltip table cells now have a shared primitive at `apps/next/src/components/ui/TableNumberCell.tsx`. `PoBuyPageClient` uses that shared numeric cell instead of its own page-local implementation.
- Current UI foundation follow-up 7: the remaining `MoneyMovementPageClient` helper controls are now also split into `apps/next/src/components/daily/MoneyMovementFieldHelpers.tsx` (`BillSelect`, `Field`, `SelectField`, `SummaryPill`). At this point the page file is mostly orchestration/state/render composition, while reusable UI pieces have moved to feature/UI helper files.
- Current UI foundation follow-up 8: shared primitives are now used across another major transaction surface too. `TransactionBillsPageClient` supplier/product searchable dropdowns now sit on `apps/next/src/components/ui/SearchCombobox.tsx`, and its main numeric cells use `apps/next/src/components/ui/TableNumberCell.tsx` for consistent tooltip/width behavior instead of page-local implementations.
- Current UI foundation follow-up 9: `TransactionBillsPageClient` now also moves its bill-form field wrappers into `apps/next/src/components/daily/TransactionBillsFieldHelpers.tsx`. Supplier/product search, select fields, summary lines, and common input wrappers are no longer defined inline in the page file, and several bill/sales form inputs now sit directly on shared `Input`/`Select` wrappers while keeping the same labels, uppercase handling, and dense modal layout.
- Current navigation cleanup: per user request on 2026-05-22, the `การเงินต่างประเทศ` / Foreign Finance category is hidden from the active Next sidebar and report index because it is not in active use/development. Existing `/finance/foreign/*` pages and APIs are retained in code as future baselines; money-moving writes remain deferred.
- Current route retirement: per user request on 2026-05-22, `/stock/customer-return` has been removed from the active Next app because it is not used. The sidebar item, page route, API route, OpenAPI path/schema, and shared Customer Return form/schema branch were removed; no stock history or database tables were changed.
- Current purchase-bill DB cleanup: `public.purchase_bill_items` is added as the relational line table for purchase bill products, backfilled from `purchase_bills.items`, and `/api/purchase/bills` plus active purchase-item reports now read/write line rows. The old `purchase_bills.items` JSONB column has been removed from the target schema.
- Current AP/payment follow-up: `/api/purchase/payments` now refreshes linked `purchase_bills.paid_amount`, `payable_balance`, and `status` from active payment rows in the same transaction. Creating a purchase bill still creates AP via `payable_balance`; it does not create a payment row until the Supplier Payment Voucher is saved. Data dictionary: `docs/data-dictionary/purchase-bills.md`; local dev-target schema-only dump: `reports/db_audit/dev_target_schema_20260522.sql`.
- Current purchase QA documentation follow-up: `docs/notes/Purchase Flow Test Matrix.md` now exists as the execution checklist for Purchase Flow verification. `docs/notes/Purchase Flow.md` remains the business/dependency/rule doc, while the new matrix tracks concrete use cases from `PO Buy -> WTI -> Purchase Bill -> Payment Approval -> Supplier Payment -> Payment History`, plus allocation, rollback, and stock-impact scenarios.
- Current AP payment-history rule clarification on 2026-05-28: purchase payment history must remain a read-only snapshot surface, but its scope is the full `รายการจ่าย` lifecycle that has left the queue. At minimum it must show `เสร็จสิ้น` and `ยกเลิกแล้ว` snapshots. If a cancelled item later goes through `approve again -> pay again`, the system must create a new payment/voucher row and keep the old cancelled row for audit. Downstream accounting/report posting must consume only successful payment rows.
- Current AP payment-history hardening slice on 2026-05-28: `/purchase/payment-history` stays GET-only as the read model route. The history UI exposes status filtering (`ทั้งหมด`, `เสร็จสิ้น`, `ยกเลิกแล้ว`), keeps cancelled rows visible for audit, and shows no in-page action button.
- Current master-data accounts wording follow-up on 2026-05-28: `/master-data/accounts` now treats bank-based company accounts as `เงินโอน` in the UI instead of `ธนาคาร`, while keeping DB values (`cash`, `bank`, `other`) unchanged. `บัญชีเงินบริษัท` table display now uses a Thai label field so FCD/OD accounts can stay under the `เงินโอน` type without changing stored data.
- Superseded purchase stock-routing follow-up: product master still exposes `products.item_status` as `รับเข้าเป็น` with RM/WIP/FG/SCRAP choices, and warehouse master still stores `warehouses.type` as metadata, but purchase bill `STOCK` no longer routes warehouse by product status or warehouse type. Current rule is explicit user selection: `/purchase/bills` filters active warehouses by selected branch, writes the selected warehouse to `purchase_bills.warehouse_id` and Stock `stock_ledger.warehouse_id`, and keeps `stock_ledger.output_category` from the line's stock status. No runtime fallback from warehouse name/code/type/hint is allowed.
- Current purchase bill modal UI follow-up: the `ข้อมูลบิล > สาขา` field in `/purchase/bills` now keeps the shared combobox behavior but renders with an input-group control and chevron trigger so the modal field matches the newer searchable selector pattern without changing topbar branch selection.
- Current branch field UI foundation follow-up: the modal-style branch selector has been extracted to reusable `@/components/ui/BranchSelectCombobox` for non-topbar forms. `/purchase/bills` purchase and sales bill modals now consume the shared branch field instead of inlining branch combobox markup.
- Current branch preference follow-up: `/purchase/bills` now reads the saved branch selection from local storage on page mount and uses it as the default branch when opening create purchase/sales bill modals, while still validating that the saved branch exists in the active branch master list before applying it.
- Current shadcn date-picker foundation: `apps/next` now has shadcn-compatible `popover`, `calendar`, `label`, `separator`, `field`, and reusable `date-picker` UI files under `src/components/ui/`. This installs the composition required by the official Radix date-picker docs without replacing the existing `Button.tsx`.
- Current purchase-bill filter UI follow-up: `/purchase/bills` and `/sales/bills` filter date inputs now use a shared shadcn-style `DatePickerInput` (`input-group` + `popover` + `calendar`) while keeping the API-facing filter values normalized as `YYYY-MM-DD`.
- Current date-picker action follow-up: shared shadcn-style `DatePicker` and `DatePickerInput` wrappers now include optional `Clear` and `Today` actions in the popover footer so filter/form date fields can match the desired basic date-picker behavior without custom per-page markup.
- Current date display follow-up: shared `DatePickerInput` now uses `dd/MM/yyyy` display (`24/05/2026`) while keeping API-facing values normalized as `YYYY-MM-DD`. Active transaction/purchase/sales filters and form date fields moved onto the shared date picker where they previously still used native `type="date"` inputs, and key list/detail tables in purchase bills, PO buy/sell, AP/payment approval, stock ledger/transfer, petty advance, daily expense, receipt vouchers, and trading matching now render dates through `formatDateDisplay` so read paths show the same `dd/MM/yyyy` pattern as the inputs.
- Current product master UI follow-up: `/master-data/products` now labels product `item_status` as `ประเภทรับเข้า Stock`, shows a table column with code + meaning (`RM · Raw Material`, `FG · Finish Good`, `WIP · Work in Process`, `SCRAP · เศษ/ของเสีย/สูญเสีย`), adds a filter for that stock status, and marks the modal select as required. This field feeds stock status / `output_category`; it is not used to auto-select the warehouse for purchase bills.
- Current product master cleanup follow-up: `/master-data/products` no longer exposes product-level Target Margin. The Next product schema/API/import/export/form/table and Prisma model were updated to remove `target_margin_pct`, and dev-target DB was updated through `supabase/migrations/20260523000200_drop_product_target_margin_pct.sql`. Profit & Cost Analysis now uses its existing 8% report threshold instead of reading a product-specific target margin.
- Current product master create follow-up: per user request on 2026-05-25, `/master-data/products` create modal no longer asks for `รหัสสินค้า`; the server generates the next `SKU001-SKU99999` code on create, while edit mode still shows the existing code as read-only. Product import still supports blank Excel codes by generating SKU values. Validation passed: `npm run type-check --workspace @ns-scrap-erp/next`, `npm run lint --workspace @ns-scrap-erp/next`, `npm run build --workspace @ns-scrap-erp/next`, and `git diff --check`. Browser smoke reached `/login?redirect=/master-data/products` but authenticated modal smoke was blocked because no test login prefill was available in the isolated browser.
- Current impurity master follow-up: per user request on 2026-05-25, `ข้อมูลหลัก` now includes `/master-data/impurities` labeled `รายการสิ่งเจือปน`. The page follows the product master dense list/modal pattern but exposes only `ชื่อสิ่งเจือปน`, `สถานะ`, and `แก้ไข`; API routes use the additive target table `public.impurities`, applied directly to dev-target from `supabase/migrations/20260525073353_create_impurities_master.sql` and verified with `select count(*)`. `/daily/weight-tickets` now loads active impurity rows into a line-level dropdown only when deduction mode is `หัก` or `หัก%`, requires a selected impurity before save, stores the impurity name in the localStorage prototype record, and shows it in the `รายการใบรับ-ส่งของ` detail modal. Validation for the WTI/WTO wiring is recorded in the current WTI/WTO checkpoint. Earlier impurity master validation passed: `npm run prisma:generate --workspace @ns-scrap-erp/next`, `npm run type-check --workspace @ns-scrap-erp/next`, `npm run lint --workspace @ns-scrap-erp/next`, `npm run build --workspace @ns-scrap-erp/next`, `npx --yes @redocly/cli lint docs/api/openapi.yaml --max-problems 200` (valid with existing 117 warnings), and `git diff --check`.

## File Naming Changes

| Old Name | New Name | Meaning |
|---|---|---|
| `SRS.md` | `REQUIREMENTS_TARGET_SYSTEM.md` | SRS/requirements ของระบบใหม่หรือระบบเป้าหมาย |
| `NS_Scrap_ERP_System_Requirements.md` | `REQUIREMENTS_LEGACY_PROTOTYPE.md` | เอกสาร requirement/description ของระบบเก่า/prototype |

## Latest Completed Implementation Checkpoints

- `cf7df95 docs: prefer sub agents for playwright qa`
  - Documented that Playwright QA should use sub agents by default
- `285eef6 chore: add playwright mcp config`
  - Added project-level Playwright MCP config
  - Documented Playwright MCP environment status
- `3805587 chore: upgrade next app to tailwind v4`
  - Upgraded active Next app to Tailwind CSS v4
  - Validated lint, type-check, build, and Tailwind package resolution
- `e900c6f docs: require resumable session handoffs`
  - Added resumable session handoff rules to `AGENTS.md`
  - Recorded TW4 as the next active batch after an interrupted install
- `14df0a5 docs: define sub agent operating rules`
  - Added sub agent use/close rules to `AGENTS.md`
  - Added operating model to this current work document
- `fa08cb1 docs: standardize requirements and doc index`
  - Renamed ambiguous requirements files
  - Added `00-doc-index.md` and this current work document
- `12fda4b feat: complete production report baseline`
  - Production pages/APIsครบแบบ read/report baseline
- `2d08f0d feat: add production category baseline`
  - Production output categories + production orders baseline
- `3ad5501 docs: add sitemap openapi preflight tasks`
  - Added Batch PRE for sitemap/OpenAPI before next major module

## Next Required Batch

`Batch F: Finance and Debt`

Tasks:

1. F0 legacy inventory and DB mapping - docs checkpoint first
2. F1 AR page/API - next implementation slice
3. F2 AP polish - existing AP route/page needs filter/sort/pagination/export/detail review
4. F3 Bank Statement - next read/reconciliation baseline after AR/AP
5. F4-F6 Cash Position, Supplier Advance, Customer Advance - read baseline first, no allocation/write rule guesses

## Tailwind v4 Migration Status

Status: completed and pushed in the TW4 checkpoint.

Changes:

- `apps/next` now uses `tailwindcss@4.3.0` and `@tailwindcss/postcss@4.3.0`.
- `apps/next/postcss.config.cjs` now uses the Tailwind v4 PostCSS plugin.
- `apps/next/src/app/globals.css` now uses `@import "tailwindcss";` and CSS-first `@theme` tokens.
- Removed `apps/next/tailwind.config.ts`; active app theme tokens now live in CSS.
- Root `package.json` still keeps Tailwind v3 for old Vue tooling; this is intentional until old Vue tooling is removed or upgraded.

Validation passed:

- `npm ls tailwindcss @tailwindcss/postcss --workspace @ns-scrap-erp/next`
- `npm run lint --workspace @ns-scrap-erp/next`
- `npm run type-check --workspace @ns-scrap-erp/next`
- `npm run build --workspace @ns-scrap-erp/next`

## Playwright MCP Status

Status: configured and pushed.

Changes:

- Added `playwright` server to project-level `.mcp.json`.
- Command: `npx --yes @playwright/mcp@latest --headless`
- Documented the setup in `docs/migration/10-environment-status.md`.

Validation passed:

- `node -e "JSON.parse(require('fs').readFileSync('.mcp.json','utf8')); console.log('mcp json ok')"`
- `npx --yes @playwright/mcp@latest --help`

Runtime note:

- Restart Codex before expecting `/mcp` or MCP resources/tools to show the new `playwright` server.

## Agent Rules Refactor Status

Status: completed and pushed in checkpoint `55c81c7`.

Changes:

- `AGENTS.md` is now a short entrypoint with hard rules, required reading, rule links, environment shortlist, and validation baseline.
- Detailed rules moved to `docs/agent-rules/`.
- `docs/migration/00-doc-index.md` now lists the agent rule documents.

Validation passed in its own checkpoint.

## System Map and API Contract Baseline Status

Status: completed and pushed in checkpoint `5ad3ab2`.

Changes:

- Added `docs/migration/18-next-system-sitemap.md`.
- Added `docs/api/openapi.yaml`.
- Updated `docs/migration/17-next-remaining-modules-progress.md` with PRE0/PRE1 execution logs.

Current findings:

- `/stock/balance` has an active read baseline and has been revised in the post-SYS legacy UI parity pass.
- `/stock/ledger` has a read baseline but still needs query/pagination/running-balance polish.
- Most main dashboard/reporting and finance-accounting routes remain placeholder coverage.

Validation:

- `git diff --check` passed.
- `npx --yes @redocly/cli lint docs/api/openapi.yaml` passed validity check with skeleton-level warnings for missing `operationId`, tag descriptions, and some 4XX responses.

## Current Priority Queue

1. Batch F: Finance and Debt
2. Batch T: Tracking 360
3. Batch D: Dual Costing / Trading / PO
4. Batch FF: Foreign Finance
5. Batch A: Finance / Accounting
6. Batch M: Main Dashboards and Operational Control
7. Batch SYS: System and Cleanup

Post-SYS UI parity priority after the first 10 route audit now includes a dedicated Daily Reports / รายงานประจำวัน group:

1. Finish Finance and Debt: `/finance/supplier-advance`, `/finance/customer-advance`
2. Stock parity is closed for active routes; `/stock/customer-return` is retired from the active app per user request.
3. Daily Reports / รายงานประจำวัน: `/owner-daily`, `/daily-report`, with `/dashboard` checked where shared daily-report cards overlap
4. Tracking 360
5. Dual Costing / Trading / PO

## Batch S Stock Status

Status: completed and pushed in checkpoint `42ce82b`.

Implemented in this checkpoint:

- Added stock balance, status convert, grade convert, stock count adjust, and customer return API/page baselines.
- Hardened stock OpenAPI contract for touched stock endpoints with operation IDs, real query parameters, request schemas, and stock response schemas.
- Adjusted stock write forms to support direct `?new=1` URLs for form smoke testing and resumable links.
- Ran authenticated browser/API smoke with the provided dev user; credentials were used only in the browser session and were not stored in docs or code.

Verification already run:

- Desktop browser smoke: all six stock pages returned HTTP 200 with no login/error state.
- Mobile browser smoke at 390x844: stock read pages and write forms rendered without visible errors.
- Authenticated API smoke: all six stock APIs returned HTTP 200.
- Write form smoke: `/stock/status-convert?new=1`, `/stock/convert?new=1`, `/stock/adjust?new=1`, and `/stock/customer-return?new=1` rendered title, fields, cancel, and save controls; no submit was performed.
- `npx --yes @redocly/cli lint docs/api/openapi.yaml --max-problems 200` passed validity with existing skeleton warnings outside the stock batch.

Final local validation:

- `git diff --check` passed.
- `npm run type-check --workspace @ns-scrap-erp/next` passed.
- `npm run lint --workspace @ns-scrap-erp/next` passed.
- `npm run build --workspace @ns-scrap-erp/next` passed.

Commit:

- `42ce82b feat: add stock module baselines` pushed to `main`.

Known carry-over from Batch S:

- Stock ledger row detail modal remains a follow-up.
- Field-level validation messages on stock write forms remain a follow-up; server-side Zod validation is active.
- Reconciliation query/report for grade convert and count adjust remains a follow-up.
- Void/reversal and final WAC/cost-source policy remain broader stock hardening work.

## Post-SYS Stock UI Parity Slice

Status: completed locally; commit/push pending.

Current checkpoint:

- `/stock/status-convert` is being revised back toward the legacy purple/pink compact surface: legacy title, usage tip, search placeholder, `+ ปรับสถานะใหม่` action, no summary cards, 10-column table, status-flow chips, reason/created-by columns, and legacy empty state.
- `/stock/customer-return` is being revised back toward the legacy purple/pink compact surface: legacy title, 3 KPI cards, search + branch filter + disabled CSV control, 11-column table, return status/action cells, guidance box, and legacy empty state.
- API changes are display/read-only additions only: status convert rows now expose `note` and `createdBy`; customer return rows now expose `branchId`/`warehouseId` for unambiguous UI filtering.
- No POST/write semantics, stock policy, WAC policy, customer-return send-back semantics, schema migrations, or permission rules were changed in this slice.

Validation:

- `npm run lint --workspace @ns-scrap-erp/next` passed.
- `npm run type-check --workspace @ns-scrap-erp/next` passed.
- `npm run build --workspace @ns-scrap-erp/next` passed.
- `git diff --check` passed.

Browser QA:

- Authenticated main Playwright checked `/stock/status-convert` and `/stock/customer-return` at `http://localhost:3100` on desktop 1365x900 and mobile 390x844; both APIs returned 200, no page-level horizontal overflow, no new console warnings/errors, and legacy markers/columns/cards/actions were present.
- Subagent unauth smoke confirmed both routes redirect to login, both APIs return 401, login desktop/mobile has no horizontal overflow, and no related console/page/network errors were reported.

Next:

- Commit and push the stock parity slice.
- Start Daily Reports / รายงานประจำวัน: `/owner-daily`, `/daily-report`, with `/dashboard` checked where shared daily-report cards overlap.

## Batch F Finance and Debt Status

Status: active batch started after checkpoint `a2fd1ba`.

Current scope:

- F0 maps the legacy/Vue finance-debt pages and target DB tables before implementation.
- F1 AR read/report baseline is implemented, validated, and pushed.
- F2 AP polish is implemented, validated, and pushed.
- F3 Bank Statement read/reconciliation baseline is implemented, validated, and pushed.
- F4 Cash Position aggregation baseline is implemented, validated, and pushed.
- F5 Supplier Advance read baseline is implemented, validated, and pushed.
- F6 Customer Advance read baseline is implemented, validated, and pushed.
- F7 Finance QA checkpoint is documented and pushed.
- Money-moving writes remain out of scope until reconciliation and allocation rules are clear.

## Batch T Tracking 360 Status

Status: active batch started after finance checkpoint `1c0b5c7`.

Current scope:

- T0 inventory and DB mapping is documented and pushed.
- T1 Customer Tracking read baseline is implemented, validated, and pushed.
- T2 Supplier Tracking polish is implemented, validated, and pushed.
- T3 Product Tracking read/report baseline is implemented, validated, and pushed.
- T4 Tracking QA Batch passed after correcting Product Tracking slow movers, and is pushed.
- D0 Dual Costing / Trading / PO legacy inventory and DB mapping is complete and pushed.
- D1 PO Sell read baseline is implemented, validated, and pushed.
- D2 PO Buy read-only polish is implemented, validated, and pushed. Write flows remain deferred.
- D2a PO Buy create/add-list is implemented and pushed; follow-up refinement makes issue timestamp server-owned and replaces channel/branch inputs with `สาขา/คลัง`.
- D3 Trading Dashboard read baseline is implemented, validated, and pushed. Dashboard remains read-only.
- D4 Trading Matching read-only polish is implemented, validated, and pushed. Write/reverse/recalc actions remain deferred.
- D5 Cost Pool read-derived baseline is implemented, validated, and pushed. UI keeps the legacy amber warning band, blue/orange/purple cost cards, summary cards, filters, export, table, and read-only detail modal; write allocation remains deferred.
- D6 Cost Allocator read-only simulation baseline is implemented, validated, and pushed. UI keeps the legacy purple step-card flow; confirm/write remains disabled until allocation logs and reversal rules are designed.
- D7a Match Log read baseline is implemented, validated, and pushed. It reads `trading_deals` as current source because normalized allocation logs are not designed yet; reverse/write remains deferred.
- D7b Deal Margin read baseline is implemented, validated, and pushed. It reads `trading_deals` matched sales/purchase amounts and preserves the legacy purple/pink gross margin card layout.
- D7c Compare Margin read baseline is implemented, validated, and pushed. It compares deal-side `trading_deals` with stock-side `sales_bills` revenue/COGS and preserves the legacy blue/purple/emerald diff-card layout.
- D8 Dual Costing QA checkpoint is implemented, validated, and pushed. It fixed PO Sell date filters, Trading Matching filter scope, Cost Pool business-facing display refs/status options, Cost Allocator modes, Deal Margin match status, Compare Margin stock scope, and PO Sell OpenAPI row names.
- FF0 Foreign Finance legacy inventory and DB mapping is completed and pushed. FF1 FX Rate manage baseline is implemented, validated, and pushed.
- Tracking routes must use active Next app only; legacy/Vue tracking views are source material.
- Keep T1-T3 read/report baselines first; no write flows in tracking pages.
- DB design preference clarified: use meaningful business-facing codes/running document numbers for user-visible references; keep UUID/opaque IDs internal only.
- Permission carry-over: trading/dual-costing currently uses `finance.cash.view`; split into dedicated trading/cost/profit permissions in a later auth batch instead of changing guards ad hoc.

Initial F0 findings:

- Legacy/Vue finance-debt pages: AR, AP, Bank Statement, Cash Position, Supplier Advance, Customer Advance.
- Related money write flows already exist in daily/purchase/sales surfaces: supplier payments, customer receipts, petty advances/returns, transfers, payment approval, and transaction ledger.
- Target DB mapping: `sales_bills`, `receipts`, `purchase_bills`, `payments`, `bank_statement`, `accounts`, plus party and branch lookup tables.
- Bank statement rows are shared side effects from payment/receipt/expense/transfer/petty flows, so bank reconciliation should be read-first before any write changes.

Initial FF0 findings:

- Active Next foreign finance routes started as placeholders: International Transfer, Overseas Receipt, FX Rate, FCD Ledger, FX Gain/Loss, and Bank Reconciliation. FF1 promotes FX Rate to a manage baseline.
- Existing support tables are `accounts`, `bank_statement`, `currencies`, `fx_gain_loss`, `overseas_recipients`, and `overseas_remittance_purposes`.
- FF1 adds historical `fx_rates`. There is still no dedicated `fcd_ledger` table, no confirmed `intl_transfers`/`overseas_receipts` tables, and no `bank_imports` table in the active Prisma schema.
- FF4 FCD Ledger read baseline is implemented, validated, and pushed. It derives from FCD/foreign-currency accounts and bank statement rows without mutating bank rows.
- FCD Ledger does not infer foreign movement from THB bank rows or current currency rates. Foreign movement stays zero unless future ITF/ORC source tables provide true foreign amounts; opening foreign balance comes from `accounts.opening_balance`.
- FF5 FX Gain/Loss read baseline is implemented, validated, and pushed. It reads realized rows from `fx_gain_loss` only and does not auto-post.
- FF6 Bank Reconciliation read/design baseline is implemented, validated, and pushed. It shows ERP bank rows and disables import/match writes until normalized import/match state exists.
- FF2/FF3 International Transfer and Overseas Receipt read/form baselines are implemented, validated, and pushed. They intentionally do not write `bank_statement`, post FX gain/loss, complete, approve, or reverse until dedicated transaction schemas and idempotency/reversal rules exist.
- FF7 Foreign Finance QA checkpoint is implemented, validated, and pushed. All six foreign finance APIs returned 200 in browser smoke; type-check, lint, build, OpenAPI validity, and diff check passed. OpenAPI still has the existing 113 skeleton warnings outside this batch.
- User-facing refs should be `ITF*`, `ORC*`, `ref_no`, account code/account no, and currency symbol/code; do not expose UUID/ref_id as the primary display.
- A0 Finance / Accounting overview is implemented locally as a docs checkpoint. All 18 routes are still placeholders; active schema supports management baselines for cash, AR/AP, stock value, assets, loans, equity, and opening balance, but GL/statutory posting remains deferred. Recommended next slice is A6 Fixed Assets read baseline before dashboards/statements.

Next concrete task:

1. Validate, commit, and push A0 Finance / Accounting overview.
2. Preserve legacy/Vue visual baseline first: colors, cards, panels, table density, button placement, and labels.
3. Use sub agents by default for Playwright/browser QA, and split read-only scouting/contract review into parallel sub agents when work can be separated cleanly.

## Operating Model

Before each module batch:

1. Read the module overview and legacy source touchpoints.
2. Break the module into page-level tasks.
3. For each page, document the expected fields, buttons, modals, APIs, DB tables, validation, pagination/sort/export, and Playwright checks.
4. Implement in reviewable slices.
5. Update the relevant tracker before moving to the next slice.
6. Commit/push after each meaningful checkpoint.

Use sub agents only for bounded parallel work:

- legacy flow search
- route/API inventory
- independent page audit
- Playwright smoke verification
- isolated docs or page/API implementation with clear file ownership

For Playwright work, use a sub agent by default so browser QA can run in parallel while the main agent continues implementation or integration. The main agent must define the exact Playwright scope and then integrate findings before committing.

Close sub agents when their task is integrated, no longer needed, blocked, overlapping, or after a batch checkpoint leaves them with no remaining work. Do not leave reminder agents open unless the user explicitly requested one for the active task list.

## Handoff Checklist

At every checkpoint, update docs as if a new session will start from only the repository:

1. Current batch/task/page
2. Exact partial work and files touched
3. Commands already run and result
4. Validation still required
5. Next concrete task
6. Whether to continue immediately or pause for discussion

## Known Carry-over Work

- Mission clarification checkpoint on 2026-06-05:
  - The active cleanup goal is not only “make UI/API use code first”.
  - The real target shape for the active identifier migration is:
    - internal `id` = technical PK/FK only
    - new/rehabilitated target tables should prefer `id bigint generated by identity` unless an explicit exception is documented
    - outward `code` or `doc_no` = business identifier used by UI, API, import/export, filters, reports, and user communication
    - server routes resolve outward `code` / `doc_no` back to internal `id` before DB write/query joins that need PK/FK identity
  - Current status of the active master slices:
    - `A` simple masters (`bank_names`, `payment_methods`, `product_units`, `product_types`) are already at the target shape in principle: internal `id bigint`, business-facing outward code/name contract, and no client dependence on bigint ids.
    - `B1` (`branches`, `warehouses`) is boundary-complete only: outward branch/warehouse code is in place, but schema/relations are still on legacy text ids and still need the real PK/FK bigint migration slice.
    - `B2` (`salespersons`, `customers`) is boundary-complete only: outward customer/salesperson code is in place across active master/sales/reporting surfaces, but the tables still need the real PK/FK bigint migration slice.
    - `B3` (`suppliers`) is boundary-complete only: outward supplier code is in place across active master/purchase/payment surfaces, but the table and downstream relations still need the real PK/FK bigint migration slice.
  - Practical mission for the next implementation pass:
    - preserve the boundary work already completed in `B1/B2/B3`
    - audit each slice for remaining outward leaks of internal ids
    - then migrate each table family from legacy text/string PK usage to internal bigint PK/FK storage without changing the business-facing `code` / `doc_no` contract
  - Outward contract hardening rule added on 2026-06-05:
    - for business-facing masters and references in the active Next app, do not use runtime fallbacks like `code ?? id` on outward UI/API/filter surfaces
    - outward contract must use business `code` directly
    - if a row has no business `code`, treat it as a data/contract error and fail visibly so the bad source row can be corrected
  - Decision rule:
    - Do not call `B1/B2/B3` fully complete in the final architectural sense until both conditions are true:
      - outward UI/API/import/export surfaces are code-first
      - underlying PK/FK storage has been migrated to the intended internal-id shape

- Batch B bigint migration decomposition checkpoint on 2026-06-05:
  - Scope definition:
    - Batch A is complete. Batch B starts with code-bearing or code-ready masters that are still deeply referenced by string `id` in UI/API/transaction flows: `branches`, `warehouses`, `customers`, `suppliers`, `products`, `salespersons`, `accounts`.
    - These must be split into reviewable batches by dependency, not migrated together.
  - B1 `branches + warehouses + branch/warehouse selectors`:
    - Why first:
      - `branches` and `warehouses` are reused across stock, purchase, sales, weight-ticket, and finance entry flows.
      - Shared master-data configs still use `optionValueKey: 'id'` for branch selectors in multiple pages.
    - Confirmed code hotspots:
      - `apps/next/src/lib/master-data-page-configs.ts`
      - `apps/next/src/components/stock/StockOperationPageClient.tsx`
      - `apps/next/src/app/api/purchase/bills/route.ts`
      - `apps/next/src/app/api/purchase/po-buy/route.ts`
      - `apps/next/src/app/api/purchase/advance-payments/route.ts`
      - `apps/next/src/app/api/purchase/advance-payments/[id]/route.ts`
    - Task goals:
      - keep DB relations on internal `id`
      - move user-facing selectors and API payload boundaries to branch/warehouse `code`
      - then convert `branches.id` and `warehouses.id` to `bigint`
    - Done definition:
      - branch/warehouse option lists return `id = code` at the UI/API surface
      - master-data create/edit/toggle still works
      - purchase/stock flows no longer require text PK values from `branches.id` / `warehouses.id`
  - B2 `salespersons + customers + customer-facing sales filters`:
    - Why separate:
      - `customers.sales_id` and many customer list/export/import flows already assume business-facing customer/sales codes.
      - Sales dashboards and filters still pass `customerId` / `salespersonId` strings around.
    - Confirmed code hotspots:
      - `apps/next/src/lib/domain/customer.ts`
      - `apps/next/src/lib/customer.ts`
      - `apps/next/src/app/api/master-data/customers/route.ts`
      - `apps/next/src/app/api/master-data/customers/export/route.ts`
      - `apps/next/src/components/main/MainSalesControlClients.tsx`
      - `apps/next/src/components/main/ProfitCostAnalysisPageClient.tsx`
    - Task goals:
      - normalize all customer/salesperson selectors and filters to `code`
      - preserve import/export business-key behavior
      - then convert `customers.id` and `salespersons.id` to `bigint`
  - B3 `suppliers + purchase/payment/advance-payment flows`:
    - Why separate:
      - `suppliers` feeds purchase bills, PO Buy, supplier advance, payments, supplier import/export, and bank-account child rows.
      - Supplier-facing flows still look up by `supplierId` string in many API paths.
    - Confirmed code hotspots:
      - `apps/next/src/lib/domain/supplier.ts`
      - `apps/next/src/lib/supplier.ts`
      - `apps/next/src/app/api/master-data/suppliers/route.ts`
      - `apps/next/src/app/api/master-data/suppliers/export/route.ts`
      - `apps/next/src/app/api/purchase/bills/route.ts`
      - `apps/next/src/app/api/purchase/po-buy/route.ts`
      - `apps/next/src/app/api/purchase/payments/route.ts`
      - `apps/next/src/app/api/purchase/advance-payments/route.ts`
    - Task goals:
      - expose supplier `code` everywhere user-facing
      - keep supplier receiving-account child logic stable
      - then convert `suppliers.id` to `bigint`
  - B4 `products + transaction product selectors`:
    - Why separate:
      - `products` is central to purchase, sales, stock, weight-ticket, costing, and dashboards.
      - Product write forms still validate and persist `productId` directly in many flows.
    - Confirmed code hotspots:
      - `apps/next/src/lib/product.ts`
      - `apps/next/src/lib/purchase-bill.ts`
      - `apps/next/src/lib/sales.ts`
      - `apps/next/src/lib/daily.ts`
      - `apps/next/src/app/api/purchase/bills/route.ts`
      - `apps/next/src/app/api/purchase/po-buy/route.ts`
      - `apps/next/src/components/stock/StockOperationPageClient.tsx`
      - costing/dashboard clients under `apps/next/src/components/main/` and `apps/next/src/components/dual-costing/`
    - Task goals:
      - shift all user-facing product selectors, filters, and write boundaries to `products.code`
      - then convert `products.id` to `bigint`
  - B5 `accounts + finance cash/payment selectors`:
    - Why last in Batch B:
      - `accounts` is referenced by daily cash, transfer, receipt, payment, petty advance, and ledger/report flows.
      - Several finance APIs still persist `accountId` directly as the operational selector value.
    - Confirmed code hotspots:
      - `apps/next/src/lib/daily.ts`
      - `apps/next/src/app/api/master-data/accounts/route.ts`
      - `apps/next/src/app/api/master-data/accounts/[id]/route.ts`
      - `apps/next/src/app/api/purchase/payments/route.ts`
      - `apps/next/src/app/api/purchase/payment-history/route.ts`
      - `apps/next/src/components/daily/MoneyMovementPageClient.tsx`
    - Task goals:
      - establish account `code` as the UI/API-facing key
      - then convert `accounts.id` to `bigint`
  - Recommended execution order:
    - B1 `branches + warehouses`
    - B3 `suppliers`
    - B2 `salespersons + customers`
    - B4 `products`
    - B5 `accounts`
  - Common done definition for every Batch B slice:
    - UI shows `code - name` or code-first wording consistently
    - option loaders / payloads stop depending on text PK values at the user-facing boundary
    - internal DB relations still use internal `id`
    - local migration changes are applied and verified on dev-target/local DB
    - `npm run type-check --workspace @ns-scrap-erp/next`
    - `npm run lint --workspace @ns-scrap-erp/next`
    - `npm run build --workspace @ns-scrap-erp/next`
    - `git diff --check`

- Batch C transaction migration decomposition checkpoint on 2026-06-05:
  - Scope definition:
    - Batch C covers transaction tables that already have business-facing `doc_no` and should not start by changing PK types directly.
    - The sequence for Batch C is:
      - make every user-facing selector/filter/export/report anchor on `doc_no` and upstream master `code`
      - remove UI/API dependence on text transaction PKs where possible
      - after the upstream Batch B master slice is ready, migrate transaction foreign keys and then transaction internal `id`
    - Main Batch C tables:
      - `expenses`
      - `payments`
      - `petty_advances`
      - `po_buys`
      - `po_sells`
      - `purchase_bills`
      - `sales_bills`
      - `receipts`
      - `receipt_vouchers`
      - `supplier_advance_payments`
      - `transfers`
      - `weight_tickets`
      - `stock_adjustments`
      - `grade_adjustments`
      - `production_orders`
  - C1 `purchase documents: po_buys + purchase_bills + purchase_bill_items + purchase allocations`:
    - Why first:
      - Purchase is currently the heaviest consumer of `branchId`, `supplierId`, `productId`, `warehouseId`, `receiptTicketId`, and `receiptLineId`.
      - Purchase APIs still validate and query by text ids directly.
    - Confirmed code hotspots:
      - `apps/next/src/lib/purchase-bill.ts`
      - `apps/next/src/app/api/purchase/bills/route.ts`
      - `apps/next/src/app/api/purchase/po-buy/route.ts`
      - `apps/next/src/app/api/po-reports/outstanding/route.ts`
      - `apps/next/src/components/purchase-flow/*`
    - Task goals:
      - move purchase UI selectors to supplier/branch/warehouse/product `code`
      - keep `doc_no` as the business-facing key for PO Buy and purchase bill surfaces
      - after `B1`, `B3`, and `B4` are complete, convert `po_buys` / `purchase_bills` foreign keys to upstream bigint ids
      - then plan `po_buys.id`, `purchase_bills.id`, `purchase_bill_items.id`, `purchase_bill_po_allocations.id`, and `purchase_bill_receipt_allocations.id` bigint migration
    - Done definition:
      - purchase create/edit/list/export flows use `doc_no` and upstream master `code` only at the user-facing boundary
      - receipt allocation logic no longer depends on legacy text PK assumptions in request payloads
  - C2 `supplier cash documents: supplier_advance_payments + payments + supplier_advance_allocations`:
    - Why second:
      - These flows sit directly on top of supplier, branch, account, and payment-method dependencies from Batch B.
      - Payment APIs still persist `supplierId`, `branchId`, and `accountId` straight from the client.
    - Confirmed code hotspots:
      - `apps/next/src/lib/purchase-advance.ts`
      - `apps/next/src/app/api/purchase/advance-payments/route.ts`
      - `apps/next/src/app/api/purchase/advance-payments/[id]/route.ts`
      - `apps/next/src/app/api/purchase/payments/route.ts`
      - `apps/next/src/app/api/purchase/payment-history/route.ts`
    - Task goals:
      - keep `ADV...` / `PMT...` `doc_no` as the only business-facing transaction key
      - shift supplier/branch/account lookups to `code`
      - then convert FK columns like `supplier_id`, `branch_id`, `account_id`, and `funding_account_id` after `B1`, `B3`, and `B5`
      - then convert `supplier_advance_payments.id`, `payments.id`, and `supplier_advance_allocations.id`
    - Done definition:
      - purchase payment/advance pages no longer require text master PKs in UI payloads
      - payment history and exports resolve by `doc_no` plus master `code/name`
  - C3 `sales documents: po_sells + sales_bills + receipts`:
    - Why third:
      - These depend on `customers`, `branches`, `products`, and `accounts`, so they must follow `B1`, `B2`, `B4`, and `B5`.
      - Sales create paths still validate and persist `customerId`, `branchId`, `productId`, and `accountId` directly.
    - Confirmed code hotspots:
      - `apps/next/src/lib/sales.ts`
      - `apps/next/src/app/api/sales/po-sell/route.ts`
      - `apps/next/src/app/api/sales/bills/route.ts`
      - `apps/next/src/app/api/sales/receipts/route.ts`
      - `apps/next/src/components/sales/*`
    - Task goals:
      - use `doc_no` as the business key for PO Sell, sales bill, and receipt documents
      - move customer/branch/product/account selectors to `code`
      - then convert transaction FKs and later `po_sells.id`, `sales_bills.id`, and `receipts.id`
    - Done definition:
      - sales create/edit/list/export/report surfaces are doc-no and code-first
      - no client form needs raw text PK values from customer/product/branch/account tables
  - C4 `daily cash documents: expenses + petty_advances + transfers`:
    - Why fourth:
      - These are smaller transaction families but still depend on Batch B `accounts`, `branches`, and in some cases `suppliers` / `expense_categories`.
      - `expenses` already migrated `category_id` to bigint, so this slice must preserve that clean direction.
    - Confirmed code hotspots:
      - `apps/next/src/lib/daily.ts`
      - `apps/next/src/app/api/daily/expenses/route.ts`
      - `apps/next/src/app/api/daily/petty-advances/route.ts`
      - `apps/next/src/app/api/daily/transfers/route.ts`
      - `apps/next/src/components/daily/*`
    - Task goals:
      - keep expense/advance/transfer `doc_no` user-facing
      - move account and branch boundaries to `code`
      - then convert remaining transaction FKs and later `expenses.id`, `petty_advances.id`, and `transfers.id`
    - Done definition:
      - daily cash pages and APIs stop requiring text account/branch PKs from the browser
      - existing `expense_categories.id bigint` relation stays canonical
  - C5 `weight and stock adjustment documents: weight_tickets + stock_adjustments + grade_adjustments`:
    - Why separate:
      - These are transaction documents but also upstream feeders into purchase/sales/stock.
      - They depend on `branches`, `warehouses`, `products`, `suppliers`, and `customers`.
    - Confirmed code hotspots:
      - `apps/next/src/app/api/daily/weight-tickets/route.ts`
      - `apps/next/src/app/api/daily/weight-tickets/[id]/route.ts`
      - `apps/next/src/app/api/stock/adjust/route.ts`
      - `apps/next/src/app/api/stock/status-convert/route.ts`
      - `apps/next/src/components/daily/WeightTicket*`
      - `apps/next/src/components/stock/StockOperationPageClient.tsx`
    - Task goals:
      - keep `WTI/WTO` and stock adjustment `doc_no` as user-facing keys
      - move branch/warehouse/product/party selectors to `code`
      - then convert transaction FKs and later `weight_tickets.id`, `weight_ticket_lines.id`, `weight_ticket_product_summaries.id`, `weight_ticket_product_summary_lines.id`, `stock_adjustments.id`, and `grade_adjustments.id`
    - Done definition:
      - weight-ticket and stock-adjustment flows are code-first at the boundary
      - downstream purchase/sales integrations no longer rely on text transaction PK values in UI payloads
  - C6 `production transaction documents: production_orders + production_inputs + production_outputs`:
    - Why last in Batch C:
      - These depend on `products`, `branches`, and `warehouses`, and they also feed stock/costing logic that belongs to Batch D.
    - Confirmed code hotspots:
      - `apps/next/src/app/api/production/orders/route.ts`
      - `apps/next/src/app/api/production/report/route.ts`
      - production pages/components under `apps/next/src/components/production/`
    - Task goals:
      - keep production `doc_no` user-facing
      - move product/branch/warehouse selectors to `code`
      - then convert transaction FKs and later `production_orders.id`, `production_inputs.id`, and `production_outputs.id`
    - Done definition:
      - production list/create/report flows are doc-no and code-first
      - no production write path requires text master PKs from the browser
  - Recommended execution order for Batch C:
    - C1 `purchase documents`
    - C2 `supplier cash documents`
    - C3 `sales documents`
    - C4 `daily cash documents`
    - C5 `weight and stock adjustment documents`
    - C6 `production transaction documents`
  - Common done definition for every Batch C slice:
    - document pages use `doc_no` as the user-facing transaction identifier
    - master selectors and payload boundaries use upstream business `code`
    - internal DB relations still use internal ids
    - migration of transaction FKs only starts after the relevant Batch B master slice is complete
    - `npm run type-check --workspace @ns-scrap-erp/next`
    - `npm run lint --workspace @ns-scrap-erp/next`
    - `npm run build --workspace @ns-scrap-erp/next`
    - `git diff --check`

- Batch D stock/costing/operational-core migration decomposition checkpoint on 2026-06-05:
  - Scope definition:
    - Batch D covers relation-heavy operational tables that are not primarily user-entered document headers, but derive from or reconcile across purchase, sales, stock, weight, and production flows.
    - These tables must wait for the relevant Batch B master slices and Batch C document slices before their FK/internal-id migrations begin.
    - Main Batch D tables:
      - `stock_ledger`
      - `trading_deals`
      - `weight_ticket_product_summaries`
      - `weight_ticket_product_summary_lines`
      - `production_inputs`
      - `production_outputs`
      - supporting operational rows such as cost-pool / matching / allocator derived surfaces that currently read from those tables
  - D1 `stock ledger core: stock_ledger + stock-linked refs`:
    - Why first:
      - `stock_ledger` is the shared operational core behind stock balance, stock finance, transaction drill-down, and downstream costing.
      - It references `products`, `warehouses`, `branches`, and many document `ref_id` / `ref_no` sources.
    - Confirmed code hotspots:
      - `apps/next/src/app/api/stock/ledger/route.ts`
      - `apps/next/src/app/api/stock/balance/route.ts`
      - `apps/next/src/app/api/finance-accounting/stock-finance/route.ts`
      - `apps/next/src/components/stock/*`
      - server aggregation helpers under `apps/next/src/lib/server/`
    - Task goals:
      - keep `ref_no` / `doc_no` as the user-facing cross-document reference
      - stop UI/report surfaces from depending on text PK values in `ref_id`, `product_id`, `warehouse_id`, and `branch_id`
      - after `B1`, `B4`, and `C1/C4/C5/C6` are complete, migrate stock-ledger FKs to upstream bigint ids
      - then plan `stock_ledger.id` bigint migration
    - Done definition:
      - stock ledger list/filter/detail/report surfaces are doc/code-first
      - ledger rows can still trace back to business documents without exposing text PK assumptions
  - D2 `weight summaries: weight_ticket_product_summaries + summary_lines`:
    - Why separate:
      - These are derived operational tables sitting between weight tickets and purchase-bill receipt allocation.
      - They depend on `weight_tickets`, `weight_ticket_lines`, and `products`, so they must follow `C5` and `B4`.
    - Confirmed code hotspots:
      - `apps/next/src/app/api/daily/weight-tickets/route.ts`
      - `apps/next/src/app/api/purchase/bills/route.ts`
      - summary reconciliation logic under `apps/next/src/lib/server/`
    - Task goals:
      - keep purchase allocation and weight detail screens anchored on WTI/WTO `doc_no`
      - remove any user-facing need for summary-table text PKs
      - then migrate `weight_ticket_product_summaries.*` and `weight_ticket_product_summary_lines.*` relations to bigint
    - Done definition:
      - weight-summary allocation flows are doc-no and product-code first
      - no client/request payload relies on summary-table text ids
  - D3 `trading/cost matching core: trading_deals + dual-costing read/write surfaces`:
    - Why third:
      - `trading_deals` references purchase bills, sales bills, products, suppliers, and customers at once.
      - Dual-costing dashboards and matching pages currently pass `productId` and bill ids heavily.
    - Confirmed code hotspots:
      - `apps/next/src/app/api/dual-costing/*`
      - `apps/next/src/lib/server/dual-costing-management.ts`
      - `apps/next/src/components/dual-costing/*`
      - `apps/next/src/components/trading/*`
    - Task goals:
      - make dual-costing/trading surfaces use purchase/sales `doc_no` plus product/customer/supplier `code`
      - remove dependence on text `purchase_bill_id`, `sales_bill_id`, `product_id`, `supplier_id`, and `customer_id` at the boundary
      - after `B2/B3/B4` and `C1/C3` are complete, migrate `trading_deals` FKs and then `trading_deals.id`
    - Done definition:
      - matching/log/report screens are doc-no and code-first
      - internal trade/cost relations use bigint-ready references only
  - D4 `production operational rows: production_inputs + production_outputs`:
    - Why separate from production orders:
      - `production_orders` belongs in Batch C as the user-facing document.
      - `production_inputs` and `production_outputs` are operational support rows tied into stock/costing calculations.
    - Confirmed code hotspots:
      - `apps/next/src/app/api/production/orders/route.ts`
      - production report routes under `apps/next/src/app/api/production/`
      - production dashboard/report components under `apps/next/src/components/production/`
    - Task goals:
      - keep production screens anchored on order `doc_no` and product `code`
      - remove any UI/request dependence on `production_inputs.id` / `production_outputs.id`
      - after `B1`, `B4`, `C6`, and `D1` are complete, migrate production operational FKs and then `production_inputs.id` / `production_outputs.id`
    - Done definition:
      - production reports/dashboards operate on order doc-no and product code
      - operational child-row ids stay internal-only
  - D5 `reporting and drill-down adapters over D tables`:
    - Why last:
      - Many read surfaces in finance-accounting, stock, trading, and dashboards consume D tables indirectly.
      - They should only be cleaned up after the underlying relations are bigint-safe.
    - Confirmed code hotspots:
      - `apps/next/src/app/api/finance-accounting/*`
      - `apps/next/src/app/api/reports/aggregate/route.ts`
      - `apps/next/src/components/main/*`
      - `apps/next/src/components/dual-costing/*`
    - Task goals:
      - ensure filter params and drill-down routes use business document numbers or master codes
      - remove any lingering UI/report dependence on text PKs from D tables
    - Done definition:
      - read-only drill-down/report surfaces are fully doc/code-first and bigint-safe underneath
  - Recommended execution order for Batch D:
    - D1 `stock ledger core`
    - D2 `weight summaries`
    - D3 `trading/cost matching core`
    - D4 `production operational rows`
    - D5 `reporting and drill-down adapters`
  - Common done definition for every Batch D slice:
    - upstream Batch B and Batch C dependencies are explicitly satisfied before FK migration starts
    - user-facing drill-down uses `doc_no`, `ref_no`, or master `code`, not internal text PK values
    - internal DB relations are migrated to bigint-safe references without changing business semantics
    - `npm run type-check --workspace @ns-scrap-erp/next`
    - `npm run lint --workspace @ns-scrap-erp/next`
    - `npm run build --workspace @ns-scrap-erp/next`
    - `git diff --check`

- Batch E support/auth/audit/exceptions decomposition checkpoint on 2026-06-05:
  - Scope definition:
    - Batch E covers support tables, audit trails, auth/session tables, reconciliation helpers, and legacy/system adapters that are not part of the main business master/document migration path.
    - Batch E is split between:
      - E-tables that may still need bigint migration or cleanup in the target business schema
      - E-exceptions that should remain UUID/composite/system-native and must not be forced into bigint
  - E1 `audit and activity trails`:
    - Tables:
      - `audit_logs`
      - `app_activity_logs`
      - `app_audit_logs`
    - Why separate:
      - These are append-only/system trails and already use UUID-style ids where appropriate.
      - User-facing admin audit pages do not need business-code migration, but event payloads should stay doc/code-first.
    - Confirmed code hotspots:
      - `apps/next/src/app/admin/audit/AuditLogPageClient.tsx`
      - `apps/next/src/app/api/admin/auth-events/route.ts`
      - `apps/next/src/lib/server/app-logging.ts`
      - `apps/next/src/lib/server/auth-audit.ts`
    - Task goals:
      - keep audit/administration read surfaces using business document numbers and business codes in labels/metadata
      - do not redesign these IDs to bigint
    - Status rule:
      - treat as exception: UUID/native ids are acceptable and preferred
  - E2 `deletion/tombstone/cleanup support`:
    - Tables:
      - `deletion_log`
      - `deletion_tombstones`
    - Why separate:
      - These are operational cleanup helpers, not user-facing business entities.
      - They may still need consistency cleanup because they currently use text ids and refer to deleted business rows.
    - Task goals:
      - standardize how deleted business records are referenced: keep table name + business `doc_no`/`code` snapshot where useful
      - decide whether these tables should remain text-keyed history stores or get additive bigint surrogate ids later
    - Status rule:
      - not a priority before B/C/D; cleanup later after main migration path is stable
  - E3 `allocation and reconciliation support tables`:
    - Tables:
      - `payment_approvals`
      - `purchase_bill_po_allocations`
      - `purchase_bill_receipt_allocations`
      - `supplier_advance_allocations`
      - `historical_monthly`
      - `bank_statement`
    - Why separate:
      - These are support/reconciliation tables that sit across multiple document families.
      - They should follow the relevant Batch C/D parents, not lead them.
    - Confirmed code hotspots:
      - `apps/next/src/app/api/daily/payment-approval/route.ts`
      - `apps/next/src/app/api/purchase/payments/*.ts`
      - `apps/next/src/app/api/purchase/bills/route.ts`
      - `apps/next/src/lib/server/advance-payments.ts`
      - `apps/next/src/lib/server/weight-tickets.ts`
      - `apps/next/src/lib/server/finance-accounting-statements.ts`
      - `apps/next/src/app/api/finance-accounting/historical-data/route.ts`
    - Task goals:
      - keep support surfaces anchored on parent `doc_no` and business codes
      - migrate foreign keys only after parent document/master migrations complete
      - then decide per-table whether internal ids should become bigint
    - Status rule:
      - follow parent slice order; do not start here first
  - E4 `loan / asset / secondary finance support`:
    - Tables:
      - `loan_payments`
      - `loan_schedules`
      - `depreciations`
      - similar finance-support rows that are not in the core migration path yet
    - Why separate:
      - They depend on `accounts` and other finance masters, but are less central than purchase/sales/stock.
    - Task goals:
      - defer until `B5 accounts` and relevant finance document slices are stable
      - decide whether these should follow the same `doc_no + bigint internal id` pattern case by case
  - E5 `auth / permission / profile / system-native exceptions`:
    - Tables:
      - `sessions`
      - `refresh_tokens`
      - `flow_state`
      - `identities`
      - `user_profiles`
      - `app_users`
      - `app_roles`
      - `app_permissions`
      - `app_role_permissions`
      - `app_user_roles`
      - `app_user_branch_access`
      - other `auth.*` / `app_*` UUID/composite-key system tables
    - Why separate:
      - These are identity/security/system-control tables and many already use UUID or composite keys intentionally.
      - Forcing them to bigint would be architectural damage, not cleanup.
    - Task goals:
      - leave primary key strategy as-is unless a security or product reason requires otherwise
      - only clean references/metadata if business-facing labels still leak legacy ids
    - Status rule:
      - explicit exception from the “all ids become bigint” goal; these remain UUID/composite/system-native
  - Missing/leftover audit after Batch A-D-E planning:
    - Confirmed still outside the main bigint migration path and should be handled explicitly as exceptions or later specialized finance/admin batches:
      - `public_users` legacy auth/user artifact
      - `bank_statement`
      - `historical_monthly`
      - `loan_*` support tables
      - `deletion_*` cleanup tables
      - all `auth.*` tables and `app_*` UUID/composite auth-permission tables
    - No additional business-facing master/document family was found outside B/C/D that needs a new top-level batch category right now.
  - Recommended execution order for Batch E:
    - E3 `allocation and reconciliation support tables` only when their parent C/D slices are ready
    - E2 `deletion/tombstone cleanup support`
    - E4 `loan / asset / secondary finance support`
    - E1 `audit/activity` and E5 `auth/system-native exceptions` are mostly policy/cleanup checkpoints, not bigint-conversion work
  - Common done definition for every Batch E slice:
    - exceptions vs migrate-later tables are documented explicitly before code/database changes
    - support tables never lead parent business-document migrations
    - auth/security/system-native UUID/composite keys are preserved unless a separate approved architecture change says otherwise
    - `npm run type-check --workspace @ns-scrap-erp/next`
    - `npm run lint --workspace @ns-scrap-erp/next`
    - `npm run build --workspace @ns-scrap-erp/next`
    - `git diff --check`

- 2026-05-24 auth flow hardening checkpoint:
  - Login now sanitizes `redirect` before navigation.
  - Forgot password accepts email or username through `/api/auth/forgot-password`, resolves username server-side, uses a same-origin `/reset-password` redirect, and records a non-secret reset request audit event.
  - Reset/change password now call `/api/auth/password-changed` after Supabase password update to clear `app_users.must_change_password` and write an auth audit event.
  - `must_change_password` is enforced by proxy when the app-user flag is readable and by `AppShell` for normal UI navigation; `/admin/change-password` redirects back to the intended safe path after success.
  - Admin invite/reset `redirectTo` is now restricted to same-origin `/reset-password`.
  - Validation run: `git diff --check`, `npm run type-check --workspace @ns-scrap-erp/next`, `npm run lint --workspace @ns-scrap-erp/next`, `npm run build --workspace @ns-scrap-erp/next`; all passed.
  - Browser smoke run on `localhost:3100`: `/login`, `/forgot-password`, `/reset-password`, `/admin/change-password`; forgot username-not-found submit returns the generic success message.
- `reports/` is untracked/local and must not be committed unless explicitly approved.
- Production write flow is not complete:
  - create/edit production order
  - production input/output write
  - process cost write
  - reverse/cancel/close/lock cost
  - stock ledger/cost allocation reconciliation
- Purchase follow-ups:
  - `/purchase/bills` purchase-bill form now needs to stay split by target flow: `STOCK` must choose `WTI` and pull receipt lines into the bill, while `TRADING` still allows direct manual quantity/weight entry. Current implementation now carries `receiptTicketId/receiptLineId` in form/API payloads and refreshes `WTI` billed status from purchase-bill usage, but Stock line split/allocation UX still needs refinement for one receipt line being cut across multiple PO/Spot rows.
  - Shared form validation UX follow-up: the active Next app now has a reusable `error path -> scroll/focus` utility and `/purchase/bills` already uses it for key purchase/sales bill fields, but the same pattern still needs to be wired through the remaining major forms (PO Buy, PO Sell, daily cash/expense forms, WTI/WTO create/edit, and master-data forms) so every validation failure scrolls to the first invalid field, focuses it, and highlights it red consistently.
  - target purchase flow spec is now documented at `docs/notes/Purchase Flow.md`: Stock + PO, Stock + Spot Buy / No PO, Trading + PO, and Trading + Spot. `ใบรับของ / WTI` is the inbound stock receiving document; no plain `WT` document remains in target. Trading does not enter stock and requires quantity/weight entry in the purchase bill.
  - design allocation tables/rules for Stock purchase bill receipt-to-PO/Spot cuts, because one `ใบรับของ` can cut multiple PO and one PO can have multiple `ใบรับของ`.
  - design PO Buy `ปิดรับไม่ครบ` action and status log; it must release/remove remaining PO qty from Cost Pool candidate only for copper/brass products and must not rewrite existing receipt/bill/stock/payment rows.
  - Cost Pool eligibility is limited to copper/brass product groups; non-copper/brass stock purchases stay in stock ledger/WAC only.
  - void/reversal
  - PO remaining qty reconciliation
  - header/line table refactor
- Sales follow-ups:
  - create/edit/post
  - FIFO/COGS
- Stock follow-ups:
  - Stock ledger row detail modal
  - Stock write form field-level messages
  - Stock reconciliation reports for grade convert/count adjust
  - Stock transfer cancel/void and cost source
- Finance follow-ups:
  - Payment approval persistence/printing
  - AP/AR allocation/reconciliation
- Auth/permission:
  - branch-scope enforcement:
    - Use `app_user_branch_access` as the scoped access source; admin/owner roles can be all-branch users.
    - Frontend branch selectors are UX only; APIs must enforce branch scope by intersecting requested branch filters with allowed branch ids.
    - `/api/branches` should return only active branches visible to the current user; `all` means all allowed branches.
    - Detail APIs should return 404/403 for records outside scope.
    - Recommended first batch: Purchase APIs (`/api/purchase/bills`, `/api/purchase/payments`, `/api/purchase/payment-history`, `/api/purchase/po-buy`), then Sales/Stock/Daily/Finance.
  - full legacy role matrix migration

- Master data form money-input pattern:
  - Shared master-data form now supports `inputFormat: 'money'` at field config level.
  - Money fields use the central pattern from `docs/design.md`:
    - `type="text" + inputMode="decimal"`
    - digits + one `.` only
    - max 2 decimal places
    - raw draft while focused
    - `#,##0.00` on blur
  - This is currently wired for known money fields in master-data config:
    - `อัตราเทียบบาท`
    - `วงเงิน OD`
    - `ยอดเงินคงเหลือ`
    - `ค่า Process/ชม.`
  - `เลขที่บัญชี` remains a separate digits-only identifier field and does not use the money-input pattern.

## Validation Baseline

Latest full app validation passed during TW4:

- `npm run type-check --workspace @ns-scrap-erp/next`
- `npm run lint --workspace @ns-scrap-erp/next`
- `npm run build --workspace @ns-scrap-erp/next`

Tailwind dependency check:

- `npm ls tailwindcss @tailwindcss/postcss --workspace @ns-scrap-erp/next`

## Latest Scoped Checkpoint

- 2026-06-05: strict `doc_no`-only cleanup for sales/payment approval/detail routes
  - completed for:
    - `apps/next/src/app/api/sales/bills/route.ts`
    - `apps/next/src/app/api/sales/po-sell/route.ts`
    - `apps/next/src/app/api/daily/payment-approval/route.ts`
    - `apps/next/src/app/api/purchase/payments/route.ts`
    - `apps/next/src/app/api/purchase/payment-history/route.ts`
    - `apps/next/src/app/api/purchase/advance-payments/[id]/route.ts`
    - `apps/next/src/app/api/daily/weight-tickets/[id]/route.ts`
    - `apps/next/src/app/api/finance/foreign/overseas-receipt/route.ts`
  - key repairs:
    - sales bill and PO-sell list/create responses now use `id = doc_no`
    - payment approval queue rows no longer fall back from `approval.doc_no` to `approval.id`; missing approval document numbers now fail visibly
    - payment history voided-approval rows now use approval `doc_no` as outward row id instead of synthetic `APPROVAL-{id}`
    - advance-payment detail and weight-ticket detail routes now resolve by `doc_no` only and no longer accept bigint route compatibility
    - overseas receipt sales-bill selector rows now use `doc_no` as outward id
  - scoped verification:
    - `npm run type-check --workspace @ns-scrap-erp/next -- --pretty false`
    - `npm run lint --workspace @ns-scrap-erp/next`
    - `npm run build --workspace @ns-scrap-erp/next`
    - `git diff --check`
- 2026-06-05: synthetic internal-id cleanup for document/report helpers
  - completed for:
    - `apps/next/src/lib/server/main-sales-control.ts`
    - `apps/next/src/lib/server/finance-accounting-working-capital.ts`
    - `apps/next/src/lib/server/weight-tickets.ts`
    - `apps/next/src/lib/server/advance-payments.ts`
    - `apps/next/src/lib/server/dual-costing-management.ts`
  - key repairs:
    - open PO sales detail rows now key off `doc_no` instead of `${po.id}`
    - profit-leak negative-margin rows now use `${doc_no}-{line}` instead of `${bill.id}-{line}`
    - weight-ticket detail payload now uses `doc_no` for the ticket id and `doc_no/line_no` or `doc_no/product_name` for nested row ids
    - advance-payment allocation timeline now keys events from purchase-bill `doc_no` instead of allocation bigint ids
    - dual-costing ledger rows now use `deal_no` instead of bigint `trading_deals.id`
  - scoped verification:
    - `npm run type-check --workspace @ns-scrap-erp/next -- --pretty false`
    - `npm run lint --workspace @ns-scrap-erp/next`
    - `npm run build --workspace @ns-scrap-erp/next`
    - `git diff --check`
- 2026-06-05: foreign master code-first checkpoint
  - schema-first changes:
    - added migration `20260605120000_add_codes_to_foreign_masters.sql`
    - `overseas_recipients.code` is now part of the target schema and backfilled with `BEN-###`
    - `overseas_remittance_purposes.code` is now treated as required/non-null in the target schema and backfilled with `RP-###` where missing
    - Prisma schema updated so both foreign masters expose real `code` columns
  - runtime changes:
    - `/api/master-data/beneficiaries` and `/api/master-data/beneficiaries/[id]` now use outward `id = code`
    - `/api/master-data/remittance-purposes` now uses `code` outward via the shared simple-master helper
    - `/api/finance/foreign/intl-transfer` now uses `account.code`, `beneficiary.code`, and `remittance purpose code` as selector ids instead of bigint ids
    - beneficiary/remittance master pages now show and edit code fields explicitly
  - scoped verification:
    - `npm run prisma:generate --workspace @ns-scrap-erp/next`
    - `npm run type-check --workspace @ns-scrap-erp/next -- --pretty false`
    - `npm run lint --workspace @ns-scrap-erp/next`
    - `npm run build --workspace @ns-scrap-erp/next`
    - `git diff --check`
- 2026-06-05: foreign/bank account-code boundary checkpoint
  - runtime changes:
    - added `apps/next/src/lib/server/account-reference.ts` so finance routes resolve outward `accounts.code` back to internal bigint ids server-side
    - `/api/finance/foreign/fcd-ledger` now accepts `accountId = accounts.code` at the API boundary and returns selected-account/filter ids by `accounts.code`
    - `/api/finance/foreign/bank-reconciliation` now accepts `accountId = accounts.code` and returns account selectors / selected account by code
    - `/api/finance/foreign/overseas-receipt` account selectors now use outward `id = accounts.code`
    - `/api/finance/bank` now filters by `accounts.code` instead of bigint account ids, and its account selectors / grouped account summaries now key on outward account code
    - `/api/finance/cash-position` account rows now return outward `id = accounts.code`
  - contract note:
    - bank-statement rows themselves still keep internal row ids outward in read payloads because that table still has no document/business key of its own; no fake code/fallback was introduced
  - scoped verification:
    - `npm run type-check --workspace @ns-scrap-erp/next -- --pretty false`
    - `npm run lint --workspace @ns-scrap-erp/next`
    - `npm run build --workspace @ns-scrap-erp/next`
    - `git diff --check`
- 2026-06-05: FX-rate business-key checkpoint
  - runtime changes:
    - `/api/finance/foreign/fx-rate` no longer returns outward `id = fx_rates.id bigint`
    - outward FX ids now use the natural business key derived from the existing unique tuple: `FX-YYYYMMDD-FROM-TO-RATE-TYPE`
    - FX create/update continues to persist by the unique tuple in DB, while edit/update resolves the existing row from the outward business id and then updates by internal bigint only inside the server
    - no bigint compatibility path or fallback was added back to the FX route/client flow
  - contract note:
    - this checkpoint did not add a new DB column because `fx_rates` already has a stable natural business key in schema (`rate_date + from_currency + to_currency + rate_type`)
    - `bank_statement` remained the open foreign-finance identity problem at this checkpoint because its rows still had no real business key/doc number of their own
  - scoped verification:
    - `npm run type-check --workspace @ns-scrap-erp/next -- --pretty false`
    - `npm run lint --workspace @ns-scrap-erp/next`
    - `npm run build --workspace @ns-scrap-erp/next`
    - `git diff --check`
- 2026-06-05: bank-statement `doc_no` checkpoint
  - schema-first changes:
    - added migration `20260605133000_add_doc_no_to_bank_statement.sql`
    - `bank_statement.doc_no` is now part of the target schema, backfilled for existing rows as `BSTYYMM-####`, and enforced unique/non-null
    - Prisma schema updated so `bank_statement` exposes a real `doc_no` business key
  - runtime changes:
    - `apps/next/src/lib/server/daily.ts` now allocates `BST` document numbers for `bank_statement`, including paired rows created by transfers
    - `/api/sales/receipts`, `/api/daily/transfers`, `/api/daily/petty-advances`, `/api/daily/petty-advances/returns`, and `/api/purchase/payments` now persist `bank_statement.doc_no` on create
    - `/api/finance/bank`, `/api/finance/foreign/fcd-ledger`, `/api/finance/foreign/bank-reconciliation`, `/api/finance/foreign/overseas-receipt`, `/api/finance/foreign/intl-transfer`, `/api/finance/customer-advance`, and `/api/finance/supplier-advance` now expose `bank_statement.doc_no` as outward statement identity instead of internal bigint row ids
  - contract note:
    - `bank_statement` is no longer the open foreign-finance identity gap for the active finance read/write scope
    - outward statement rows now use `doc_no`; internal bigint `id` stays server-side only
  - scoped verification:
    - `npm run prisma:generate --workspace @ns-scrap-erp/next`
    - `npm run type-check --workspace @ns-scrap-erp/next -- --pretty false`
    - `npm run lint --workspace @ns-scrap-erp/next`
    - `npm run build --workspace @ns-scrap-erp/next`
    - `git diff --check`
- 2026-06-05: petty-advance return + supplier receiving-account business-key checkpoint
  - schema-first changes:
    - added migration `20260605143000_add_doc_no_to_petty_advance_returns_and_code_to_supplier_bank_accounts.sql`
    - `petty_advance_returns.doc_no` is now part of the target schema, existing rows were backfilled as `PRETYYMM-####`, and the column is unique/non-null
    - `supplier_bank_accounts.code` is now part of the target schema, existing rows were backfilled per supplier as `SUPPLIERCODE-BA##`, and the column is unique/non-null
    - Prisma schema updated so both models expose their business keys directly
  - runtime changes:
    - `apps/next/src/lib/server/daily.ts` now allocates `PRET` document numbers through the shared daily allocator
    - `/api/daily/petty-advances` now returns petty-return child rows with outward `id = doc_no`
    - `/api/daily/petty-advances/returns` now creates PRET rows with `doc_no`, writes `bank_statement.ref_id/ref_no = PRET doc_no`, and returns `{ id: docNo }`
    - `/api/daily/payment-approval` now uses `supplier_bank_accounts.code` as the destination selector id and no longer synthesizes fallback destination accounts from legacy supplier-level bank fields
    - supplier save/import now persists `supplier_bank_accounts.code` on child receiving-account rows
    - `/api/admin/transaction-ledger` now resolves PRET references by `doc_no` for outward source labels instead of relying on bigint-only lookup keys
  - contract note:
    - active PRET flows now use `doc_no` outward only; internal bigint ids remain server-side
    - active supplier payment-destination flows now use `supplier_bank_accounts.code` outward only; no internal-id or supplier-level fallback destination was reintroduced
  - scoped verification:
    - `npm run prisma:generate --workspace @ns-scrap-erp/next`
    - `npm run type-check --workspace @ns-scrap-erp/next -- --pretty false`
    - `npm run lint --workspace @ns-scrap-erp/next`
    - `npm run build --workspace @ns-scrap-erp/next`
    - `git diff --check`
- 2026-06-05: daily/payment account-selector code-first checkpoint
  - runtime changes:
    - `apps/next/src/lib/server/daily.ts:listDailyAccounts()` now returns outward `id = accounts.code` instead of internal bigint account ids
    - active daily/payment write paths now resolve `accounts.code -> accounts.id` server-side before DB write in `/api/daily/expenses`, `/api/daily/petty-advances`, `/api/daily/petty-advances/returns`, `/api/daily/transfers`, `/api/sales/receipts`, `/api/purchase/advance-payments`, and `/api/purchase/payments`
    - touched read models now return account refs by business code instead of bigint ids in expense/petty-advance/transfer/receipt/payment payloads
  - contract note:
    - account selectors in the active daily/payment family now follow the same rule as the other migrated masters: `code outward, bigint inward`
    - no bigint-account compatibility path or fallback was added
  - scoped verification:
    - `npm run type-check --workspace @ns-scrap-erp/next -- --pretty false`
    - `npm run lint --workspace @ns-scrap-erp/next`
    - `npm run build --workspace @ns-scrap-erp/next`
    - `git diff --check`
- 2026-06-05: report/tracking/ledger outward-key cleanup checkpoint
  - runtime changes:
    - `profit-cost-analysis`, `tracking/product`, and `tracking/supplier` now count related bills by `doc_no` instead of internal bigint ids
    - `dual-costing-management` waiting/ledger rows now use sales-bill `doc_no` as outward bill identity where that field is exposed
    - `/api/stock/ledger` no longer exposes internal stock-ledger row ids or raw `ref_id` values; outward row identity now uses a business composite from `refType/refNo/product/date/lot/status`
    - `/api/admin/transaction-ledger` now exposes `bank_statement.doc_no` as row id, uses outward `accounts.code` for account ids, and stops falling back to internal bigint ids for row/duplicate identifiers
  - contract note:
    - touched report/tracking/ledger surfaces now use business document keys or business composites outward only
    - no internal-id fallback or bigint compatibility path was added
  - scoped verification:
    - `npm run type-check --workspace @ns-scrap-erp/next -- --pretty false`
    - `npm run lint --workspace @ns-scrap-erp/next`
    - `npm run build --workspace @ns-scrap-erp/next`
    - `git diff --check`
- 2026-06-05: UUID-cutover policy escalation
  - scope is expanded from `public text/uuid cleanup` to `all remaining uuid ids`, including app/system tables and Supabase auth-managed tables where technically feasible
  - execution order stays `DB-first -> Prisma -> app`, and no internal-id fallback is allowed during this wave
  - current UUID inventory from `apps/next/prisma/schema.prisma` is `31` models total: `21` Supabase-auth/internal and `10` app/public (`audit_logs`, `bill_swap_history`, `equity`, `user_profiles`, `app_activity_logs`, `app_audit_logs`, `app_permissions`, `app_roles`, `app_users`, `app_auth_events`)
  - next active task is FK/relationship inventory for those UUID families before writing the migration
- 2026-06-05: purchase identifier fallout closure for `/api/purchase/bills`, `/api/purchase/payments`, `/api/purchase/payment-history`, `/api/purchase/payments/cancel`, `/api/purchase/payments/cancel-approved`, and `/api/purchase/po-buy`
  - purchase routes now conform to the DB-first bigint schema instead of reusing legacy string PK behavior
  - `/api/purchase/bills` no longer fabricates string PKs for `purchase_bill_items`, `purchase_bill_receipt_allocations`, `purchase_bill_po_allocations`, `stock_ledger`, or `supplier_advance_allocations`; item rows are created with DB identity ids, downstream allocation rows now point to internal bigint ids, and stock ledger `ref_id` stays outward `doc_no`
  - purchase bill/payment history/options payloads now return outward business refs only: branch/supplier/product/PO/ADV values use code or `doc_no`, and no new fallback to internal ids was added
  - purchase payment cancel/approved-cancel flows now resolve bigint approval/payment refs internally and keep outward ids stringified only at response boundaries
  - scoped verification:
    - `npm run type-check --workspace @ns-scrap-erp/next -- --pretty false`
    - `npm run lint --workspace @ns-scrap-erp/next`
    - `npm run build --workspace @ns-scrap-erp/next`
    - `git diff --check`
- 2026-06-05: bigint fallout repair for `/api/daily/petty-advances`, `/api/daily/petty-advances/returns`, and `/api/daily/transfers`
  - internal `id` / `accountId` / `advanceId` are now parsed to bigint before Prisma query/write
  - bigint identity PKs are no longer manually assigned on create for `petty_advances`, `petty_advance_returns`, or `transfers`
  - outward JSON now stringifies bigint route ids only at response time
  - `bank_statement.ref_id` stays stringified because it is a polymorphic reference field, not a bigint FK
  - no outward fallback to internal ids was added
  - scoped verification:
    - `npm run type-check --workspace @ns-scrap-erp/next 2>&1 | rg "petty-advances/route.ts|petty-advances/returns/route.ts|daily/transfers/route.ts"` returned no matches
    - `git diff --check -- apps/next/src/app/api/daily/petty-advances/route.ts apps/next/src/app/api/daily/petty-advances/returns/route.ts apps/next/src/app/api/daily/transfers/route.ts`
- 2026-06-05: finance aging + bill-swap outward-contract follow-up
  - runtime changes:
    - `/api/finance/ap` now returns purchase-bill `id = doc_no` instead of internal bigint bill ids
    - `/api/finance/ar` now returns sales-bill `id = doc_no`, and AR channel filters now use outward `sales_channels.code`
    - `/api/daily/bill-swap-history` no longer returns internal bigint row ids outward; history rows now key on `billDocNo:itemIndex:swapDate`
  - contract note:
    - this slice closes the remaining obvious AP/AR aging leaks where document-family rows still exposed bigint ids outward after the wider Batch C cleanup
    - no fallback path back to internal bill ids or channel ids was reintroduced
  - scoped verification:
    - `npm run type-check --workspace @ns-scrap-erp/next -- --pretty false`
    - `npm run lint --workspace @ns-scrap-erp/next`
    - `npm run build --workspace @ns-scrap-erp/next`
    - `git diff --check`
- 2026-06-05: sales-channel and trading/stock outward-key follow-up
  - runtime changes:
    - `/api/sales/bills` and `/api/sales/po-sell` now use outward `sales_channels.code` in selector payloads and resolve `channelId` by code on write instead of bigint ids
    - `/api/trading/dashboard`, `/api/trading/matching`, `/api/dual-costing/deal-margin`, and `/api/dual-costing/match-log` now return outward `id = deal_no` or `doc_no` instead of internal bigint bill/deal ids
    - `/api/stock/convert` and `/api/stock/transfer` now key read payloads from document refs only, without fallback to internal ledger ids
    - `/api/admin/transaction-ledger` no longer falls back from `accountName` to `account_id`
  - contract note:
    - this slice removes another set of business-facing synthetic/internal ids while keeping internal bigint ids confined to DB/query paths only
    - no compatibility fallback path back to bigint ids was added
  - scoped verification:
    - `npm run type-check --workspace @ns-scrap-erp/next -- --pretty false`
    - `npm run lint --workspace @ns-scrap-erp/next`
    - `npm run build --workspace @ns-scrap-erp/next`
    - `git diff --check`
- 2026-06-05: event/history and FX natural-key follow-up
  - runtime changes:
    - `advance-payments` and `weight-tickets` timeline/audit events now use outward `id = event_key` instead of internal audit-log row ids
    - purchase-bill weight-ticket selectors now use `doc_no`, `doc_no:line_no`, and `doc_no:product:lineCount` composites instead of internal ticket/line/summary ids
    - `/api/finance/foreign/fx-gain-loss-report` now returns a natural composite id from date/currency/reference/amount, and no longer exposes raw `ref_id` outward
  - contract note:
    - this slice closes another set of business-facing history/read models that still emitted internal row ids after the wider document cleanup
    - no fallback path back to internal ids was added
  - scoped verification:
    - `npm run type-check --workspace @ns-scrap-erp/next -- --pretty false`
    - `npm run lint --workspace @ns-scrap-erp/next`
    - `npm run build --workspace @ns-scrap-erp/next`
    - `git diff --check`
- 2026-06-05: admin auth-events outward-id cleanup
  - runtime changes:
    - `/api/admin/auth-events` no longer returns internal audit/activity row ids outward
    - row ids now use `event_type:createdAt:stream` composite keys instead
  - audit note:
    - follow-up grep on remaining `row.id` hits in active business routes shows only false positives or internal-only resolver/query paths
    - remaining non-business/internal paths include `salesperson-reference`, `sales-channel-reference`, `po-buy-reconciliation`, and already-normalized product/sales summary rows where `row.id` is actually `code`
  - scoped verification:
    - `npm run type-check --workspace @ns-scrap-erp/next -- --pretty false`
    - `npm run lint --workspace @ns-scrap-erp/next`
    - `npm run build --workspace @ns-scrap-erp/next`
    - `git diff --check`
- 2026-06-05: remaining business-key inventory checkpoint
  - schema inventory from `apps/next/prisma/schema.prisma`:
    - models with `id`: `106`
    - models still lacking both `code` and `doc_no`: `59`
    - `public`: `37`
    - `auth`: `22`
  - `public` models that already have an alternate natural/business key and therefore are not immediate schema blockers:
    - `trading_deals.deal_no`
    - `stock_ledger.ref_no`
    - `app_activity_logs.activity_key`
    - `app_audit_logs.event_key`
  - `public` models that still need an explicit decision whether to stay internal-only or receive `code/doc_no` in a later wave include:
    - support/admin: `audit_logs`, `company_profiles`, `deletion_log`, `deletion_tombstones`, `roles`, `user_profiles`, `app_users`, `app_auth_events`
    - finance/support: `fx_gain_loss`, `historical_monthly`, `opening_balance`, `equity`, `loans`, `loan_schedules`, `depreciations`
    - production/bridge/detail: `production_machines`, `production_machine_types`, `production_lines`, `production_inputs`, `production_outputs`, `process_costs`
    - document detail/bridge rows: `purchase_bill_items`, `purchase_bill_receipt_allocations`, `purchase_bill_po_allocations`, `supplier_advance_allocations`, `weight_ticket_lines`, `weight_ticket_product_summaries`, `weight_ticket_product_summary_lines`, `po_buy_status_logs`, `bill_swap_history`
  - scope note:
    - `auth.*` tables remain a separate identity-layer project; they are not active business-flow blockers for the current cutover wave
    - next identifier wave should start from the `public` list above, not from already-normalized internal resolver/query code paths
- 2026-06-06: Batch C8 first finance/support history slice
  - runtime changes:
    - `/api/daily/payment-approval`, `/api/purchase/payments`, `/api/purchase/payments/cancel-approved`, and `/api/purchase/payment-history` now use `payment_approvals.doc_no` as the only outward `approvalId`
    - supplier-payment write flow now resolves approval targets by `doc_no` only before mapping to internal bigint ids
    - payment-history voucher groups no longer seed `approvalIds` from internal bigint approval ids in active or voided paths, and outward row ids now use `payments.doc_no` instead of internal `voucher_id`
    - `/api/finance/bank` no longer returns raw `bank_statement.ref_id`; outward `refId` now follows `ref_no ?? doc_no`
    - stock-ledger detail wording now presents that outward field as `Ref No` rather than `Ref ID`
    - shared supplier-payment validation now requires `billId`/`approvalId` in `doc_no` format at the Zod boundary, so the form layer matches the API/runtime contract
    - `/api/finance/customer-advance` and `/api/finance/supplier-advance` now resolve bank-statement references against `customer.code` / `supplier.code` instead of internal master ids
  - contract note:
    - this closes the obvious `payment_approvals`/`bank_statement` outward-id leaks in active finance/payment flows without reintroducing compatibility fallback
    - `fx_gain_loss` remains on its natural composite outward key and does not need a persisted surrogate key in this wave
  - verification:
    - `npm run type-check --workspace @ns-scrap-erp/next -- --pretty false`
    - `npm run lint --workspace @ns-scrap-erp/next`
    - `npm run build --workspace @ns-scrap-erp/next`
    - `git diff --check`
- 2026-06-06: runtime report recovery checkpoint for audit/calendar/cash summary
  - runtime changes:
    - `buildCashFlowCalendar()` no longer returns raw `accounts.id bigint` in the outward payload; the cash-calendar account list now emits `accounts.code` as outward `id`
    - `accountBalances()` / `buildCashOthersSummary()` no longer return raw `accounts.id bigint` in `rows.cashAccounts`; outward account ids now follow `accounts.code`
    - `/api/admin/auth-events` no longer performs an unsafe join cast on `app_audit_logs.target_id`; the route now resolves `target.id` through a guarded `CASE` expression so legacy nonnumeric target ids cannot crash the feed
    - `/api/admin/auth-events` now distinguishes auth failures from internal query/runtime failures; non-auth faults return `โหลด Audit & Activity Log ไม่สำเร็จ` instead of the misleading generic permission text
  - contract note:
    - this closes the current report-family failure mode where bigint identifiers or unsafe cast paths broke read-only pages after the identifier cutover
    - no fallback to internal ids was added; outward ids remain business keys only
  - verification:
    - `npm run type-check --workspace @ns-scrap-erp/next -- --pretty false`
    - `npm run lint --workspace @ns-scrap-erp/next`
    - `npm run build --workspace @ns-scrap-erp/next`
    - `git diff --check`
- 2026-06-06: PO Buy form design-alignment checkpoint
  - UI/runtime changes:
    - `/purchase/po-buy` item rows now use `SearchCombobox` for the product field instead of a plain `<select>`, matching `docs/design.md` for searchable `product` inputs
    - product row options keep the outward business label `CODE - NAME` and search by code/name without reintroducing any internal-id display
    - PO Buy `ราคา/หน่วย` now follows the system money-input baseline (`type="text"` + `inputMode="decimal"` + Thai money formatting on blur) instead of raw `type="number"`
    - PO Buy `จำนวน (กก.)` stays on the number-exception path but now explicitly uses decimal input mode and hides native number spinners to match the design matrix
  - contract note:
    - no schema or API payload change was introduced in this batch; the form still submits the same validated `PoBuyFormValues`
    - this batch only brings the active page controls back in line with `docs/design.md`
  - verification:
    - `npm run type-check --workspace @ns-scrap-erp/next -- --pretty false`
    - `npm run lint --workspace @ns-scrap-erp/next`
    - `npm run build --workspace @ns-scrap-erp/next`
    - `git diff --check`
- 2026-06-06: PO Buy combobox and sort behavior checkpoint
  - UI/runtime changes:
    - `SearchCombobox` now supports `hideLabel` and `optionsPanelClassName` so PO Buy can hide inline table labels and expand supplier/product dropdown height without changing other pages
    - PO Buy supplier/product dropdowns now render through a scoped portal host inside the dialog, so the option list is not clipped by the table section and still remains clickable/selectable inside the modal
    - `SearchCombobox` now supports keyboard navigation for active option lists via `ArrowUp`, `ArrowDown`, and `Enter`, using the highlighted option instead of always choosing the first row
    - PO Buy `จำนวน` now follows the same editable text-entry pattern as `ราคา/หน่วย` for clearing and retyping values, while still staying a qty field rather than a money-formatted field
    - new PO Buy forms now default `วันส่งมอบ` to today
    - `/purchase/po-buy` now defaults table sorting to `docNo desc` so the latest document number appears first
  - contract note:
    - no API/schema payload changed in this batch; all changes are UI behavior, combobox rendering, and local client-side sorting defaults only
    - the scoped portal fix intentionally avoids `document.body` for comboboxes inside the PO Buy dialog because Radix dialog focus/outside handling broke option selection there
  - verification:
    - `npm run type-check --workspace @ns-scrap-erp/next -- --pretty false`
    - `npm run lint --workspace @ns-scrap-erp/next`
    - `npm run build --workspace @ns-scrap-erp/next`
    - `git diff --check`
- 2026-06-06: purchase flow execution checkpoint
  - scope:
    - executed live QA for `PO Buy -> WTI -> Purchase Bill -> Payment Approval -> Purchase Payment -> Payment History`
    - report captured in [testpurchaseflow_date.md](/Users/watcharathatsrithanesiganon/Documents/GitHub/ns-scrap-erp/testpurchaseflow_date.md)
  - verified pass:
    - created `PO Buy` document `POB012606-0005`
    - created `WTI` document `WTI012606-0003`
  - blocker:
    - stock `Purchase Bill` create path is currently blocked at `/api/purchase/bills`
    - route contract is internally inconsistent for `item.productId`
    - `buildBillItems()` resolves product rows through `createProductRefMap()` keyed by `products.code`
    - `validateStockReceiptSelection()` later parses the same outward `item.productId` as internal bigint and compares it to `weight_ticket_product_summaries.product_id`
    - current product master data uses outward codes like `SKU001`, `SKU081`, etc.; there is no active product where `code === internal bigint id`
    - result: the stock purchase-bill flow cannot proceed past the first PB create request, so downstream PO partial/full receive, approval, payment, and payment-history UAT cases are blocked by the same route bug
  - evidence:
    - API test result saved in `tmp/test_purchase_flow_result.json`
    - product contract probe saved in `tmp/product_probe.mjs`
  - next fix:
    - normalize `/api/purchase/bills` to accept outward `products.code` only and compare receipt summary product ids against the already-resolved internal bigint product id rather than reparsing the outward field
- 2026-06-06: purchase bills ADV selector alignment checkpoint
  - UI/runtime changes:
    - `/purchase/bills` field `เอกสารจ่ายเงินล่วงหน้า/มัดจำ` now uses the same `SearchCombobox` interaction pattern as the `ใบรับของ WTI` selector instead of a plain select
    - ADV options now show searchable document labels with remaining-amount descriptions and follow the same searchable/selectable behavior inside the modal as other purchase-bill document pickers
  - contract note:
    - no API/schema payload changed in this batch; the field still submits the same outward `advancePaymentId`
  - verification:
    - `npm run type-check --workspace @ns-scrap-erp/next -- --pretty false`
    - `npm run lint --workspace @ns-scrap-erp/next`
    - `npm run build --workspace @ns-scrap-erp/next`
    - `git diff --check`
- 2026-06-06: purchase payment history recovery checkpoint
  - root cause:
    - `/api/purchase/payment-history` crashed on voided purchase approvals because legacy `payment_approvals.source_id` rows still contain business ids like `PB-...` rather than internal bigint ids
    - the route was calling `BigInt(approval.source_id)` directly in the voided-approval path, which throws for those legacy rows
  - runtime fix:
    - switched the route to `parseInternalBigIntId()` and only read `billDocNoById` when `source_id` is actually numeric
    - `source_doc_no_snapshot` remains the primary outward bill reference for voided approval rows
  - verification:
    - `npx tsx tmp/check_voided_purchase_approvals.mjs`
    - `npx tsx tmp/check_payment_history.mjs`
    - `npm run type-check --workspace @ns-scrap-erp/next -- --pretty false`
    - `npm run lint --workspace @ns-scrap-erp/next`
    - `npm run build --workspace @ns-scrap-erp/next`
    - `git diff --check`
- SUPERSEDED historical checkpoint on 2026-06-06: this earlier payment-approval override moved runtime toward source-write-time `PMA pending` rows. It is no longer the target model after the later 2026-06-06 flow review. Keep the notes below only as history of code/data already touched; future work must follow the newer source-derived pending queue model documented in `docs/notes/Payment Flow.md` and `docs/notes/Purchase Flow.md`.
- Payment-approval runtime slice checkpoint on 2026-06-06: the first implementation pass of the overridden PMA lifecycle is now in place. `apps/next/src/lib/server/payment-approval-pending.ts` adds `ensurePendingPaymentApproval()` plus PMA numbering for source-create flows. `ADV`, `PB`, and `EXP` create or refresh `PMA pending` rows at source-write time, using minimal source-backed fields only (`source_type`, `source_id`, `source_doc_no_snapshot`, source date, party snapshot) rather than copying full frozen payment snapshots while status is still `pending`. `/api/daily/payment-approval` now reads both tabs from `payment_approvals`: pending AP/ADV/EXP rows use `PMA.doc_no` as the main document number and show the source document in a separate reference column, while approved rows continue to read frozen PMA snapshots. The approval POST path now approves an existing pending PMA instead of creating a PMA from scratch, and split approval continues by reusing the PMA cycle doc number. `PaymentApprovalPageClient` was adjusted so tables and detail labels show `PMA` as the primary document and `ADV/PB/EXP` as reference data. Validation passed with `npm run type-check --workspace @ns-scrap-erp/next -- --pretty false`, `npm run lint --workspace @ns-scrap-erp/next`, `npm run build --workspace @ns-scrap-erp/next`, and `git diff --check`.
- Payment-approval lifecycle batch checkpoint on 2026-06-06 (follow-up implementation):
  - `apps/next/src/lib/server/payment-approval-pending.ts` now adds `backfillPendingPaymentApprovals()` plus cleanup helpers for deleting stale pending PMAs when source documents are cancelled or no longer payable
  - `/api/daily/payment-approval` now backfills missing `PMA pending` rows for legacy `PB`, `ADV`, and `EXP` documents before building the pending/approved tabs, so old source documents no longer disappear just because they were created before the PMA-first model
  - `expense` approval is now open in the approval POST flow: pending expense PMAs are approved in place, expense status is advanced to `approved`, and the UI can submit the approval directly from the expense pending row without the old hard block
  - source-write cleanup is now partially wired:
    - `ADV` edit refreshes its pending PMA; `ADV` cancel removes the pending PMA
    - `PB` edit refreshes/removes the pending PMA based on remaining payable balance; `PB` cancel removes the pending PMA
    - `EXP` cancel removes the pending PMA
  - source lock enforcement is now partially wired to `payment_approvals.status in ('approved','paid')`:
    - `ADV` edit/cancel is blocked once a locked PMA exists
    - `EXP` edit/cancel is blocked once a locked PMA exists
    - `PB` edit/cancel now treats both `approved` and `paid` PMAs as locked states
  - `/api/purchase/payments` now reads approved PMAs from both `purchase_bill` and `advance_payment`, validates supplier-payment lines against `approvalId`, and refreshes post-payment status for both PB settlement and ADV payment lifecycle
  - `/api/purchase/payment-history` was widened so ADV payment rows can still resolve their source document references even when `payments.bill_id` is null
  - validation:
    - `npm run type-check --workspace @ns-scrap-erp/next -- --pretty false`
    - `npm run lint --workspace @ns-scrap-erp/next`
    - `npm run build --workspace @ns-scrap-erp/next`
- Payment-approval data-normalization checkpoint on 2026-06-06:
  - root cause of missing old approved `ADV` rows was not the PMA read model itself but legacy `payment_approvals.source_id` data that still stored business ids like `ADV-...` / `PB-...` instead of the normalized internal bigint id string expected by the current flow
  - `tmp/probe-legacy-payment-approval-source-ids.ts` confirmed `16` legacy rows (`purchase_bill 14`, `advance_payment 2`)
  - applied [20260606065000_normalize_payment_approval_source_ids.sql](/Users/watcharathatsrithanesiganon/Documents/GitHub/ns-scrap-erp/supabase/migrations/20260606065000_normalize_payment_approval_source_ids.sql) to the dev-target DB, updating those rows by resolving `source_doc_no_snapshot -> source document id`
  - post-fix probe confirmed `legacyCount = 0`, and the older approved ADV rows now point to `supplier_advance_payments.id` correctly without adding any compatibility branch in runtime code
  - also applied [20260606062000_allow_pending_payment_approvals.sql](/Users/watcharathatsrithanesiganon/Documents/GitHub/ns-scrap-erp/supabase/migrations/20260606062000_allow_pending_payment_approvals.sql) during the now-superseded PMA-first implementation; this migration/runtime shape must be reviewed in the next correction batch so pending approval is source-derived instead of source-write-time PMA
- Payment-flow correction checkpoint on 2026-06-06:
  - latest decision supersedes the PMA-first/pending implementation direction above
  - pending approval queue must be source-derived from `PB`, `ADV`, and `EXP`; no `PMA` row should be required before approval
  - `PMA` is created only by approve action, one row per approved split amount, and stores the approval snapshot for the exact approved amount
  - `/daily/payment-approval` pending tab must show source doc numbers as the main document; approved tab must show `PMA.doc_no` as main document with source doc number as reference
  - `PMT` must pay full selected PMA rows; partial payment belongs at the PMA split/approval layer, not at PMT
  - voiding an approved PMA before PMT returns that amount to source pending candidate and keeps the PMA as audit/history only
  - cancelling a PMT must reverse bank/payment allocation, close the old PMA cycle, return the reversed amount to source pending candidate, and require a new PMA before paying again
  - source financial fields lock after any `PMA approved` or active PMT cycle; before approval, source can be edited/cancelled and pending queue must reflect source current state
  - scope boundary clarified: [Purchase Flow.md](/Users/watcharathatsrithanesiganon/Documents/GitHub/ns-scrap-erp/docs/notes/Purchase%20Flow.md) now ends at `PB/payable handoff`, while approval/PMA/PMT/void/cancel/payment-history requirements are owned by [Payment Flow.md](/Users/watcharathatsrithanesiganon/Documents/GitHub/ns-scrap-erp/docs/notes/Payment%20Flow.md)
  - docs updated in [Payment Flow.md](/Users/watcharathatsrithanesiganon/Documents/GitHub/ns-scrap-erp/docs/notes/Payment%20Flow.md), [Purchase Flow.md](/Users/watcharathatsrithanesiganon/Documents/GitHub/ns-scrap-erp/docs/notes/Purchase%20Flow.md), and [Purchase Flow Status Matrix.md](/Users/watcharathatsrithanesiganon/Documents/GitHub/ns-scrap-erp/docs/notes/Purchase%20Flow%20Status%20Matrix.md), including Mermaid diagrams, ownership boundary, and separate per-flow status matrices
  - implementation follow-up is tracked in [09-implementation-tasklist.md](/Users/watcharathatsrithanesiganon/Documents/GitHub/ns-scrap-erp/docs/migration/09-implementation-tasklist.md) under `Payment-approval model correction 2026-06-06`
- 2026-06-06: PO Buy allocation timeline checkpoint
  - schema/runtime changes:
    - added `po_buy_allocation_logs` as an append-only usage history table for `POB -> PB` allocation and release events
    - active/current PO cuts remain in `purchase_bill_po_allocations`; history is not rebuilt from active rows at read time
    - dev-target DB was migrated and backfilled from active non-cancelled `purchase_bill_po_allocations`; verification count was `10` rows
    - `/api/purchase/bills` now appends `allocated_to_purchase_bill` on create, `released_from_purchase_bill` on cancel, and diff-only allocation/release logs on edit
    - `/api/purchase/po-buy` and `/purchase/po-buy` detail now expose/show `po_buy_status_logs` plus `po_buy_allocation_logs`
  - runtime bug fix:
    - `/api/purchase/bills` returned `400` with `Cannot read properties of undefined (reading 'createMany')` when the running Next dev server reused a stale Prisma client created before the new log delegates existed
    - `apps/next/src/lib/server/prisma.ts` now includes the new timeline delegates in `hasExpectedDelegates()` so the proxy discards stale clients instead of calling missing delegates
    - this is a schema/client consistency fix, not a fallback path
- 2026-06-06: purchase-bill ADV selector readiness checkpoint
  - root cause:
    - `/purchase/bills` ADV search looked empty because dev-target currently has ADV rows only in `pending_approval` / `approved`, while the PB allocation flow correctly allows only ADV that has been paid or already partially allocated
    - `approved` means the payment request is approved but cash is not yet paid; it must not reduce a purchase bill
  - runtime changes:
    - `/api/purchase/bills` options now returns non-cancelled ADV rows with their real status, but marks `active=true` only for `paid`, `partially_allocated`, or `allocated` rows with remaining available amount
    - `/purchase/bills` still lets users select only active/usable ADV rows, but now shows a clear warning when matching supplier/branch ADV exists and is not ready yet
    - PB allocation validation now resolves `advancePaymentId` by `supplier_advance_payments.doc_no` only; it no longer accepts internal bigint ids as an alternate input path
  - contract note:
    - no fallback from `approved` / `pending_approval` into usable ADV was added
    - no fallback from inactive/mismatched ADV options into selected advance-payment calculation is allowed in the UI
    - if legacy ADV was actually paid, fix data from PMT/payment evidence so status becomes `paid`; do not loosen PB allocation validation
  - verification:
    - DB probe on dev-target shows only `ADV012605-0001|approved|500` and `ADV012606-0001|pending_approval|5000` for supplier `SU0001` / branch `01`; there is no currently usable paid ADV in this data set
    - isolated Playwright QA logged in, opened `/purchase/bills`, selected branch `สมุทรสาคร` and supplier `SU0001 - บจ. เอ็มแอนด์เอ็ม บราส เมททอล`; the ADV field stayed searchable but listed no selectable options and displayed `มี ADV ของผู้ขายนี้ แต่ยังไม่พร้อมใช้หักบิล ต้องอนุมัติและจ่ายเงินจริงให้เป็นสถานะพร้อมใช้ก่อน`
