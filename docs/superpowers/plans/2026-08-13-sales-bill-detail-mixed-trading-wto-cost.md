# Sales Bill Detail Mixed Trading/WTO Cost Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:executing-plans` to implement this plan task-by-task. Work inline on the existing SIT-aligned working line; do not create a branch/worktree or delegate unless the user explicitly requests it. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Sales Bill detail and Trading-allocation correction treat each line by its real cost owner, so a WTO-backed line keeps and displays its durable Stock COGS while a PB-derived Trading line continues to use Trading allocation facts.

**Architecture:** Keep `sales_bill_lines.cogs_amount` as the historical line-cost snapshot for detail/print consumers, and classify cost ownership per line from durable source allocations rather than from `sales_bills.transaction_mode` alone. Reuse the existing `normalizeSalesBillProfitCostSource()` reconciliation after Trading allocation correction so mixed bills preserve WTO COGS, refresh corrected Trading line COGS, update the header, and project the existing profit/cost read model in one transaction.

**Tech Stack:** Next.js App Router, React, TypeScript, Prisma, PostgreSQL/Supabase SIT, Zod, Vitest, ESLint.

## Global Constraints

- Scope is Sales Bill detail/source presentation and Trading allocation correction only.
- Do not change REST request/response shapes, database schema, migrations, Storage, Redis, browser cache, or calculation policy.
- Do not backfill or mutate `SB012608-0006`; its persisted line/header costs already reconcile.
- Preserve append-only cancellation: original `SB` Stock ledger and `SB-CANCEL` reversal remain unchanged.
- A mixed `TRADING` bill is classified per line: PB-derived lines use `trading_allocation_facts`; WTO-derived lines use `sales_bill_source_allocations` plus the persisted Stock COGS snapshot.
- A cancelled document must display the cost snapshot recorded when it was issued; it must not recompute historical cost from only currently active facts.
- A genuinely unmatched Trading line must continue to show `-` and `รอ Trading allocation`.
- `Matched COGS` remains Trading-allocation terminology. WTO-backed lines show their cost in `ต้นทุน/หน่วย` and their source as WTO; they do not invent a Trading matched fact.
- Preserve the shared analytics behavior in `sales-bill-line-facts.ts`; the detail fix must not globally change active-report calculations.
- Preserve all unrelated dirty/untracked workspace files. Do not commit, push, or deploy until explicitly requested.
- Browser/DOM UAT is not part of implementation unless the user explicitly requests it; automated and read-only runtime proof remain required.

---

## Verified Diagnosis

`SB012608-0006` is the only mixed Trading + WTO Sales Bill currently found on SIT:

| Line | Cost owner | Durable COGS | Current detail result | Correct result |
|---|---|---:|---|---|
| 1 | Trading PB `PB012608-0009:1` | 51,085.00 | 1.70 per กก. | unchanged |
| 2 | WTO `WTO012608-0005` / Stock ledger `SB` | 646.50 | `-` / Pending Trading Allocation | 25.86 per ลัง / WTO Stock source |

The header is already correct: `51,085.00 + 646.50 = 51,731.50`. The defect is in the read model:

1. `getSalesBillDetail()` calls `salesBillLineFactsForBills()` to recompute detail cost.
2. That shared reader includes only active Stock source allocations when deriving Stock COGS.
3. Cancelling the bill changes the WTO source allocation to `cancelled`, so line 2 recomputes to zero even though `sales_bill_lines.cogs_amount = 646.50` remains correct.
4. `buildDurableItems()` also classifies every line under a `TRADING` header as a Trading-allocation line, so the WTO line is labelled Pending Trading Allocation.

The correction path has a related future-risk: it currently requires a Trading Cost Source for every row and replaces header cost with Trading COGS only. On an active mixed bill this could incorrectly include a WTO row in Trading correction or omit WTO Stock COGS from the corrected header.

## Bounded Impact Map

| Surface | Evidence | Class | Action | Verification |
|---|---|---|---|---|
| `getSalesBillDetail()` / `buildDurableItems()` | modal, owner page, print, and LINE bill notification consume `SalesBillDetail` | change | use durable line COGS and line-level source kind | focused unit test + real read-only detail probe |
| `sales_bill_lines.cogs_amount` | line 2 stores 646.50 and header/line sums reconcile | preserve/source of truth | read snapshot; do not rewrite historical bill | DB read-only reconciliation |
| `sales_bill_source_allocations` | line 2 is WTO, movement owner `SALES_BILL`, status `cancelled` | change/read | classify WTO source even for cancelled detail | source label assertion |
| `trading_allocation_facts` | only line 1 has a fact, as designed | preserve | never create a Trading fact for a WTO/Stock-owned line | correction contract assertions |
| `sales-bill-line-facts.ts` | shared by tracking, exports, and analytics | preserve/out | do not modify for this detail bug | final diff review |
| `correctTradingSalesBillAllocations()` | currently validates and recreates facts for every JSON item | change | operate only on durable lines with no Stock-owned source | rollback integration script |
| Profit/Cost report projection | create/edit paths call `project_profit_cost_sales_bill`; correction does not | verify/change | call existing projector after normalized correction | integration assertion/read-model verification |
| Cancelled correction UI | backend rejects cancelled bills, modal still shows button | change | hide correction action/panel for cancelled bills | UI source-contract test |
| API/DB/schema/cache | no new contract is needed | out | leave unchanged | schema/diff scan |

---

### Task 1: Lock the line-level cost/source regression

**Files:**
- Modify: `apps/next/src/lib/server/sales-bill-detail.ts`
- Create: `apps/next/src/lib/server/sales-bill-detail.test.ts`

