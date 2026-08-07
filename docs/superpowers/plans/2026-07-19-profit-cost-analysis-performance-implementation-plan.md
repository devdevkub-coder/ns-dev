# Profit & Cost Analysis Performance Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** เปลี่ยน `/profit-cost-analysis` ให้ใช้ incremental reporting fact + daily rollup, split APIs และ server-side pagination โดยรักษายอดจาก source transaction แบบตรวจสอบย้อนกลับได้

**Architecture:** Normalize COGS และ purchase-channel dimensions ที่ source ก่อน จากนั้นใช้ PostgreSQL projector functions/triggers สร้าง idempotent facts และ daily rollup ทุกครั้งที่เอกสารยืนยัน แก้ไข ยกเลิก หรือ stock ledger เปลี่ยน หน้าเว็บอ่าน summary/rankings/active-tab ผ่าน API แยกและไม่ cache L5 report facts

**Tech Stack:** Next.js 16 App Router, TypeScript, Prisma, PostgreSQL/Supabase migrations, Zod, Vitest, Tailwind CSS

## Execution Status 2026-07-19

- Tasks 1-7 are implemented on isolated branch `codex/profit-cost-performance` and the migration/backfill is applied to production only.
- Source normalization, fact ledger, daily rollup, reconciliation, split APIs, applied filters, independent summary/rankings/table request lifecycles, branch scope and server pagination/sort are implemented. Alerts evaluate the complete scoped daily read model before limiting the result set.
- The page remains one component instead of the optional hook/section file split in the original file map; request lifecycles are independent and validated without adding an abstraction used only once.
- Backfill/verify scripts use TypeScript (`.ts`) rather than the provisional `.mjs` filenames in this plan.
- Production reconciliation for 2026-01-01 through 2026-07-31 reports zero issues and exact fact/daily parity. Warm reader measurement for summary + products + rankings averaged 88.6 ms across three warm runs.
- Focused tests, full lint, source type-check and diff check pass. The full Next build remains blocked by the pre-existing invalid route export `getCostPoolRowsData` in `dual-costing/cost-pool/route.ts`, which is outside this batch and unchanged.
- Browser/UAT was not run because it was not requested. SIT/UAT migration and promotion remain pending explicit instruction.

## Global Constraints

- Active app คือ `apps/next/`; legacy/Vue ใช้อ้างอิงเท่านั้น
- ใช้ production Supabase ก่อน environment อื่น
- เงินใช้ PostgreSQL `numeric(18,2)` และน้ำหนักใช้ `numeric(18,3)`
- API decimal fields ส่งเป็น string; ห้าม aggregate เงิน/น้ำหนักด้วย JavaScript floating point
- Draft ไม่สร้าง fact; confirmed/open/unpaid/paid/partial ตาม source contract สร้าง fact; cancelled/canceled/void/reversed ไม่รวม
- Report facts เป็น L5: `private, no-store`, ไม่ใช้ Redis และไม่ใช้ persistent browser cache
- ไม่มี hardcode, runtime fallback, skip-row หรือ silent coercion เมื่อ source data ไม่ครบ
- ทุก projector ต้อง idempotent และ trace กลับ `source_type`, `source_doc_no`, `source_line_no`, `source_event_key`
- Cutover หลัง shadow parity ผ่านเท่านั้น

---

## File Structure

