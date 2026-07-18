# Main Dashboard API Separation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** แยก query/service และ response contract ของ `owner-daily`, `daily-report`, `dashboard` และ `analytics-dashboard` เพื่อให้แต่ละหน้าโหลดเฉพาะข้อมูลที่ใช้จริงและคงตัวเลขธุรกิจเดิม

**Architecture:** Route แต่ละหน้าจะเรียก service เฉพาะหน้า และ service จะใช้ shared helper สำหรับ date scope, permission, status และ reference cache เท่านั้น `main-dashboards.ts` จะไม่เป็นตัวสร้าง payload รวมของทุกหน้าอีกต่อไป แต่จะแตก logic ตาม ownership อย่าง reviewable

**Tech Stack:** Next.js App Router, TypeScript, Prisma, Supabase transaction pooler, existing `dailyFetchJson`, existing reference-master cache

## Global Constraints

- Database remains the source of truth for financial, stock, permission, transaction, balance, and report facts.
- Prisma read concurrency is bounded to a maximum of four tasks and remains compatible with `DATABASE_POOL_MAX=1`.
- Report API responses use `private, no-store` unless an explicit approved contract changes this.
- No hardcoded, silent fallback, skip-row, scope substitution, or runtime legacy image/base64 fallback.
- Never stage unrelated dirty files: `.codex/config.toml`, customer-advance files, `docs/migration/10-environment-status.md`, or untracked sales-bills screenshots.
- Use `new-origin` only for development promotion; do not mutate legacy `origin`.

---

### Task 1: Establish Shared Report Contracts and Route Dispatch

**Files:**
- Create: `apps/next/src/lib/server/dashboard-report-contracts.ts`
- Create: `apps/next/src/lib/server/dashboard-report-shared.ts`
- Modify: `apps/next/src/app/api/dashboard/route.ts`
- Modify: `apps/next/src/app/api/owner-daily/route.ts`
- Modify: `apps/next/src/app/api/daily-report/route.ts`
- Modify: `apps/next/src/components/main/MainDashboardsPageClient.tsx`
- Test: `apps/next/src/lib/server/__tests__/dashboard-report-contracts.test.ts`

**Interfaces:**
- `MainDashboardFilter` remains the normalized input for all report services.
- `DashboardReportSourceState` and date filter types are shared.
- Each route exports `GET(request: NextRequest)` and calls only its own service after `getCurrentAuthContext()` and `requirePermission()`.
- Add `apps/next/src/app/api/analytics-dashboard/route.ts` with the same auth/error wrapper.

- [ ] **Step 1: Write contract tests for route-specific payload boundaries**

```ts
import { describe, expect, it } from 'vitest'
import { assertDashboardPayload, assertOwnerDailyPayload } from '../dashboard-report-contracts'

describe('dashboard report contracts', () => {
  it('accepts owner payload without other report sections', () => {
    expect(() => assertOwnerDailyPayload({ filters: { date: '2026-07-18', from: '2026-07-01', to: '2026-07-18' }, ownerDaily: { actualActivity: { cashIn: 0, cashOut: 0, expenseOut: 0, fgQty: 0, fgValue: 0, net: 0, paymentOut: 0 }, cashPlan: { available: 0, expectedIn: 0, expectedOut: 0, gap: 0 }, due: { ap: [], ar: [] }, expensesToday: [], loanToday: [], pending: {} }, sourceState: { limitations: [], writeActionsEnabled: false } })).not.toThrow()
  })

  it('rejects a payload with an unrelated full report section', () => {
    expect(() => assertOwnerDailyPayload({ dashboard: {}, filters: { date: '2026-07-18', from: '2026-07-01', to: '2026-07-18' }, ownerDaily: {}, sourceState: { limitations: [], writeActionsEnabled: false } })).toThrow()
  })
})
```

- [ ] **Step 2: Run the focused test and verify it fails**

Run: `npx vitest run --config apps/next/vitest.config.ts apps/next/src/lib/server/__tests__/dashboard-report-contracts.test.ts`
Expected: FAIL because the contract module and assertions do not exist.

- [ ] **Step 3: Implement shared types and route-specific payload guards**

Define `OwnerDailyPayload`, `DailyReportPayload`, `DashboardPayload`, and `AnalyticsDashboardPayload` as separate TypeScript types. Keep shared `filters` and `sourceState` in the shared module. Runtime guards must reject unrelated top-level keys instead of silently accepting a full payload.

- [ ] **Step 4: Split route handlers and client endpoint selection**