**Interfaces:**
- Consumes: durable `sales_bill_lines.cogs_amount`, line quantity, WTO-source presence, and Trading-fact presence.
- Produces:

```ts
export type SalesBillLineCostSourceKind =
  | 'STOCK'
  | 'TRADING_ALLOCATED'
  | 'TRADING_PENDING'
  | 'WTO_STOCK'

export function resolveSalesBillLineCostDisplay(input: {
  cogsAmount: number | null
  hasStockSource: boolean
  hasTradingAllocation: boolean
  hasWtoSource: boolean
  qty: number
  transactionMode: string | null
}): {
  sourceKind: SalesBillLineCostSourceKind
  unitCostSnapshot: number | null
}
```

- [ ] **Step 1: Write failing tests for the four cost-owner states**

```ts
import { describe, expect, it } from 'vitest'
import { resolveSalesBillLineCostDisplay } from './sales-bill-detail'

describe('resolveSalesBillLineCostDisplay', () => {
  it('keeps WTO Stock COGS visible inside a mixed Trading bill', () => {
    const result = resolveSalesBillLineCostDisplay({
      cogsAmount: 646.5,
      hasStockSource: true,
      hasTradingAllocation: false,
      hasWtoSource: true,
      qty: 25,
      transactionMode: 'TRADING',
    })

    expect(result.sourceKind).toBe('WTO_STOCK')
    expect(result.unitCostSnapshot).toBeCloseTo(25.86, 6)
  })

  it('keeps PB-derived Trading COGS allocated', () => {
    const result = resolveSalesBillLineCostDisplay({
      cogsAmount: 51085,
      hasStockSource: false,
      hasTradingAllocation: true,
      hasWtoSource: false,
      qty: 30050,
      transactionMode: 'TRADING',
    })

    expect(result.sourceKind).toBe('TRADING_ALLOCATED')
    expect(result.unitCostSnapshot).toBeCloseTo(1.7, 6)
  })

  it('does not turn a genuinely pending Trading line into zero cost', () => {
    expect(resolveSalesBillLineCostDisplay({
      cogsAmount: 0,
      hasStockSource: false,
      hasTradingAllocation: false,
      hasWtoSource: false,
      qty: 10,
      transactionMode: 'TRADING',
    })).toEqual({ sourceKind: 'TRADING_PENDING', unitCostSnapshot: null })
  })

  it('treats a generic Stock-owned row in a Trading header as Stock', () => {
    expect(resolveSalesBillLineCostDisplay({
      cogsAmount: 300,
      hasStockSource: true,
      hasTradingAllocation: false,
      hasWtoSource: false,
      qty: 10,
      transactionMode: 'TRADING',
    })).toEqual({ sourceKind: 'STOCK', unitCostSnapshot: 30 })
  })

  it('does not divide a cost snapshot by zero quantity', () => {
    expect(resolveSalesBillLineCostDisplay({
      cogsAmount: 100,
      hasStockSource: true,
      hasTradingAllocation: false,
      hasWtoSource: true,
      qty: 0,
      transactionMode: 'TRADING',
    }).unitCostSnapshot).toBeNull()
  })
})
```

- [ ] **Step 2: Run the focused test and confirm it fails before implementation**

Run from `apps/next`:

```powershell
npx vitest run src/lib/server/sales-bill-detail.test.ts
```

Expected: FAIL because `resolveSalesBillLineCostDisplay` does not exist yet.

- [ ] **Step 3: Add the minimal pure resolver**

```ts
export function resolveSalesBillLineCostDisplay(input: {
  cogsAmount: number | null
  hasStockSource: boolean
  hasTradingAllocation: boolean
  hasWtoSource: boolean
  qty: number
  transactionMode: string | null
}) {
  const sourceKind: SalesBillLineCostSourceKind = input.hasStockSource
    ? input.hasWtoSource ? 'WTO_STOCK' : 'STOCK'
    : input.transactionMode === 'TRADING'
      ? input.hasTradingAllocation
        ? 'TRADING_ALLOCATED'
        : 'TRADING_PENDING'
      : 'STOCK'
  const unitCostSnapshot = sourceKind !== 'TRADING_PENDING'
    && input.cogsAmount != null
    && input.cogsAmount > 0
    && input.qty > 0
    ? input.cogsAmount / input.qty
    : null

  return { sourceKind, unitCostSnapshot }
}
```

- [ ] **Step 4: Re-run the focused test**

Expected: all five tests PASS.

---

### Task 2: Make Sales Bill detail read the durable historical line snapshot

**Files:**
- Modify: `apps/next/src/lib/server/sales-bill-detail.ts`
- Test: `apps/next/src/lib/server/sales-bill-detail.test.ts`

**Interfaces:**
- Consumes: `SalesBillLineFact.cogs_amount`, `sales_bill_source_allocations`, and `tradingFactByLineNo` already loaded by `getSalesBillDetail()`.
- Produces: unchanged public `SalesBillDetail` DTO with corrected `sourceLabel`, `sourceType`, `matchedCogs`, and `unitCostSnapshot` values.

- [ ] **Step 1: Expose Trading-fact presence without changing the DTO**

Extend the internal return from `tradingSourceInfo()`:

```ts
return {
  hasAllocation: Boolean(tradingFact),
  label,
  matchedCogs: toNumber(tradingFact?.matched_cogs),
  sourceDocNo,
  sourceLineNo,
  sourceType,
}
```

- [ ] **Step 2: Classify each item by its own source instead of the bill header**

Inside `buildDurableItems()`, derive the line presentation after `wtoSource` is known:

```ts
const lineQty = toNumber(line.qty) || toNumber(line.net_weight)
const hasStockSource = sourceAllocations.some((allocation) => (
  allocation.movement_owner === 'SALES_BILL'
  && (allocation.source_type === 'WTO' || allocation.source_type === 'STOCK')
))
const costDisplay = resolveSalesBillLineCostDisplay({
  cogsAmount: line.cogs_amount == null ? null : toNumber(line.cogs_amount),
  hasStockSource,
  hasTradingAllocation: tradingSource.hasAllocation,
  hasWtoSource: Boolean(wtoSource),
  qty: lineQty,
  transactionMode: input.bill.transaction_mode,
})
const usesTradingAllocation = costDisplay.sourceKind === 'TRADING_ALLOCATED'
  || costDisplay.sourceKind === 'TRADING_PENDING'
const stockSourceLabel = wtoSource
  ? `WTO ${wtoSource.source_doc_no}`
  : firstSourceAllocation
    ? `${firstSourceAllocation.source_type} ${firstSourceAllocation.source_doc_no}`
    : ''
const sourceParts = usesTradingAllocation
  ? [tradingSource.label, ...salesSourceLabels]
  : [stockSourceLabel, ...salesSourceLabels]
```

For the returned item:

```ts
matchedCogs: usesTradingAllocation ? tradingSource.matchedCogs : 0,
sourceLabel: sourceParts.filter(Boolean).join(' / '),
sourceType: usesTradingAllocation
  ? tradingSource.sourceType
  : Array.from(new Set([
      ...sourceAllocations.map((allocation) => {
        if (allocation.source_type === 'WTO') {
          return allocation.movement_owner === 'SALES_BILL'
            ? 'WTO stock-out source'
            : 'WTO source'
        }
        if (allocation.source_type === 'STOCK') return 'System stock source'
        return allocation.source_type
      }),
      ...poAllocations.map((allocation) => (
        allocation.allocation_type === 'PO_SELL' ? 'PO Sell' : 'Spot Sale'
      )),
    ])).join(' / '),
unitCostSnapshot: costDisplay.unitCostSnapshot,
```

This must make line 2 read `WTO WTO012608-0005 / Spot Sale`, a source type containing `WTO stock-out source` (while retaining any existing `Spot Sale`/`PO Sell` presentation), and `25.86`, while line 1 remains Trading PB + `Matched COGS 51,085.00` + `1.70`.

- [ ] **Step 3: Stop recomputing historical detail cost through the shared active-fact reader**

Remove the `salesBillLineFactsForBills` import and replace the detail-only maps with durable line snapshots:

```ts
const lineCogsByLineNo = new Map(lineFacts.map((line) => [
  line.line_no,
  line.cogs_amount == null ? 0 : toNumber(line.cogs_amount),
] as const))
```

Use `lineCogsByLineNo` for the WTO usage-fact amount calculation. Remove `stockLineFacts`, `stockCogsByLineNo`, and `stockUnitCostByLineNo`; do not edit `sales-bill-line-facts.ts`.

- [ ] **Step 4: Add assertions that snapshot absence and pending Trading stay distinct**

Add this case to `sales-bill-detail.test.ts`:

```ts
it('does not invent cost when the durable snapshot is absent', () => {
  expect(resolveSalesBillLineCostDisplay({
    cogsAmount: null,
    hasStockSource: true,
    hasTradingAllocation: false,
    hasWtoSource: true,
    qty: 25,
    transactionMode: 'TRADING',
  }).unitCostSnapshot).toBeNull()
})
```

- [ ] **Step 5: Run the focused unit test**

Expected: PASS with WTO, generic Stock, Trading-allocated, Trading-pending, missing-snapshot, and zero-quantity cases.

---

### Task 3: Make mixed-source Trading correction operate only on Trading lines

**Files:**
- Modify: `apps/next/src/lib/server/trading-sales-bill-allocation-correction.ts`
- Modify: `apps/next/scripts/verify-trading-allocation-correction-contract.ts`

**Interfaces:**
- Consumes: active durable `sales_bill_lines`, active WTO/Stock `sales_bill_source_allocations`, selected Trading Cost Sources, existing normalization service, and existing profit/cost SQL projector.
- Produces: the same `{ docNo: string; totalCost: number }` result and unchanged PATCH payload schema.

- [ ] **Step 1: Bring the rollback fixtures onto durable lines, then add a mixed-source fixture**

The correction implementation will stop reading `sales_bills.items`, so first make every existing fixture satisfy the same durable contract as production. Create one sales channel beside the existing branch fixture and assign it to every test Sales Bill that can reach the projector:

```ts
const salesChannel = await tx.sales_channels.create({
  data: { code: `${qaPrefix}-SC`, name: `${qaPrefix} Sales Channel` },
})
```

Add `channel_id: salesChannel.id` to `successBill`, `capacityBill`, `mismatchBill`, and the new `mixedBill`. Immediately after creating `successBill`, add its two durable lines:

```ts
await tx.sales_bill_lines.createMany({
  data: [
    {
      cogs_amount: 999,
      gross_profit: -499,
      gross_weight: 25,
      line_amount: 500,
      line_no: 1,
      meta: { tradingCostSourceId: `PB:${pb.doc_no}:1` },
      net_weight: 25,
      product_code_snapshot: product.code,
      product_id: product.id,
      product_name_snapshot: product.name,
      qty: 25,
      sales_bill_id: successBill.id,
      status: 'active',
      unit_price: 20,
      unit_snapshot: 'กก.',
    },
    {
      cogs_amount: 999,
      gross_profit: -499,
      gross_weight: 30,
      line_amount: 500,
      line_no: 2,
      meta: { tradingCostSourceId: `SRC:${manualSource.source_no}:1` },
      net_weight: 30,
      product_code_snapshot: product.code,
      product_id: product.id,
      product_name_snapshot: product.name,
      qty: 30,
      sales_bill_id: successBill.id,
      status: 'active',
      unit_price: 20,
      unit_snapshot: 'กก.',
    },
  ],
})
```