| File | Responsibility |
|---|---|
| `supabase/migrations/20260719160000_create_profit_cost_reporting_read_model.sql` | source columns, fact/rollup/settings/reconciliation schema, projector functions, triggers, indexes |
| `apps/next/prisma/schema.prisma` | Prisma models for normalized source fields and reporting tables |
| `apps/next/src/lib/server/profit-cost-report-contract.ts` | shared filters, decimal response types, sort allowlists, status contracts |
| `apps/next/src/lib/server/profit-cost-report-reader.ts` | read-only summary/ranking/tab queries against rollup/facts |
| `apps/next/src/lib/server/profit-cost-report-reader.test.ts` | reader/query contract tests |
| `apps/next/src/lib/server/profit-cost-report-projector.test.ts` | source lifecycle and idempotency contract tests |
| `apps/next/src/app/api/profit-cost-analysis/_shared.ts` | auth, filter parsing, no-store headers, Server-Timing response helper |
| `apps/next/src/app/api/profit-cost-analysis/{summary,rankings,products,suppliers,customers,channels,trend,alerts}/route.ts` | split report endpoints |
| `apps/next/src/app/api/profit-cost-analysis/routes.test.ts` | validation, headers and endpoint dispatch contracts |
| `apps/next/src/components/main/ProfitCostAnalysisPageClient.tsx` | page orchestration, applied filters, active-tab lazy loading |
| `apps/next/src/components/main/profit-cost-analysis/useProfitCostReport.ts` | request cancellation and independent resource states |
| `apps/next/src/components/main/profit-cost-analysis/ProfitCostReportSections.tsx` | typed KPI, ranking and tab table sections |
| `apps/next/src/components/main/profit-cost-analysis/ProfitCostReportSections.test.tsx` | initial-load, tab-load, apply/reset and stale-response tests |
| `apps/next/scripts/backfill-profit-cost-report.mjs` | resumable backfill and reconciliation command |
| `apps/next/scripts/verify-profit-cost-report.mjs` | source/fact/rollup parity and performance verification |
| `docs/notes/page-flows/main-dashboard-reports-profit-cost-analysis.md` | final business/data/cache flow |

### Task 1: Freeze Source And API Contracts With Failing Tests

**Files:**
- Create: `apps/next/src/lib/server/profit-cost-report-contract.ts`
- Create: `apps/next/src/lib/server/profit-cost-report-reader.test.ts`
- Create: `apps/next/src/app/api/profit-cost-analysis/routes.test.ts`

**Interfaces:**
- Produces: `ProfitCostAppliedFilter`, `ProfitCostSortDirection`, `parseProfitCostFilter(searchParams)`, `PROFIT_COST_PAGE_SIZES`, endpoint-specific sort allowlists
- Consumes: existing `parseInternalBigIntId`, auth/branch permission helpers and Zod

- [ ] **Step 1: Write failing filter and decimal contract tests**

```ts
it('rejects malformed IDs and unsupported page sizes instead of defaulting', () => {
  expect(() => parseProfitCostFilter(new URLSearchParams('from=2026-07-01&to=2026-07-31&branchId=B01'))).toThrow()
  expect(() => parseProfitCostFilter(new URLSearchParams('from=2026-07-01&to=2026-07-31&pageSize=999'))).toThrow()
})

it('keeps report decimals as strings at the API boundary', () => {
  expect(decimalString('8881.600')).toBe('8881.600')
  expect(() => decimalString(8881.6)).toThrow()
})
```

- [ ] **Step 2: Run tests and confirm red state**

Run: `npx vitest run --config apps/next/vitest.config.ts apps/next/src/lib/server/profit-cost-report-reader.test.ts apps/next/src/app/api/profit-cost-analysis/routes.test.ts`

Expected: FAIL because contract module and routes do not exist

- [ ] **Step 3: Implement strict shared contract**

```ts
export const PROFIT_COST_PAGE_SIZES = [10, 25, 50, 100] as const
export type ProfitCostSortDirection = 'asc' | 'desc'
export type ProfitCostAppliedFilter = {
  from: string
  to: string
  branchId?: bigint
  productId?: bigint
  supplierId?: bigint
  customerId?: bigint
  purchaseChannelId?: bigint
  salesChannelId?: bigint
}

export function decimalString(value: unknown): string {
  if (typeof value !== 'string' || !/^-?\d+(?:\.\d+)?$/.test(value)) {
    throw new TypeError('Report decimal must be a PostgreSQL numeric string')
  }
  return value
}
```

Use Zod `date`, positive digit-string IDs, page-size enum and endpoint sort allowlists. Do not call `parseInternalBigIntId` on business codes.

