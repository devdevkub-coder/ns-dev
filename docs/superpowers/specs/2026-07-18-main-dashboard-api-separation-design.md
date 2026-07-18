# Main Dashboard API Separation Design

**Date:** 2026-07-18
**Scope:** `owner-daily`, `daily-report`, `dashboard`, and `analytics-dashboard`

## Goal

แยก API และ query contract ของ dashboard แต่ละหน้า เพื่อไม่ให้แต่ละหน้าคำนวณข้อมูลของหน้าอื่น ลดเวลาโหลดและลดแรงกดดันต่อ Prisma/Supabase transaction pooler โดยรักษาตัวเลขและ business rules เดิม

## Approved Architecture

แต่ละหน้ามี route และ server service ของตัวเอง:

| Page | Route | Service responsibility |
| --- | --- | --- |
| Owner Daily | `/api/owner-daily` | Operational daily control summary |
| Daily Report | `/api/daily-report` | Day/range purchase, sales, expense, and cash report |
| Dashboard | `/api/dashboard` | KPI, finance, aging, cash position, stock, and historical summary |
| Analytics Dashboard | `/api/analytics-dashboard` | Trend, ranking, group, and top-entity analytics |

Shared helpers may contain date normalization, active-status rules, business-code validation, permission scope resolution, response source-state, and reference-master access. A page service must not call another page service or return another page's data as an accidental side effect.

## Query Contracts

### Owner Daily

Read only the selected date's operational inputs and the minimum as-of data required by the existing owner-daily cards:

- outstanding receivables and payables
- today's bank/cash movement
- today's expenses
- due loan schedules
- pending purchase/sales counts and trading pending count
- finished-goods stock quantity/value
- production WIP total
- current cash position needed by the cash plan

Do not load finance dashboard statements, historical monthly rows, ranking data, sales line facts for analytics, full stock ledger relations, or production detail metrics.

### Daily Report

Read only the requested day/range's purchase bills, sales bills, expenses, cash movement, group/product breakdown, and daily summary. Do not build finance statements, historical KPI deltas, full stock summaries, or owner-only pending data.

### Dashboard

Read KPI, finance summary, aging, cash position, stock summary, and historical rows required by dashboard controls. Do not build daily-report tables, owner-only loan/expense lists, or analytics payloads unless the dashboard contract explicitly requires the field.

### Analytics Dashboard

Read only trend, ranking, group, and top customer/supplier/product facts for the requested range. Do not load finance statement detail, loan schedules, full stock ledger, or owner pending data.

## Data and Cache Rules

- Database remains the source of truth for all financial, stock, permission, transaction, balance, and report facts.
- API report responses use `private, no-store` unless an explicit approved contract changes this.
- Branch/customer/supplier/product reference options use the existing shared reference-master cache with complete scope and permission dimensions in the key.
- Search caches normalize the query, use short TTL, bounded results, and no PII in logs.
- Cache miss reads the database. No hardcoded, silent fallback, skip-row, or scope substitution is allowed.
- Writes invalidate related reference keys only after the database write succeeds.

## Runtime and Error Contract

- Prisma read concurrency is bounded to a maximum of four tasks and must remain compatible with `DATABASE_POOL_MAX=1`.
- Queries use explicit `select` fields and bounded date/range predicates where the business contract permits.
- Each API keeps the existing auth and permission check and returns the common error shape:

```json
{
  "code": "DATABASE_ERROR",
  "error": "โหลดข้อมูลไม่ได้"
}
```

- Errors must preserve auth/permission status, identify the operation in server logs, and avoid PII/raw query logging.

## Batch Decomposition

1. **Batch 1: API contract and route separation**
   - define response types per page
   - stop aliasing every route to one full payload contract
   - preserve current client behavior while introducing explicit service boundaries
2. **Batch 2: Owner Daily query reduction**
   - implement the minimum operational query set
   - reuse `loadProductionTotalWipQty` and shared cash/reference helpers
   - verify values against the current implementation
3. **Batch 3: Daily Report query reduction**
   - isolate day/range report queries and line facts needed by its tables
   - remove finance, historical, owner, and full stock work
4. **Batch 4: Dashboard query reduction**
   - keep finance/stock/historical calculations in the dashboard service
   - remove daily-report and owner-only payload work
5. **Batch 5: Analytics query reduction**
   - isolate trend/ranking queries and response shape
   - remove finance/loan/stock work not consumed by analytics
6. **Batch 6: Shared validation, observability, documentation, and regression checks**
   - add timing/query-count checks
   - compare representative outputs before/after
   - update flow/cache documentation

## Acceptance Criteria

- Four APIs have distinct service/query contracts and no page calls another page service.
- Each response contains only fields used by its page contract.
- No financial, stock, permission, transaction, or report response is persisted in browser cache.
- Cache scope/invalidation rules remain centralized.
- Type-check, lint, build, and `git diff --check` pass.
- Representative same-date/range comparisons show no unintended business-value changes.
- Local and SIT logs show no pool acquisition timeout or 500 caused by dashboard reads.
- Server duration and response size are recorded for each route during validation.