Likewise, add one active durable line after each negative fixture so those tests still reach the intended capacity and product-mismatch guards instead of failing early with “missing durable line”:

```ts
await tx.sales_bill_lines.create({
  data: {
    line_amount: 2000,
    line_no: 1,
    net_weight: 90,
    product_code_snapshot: product.code,
    product_id: product.id,
    product_name_snapshot: product.name,
    qty: 90,
    sales_bill_id: capacityBill.id,
    status: 'active',
    unit_price: 20,
    unit_snapshot: 'กก.',
  },
})

await tx.sales_bill_lines.create({
  data: {
    line_amount: 200,
    line_no: 1,
    net_weight: 10,
    product_code_snapshot: product.code,
    product_id: product.id,
    product_name_snapshot: product.name,
    qty: 10,
    sales_bill_id: mismatchBill.id,
    status: 'active',
    unit_price: 20,
    unit_snapshot: 'กก.',
  },
})
```

Keep the existing `throw rollbackSentinel` after all assertions; the new channel, durable lines, report projections, and mixed fixture must remain inside the same Prisma transaction.
Because the success and mixed cases now invoke the SQL projector and daily rebuild, raise only this script transaction timeout from `20_000` to `60_000`; do not remove the rollback sentinel or split the fixture across transactions.

Create an active Trading SB with:

```ts
const mixedBill = await tx.sales_bills.create({
  data: {
    branch_id: branch.id,
    channel_id: salesChannel.id,
    customer_id: customer.id,
    date: today,
    doc_no: `${qaPrefix}-SB-MIX`,
    gross_profit: 603.5,
    items: [
      {
        amount: 500,
        lineNo: 1,
        productCode: product.code,
        productId: product.code,
        productName: product.name,
        qty: 25,
        tradingCostSourceId: `PB:${pb.doc_no}:1`,
        unitPrice: 20,
      },
      {
        amount: 1000,
        deliveryTicketDocNo: `${qaPrefix}-WTO`,
        deliveryTicketId: `${qaPrefix}-WTO`,
        lineNo: 2,
        productCode: otherProduct.code,
        productId: otherProduct.code,
        productName: otherProduct.name,
        qty: 25,
        tradingCostSourceId: null,
        unitPrice: 40,
      },
    ],
    receivable_balance: 1500,
    status: 'unreceived',
    total_amount: 1500,
    total_cost: 896.5,
    transaction_mode: 'TRADING',
  },
})
```

Insert the two durable lines and load their ids:

```ts
await tx.sales_bill_lines.createMany({
  data: [
    {
      cogs_amount: 250,
      gross_profit: 250,
      gross_weight: 25,
      line_amount: 500,
      line_no: 1,
      meta: { tradingCostSourceId: `PB:${pb.doc_no}:1` },
      net_weight: 25,
      product_code_snapshot: product.code,
      product_id: product.id,
      product_name_snapshot: product.name,
      qty: 25,
      sales_bill_id: mixedBill.id,
      status: 'active',
      unit_price: 20,
      unit_snapshot: 'กก.',
    },
    {
      cogs_amount: 646.5,
      gross_profit: 353.5,
      gross_weight: 25,
      line_amount: 1000,
      line_no: 2,
      meta: { deliveryTicketId: `${qaPrefix}-WTO` },
      net_weight: 25,
      product_code_snapshot: otherProduct.code,
      product_id: otherProduct.id,
      product_name_snapshot: otherProduct.name,
      qty: 25,
      sales_bill_id: mixedBill.id,
      status: 'active',
      unit_price: 40,
      unit_snapshot: 'ลัง',
    },
  ],
})
const mixedLines = await tx.sales_bill_lines.findMany({
  orderBy: { line_no: 'asc' },
  where: { sales_bill_id: mixedBill.id },
})
const mixedLine2 = mixedLines.find((line) => line.line_no === 2)
if (!mixedLine2) throw new Error('mixed line 2 fixture missing')
```

Insert the WTO ownership fact and original Stock ledger value:

```ts
await tx.sales_bill_source_allocations.create({
  data: {
    allocated_gross_weight: 25,
    allocated_net_weight: 25,
    allocated_qty: 25,
    movement_owner: 'SALES_BILL',
    product_code_snapshot: otherProduct.code,
    product_id: otherProduct.id,
    product_name_snapshot: otherProduct.name,
    sales_bill_id: mixedBill.id,
    sales_bill_line_id: mixedLine2.id,
    sales_line_no: 2,
    source_doc_no: `${qaPrefix}-WTO`,
    source_line_no: 1,
    source_type: 'WTO',
    status: 'active',
    stock_ledger_ref_type: 'SB',
  },
})
await tx.stock_ledger.create({
  data: {
    branch_id: branch.id,
    date: today,
    movement_type: 'ขายออก',
    product_id: otherProduct.id,
    qty_out: 25,
    ref_no: mixedBill.doc_no,
    ref_type: 'SB',
    unit_cost: 25.86,
    value_out: 646.5,
  },
})
```

Insert one old active Trading fact for line 1 only:

```ts
await tx.trading_allocation_facts.create({
  data: {
    allocation_method: 'RECORDED_LINE',
    allocation_no: `${qaPrefix}-MIX-OLD-1`,
    customer_id: customer.id,
    date: today,
    matched_cogs: 250,
    product_code_snapshot: product.code,
    product_id: product.id,
    product_name_snapshot: product.name,
    purchase_bill_id: pb.id,
    qty: 25,
    sales_amount: 500,
    sales_bill_id: mixedBill.id,
    sales_doc_no: mixedBill.doc_no,
    sales_line_no: 1,
    source_doc_no: pb.doc_no,
    source_line_no: 1,
    source_type: 'TRADING_PURCHASE_BILL',
    status: 'active',
    supplier_id: supplier.id,
    supplier_name_snapshot: supplier.name,
  },
})
```

Call correction with only the Trading line:

```ts
const mixedResult = await correctTradingSalesBillAllocations(tx, {
  actor: 'qa-script',
  allocations: [
    { salesLineNo: 1, tradingCostSourceId: `PB:${pb.doc_no}:1` },
  ],
  billRef: mixedBill.doc_no,
  correctedAt: new Date('2026-06-14T01:15:00.000Z'),
  note: 'qa mixed trading allocation correction',
})
assertEqual('mixed correction docNo', mixedResult.docNo, mixedBill.doc_no)
assertions += 1
```

Assertions must prove:

```ts
const [mixedUpdatedLines, mixedActiveFacts, mixedHeader, mixedLedger, mixedProjectedFacts] = await Promise.all([
  tx.sales_bill_lines.findMany({
    orderBy: { line_no: 'asc' },
    where: { sales_bill_id: mixedBill.id, status: 'active' },
  }),
  tx.trading_allocation_facts.findMany({
    where: { sales_bill_id: mixedBill.id, status: 'active' },
  }),
  tx.sales_bills.findUniqueOrThrow({ where: { id: mixedBill.id } }),
  tx.stock_ledger.findFirstOrThrow({
    where: { ref_no: mixedBill.doc_no, ref_type: 'SB' },
  }),
  tx.report_profit_cost_facts.findMany({
    orderBy: { source_line_no: 'asc' },
    where: {
      fact_type: 'SALE',
      source_doc_no: mixedBill.doc_no,
      source_type: 'SALES_BILL',
    },
  }),
])
const mixedWtoLine = mixedUpdatedLines.find((line) => line.line_no === 2)
const correctedTradingFact = mixedActiveFacts.find((fact) => fact.sales_line_no === 1)
if (!mixedWtoLine || !correctedTradingFact) throw new Error('mixed correction result missing')
const correctedTradingCogs = Number(correctedTradingFact.matched_cogs)
const mixedLineCostTotal = mixedUpdatedLines.reduce(
  (sum, line) => sum + Number(line.cogs_amount ?? 0),
  0,
)

assertNear('mixed WTO line COGS preserved', Number(mixedWtoLine.cogs_amount), 646.5)
assertEqual('mixed WTO line has no Trading fact', mixedActiveFacts.some((fact) => fact.sales_line_no === 2), false)
assertNear('mixed header includes Trading plus WTO COGS', Number(mixedHeader.total_cost), correctedTradingCogs + 646.5)
assertNear('mixed return includes Trading plus WTO COGS', mixedResult.totalCost, correctedTradingCogs + 646.5)
assertNear('mixed line/header COGS reconcile', mixedLineCostTotal, Number(mixedHeader.total_cost))
assertNear('mixed stock ledger unchanged', Number(mixedLedger.value_out), 646.5)
assertEqual('mixed projector line count', mixedProjectedFacts.length, 2)
assertNear('mixed projector Trading COGS', Number(mixedProjectedFacts[0]?.cogs_amount ?? 0), correctedTradingCogs)
assertNear('mixed projector WTO COGS', Number(mixedProjectedFacts[1]?.cogs_amount ?? 0), 646.5)
assertions += 9
```

Submit line 2 as a Trading correction and prove the backend rejects it:

```ts
await expectRejects(
  'mixed WTO line correction guard',
  () => correctTradingSalesBillAllocations(tx, {
    actor: 'qa-script',
    allocations: [
      { salesLineNo: 2, tradingCostSourceId: `PB:${pb.doc_no}:1` },
    ],
    billRef: mixedBill.doc_no,
    correctedAt: new Date('2026-06-14T01:20:00.000Z'),
    note: 'qa must reject WTO correction',
  }),
  'รายการ WTO/Stock ไม่สามารถแก้เป็น Trading allocation',
)
assertions += 1
```

- [ ] **Step 2: Run the integration script and confirm the new mixed case fails**

Run from `apps/next`:

```powershell
npx tsx scripts/verify-trading-allocation-correction-contract.ts
```

Expected before the fix: FAIL because the current function requires every bill item and does not preserve mixed Stock COGS.

- [ ] **Step 3: Read correctable lines from durable facts**

Load active lines and their active stock-owned sources:

```ts
const salesLines = await tx.sales_bill_lines.findMany({
  include: {
    sales_bill_source_allocations: {
      where: {
        movement_owner: 'SALES_BILL',
        status: 'active',
      },
    },
  },
  orderBy: { line_no: 'asc' },
  where: { sales_bill_id: bill.id, status: 'active' },
})
const correctableLines = salesLines.filter(
  (line) => line.sales_bill_source_allocations.length === 0,
)
const correctableLineNos = new Set(correctableLines.map((line) => line.line_no))
const allLineNos = new Set(salesLines.map((line) => line.line_no))
const stockOwnedLineNos = new Set(
  salesLines
    .filter((line) => line.sales_bill_source_allocations.length > 0)
    .map((line) => line.line_no),
)
```