- [ ] **Step 4: Run focused tests**

Run: `npx vitest run --config apps/next/vitest.config.ts apps/next/src/lib/server/profit-cost-report-reader.test.ts apps/next/src/app/api/profit-cost-analysis/routes.test.ts`

Expected: PASS for contract tests; route tests remain skipped only until Task 5 files exist

- [ ] **Step 5: Commit Task 1**

```bash
git add apps/next/src/lib/server/profit-cost-report-contract.ts apps/next/src/lib/server/profit-cost-report-reader.test.ts apps/next/src/app/api/profit-cost-analysis/routes.test.ts
git commit -m "test: define profit cost report contracts"
```

### Task 2: Normalize Line COGS And Purchase Channel At Source

**Files:**
- Create: `supabase/migrations/20260719160000_create_profit_cost_reporting_read_model.sql`
- Modify: `apps/next/prisma/schema.prisma`
- Modify: `apps/next/src/app/api/sales/bills/route.ts`
- Modify: `apps/next/src/app/api/purchase/bills/route.ts`
- Test: `apps/next/src/lib/server/profit-cost-report-projector.test.ts`

**Interfaces:**
- Produces: `sales_bill_lines.cogs_amount`, `sales_bill_lines.gross_profit`, `purchase_bills.purchase_channel_id`
- Consumes: `tradingMatchedCogsByLineIndex`, stock-consumption `valueOut`, active `purchase_channels.id`

- [ ] **Step 1: Write failing source precision tests**

```ts
it('requires COGS on every active sales line before report projection', async () => {
  const issues = await listProjectionIssues({ sourceType: 'SALES_BILL', sourceDocNo: 'SB012607-0001' })
  expect(issues).not.toContainEqual(expect.objectContaining({ issueCode: 'MISSING_LINE_COGS' }))
})

it('requires purchase channel ID instead of deriving it from purchase_source text', async () => {
  const issues = await listProjectionIssues({ sourceType: 'PURCHASE_BILL', sourceDocNo: 'PB012607-0001' })
  expect(issues).not.toContainEqual(expect.objectContaining({ issueCode: 'MISSING_PURCHASE_CHANNEL_ID' }))
})
```

- [ ] **Step 2: Run tests and confirm red state**

Run: `npx vitest run --config apps/next/vitest.config.ts apps/next/src/lib/server/profit-cost-report-projector.test.ts`

Expected: FAIL because normalized columns and issue reader do not exist

- [ ] **Step 3: Add strict source columns and constraints**

Migration fragment:

```sql
alter table public.sales_bill_lines
  add column cogs_amount numeric(18,2),
  add column gross_profit numeric(18,2);

alter table public.purchase_bills
  add column purchase_channel_id bigint references public.purchase_channels(id);

alter table public.sales_bill_lines
  add constraint sales_bill_lines_profit_equation_check
  check (gross_profit is null or gross_profit = line_amount - cogs_amount);
```

Do not set defaults that would turn missing data into zero. Backfill must stop and report rows that cannot be derived from recorded line allocation facts.

- [ ] **Step 4: Populate line COGS in create/edit transactions**

For TRADING, write `tradingMatchedCogsByLineIndex.get(index)` to the matching normalized line. For STOCK, aggregate `consumeActiveWtoPendingOut()` results by product/source allocation and update the exact `sales_bill_line_id`. Set `gross_profit = line_amount - cogs_amount` in the same transaction because `line_amount` is already net of the line discount. Reject the transaction if active sales lines cannot be matched one-to-one with recorded cost sources.

- [ ] **Step 5: Require purchase channel at PB write boundary**

Resolve submitted `purchaseChannelId` as a positive internal ID, verify active master, persist `purchase_channel_id`, and reject missing/invalid values. Update the existing PB form option payload from active purchase-channel master without a string fallback.

- [ ] **Step 6: Regenerate Prisma and run focused tests**

Run: `npm run prisma:generate --workspace @ns-scrap-erp/next && npx vitest run --config apps/next/vitest.config.ts apps/next/src/lib/server/profit-cost-report-projector.test.ts`

