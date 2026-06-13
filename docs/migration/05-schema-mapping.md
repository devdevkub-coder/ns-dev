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
| `impurities` | new target master | `impurities` | additive master for user-maintained impurity names; WTI/WTO line UI uses active impurity rows when deduction mode is `หัก` or `หัก%`, while durable ticket persistence still needs a normalized receipt-line reference design |
| `accounts` | keep | `cash_bank_accounts` or `accounts` | clarify scope |
| `purchase_bills` | refactor | `purchase_bills` + `purchase_bill_lines` + receipt/PO allocation lines + supplier printable snapshot + header discount expense entry | move `items jsonb` to lines; Stock bills choose receipt lines and allocate to PO or Spot Buy; line items must keep `ราคาหน้าใบ` / `sales_price` for Sale Tracking commission; target has only header-level `ส่วนลดท้ายใบ`, no line-item discount; PB owns supplier printable fields (`name/tax/address/phone/sale contact`) so print/RV reads do not change when Supplier master changes later |
| `/daily/weight-tickets` prototype | refactor | `weight_tickets` + `weight_ticket_lines` + ticket images | target has no plain `WT` document; inbound receiving issues `ใบรับของ / Weight Ticket In` with `WTI{branchCode}{YYMM}-NNNN`, outbound delivery issues `ใบส่งของ / Weight Ticket Out` with `WTO{branchCode}{YYMM}-NNNN`; header needs direction, auto document date/time/entered-by, branch, party, vehicle plate; lines need gross weight, deduction mode, impurity reference when deducted, deduction value, net weight; PO/Spot cut happens later in Stock purchase bill allocation |
| `sales_bills` | refactor | `sales_bills` + `sales_bill_lines` + purchase/stock/PO allocation lines | move `items jsonb` to lines; Trading sales choose multiple purchase bills first, auto-fill sale lines from purchase bills, allow manual stock lines, and allocate each line to PO Sell when applicable |
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
- purchase mode split: Stock + PO, Stock + Spot, Trading + PO, Trading + Spot
- purchase bill supplier printable snapshot: create/supplier-swap saves `supplier_name_snapshot`, `supplier_tax_id_snapshot`, `supplier_address_snapshot`, `supplier_phone_snapshot`, and `supplier_sales_rep_snapshot`; normal edit preserves snapshot unless Supplier changes
- `ใบรับของ / WTI` header/line mapping with system-owned date/time/entered-by, vehicle plate, branch, product weights, impurity deduction mode, and image evidence
- `ใบส่งของ / WTO` header/line mapping for outbound delivery evidence, weights, vehicle/customer context, and image evidence
- no plain `WT` document number in target; use `WTI`/`WTO` prefixes and keep status for lifecycle only
- many-to-many allocation for Stock purchase bill receipt lines to PO/Spot cuts
- mixed Stock bill allocation where one receipt line can be split between PO and Spot Buy when receipt weight exceeds PO remaining
- purchase bill item `ราคาหน้าใบ` / `sales_price` mapping for Sale Tracking commission calculation
- header-only purchase bill discount mapping: `ส่วนลดท้ายใบ` posts as expense/separate entry and does not reduce product cost/WAC/Cost Pool
- Trading sales bill source allocation: selected purchase bills can be many-to-one sales bill sources, manual stock lines create stock out, and PO Sell cuts happen at sales bill line level
- PO Buy short-close action (`ปิดรับไม่ครบ`) with reason/status log and remaining quantity release
- Cost Pool eligibility filter by product metal group: copper/brass only
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