Delete the `bill.items` array validation and the `rawBillItems`/`billItems` parsing. Validate the request against durable line numbers instead:

```ts
if (salesLines.length === 0) {
  throw new Error('บิลขายนี้ไม่มี durable line facts ให้แก้ไข allocation')
}
const requestedLines = new Set(params.allocations.map((allocation) => allocation.salesLineNo))
if (requestedLines.size !== params.allocations.length) {
  throw new Error('มีรายการแก้ไข allocation ซ้ำแถว')
}
for (const lineNo of requestedLines) {
  if (!allLineNos.has(lineNo)) {
    throw new Error(`ไม่พบรายการบิลขายแถวที่ ${lineNo}`)
  }
  if (stockOwnedLineNos.has(lineNo)) {
    throw new Error(`รายการ WTO/Stock ไม่สามารถแก้เป็น Trading allocation (แถวที่ ${lineNo})`)
  }
}
if (
  requestedLines.size !== correctableLineNos.size
  || [...correctableLineNos].some((lineNo) => !requestedLines.has(lineNo))
) {
  throw new Error('ต้องระบุ Trading Cost Source ให้ครบทุกรายการ Trading ในบิลขาย')
}
```

This preserves the duplicate/unknown/missing guards while refusing every active Stock-owned row. The requested set equals `correctableLineNos`, not the legacy header JSON row count.

- [ ] **Step 4: Resolve and recreate facts only for correctable Trading lines**

Change `resolveTradingCorrectionSources()` to consume a `Map<number, TradingCorrectionSalesLine>` built from durable `sales_bill_lines` instead of indexing `sales_bills.items`. The internal line shape is:

```ts
type TradingCorrectionSalesLine = {
  amount: number
  lineNo: number
  productCode: string
  productId: bigint | null
  productName: string
  qty: number
}
```

Use this exact resolver parameter contract:

```ts
params: {
  allocations: z.infer<typeof correctTradingAllocationsSchema>['allocations']
  billId: bigint
  salesLines: Map<number, TradingCorrectionSalesLine>
}
```

Build the resolver input from durable snapshots and remove the now-unused JSON helpers (`itemNumber`, `salesItemUnitPrice`, `itemText`, `itemProductCode`, `itemProductName`, `itemQty`, `itemAmount`, `itemGrossAmountBeforeDiscount`, and `isRecord`) plus the unused `roundMoney` import:

```ts
const correctionLineByNo = new Map<number, TradingCorrectionSalesLine>(
  correctableLines.map((line) => [line.line_no, {
    amount: toNumber(line.line_amount),
    lineNo: line.line_no,
    productCode: line.product_code_snapshot,
    productId: line.product_id,
    productName: line.product_name_snapshot,
    qty: toNumber(line.qty) || toNumber(line.net_weight),
  }]),
)
const resolvedSources = await resolveTradingCorrectionSources(tx, {
  allocations: params.allocations,
  billId: bill.id,
  salesLines: correctionLineByNo,
})
```

Inside `resolveTradingCorrectionSources()`, replace `params.billItems[parsed.salesLineNo - 1]` with `params.salesLines.get(parsed.salesLineNo)`, then read `item.productCode`, `item.productName`, `item.qty`, and `item.amount` directly. Keep all existing source-capacity and product-match checks unchanged.

Build new facts from `correctableLines`:

```ts
await tx.trading_allocation_facts.createMany({
  data: correctableLines.map((line) => {
    const resolved = resolvedSources.get(line.line_no)
    if (!resolved) throw new Error(`ไม่พบ Trading allocation สำหรับแถวที่ ${line.line_no}`)
    return {
      allocation_method: 'RECORDED_LINE',
      allocation_no: `TAF-${bill.doc_no}-COR-${revisionKey}-${String(line.line_no).padStart(3, '0')}`,
      created_at: correctedAt,
      created_by: params.actor,
      customer_id: bill.customer_id,
      customer_name_snapshot: bill.customers?.name ?? null,
      date: normalizeDate(toDateOnly(bill.date)),
      matched_cogs: resolved.matchedCogs,
      notes: `Sales Bill allocation correction: ${params.note}`,
      product_code_snapshot: resolved.source.productCode || line.product_code_snapshot,
      product_id: resolved.source.productId ?? line.product_id,
      product_name_snapshot: resolved.source.productName || line.product_name_snapshot,
      purchase_bill_id: resolved.source.billId,
      qty: line.qty,
      sales_amount: line.line_amount,
      sales_bill_id: bill.id,
      sales_doc_no: bill.doc_no,
      sales_line_no: line.line_no,
      source_doc_no: resolved.source.docNo,
      source_line_no: resolved.source.lineNo,
      source_type: resolved.source.type === 'MANUAL'
        ? 'TRADING_COST_SOURCE'
        : 'TRADING_PURCHASE_BILL',
      status: 'active',
      supplier_id: resolved.source.supplierId,
      supplier_name_snapshot: resolved.source.supplierName,
      trading_cost_source_id: resolved.source.costSourceId,
      updated_at: correctedAt,
      updated_by: params.actor,
    }
  }),
})
```

- [ ] **Step 5: Reconcile every line and project the report inside the same transaction**

After reversing old facts and creating corrected facts:

```ts
import { normalizeSalesBillProfitCostSource } from './sales-bill-profit-cost-source'

await normalizeSalesBillProfitCostSource(tx, {
  actor: params.actor,
  salesBillDocNo: bill.doc_no,
  salesBillId: bill.id,
})
await tx.sales_bill_lines.updateMany({
  data: { updated_at: correctedAt, updated_by: params.actor },
  where: { id: { in: salesLines.map((line) => line.id) } },
})
const updated = await tx.sales_bills.update({
  data: { updated_at: correctedAt, updated_by: params.actor },
  select: { doc_no: true, total_cost: true },
  where: { id: bill.id },
})
await tx.$executeRaw`select public.project_profit_cost_sales_bill(${bill.id})`
```

Update the bill timestamp before projection so `report_profit_cost_facts.source_updated_at` receives `correctedAt`, then return:

```ts
return { docNo: updated.doc_no, totalCost: toNumber(updated.total_cost) }
```

Remove `const totalCost = [...resolvedSources.values()]...` and the manual `grossProfitBase - totalCost` header update so the existing normalization service remains the single reconciliation owner for Trading + WTO mixed cost.

- [ ] **Step 6: Run the rollback integration script again**

Expected: all existing capacity/product guards still PASS, mixed correction preserves WTO COGS and Stock ledger, line/header costs reconcile, profit/cost projection executes, and the transaction reports `rolledBack: true`.

---

### Task 4: Align the correction UI with the backend contract

**Files:**
- Modify: `apps/next/src/components/daily/TransactionBillsDetailModals.tsx`
- Modify: `apps/next/src/components/daily/transaction-table-alignment.test.ts`

**Interfaces:**
- Consumes: unchanged `SalesBillDetail.items[].deliveryTicketDocNo`, `tradingSourceDocNo`, `sourceType`, and bill status.
- Produces: unchanged PATCH payload containing only correctable PB-derived Trading line numbers.

- [ ] **Step 1: Add a UI source-contract regression**

Extend the existing source test to require both guards:

```ts
const transactionBillsDetailModalsSource = readSource('./TransactionBillsDetailModals.tsx')

expect(transactionBillsDetailModalsSource).toContain(
  'function isCorrectableTradingDetailItem',
)
expect(transactionBillsDetailModalsSource).toContain(
  '!item.deliveryTicketDocNo',
)
expect(transactionBillsDetailModalsSource).toContain(
  "!isCancelledBillStatus(detail.status)",
)
expect(transactionBillsDetailModalsSource).toContain(
  'detail.items.filter(isCorrectableTradingDetailItem)',
)
expect(transactionBillsDetailModalsSource).toContain(
  '{canCorrectTradingAllocation ? (',
)
```

Declare `transactionBillsDetailModalsSource` once with the other top-level source fixtures, then put the expectations in a dedicated `it('limits Trading correction to active Trading-owned rows', ...)` case; do not place them inside the sliced detail-table assertion.

Run the focused test and confirm it fails before the component change.

- [ ] **Step 2: Filter correction state, fields, and payload to Trading-owned rows**

Add a local predicate so generic `STOCK` lines and WTO lines both stay out of the Trading editor without changing the DTO:

```ts
function isCorrectableTradingDetailItem(item: SalesBillDetail['items'][number]) {
  return !item.deliveryTicketDocNo && item.sourceType.includes('Trading')
}
```

Import `useMemo`, then derive a stable list inside `SalesBillDetailModal`:

```ts
const correctableTradingItems = useMemo(() => (
  detail?.transactionMode === 'TRADING'
    ? detail.items.filter(isCorrectableTradingDetailItem)
    : []
), [detail])
const canCorrectTradingAllocation = Boolean(
  detail
  && !isCancelledBillStatus(detail.status)
  && correctableTradingItems.length > 0
)
```

Do not create the array inline in the `useEffect` dependency list. Use the memoized list to initialize `correctionSources` and include it in the effect dependencies so the editor cannot retain WTO/Stock rows from the previous detail:

```ts
useEffect(() => {
  if (!canCorrectTradingAllocation) {
    setShowCorrection(false)
    setCorrectionSources({})
    setCorrectionNote('')
    setCorrectionError(null)
    return
  }
  setCorrectionSources(Object.fromEntries(correctableTradingItems.map((item) => {
    const sourceType = item.sourceType.toUpperCase()
    const sourceDocNo = item.tradingSourceDocNo
    const sourceLineNo = item.tradingSourceLineNo ?? 1
    const sourceId = !sourceDocNo
      ? ''
      : sourceType.includes('COST SOURCE')
        ? `SRC:${sourceDocNo}:1`
        : `PB:${sourceDocNo}:${sourceLineNo}`
    return [item.lineNo, sourceId]
  })))
  setCorrectionError(null)
}, [canCorrectTradingAllocation, correctableTradingItems])
```

Use `correctableTradingItems` in:

- `submitCorrection()` payload;
- rendering the correction combobox rows.

Use `canCorrectTradingAllocation` for both the button and correction panel. This hides the action for cancelled bills and prevents every WTO/Stock row from requesting a Trading Cost Source.

- [ ] **Step 3: Keep the existing error behavior for incomplete Trading lines**

The validation remains:

```ts
if (allocations.some((allocation) => !allocation.tradingCostSourceId)) {
  setCorrectionError('เลือก Trading Cost Source ให้ครบทุกรายการ Trading')
  return
}
```

- [ ] **Step 4: Run the focused UI source-contract test**

Expected: PASS, with the existing table-alignment assertions unchanged.

---

### Task 5: Update the business contract and prove the real regression

**Files:**
- Modify: `docs/notes/page-flows/daily-transactions-sales-bills.md`
- Modify only if this batch becomes the active handoff: `docs/migration/00-current-work.md`

**Interfaces:**
- Documents the existing, now-enforced contract; no public schema change.

- [ ] **Step 1: Record the line-level detail and correction rule**