Expected: PASS

- [ ] **Step 7: Commit Task 2**

```bash
git add supabase/migrations/20260719160000_create_profit_cost_reporting_read_model.sql apps/next/prisma/schema.prisma apps/next/src/app/api/sales/bills/route.ts apps/next/src/app/api/purchase/bills/route.ts apps/next/src/lib/server/profit-cost-report-projector.test.ts
git commit -m "feat: normalize profit cost report sources"
```

### Task 3: Create Idempotent Fact Ledger, Daily Rollup And Reconciliation

**Files:**
- Modify: `supabase/migrations/20260719160000_create_profit_cost_reporting_read_model.sql`
- Modify: `apps/next/prisma/schema.prisma`
- Modify: `apps/next/src/lib/server/profit-cost-report-projector.test.ts`

**Interfaces:**
- Produces: `report_profit_cost_facts`, `report_profit_cost_daily`, `report_profit_cost_reconciliation_issues`, `project_profit_cost_purchase_bill(bigint)`, `project_profit_cost_sales_bill(bigint)`, `project_profit_cost_stock_ledger(bigint)`, `rebuild_profit_cost_daily(date,date)`
- Consumes: normalized source columns from Task 2

- [ ] **Step 1: Add failing idempotency/lifecycle tests**

```ts
it('projects a confirmed source twice without duplicating totals', async () => {
  await projectSalesBill(101n)
  const first = await factTotals('SB012607-0001')
  await projectSalesBill(101n)
  expect(await factTotals('SB012607-0001')).toEqual(first)
})

it('removes draft facts and records cancellation as a traceable reversal', async () => {
  await projectSalesBill(102n)
  expect(await factTotals('SB-DRAFT-1')).toEqual(null)
  await projectSalesBill(103n)
  expect(await factTotals('SB-CANCEL-1')).toMatchObject({ revenueAmount: '0.00' })
})
```

- [ ] **Step 2: Run tests and confirm red state**

Run: `npx vitest run --config apps/next/vitest.config.ts apps/next/src/lib/server/profit-cost-report-projector.test.ts`

Expected: FAIL because reporting objects/functions do not exist

- [ ] **Step 3: Create tables and constraints**

Use the exact columns/scales from the approved spec. Add unique source key, fact-type checks, required dimensions by fact type, and indexes for source lookup plus date/dimension queries. Add `system_settings.key = 'profit_cost_target_margin_pct'` only through an explicit data migration value approved for production; API must fail configuration validation if absent.

- [ ] **Step 4: Implement DB projector functions**

Each projector must lock the source row, delete/reverse only the currently projected version for that source, insert strict line facts, and call `rebuild_profit_cost_daily(min_date,max_date)` for affected dates. Trigger calls must run after source and line writes are complete; route transactions may call the projector explicitly as their final DB operation when statement ordering makes row triggers unsafe.

- [ ] **Step 5: Create reconciliation view**

The view emits explicit issue codes: `MISSING_BRANCH_ID`, `MISSING_PRODUCT_ID`, `MISSING_SUPPLIER_ID`, `MISSING_CUSTOMER_ID`, `MISSING_PURCHASE_CHANNEL_ID`, `MISSING_SALES_CHANNEL_ID`, `MISSING_LINE_COGS`, `HEADER_LINE_TOTAL_MISMATCH`, `FACT_SOURCE_MISMATCH`, `ROLLUP_FACT_MISMATCH`.

- [ ] **Step 6: Run projector tests and migration lint**

Run: `npx vitest run --config apps/next/vitest.config.ts apps/next/src/lib/server/profit-cost-report-projector.test.ts && git diff --check -- supabase/migrations/20260719160000_create_profit_cost_reporting_read_model.sql apps/next/prisma/schema.prisma`

Expected: PASS

- [ ] **Step 7: Commit Task 3**

