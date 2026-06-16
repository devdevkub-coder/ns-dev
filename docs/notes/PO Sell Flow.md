# PO Sell Flow

## Purpose

`/sales/po-sell` records customer sell reservations / forward sell orders. It is the starting document for a planned sale before stock issue, sales bill, receipt, and dual-costing match are completed.

PO Sell is not a sales bill and does not post AR or bank movement by itself. It creates a sell commitment that other pages must read and consume.

## Legacy Baseline

Legacy source: `old-apps/legacy/index.html`, component `view-poSell`.

Legacy behavior to preserve unless a later requirement explicitly changes it:

- New PO Sell starts with `status = Open`.
- New PO Sell starts with match status `Not Matched` because no Cost Pool / Match Log has been allocated yet.
- PO Sell supports multiple product lines.
- The PO Sell page shows:
  - KPI summary for total PO, match status counts, waiting delivery quantity, waiting delivery value.
  - Top customer summary.
  - PO outstanding delivery list.
  - Main PO Sell table.
- Cancel sets `status = Cancelled`; it is not deleted.
- Confirm close sets `status = Completed` in legacy and removes the PO from active dropdowns.

## Current Next Surfaces

| Surface | Route / API | What It Should Show |
|---|---|---|
| PO Sell list | `/sales/po-sell` / `GET /api/sales/po-sell` | The created `POS...` row immediately, with `status = Open`, `matchStatus = Not Matched`, full quantity as remaining, and full amount as remaining amount |
| Pending Sales summary | `/pending-sales` / `GET /api/pending-sales` | PO Sell remaining quantity as `lockedSell` by product, affecting real pending sale calculation |
| Cost Allocator | `/dual-costing/cost-allocator` | Open PO Sell as a target that can be matched against Cost Pool |
| Match Log / Deal Margin | `/dual-costing/match-log`, `/dual-costing/deal-margin` | PO Sell match status and cost allocation history after matching |
| PO Outstanding | `/po-reports/outstanding` | Open PO Sell remaining delivery quantity and value |
| Sales Bill | `/sales/bills` / `POST /api/sales/bills` | Target create flow should select `WTO`, show WTO product lines, allocate each line to PO Sell where possible, and split any quantity over PO Sell remaining into Spot Sale |
| Stock Issue / Pending Sale | `/sales/stock-issue` | Target flow says stock issue from PO Sell should create `PSALE...` and reduce delivery commitment; implementation parity must be verified separately |

## Create Flow

| Step | Actor | Action | Result |
|---|---|---|---|
| 1 | User | Opens `/sales/po-sell` and clicks create | Form opens with empty customer/channel/branch, one item row, and delivery date |
| 2 | User | Selects customer, optional branch/channel, delivery date, products, quantities, prices, and note | Client validates required customer, delivery date, at least one item, product, qty, and price |
| 3 | System | Saves through `POST /api/sales/po-sell` | Creates `po_sells` row with generated `POS...` doc no |
| 4 | System | Stores item snapshot and totals | `items`, `qty`, `total_amount`, `remaining_qty`, and `remaining_amount` are initialized from submitted lines |
| 5 | System | Sets initial status | `status = Open`, match status derives as `Not Matched` |
| 6 | UI | Reloads PO Sell list | New row appears in the main table and can be searched by its doc no |

## Edit / Cancel Flow

PO Sell follows the same operational rule as PO Buy: edit/cancel is allowed only before the document is consumed by downstream transactions.

| Action | Allowed When | System Result |
|---|---|---|
| Edit | `status = Open`, full quantity/value still remaining, and no active downstream Sales Bill / PO Sell allocation / Dual Costing allocation fact | Updates customer/branch/channel/delivery date/items/totals and `updated_by` / `updated_at`; keeps the original doc no and created date |
| Cancel | `status = Open`, full quantity/value still remaining, and no active downstream Sales Bill / PO Sell allocation / Dual Costing allocation fact | Requires a cancel note, sets `status = Cancelled`, clears remaining quantity/value, keeps the original document for audit |