Each route must import one service only. Change the client endpoint mapping to:

```ts
const endpoint = mode === 'dashboard'
  ? '/api/dashboard'
  : mode === 'owner-daily'
    ? '/api/owner-daily'
    : mode === 'analytics-dashboard'
      ? '/api/analytics-dashboard'
      : '/api/daily-report'
```

Use a discriminated response type in the client so `OwnerDailyView` does not require dashboard or daily-report properties.

- [ ] **Step 5: Run focused tests and type-check**

Run: `npx vitest run --config apps/next/vitest.config.ts apps/next/src/lib/server/__tests__/dashboard-report-contracts.test.ts`
Expected: PASS.

Run: `npm run type-check --workspace @ns-scrap-erp/next -- --pretty false`
Expected: exit 0.

- [ ] **Step 6: Commit the route/contract boundary**

```bash
git add apps/next/src/lib/server/dashboard-report-contracts.ts apps/next/src/lib/server/dashboard-report-shared.ts apps/next/src/app/api/dashboard/route.ts apps/next/src/app/api/owner-daily/route.ts apps/next/src/app/api/daily-report/route.ts apps/next/src/app/api/analytics-dashboard/route.ts apps/next/src/components/main/MainDashboardsPageClient.tsx apps/next/src/lib/server/__tests__/dashboard-report-contracts.test.ts
git commit -m "refactor(dashboard): separate report api contracts"
```

---

### Task 2: Extract Owner Daily Service and Reduce Its Query Set

**Files:**
- Create: `apps/next/src/lib/server/owner-daily-dashboard.ts`
- Modify: `apps/next/src/app/api/owner-daily/route.ts`
- Modify: `apps/next/src/lib/server/production-reports.ts` only if the existing WIP helper needs a typed branch scope parameter
- Test: `apps/next/src/lib/server/__tests__/owner-daily-dashboard.test.ts`
- Update: `docs/notes/Main Dashboard Reports Flow.md`

**Interfaces:**
- `buildOwnerDailyDashboard(filter: MainDashboardFilter): Promise<OwnerDailyPayload>`
- Reuse `cashBalancesForDates` through a shared helper with one bank read.
- Reuse `loadProductionTotalWipQty` for WIP, not `loadProductionMetrics`.

- [ ] **Step 1: Add characterization fixtures for the current owner payload**

Create a fixture with one overdue receivable, one overdue payable, one expense, one loan schedule, one pending bill, one bank movement, and one FG ledger movement. Assert the returned owner fields and exact cash-plan arithmetic.

- [ ] **Step 2: Run the characterization test before extraction**

Run: `npx vitest run --config apps/next/vitest.config.ts apps/next/src/lib/server/__tests__/owner-daily-dashboard.test.ts`
Expected: FAIL until the isolated service exists; record the current endpoint response separately for comparison.

- [ ] **Step 3: Implement the minimum read set**

Use explicit `select` fields and date predicates. The service may read only purchase/sales balances, expenses, receipts/payments for the selected range, today's bank rows, due loans, pending trading statuses, selected FG ledger fields, active cash accounts/bank statements, and total WIP. Do not import or invoke `buildFinancialDashboard`, `salesBillLineFactsByBillId`, `loadProductionMetrics`, or historical monthly queries.

- [ ] **Step 4: Add query-boundary regression assertions**

Mock Prisma delegates and assert the service does not call `sales_bill_line_facts`, `buildFinancialDashboard`, or production detail loaders. Assert branch scope is included in purchase/sales queries when supplied.

- [ ] **Step 5: Run tests and compare response values**

Run: `npx vitest run --config apps/next/vitest.config.ts apps/next/src/lib/server/__tests__/owner-daily-dashboard.test.ts`
Expected: PASS with the fixture values unchanged.

Run the local endpoint twice with the same date and record status, duration, and response byte size. The isolated endpoint must be materially smaller than the previous full payload and must not produce a pool timeout.

- [ ] **Step 6: Commit the owner batch**

```bash
git add apps/next/src/lib/server/owner-daily-dashboard.ts apps/next/src/app/api/owner-daily/route.ts apps/next/src/lib/server/production-reports.ts apps/next/src/lib/server/__tests__/owner-daily-dashboard.test.ts docs/notes/Main Dashboard Reports Flow.md
git commit -m "perf(owner-daily): isolate operational dashboard queries"
```

---

### Task 3: Extract Daily Report Service