Add a concise checkpoint under the Sales Bill detail/correction section:

```markdown
- Mixed-source `TRADING` SB detail classifies cost per line, not from the header mode: PB-derived rows display Trading allocation COGS, while WTO-derived rows display the durable `sales_bill_lines.cogs_amount` Stock snapshot and WTO source. Cancelled documents keep the issued snapshot visible even after source facts become cancelled.
- Trading allocation correction accepts only active lines with no Stock-owned source allocation. It must preserve WTO/Stock line COGS and ledger, rerun `normalizeSalesBillProfitCostSource`, and project the Profit & Cost read model in the same transaction. It must never create `trading_allocation_facts` for WTO/Stock rows.
```

- [ ] **Step 2: Run the real read-only regression probe against SIT**

Call `getSalesBillDetail('SB012608-0006')` and assert:

```ts
const detail = await getSalesBillDetail('SB012608-0006')
if (!detail) throw new Error('SB012608-0006 detail not found')
const first = detail.items.find((item) => item.lineNo === 1)
const second = detail.items.find((item) => item.lineNo === 2)
if (!first || !second) throw new Error('missing regression lines')
if (Math.abs((first.unitCostSnapshot ?? 0) - 1.7) > 0.000001) throw new Error('line 1 cost drift')
if (Math.abs(first.matchedCogs - 51085) > 0.01) throw new Error('line 1 matched COGS drift')
if (Math.abs((second.unitCostSnapshot ?? 0) - 25.86) > 0.000001) throw new Error('line 2 cost missing')
if (!second.sourceLabel.includes('WTO012608-0005')) throw new Error('line 2 WTO source missing')
if (second.sourceType === 'Pending Trading Allocation') throw new Error('WTO line misclassified as pending Trading')
if (second.matchedCogs !== 0) throw new Error('WTO line invented Trading COGS')
```

This probe is read-only and must disconnect Prisma in `finally` without printing credentials or raw customer data.

- [ ] **Step 3: Verify header/line reconciliation remains unchanged**

Read only the bill header and durable line costs:

```ts
const bill = await prisma.sales_bills.findUniqueOrThrow({
  select: { gross_profit: true, id: true, total_amount: true, total_cost: true },
  where: { doc_no: 'SB012608-0006' },
})
const lines = await prisma.sales_bill_lines.findMany({
  orderBy: { line_no: 'asc' },
  select: { cogs_amount: true, line_no: true },
  where: { sales_bill_id: bill.id },
})
const lineCostTotal = lines.reduce(
  (sum, line) => sum + Number(line.cogs_amount ?? 0),
  0,
)
if (Math.abs(lineCostTotal - Number(bill.total_cost ?? 0)) > 0.01) {
  throw new Error('header/line COGS mismatch')
}
if (Math.abs(Number(bill.gross_profit ?? 0) - 2955768.5) > 0.01) {
  throw new Error('header GP drift')
}
```

The expected arithmetic is:

```text
51,085.00 + 646.50 = 51,731.50
3,007,500.00 - 51,731.50 = 2,955,768.50
```

No update/backfill is expected.

---

### Task 6: Full validation, review, and acceptance gate

**Files:**
- Review all files changed by Tasks 1-5 only.

- [ ] **Step 1: Run focused tests and rollback contract**

From `apps/next`:

```powershell
npx vitest run src/lib/server/sales-bill-detail.test.ts src/components/daily/transaction-table-alignment.test.ts
npx tsx scripts/verify-trading-allocation-correction-contract.ts
```

- [ ] **Step 2: Run project validation**

From the repository root:

```powershell
npm run lint --workspace @ns-scrap-erp/next
npm run type-check --workspace @ns-scrap-erp/next
npm run build --workspace @ns-scrap-erp/next
git diff --check
```

- [ ] **Step 3: Review the final diff**

Check explicitly:

- no API or Prisma schema change;
- no data mutation/backfill script;
- no WTO/Stock-owned line receives a Trading fact;
- cancelled detail reads the original line snapshot;
- pending Trading still displays `-`;
- correction preserves Stock ledger and line/header reconciliation;
- print and LINE consumers keep the same `SalesBillDetail` shape;
- no unrelated dirty file is staged or altered.

Fix every actionable finding, rerun affected validation, and review the updated diff again.

- [ ] **Step 4: Run fresh-context acceptance audit**

Provide the reviewer with:

- the exact user symptom and this acceptance contract;
- final diff;
- focused test output;
- rollback integration output;
- read-only `SB012608-0006` probe output;
- lint/type-check/build/diff-check output.

Completion requires `ACCEPTED`. If no isolated reviewer is available, label the self-audit degraded and do not describe it as independent.

- [ ] **Step 5: Stop before delivery mutation**

Report the result locally. Do not commit, push to `sit-origin/main`, or deploy Vercel until the user explicitly requests that delivery step; before any later push, fetch and semantically integrate the latest `sit-origin/main` first.

---

## Acceptance Contract

- `SB012608-0006` line 2 displays `25.86` instead of `-`.
- Its source displays WTO/Stock ownership, not Pending Trading Allocation.
- Line 1 remains `1.70` and retains Trading PB + Matched COGS presentation.
- Header cost and GP remain `51,731.50` and `2,955,768.50`.
- Cancelled bills expose no Trading-allocation correction action.
- Active mixed bills correct only PB-derived Trading lines.
- Correction preserves WTO line COGS and Stock ledger, updates Trading line snapshots, reconciles header totals, and refreshes Profit & Cost projection.
- Truly pending Trading rows still display `-`.
- No API, DB schema, Storage, Cache, historical-data, or cancellation-ledger change.
