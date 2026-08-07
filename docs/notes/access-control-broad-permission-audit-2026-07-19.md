# Access Control Broad Permission Audit 2026-07-19

## Scope

ตรวจ `finance.cash.view` ที่ยังเหลือใน active Next app หลังย้าย action สำคัญของเงินสำรองจ่าย, payment approval, WTI open-bill, บิลซื้อ, บิลขาย, supplier payment และ customer receipt แล้ว

## Completed In This Batch

| Flow | Read | Create/Edit | Cancel | Source of truth |
|---|---|---|---|---|
| Supplier advance payment (ADV) | `purchase.advance_payments.view` | `purchase.advance_payments.create`, `purchase.advance_payments.update` | `purchase.advance_payments.cancel` | action permission catalog + API checks |
| Daily expense | `daily.expenses.view` | `daily.expenses.create` | `daily.expenses.cancel` | action permission catalog + API checks |

Legacy `finance.cash.view` role assignments are mapped to the new actions by migration `20260719011602_access_control_advance_expense_actions.sql`; runtime routes do not fall back to the legacy code.

## Remaining Legacy Surface

The following families still use `finance.cash.view` and require separate business decisions before replacing the check, because their current endpoint combines reporting, reference data, reconciliation, and/or write operations:

- `dual-costing/*`: Allocation Ledger, Deal Margin Report, cost pool, matching and reconciliation surfaces.
- `finance/*`: bank/cash position, AR/AP, customer/supplier advances and foreign-currency operations.
- `trading/*`: dashboard, cost sources and matching.
- `purchase/receipt-vouchers`, `purchase/po-buy`, payment history and payment cancellation.
- `sales/customer-advances`, sales/purchase option endpoints and stock-return actions.
- `daily/transfers`, bill-swap history, transaction-ledger and expense detail pages.

## Decision Rules For Next Batches

1. Read/report endpoints receive a `*.view` code with branch scope applied.
2. Create, update, cancel, approve, pay, receive and export are separate actions only where the route has a distinct business transition.
3. A combined endpoint must be split by request method or explicit action before changing authorization; it must not infer permission from hidden UI state.
4. Legacy grants are migrated to explicit actions before route enforcement, then the old broad permission can be retired only after role-assignment and direct-API regression checks pass.
5. No runtime fallback to `finance.cash.view` is allowed after a route is migrated.

## Validation

- Targeted ESLint passed for ADV, expense and navigation changes.
- Workspace TypeScript check passed.
- `git diff --check` is required before commit.
- Database migrations are created but still require controlled apply to `production`; blanket `supabase db push` is blocked by documented remote migration-history drift.