**Files:**
- Create: `apps/next/src/lib/server/daily-report-dashboard.ts`
- Modify: `apps/next/src/app/api/daily-report/route.ts`
- Modify: `apps/next/src/components/main/MainDashboardsPageClient.tsx`
- Test: `apps/next/src/lib/server/__tests__/daily-report-dashboard.test.ts`
- Update: `docs/notes/Main Dashboard Reports Flow.md`

**Interfaces:**
- `buildDailyReportDashboard(filter: MainDashboardFilter): Promise<DailyReportPayload>`
- `DailyReportPayload` contains only `filters`, `dailyReport`, and `sourceState`.

- [ ] **Step 1: Write a fixture test for day/range totals**

Cover purchase/sales totals, expense totals, cash movement, and one group/product row. Include a cancelled row and assert it is excluded by the existing active-status rule.

- [ ] **Step 2: Implement range-scoped selects**

Move only the bill, expense, cash movement, product group, and required line-fact aggregation into the service. Use one normalized range and bounded reads. Do not call finance dashboard, historical rows, loan schedules, full stock ledger, or owner pending queries.

- [ ] **Step 3: Wire the route and response type**

Return the daily-report contract directly and remove the route's dependency on the full main-dashboard builder.

- [ ] **Step 4: Run focused validation**

Run: `npx vitest run --config apps/next/vitest.config.ts apps/next/src/lib/server/__tests__/daily-report-dashboard.test.ts`
Expected: PASS.

Run: `npm run type-check --workspace @ns-scrap-erp/next -- --pretty false`
Expected: exit 0.

- [ ] **Step 5: Commit the daily-report batch**

```bash
git add apps/next/src/lib/server/daily-report-dashboard.ts apps/next/src/app/api/daily-report/route.ts apps/next/src/components/main/MainDashboardsPageClient.tsx apps/next/src/lib/server/__tests__/daily-report-dashboard.test.ts docs/notes/Main Dashboard Reports Flow.md
git commit -m "perf(daily-report): isolate range report queries"
```

---

### Task 4: Extract Dashboard Summary Service

**Files:**
- Create: `apps/next/src/lib/server/dashboard-summary.ts`
- Modify: `apps/next/src/app/api/dashboard/route.ts`
- Modify: `apps/next/src/lib/server/main-dashboards.ts`
- Test: `apps/next/src/lib/server/__tests__/dashboard-summary.test.ts`
- Update: `docs/notes/Main Dashboard Reports Flow.md`

**Interfaces:**
- `buildDashboardSummary(filter: MainDashboardFilter): Promise<DashboardPayload>`
- `DashboardPayload` contains only `filters`, `dashboard`, `filterOptions`, and `sourceState`.

- [ ] **Step 1: Add characterization tests for KPI, aging, cash, stock, and historical outputs**

Use representative fixtures for current and previous periods and assert KPI deltas, cash composition, aging buckets, and stock grouping.

- [ ] **Step 2: Move dashboard-only calculations**

Keep finance helpers, cash position, stock summaries, historical rows, and dashboard filter options. Remove daily-report tables, owner due lists, loan lists, and analytics ranking from this response. Preserve the bounded concurrency limit of four.

- [ ] **Step 3: Make stock reads explicit and bounded**

Select only fields used by stock totals/grouping and keep all date/scope semantics unchanged. Do not introduce a cache for stock or financial facts.

- [ ] **Step 4: Run focused and full static validation**

Run: `npx vitest run --config apps/next/vitest.config.ts apps/next/src/lib/server/__tests__/dashboard-summary.test.ts`
Expected: PASS.

Run: `npm run lint --workspace @ns-scrap-erp/next`
Expected: exit 0; existing unrelated warning may remain.

Run: `npm run type-check --workspace @ns-scrap-erp/next -- --pretty false`
Expected: exit 0.

- [ ] **Step 5: Commit the dashboard batch**

```bash
git add apps/next/src/lib/server/dashboard-summary.ts apps/next/src/app/api/dashboard/route.ts apps/next/src/lib/server/main-dashboards.ts apps/next/src/lib/server/__tests__/dashboard-summary.test.ts docs/notes/Main Dashboard Reports Flow.md
git commit -m "perf(dashboard): isolate summary queries"
```

---

### Task 5: Extract Analytics Dashboard Service

**Files:**
- Create: `apps/next/src/lib/server/analytics-dashboard.ts`
- Create: `apps/next/src/app/api/analytics-dashboard/route.ts` if Task 1 did not create it
- Modify: `apps/next/src/components/main/MainDashboardsPageClient.tsx`
- Test: `apps/next/src/lib/server/__tests__/analytics-dashboard.test.ts`
- Update: `docs/notes/Main Dashboard Reports Flow.md`

