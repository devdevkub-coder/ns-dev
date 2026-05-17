# 05 Schema Mapping

## Objective

ใช้ map จาก schema เดิมไป schema เป้าหมาย เพื่อควบคุม migration ให้ตรวจสอบได้

## Mapping Rules

- ถ้าตารางเดิม valid และ normalize พอ ให้ `keep + clean`
- ถ้าตารางเดิมมี business value แต่โครงไม่ดี ให้ `refactor`
- ถ้าตารางเดิมผิดหลักเชิงโครงสร้าง ให้ `replace`

## High-Level Mapping

| Legacy Table | Direction | Target Direction | Notes |
|---|---|---|---|
| `branches` | keep | `branches` | cleanup keys and metadata |
| `warehouses` | keep | `warehouses` | keep with FK cleanup |
| `customers` | keep | `customers` | review business key and branch access |
| `suppliers` | keep | `suppliers` | dedupe and validate data quality |
| `products` | keep | `products` | add grade/status sub-structure if needed |
| `accounts` | keep | `cash_bank_accounts` or `accounts` | clarify scope |
| `purchase_bills` | refactor | `purchase_bills` + `purchase_bill_lines` | move `items jsonb` to lines |
| `sales_bills` | refactor | `sales_bills` + `sales_bill_lines` | move `items jsonb` to lines |
| `payments` | refactor | `supplier_payments` + allocations | move `lines jsonb` out |
| `receipts` | refactor | `customer_receipts` + allocations | normalize allocation model |
| `stock_ledger` | refactor | `inventory_transactions` + lines | review event model |
| `po_buys` | refactor | `purchase_orders` + lines | normalize PO structure |
| `po_sells` | refactor | `sales_orders` + lines | normalize PO structure |
| `production_orders` | refactor | `production_orders` | extend input/output references |
| `production_inputs` | keep/refactor | `production_inputs` | validate costing logic |
| `production_outputs` | keep/refactor | `production_outputs` | validate output model |
| `roles` / `roles_config` | replace | `roles`, `permissions`, mapping tables | remove duplication |
| `public.users` | replace | `app_users` linked to `auth.users` | no local password storage |
| `user_profiles` | refactor | merge into `app_users` | keep branch access semantics |
| `opening_balance` | replace | `opening_balance_entries` | remove singleton jsonb |

## Transform Topics

- document headers and line extraction
- JSON to relational mapping
- role and permission normalization
- app user and auth user linking
- transaction-to-ledger reconciliation
- opening balance normalization

## Required Deliverables per Table

- legacy definition
- target definition
- field mapping
- transform rule
- default value rule
- data quality issues
- test query for validation