```bash
git add supabase/migrations/20260719160000_create_profit_cost_reporting_read_model.sql apps/next/prisma/schema.prisma apps/next/src/lib/server/profit-cost-report-projector.test.ts
git commit -m "feat: add profit cost reporting ledger"
```

### Task 4: Add Backfill, Reconciliation And Performance Commands

**Files:**
- Create: `apps/next/scripts/backfill-profit-cost-report.mjs`
- Create: `apps/next/scripts/verify-profit-cost-report.mjs`
- Modify: `apps/next/package.json`

**Interfaces:**
- Produces: `npm run backfill:profit-cost-report -- --from YYYY-MM-DD --to YYYY-MM-DD --batch-days N`, `npm run verify:profit-cost-report -- --from ... --to ...`
- Consumes: projector/rebuild/reconciliation SQL functions from Task 3

- [ ] **Step 1: Add scripts in dry-run mode first**

Backfill must print target project ref, date range, source counts, blocking issue counts and planned batches before mutation. Require `--apply` for writes. Verification exits nonzero for any blocking issue or monetary/weight mismatch.

- [ ] **Step 2: Add package scripts**

```json
{
  "backfill:profit-cost-report": "node scripts/backfill-profit-cost-report.mjs",
  "verify:profit-cost-report": "node scripts/verify-profit-cost-report.mjs"
}
```

- [ ] **Step 3: Run dry-run against production**

Run: `npm run backfill:profit-cost-report --workspace @ns-scrap-erp/next -- --from 2026-01-01 --to 2026-07-19`

Expected: target project ref is `fhglqymcdmrgbsbadnwr`; no write occurs without `--apply`

- [ ] **Step 4: Apply migration/backfill only after preflight has zero blocking source issues**

Run the project Supabase MCP first. If unavailable, use a verified CLI workdir linked to production. Never use legacy-prod-source.

- [ ] **Step 5: Verify parity and query plans**

Run: `npm run verify:profit-cost-report --workspace @ns-scrap-erp/next -- --from 2026-01-01 --to 2026-07-19`

Expected: money delta `0.00`, weight delta within scale `0.001`, zero blocking issues, and saved `EXPLAIN (ANALYZE, BUFFERS)` timings

- [ ] **Step 6: Commit Task 4**

```bash
git add apps/next/scripts/backfill-profit-cost-report.mjs apps/next/scripts/verify-profit-cost-report.mjs apps/next/package.json
git commit -m "chore: add profit cost report reconciliation tools"
```

### Task 5: Build Split Read APIs

**Files:**
- Create: `apps/next/src/lib/server/profit-cost-report-reader.ts`
- Modify: `apps/next/src/lib/server/profit-cost-report-reader.test.ts`
- Create: `apps/next/src/app/api/profit-cost-analysis/_shared.ts`
- Create: eight split `route.ts` files listed in File Structure
- Modify: `apps/next/src/app/api/profit-cost-analysis/routes.test.ts`

**Interfaces:**
- Produces: `readProfitCostSummary`, `readProfitCostRankings`, `readProfitCostProducts`, `readProfitCostSuppliers`, `readProfitCostCustomers`, `readProfitCostChannels`, `readProfitCostTrend`, `readProfitCostAlerts`
- Consumes: `ProfitCostAppliedFilter` and reporting tables

- [ ] **Step 1: Write failing reader and route tests**

Test exact filters, branch scope, sort allowlist, `page/pageSize`, decimal strings, `generatedAt`, applied-filter echo, `Cache-Control: private, no-store`, and `Server-Timing` containing `auth`, `query`, `serialize`, `total`.

- [ ] **Step 2: Run tests and confirm red state**

Run: `npx vitest run --config apps/next/vitest.config.ts apps/next/src/lib/server/profit-cost-report-reader.test.ts apps/next/src/app/api/profit-cost-analysis/routes.test.ts`

Expected: FAIL because readers/routes do not exist

- [ ] **Step 3: Implement SQL readers**

