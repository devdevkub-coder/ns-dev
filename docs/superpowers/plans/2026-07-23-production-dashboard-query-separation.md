# Production Dashboard Query Separation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Separate the Production Dashboard data path from the shared production report reader while preserving the current Dashboard response contract and enforcing scoped, correct production facts.

**Architecture:** Keep `GET /api/production/dashboard` as a thin route. Add a Dashboard-specific module that owns response composition and a query implementation that reads only Dashboard data. Reuse only narrow, behavior-neutral helpers for branch scope, ledger facts, and JSON serialization; do not change Report or standalone Machine Utilization behavior in this batch.

**Tech Stack:** Next.js App Router, TypeScript, Prisma, PostgreSQL/Supabase, Vitest.

## Global Constraints

- Scope is limited to `/production/dashboard` and `GET /api/production/dashboard`.
- Do not change `/api/production/report` or `/api/production/machine-utilization` behavior.
- Production relational IDs remain `BigInt`; `stock_ledger.ref_id` remains polymorphic text.
- Database is the source of truth; output, loss, and WIP reconcile to active PI/PO2 ledger facts.
- Production fact responses use `Cache-Control: private, no-store`.
- No DB migration is added without measured need from `EXPLAIN ANALYZE`.

---

### Task 1: Add Dashboard contract tests

**Files:**
- Create: `apps/next/src/lib/server/production-dashboard.test.ts`
- Create: `apps/next/src/app/api/production/dashboard/route.test.ts`

**Interfaces:**
- Tests will import the Dashboard module contract and route handler.
- Tests will assert branch scope, WIP scope, output/loss semantics, safe JSON, zero variance, and no-store headers.

- [ ] **Step 1: Write failing service tests** for a scoped dashboard result, non-loss output grouping, and zero-valued variance.
- [ ] **Step 2: Run the focused test file and confirm the new module is missing or behavior is not yet implemented.**
- [ ] **Step 3: Add route tests** that mock the Dashboard service and assert `allowedBranchIds` is passed and the response includes `Cache-Control: private, no-store`.
- [ ] **Step 4: Run the focused tests again and keep the expected failures until the implementation tasks are complete.**

### Task 2: Create the Dashboard service and query module

**Files:**
- Create: `apps/next/src/lib/server/production-dashboard.ts`
- Create: `apps/next/src/lib/server/production-dashboard-query.ts`
- Modify: `apps/next/src/app/api/production/dashboard/route.ts`

**Interfaces:**
- `loadProductionDashboard(filters: { dateFrom: string; dateTo: string; allowedBranchIds: bigint[] | null }): Promise<ProductionDashboardResponse>`
- The service returns the existing fields: `daily`, `machineUtil`, `monthly`, `rows`, `summary`, `byStatus`, and `topProducts`.
- The route passes auth-derived branch scope and does not perform aggregation itself.

- [ ] **Step 1: Move current Dashboard aggregation into pure service functions** for daily/monthly, abnormal loss, status, top products, and machine utilization.
- [ ] **Step 2: Implement a Dashboard-specific Prisma query** with explicit `select`, date scope, branch scope, and active child relations; do not call `loadProductionMetrics()`.
- [ ] **Step 3: Keep WIP as a separate scoped query path** and compose it into the Dashboard summary.
- [ ] **Step 4: Update the route to authenticate, call `getAllowedBranchIds(context)`, call `loadProductionDashboard`, and return only the service response.**

### Task 3: Enforce metric and serialization correctness

**Files:**
- Modify: `apps/next/src/lib/server/production-dashboard.ts`
- Modify: `apps/next/src/lib/server/production-dashboard-query.ts`
- Modify: `apps/next/src/app/api/production/dashboard/route.ts`

- [ ] **Step 1: Group machine metrics by `machine_id`** while retaining the display name; count active non-loss output receipt rows and sum output quantity/cost.
- [ ] **Step 2: Group Top 10 by actual non-loss output product receipts** and preserve the current response keys plus explicit unit labels where the UI contract requires them.
- [ ] **Step 3: Remove truthiness fallback for computed variance** and use an explicit source-availability rule.
- [ ] **Step 4: Convert internal IDs to JSON-safe strings at the response boundary and keep Decimal conversion/rounding in one place.**
- [ ] **Step 5: Add `Cache-Control: private, no-store` to the Dashboard response.**

### Task 4: Validate query plans and schema needs

**Files:**
- Inspect: `apps/next/prisma/schema.prisma`
- Inspect: `supabase/migrations/20260613093000_optimize_production_dashboard_queries.sql`
- Inspect: `supabase/migrations/20260613124402_optimize_production_report_ledger_lookup.sql`
- Create only if required: `supabase/migrations/<timestamp>_optimize_production_dashboard.sql`

- [ ] **Step 1: Run the Dashboard queries against dev-target with representative filters.**
- [ ] **Step 2: Capture `EXPLAIN ANALYZE` for production order, child relation, and ledger lookups.**
- [ ] **Step 3: Add only evidence-backed indexes, then document the reason and rollback shape.**
- [ ] **Step 4: Confirm no identifier type change is needed.**

### Task 5: Run validation and update task status

**Files:**
- Modify: `docs/notes/page-flows/production-production-dashboard.md`
- Modify: `docs/migration/00-current-work.md`
- Modify: `docs/migration/16-next-production-progress.md`

- [ ] **Step 1: Run focused Dashboard tests.**
- [ ] **Step 2: Run `npm run lint --workspace @ns-scrap-erp/next`.**
- [ ] **Step 3: Run `npm run type-check --workspace @ns-scrap-erp/next`.**
- [ ] **Step 4: Run `npm run build --workspace @ns-scrap-erp/next`.**
- [ ] **Step 5: Run `git diff --check`.**
- [ ] **Step 6: Mark only verified `DASH-*` tasks complete and record remaining risks.**