The list UI keeps `แก้ไข` and `ยกเลิก` buttons visible on every row, but disables them with a reason when the row is no longer eligible.

## Initial State After Create

| Field | Expected Initial Value |
|---|---|
| Document no | `POS{YYMM}-NNNN` in current implementation; target should be branch-aware `POS{branchCode}{YYMM}-NNNN` per Sales Flow |
| Status | `Open` / displayed as `เปิดอยู่` when Thai status mapping is applied |
| Match status | `Not Matched` |
| Matched qty | `0` |
| Matched cost | `0` |
| Remaining qty | Full PO quantity |
| Remaining amount | Full PO amount |
| Require delivery | `true` |
| AR / receipt impact | None |
| Stock ledger impact | None |

## Date Contract

PO Sell exposes only two user-facing dates:

| User-facing label | Source | Meaning |
|---|---|---|
| วันที่สร้างรายการ | `created_at` | system-created timestamp/date for audit, list sorting, and date filtering |
| วันที่ส่งมอบ | `expected_delivery` | business delivery date selected by the user |

The legacy `date` / document date column is not a separate user-facing field for PO Sell. Current writes may keep it populated from `created_at` for compatibility and document-number generation, but list/detail/export should not present it as another date.

## Where The Created Row Must Appear

After saving a new PO Sell, the same `POS...` should be visible in these read models:

1. `/sales/po-sell`
   - Main table row.
   - KPI `PO ทั้งหมด`.
   - KPI `Not Matched`.
   - Waiting delivery quantity/value.
   - Outstanding delivery block when remaining delivery is greater than zero.
2. `/pending-sales`
   - Product-level `lockedSell` should include the open PO Sell remaining quantity.
   - `realPendingSale = stock + lockedBuy - lockedSell` should decrease by that PO Sell quantity.
3. `/dual-costing/cost-allocator`
   - PO Sell dropdown/list should include it as a target for matching if it is still open and has remaining quantity.
4. `/po-reports/outstanding`
   - Sell outstanding rows should include the remaining product lines while `remainingQty > 0`.
5. `/sales/bills`
   - It should be selectable/referenceable for a PO delivery sale or line-level PO Sell allocation, depending on the active sales-bill implementation.

If the PO Sell appears only on `/sales/po-sell` but not on the downstream read models above, the list page is not wrong by itself; the issue is a read-model/status/remaining-qty integration gap.

## Status Contract

| Business Status | Raw / Current Status | Meaning | Should Be Active In Downstream Lists |
|---|---|---|---|
| `เปิดอยู่` | `Open` | Created, not cancelled/closed, still available for delivery/billing/matching | Yes |
| `เบิกบางส่วน รอออกบิล` | target follow-up | Some `PSALE` issued, not fully billed | Yes |
| `เบิกครบ รอออกบิล` | target follow-up | Full quantity issued, not fully billed | Yes, but no further stock issue beyond remaining |
| `ออกบิลบางส่วน` | target follow-up | Some sales bill quantity posted | Yes for remaining quantity |
| `ออกบิลแล้ว` | target follow-up | Fully billed | No active outstanding |
| `ปิดส่งไม่ครบ` | target follow-up | Manually closed short with reason | No active outstanding |
| `ยกเลิก` | `Cancelled` / `cancelled` | Cancelled without deleting | No |
| `ปิดแล้ว` | `Completed` / `Closed` | Closed in legacy confirm-close path | No |

Current Next implementation normalizes raw PO Sell status into a separate document-status filter/display (`เปิดอยู่`, `ยกเลิก`, `ปิดแล้ว`) and keeps match status as a separate allocation/matching state. The full Thai PO Sell status lifecycle from `Sales Flow.md` is still a target integration contract and should not be faked in the table without source facts.

## Match Status Contract

Match status is separate from delivery/billing status. The API keeps the existing English values for filtering and compatibility, but list/detail/export/filter labels must display the same Thai wording.