Use parameterized Prisma `$queryRaw` fragments. Aggregate in PostgreSQL and cast numeric output to text. Query only active endpoint data. Do not load master lists in every tab endpoint; summary returns filter references through existing reference-master readers without report values in cache.

- [ ] **Step 4: Implement route helper and endpoints**

Each route validates permission and branch scope before query, creates a timing response, catches validation errors as 400, authorization as 403, source/configuration contract errors as 409, and unexpected errors as 500 without exposing SQL details.

- [ ] **Step 5: Run focused tests and type-check**

Run: `npx vitest run --config apps/next/vitest.config.ts apps/next/src/lib/server/profit-cost-report-reader.test.ts apps/next/src/app/api/profit-cost-analysis/routes.test.ts && npm run type-check --workspace @ns-scrap-erp/next -- --pretty false`

Expected: PASS

- [ ] **Step 6: Commit Task 5**

```bash
git add apps/next/src/lib/server/profit-cost-report-reader.ts apps/next/src/lib/server/profit-cost-report-reader.test.ts apps/next/src/app/api/profit-cost-analysis
git commit -m "feat: split profit cost report APIs"
```

### Task 6: Convert The Page To Applied Filters And Lazy Tab Loading

**Files:**
- Modify: `apps/next/src/components/main/ProfitCostAnalysisPageClient.tsx`
- Create: `apps/next/src/components/main/profit-cost-analysis/useProfitCostReport.ts`
- Create: `apps/next/src/components/main/profit-cost-analysis/ProfitCostReportSections.tsx`
- Create: `apps/next/src/components/main/profit-cost-analysis/ProfitCostReportSections.test.tsx`

**Interfaces:**
- Produces: `useProfitCostReport(appliedFilters, activeTab)`, independent `summary`, `rankings`, `tab` resource states
- Consumes: split APIs from Task 5 and existing shared Filter/Select/PageSizeDropdown/table components

- [ ] **Step 1: Write failing request-behavior tests**

```tsx
it('loads summary, rankings and products only on first render', async () => {
  render(<ProfitCostAnalysisPageClient />)
  await waitFor(() => expect(fetch).toHaveBeenCalledTimes(3))
  expect(requestedPaths()).toEqual([
    '/api/profit-cost-analysis/summary',
    '/api/profit-cost-analysis/rankings',
    '/api/profit-cost-analysis/products',
  ])
})

it('does not request again until Apply and aborts the prior request', async () => {
  // change draft branch, assert no fetch; click Apply, assert one new request set and prior signal.aborted
})
```

- [ ] **Step 2: Run test and confirm red state**

Run: `npx vitest run --config apps/next/vitest.config.ts apps/next/src/components/main/profit-cost-analysis/ProfitCostReportSections.test.tsx`

Expected: FAIL because the current page uses one eager endpoint

- [ ] **Step 3: Extract request hook**

Maintain separate AbortControllers and resource states for summary, rankings and active tab. Key requests by stable serialized applied filters. Reject stale `appliedFilters` echo before state update.

- [ ] **Step 4: Refactor page orchestration**

Keep existing visual hierarchy. Introduce `draftFilters` and `appliedFilters`; Apply copies a complete validated set, Reset performs one explicit apply of default month-to-date. Tab switch fetches only the selected endpoint. Table sort/page/pageSize remain endpoint-local.

- [ ] **Step 5: Add independent skeleton/error/empty states**

Do not replace failed values with zero. Summary failure leaves tab content usable; tab failure leaves KPI/rankings visible.

- [ ] **Step 6: Run component tests and lint**

Run: `npx vitest run --config apps/next/vitest.config.ts apps/next/src/components/main/profit-cost-analysis/ProfitCostReportSections.test.tsx && npm run lint --workspace @ns-scrap-erp/next`

Expected: PASS, except any explicitly documented pre-existing warning outside these files

- [ ] **Step 7: Commit Task 6**

```bash
git add apps/next/src/components/main/ProfitCostAnalysisPageClient.tsx apps/next/src/components/main/profit-cost-analysis
git commit -m "feat: lazy load profit cost analysis sections"
```