**Interfaces:**
- `buildAnalyticsDashboard(filter: MainDashboardFilter): Promise<AnalyticsDashboardPayload>`
- `AnalyticsDashboardPayload` contains only `filters`, `analytics`, and `sourceState`.

- [ ] **Step 1: Write ranking and trend fixture tests**

Cover date-range filtering, top customer/supplier/product ordering, group summary, and zero-result ranges.

- [ ] **Step 2: Implement analytics-only reads**

Use range-scoped queries and only the fields needed by analytics. Do not call finance, owner, loan, full stock, or historical report services.

- [ ] **Step 3: Wire the client to `/api/analytics-dashboard`**

Use the analytics response type in `AnalyticsDashboardView`; do not cast analytics data to a full dashboard payload.

- [ ] **Step 4: Run focused validation**

Run: `npx vitest run --config apps/next/vitest.config.ts apps/next/src/lib/server/__tests__/analytics-dashboard.test.ts`
Expected: PASS.

Run: `npm run build --workspace @ns-scrap-erp/next`
Expected: exit 0 with no route/type build errors.

- [ ] **Step 5: Commit the analytics batch**

```bash
git add apps/next/src/lib/server/analytics-dashboard.ts apps/next/src/app/api/analytics-dashboard/route.ts apps/next/src/components/main/MainDashboardsPageClient.tsx apps/next/src/lib/server/__tests__/analytics-dashboard.test.ts docs/notes/Main Dashboard Reports Flow.md
git commit -m "perf(analytics): isolate trend and ranking queries"
```

---

### Task 6: Cross-API Performance, Cache, and Documentation Gate

**Files:**
- Modify: `docs/notes/Main Dashboard Reports Flow.md`
- Modify: `docs/notes/Reference Master Cache Flow.md`
- Modify: `docs/migration/00-current-work.md`
- Test: `apps/next/src/lib/server/__tests__/dashboard-api-performance.test.ts`

**Interfaces:**
- A shared test helper records route status, duration, query count, and response byte size without logging PII.

- [ ] **Step 1: Add cross-API contract tests**

Assert each route returns only its allowed top-level keys, all report responses are `private, no-store`, and an empty range remains a valid response rather than a fabricated fallback.

- [ ] **Step 2: Run the local performance matrix**

Run each route twice with representative parameters:

```bash
curl -sS -D /tmp/owner.headers -o /tmp/owner.json 'http://localhost:3000/api/owner-daily?date=2026-07-18'
curl -sS -D /tmp/daily.headers -o /tmp/daily.json 'http://localhost:3000/api/daily-report?date=2026-07-18&from=2026-07-01&to=2026-07-18'
curl -sS -D /tmp/dashboard.headers -o /tmp/dashboard.json 'http://localhost:3000/api/dashboard?date=2026-07-18&from=2026-01-01&to=2026-07-18'
curl -sS -D /tmp/analytics.headers -o /tmp/analytics.json 'http://localhost:3000/api/analytics-dashboard?date=2026-07-18&from=2026-06-19&to=2026-07-18'
wc -c /tmp/owner.json /tmp/daily.json /tmp/dashboard.json /tmp/analytics.json
```

Expected: all responses are 200 for an authenticated local session, each route has its own payload shape, and owner/daily/analytics do not trigger unrelated service queries.

- [ ] **Step 3: Verify browser/cache boundaries**

Confirm report responses are `private, no-store`; confirm reference options still use shared cache with scoped keys; confirm no report facts are written to `localStorage`, `sessionStorage`, or Redis reference keys.

- [ ] **Step 4: Run the final validation baseline**

```bash
npm run lint --workspace @ns-scrap-erp/next
npm run type-check --workspace @ns-scrap-erp/next -- --pretty false
npm run build --workspace @ns-scrap-erp/next
git diff --check
```

Expected: all commands exit 0; record any existing warning separately.

- [ ] **Step 5: Update active handoff and flow notes**

Keep `docs/migration/00-current-work.md` short: current batch, latest decision, validation result, and next task only. Put detailed route measurements in the dashboard flow note or an archive tracker.

- [ ] **Step 6: Commit the validation/documentation batch**

```bash
git add docs/notes/Main Dashboard Reports Flow.md docs/notes/Reference Master Cache Flow.md docs/migration/00-current-work.md apps/next/src/lib/server/__tests__/dashboard-api-performance.test.ts
git commit -m "docs(perf): record dashboard api validation"
```