| Internal value | Thai display label | Meaning |
|---|---|---|
| `Not Matched` | `ยังไม่จับคู่` | No cost allocation or matched sales-bill facts yet |
| `Partially Matched` | `จับคู่บางส่วน` | Some quantity matched to cost/source |
| `Fully Matched` | `จับคู่ครบ` | Matched quantity reaches PO Sell quantity |
| `Over Matched` | `จับคู่เกิน` | Matched quantity exceeds PO Sell quantity; should be treated as an exception |
| `Cancelled` | `ยกเลิก` | PO Sell was cancelled |

Do not use match status as the only business status. A PO can be `Open` while `Not Matched`; that is normal immediately after create.

## Downstream Effects

### Pending Sales

`/pending-sales` is a read-only planning summary. It should include active PO Sell remaining quantity as `lockedSell` by product. This means a new PO Sell can create or worsen a negative `realPendingSale` when committed sell quantity exceeds available stock and locked buys.

### Cost Allocator

Cost Allocator uses PO Sell as a sell target for deal-cost matching. New PO Sell rows should be available while they are active and not fully matched/closed/cancelled.

### PO Outstanding

PO Outstanding should show remaining sell commitment while `remainingQty > 0`, excluding cancelled/closed/received-like statuses.

### Document Aging

PO Sell aging follows [[Document Aging Policy]] as `operational_pending_aging`: active PO Sell rows with remaining quantity/amount should expose age from delivery/expected date when available, otherwise from document date. Short-close, cancel, or fully billed status stops the active aging clock.

### Sales Bill / Stock Issue

Target Sales Flow now says the primary operational fulfillment should proceed through:

```text
PO Sell
-> WTO / delivery note when goods are delivered
-> Sales Bill
-> Receipt
```

Sales Bill posting should update PO Sell billed facts from `WTO -> SB` line allocation. If a WTO line exceeds PO Sell remaining quantity, only the remaining PO quantity is consumed and the excess is recorded as Spot Sale. The PO Sell list should display those facts from source data rather than manually changing status without a linked transaction.

Current implemented behavior:

- `POST /api/sales/bills` with `poSellId` validates that the PO Sell exists, is not cancelled/closed, belongs to the same customer, and does not cross branch when both branch values are present.
- Sales bill item product codes must exist in the selected PO Sell item snapshot.
- Sales bill quantity cannot exceed the selected PO Sell remaining quantity.
- On save, the sales bill and PO Sell remaining update run in one transaction.
- The PO Sell `items[].remainingQty`, `remaining_qty`, `remaining_amount`, and `cut_amount` are updated from the consumed quantities.
- Fully consumed PO Sell rows are marked raw status `Completed`, which normalizes to document status `ปิดแล้ว` and is excluded from active pending/outstanding/cost-allocator lists.

## Known Current Gaps To Verify Before Coding

- Current `POST /api/sales/po-sell` generates `POS{YYMM}-NNNN`; Sales Flow target says branch-aware `POS{branchCode}{YYMM}-NNNN`.
- Current Next PO Sell page displays normalized document status plus derived `matchStatus`; Thai business status lifecycle is not fully implemented.
- Current `/sales/bills` has bill-level PO Sell consumption; Sales Flow target still requires line-level PO Sell allocation for mixed-source sales bills.
- Current `/sales/bills` must be reworked to make `WTO` the create source before PO Sell allocation, per `docs/notes/Sales Bills Page Flow.md`.
- Current `/sales/stock-issue` / Pending Sale write integration with PO Sell needs a separate click-path audit before changing status behavior.
- `remaining_qty` / item-level `remainingQty` must be updated by actual billing/issue/matching facts, not by table-only UI state.

## Validation Checklist

- Create a PO Sell and confirm it appears on `/sales/po-sell` with `Open`, `Not Matched`, full remaining quantity, and full remaining amount.
- Confirm `/pending-sales` includes the product quantity in `lockedSell`.
- Confirm `/dual-costing/cost-allocator` can see the PO Sell as an available target.
- Confirm `/po-reports/outstanding` shows it while remaining quantity is greater than zero.
- Confirm cancelled/closed PO Sell rows do not appear in active downstream lists.
- Confirm a created PO Sell has no stock ledger, AR, receipt, or bank-statement side effect until a fulfillment/billing/receipt document is posted.