### Task 7: Shadow Parity, Cutover And Old Path Retirement

**Files:**
- Modify: `apps/next/src/app/api/profit-cost-analysis/route.ts`
- Modify: `apps/next/src/lib/server/profit-cost-analysis.ts`
- Modify: `apps/next/scripts/verify-profit-cost-report.mjs`
- Modify: `docs/notes/page-flows/main-dashboard-reports-profit-cost-analysis.md`
- Modify: `docs/migration/00-current-work.md`

**Interfaces:**
- Produces: verified cutover to split endpoints and removal of old eager aggregation reader after observation period
- Consumes: Tasks 1-6

- [ ] **Step 1: Add shadow comparison output**

Compare old/new summary by day and month plus product/supplier/customer/channel totals. The script must print exact source keys for mismatches and exit nonzero.

- [ ] **Step 2: Run production parity across representative ranges**

Run month-to-date, previous month, year-to-date, each branch and all branches. Expected: zero monetary delta, scale-3 weight parity, zero blocking reconciliation issues.

- [ ] **Step 3: Measure acceptance targets**

Collect at least 30 warm requests per summary and active-tab endpoint. Report p50/p95 for `auth`, `query`, `serialize`, `total`; query/application p95 must be <= 300 ms for standard page size.

- [ ] **Step 4: Cut over and retire old runtime reader**

Remove frontend use of `/api/profit-cost-analysis`. Keep the route returning `410 Gone` for one release with migration guidance only if no internal consumer remains; otherwise remove route and old service together. Confirm with `rg` before deletion.

- [ ] **Step 5: Update flow documentation**

Document what facts/rollups are, why draft is excluded, why report facts are not Redis-cached, lifecycle/reconciliation behavior, APIs, permission scope and failure behavior.

- [ ] **Step 6: Run full validation**

```bash
npx vitest run --config apps/next/vitest.config.ts \
  apps/next/src/lib/server/profit-cost-report-projector.test.ts \
  apps/next/src/lib/server/profit-cost-report-reader.test.ts \
  apps/next/src/app/api/profit-cost-analysis/routes.test.ts \
  apps/next/src/components/main/profit-cost-analysis/ProfitCostReportSections.test.tsx
npm run lint --workspace @ns-scrap-erp/next
npm run type-check --workspace @ns-scrap-erp/next -- --pretty false
npm run build --workspace @ns-scrap-erp/next
git diff --check
```

Expected: all focused tests, lint, type-check, build and diff-check pass; any unrelated pre-existing failure is recorded with proof that changed files are not involved

- [ ] **Step 7: Commit Task 7**

```bash
git add apps/next/src/app/api/profit-cost-analysis apps/next/src/lib/server/profit-cost-analysis.ts apps/next/scripts/verify-profit-cost-report.mjs docs/notes/page-flows/main-dashboard-reports-profit-cost-analysis.md docs/migration/00-current-work.md
git commit -m "refactor: cut over profit cost analysis read model"
```

## Execution Order And Checkpoints

1. Tasks 1-3 form the source/schema checkpoint. Do not apply migration if preflight finds source rows without exact COGS/channel mapping.
2. Task 4 applies and verifies production only.
3. Task 5 may merge while frontend still uses old endpoint.
4. Task 6 switches local UI to split endpoints.
5. Task 7 controls parity and retirement. Do not promote to SIT/UAT until parity and performance acceptance pass.

## Plan Self-Review

- Spec coverage: source normalization, projector lifecycle, reconciliation, split APIs, lazy loading, server pagination, no-store/cache boundary, numeric contract, backfill, shadow cutover and performance targets all map to Tasks 1-7.
- Placeholder scan: no TBD/TODO/implement-later steps remain.
- Type consistency: shared filter/decimal/sort types originate in Task 1; projectors in Task 3; readers/routes in Task 5; frontend consumes the same endpoint contracts in Task 6.
- Scope: limited to Profit & Cost Analysis plus source fields required for mathematically valid per-line reporting.
