import { allocateStockCogsToSalesLines, calculateSalesLineProfit, requireSalesLineCosts } from './profit-cost-source-lines'
import { Prisma } from '../../../generated/prisma/client'

type TxClient = Prisma.TransactionClient

export async function normalizeSalesBillProfitCostSource(
  tx: TxClient,
  input: { actor: string; salesBillDocNo: string; salesBillId: bigint },
) {
  const [bill, lines, tradingFacts, sourceAllocations, ledgerRows] = await Promise.all([
    tx.sales_bills.findUnique({
      select: { discount_total: true },
      where: { id: input.salesBillId },
    }),
    tx.sales_bill_lines.findMany({
      orderBy: { line_no: 'asc' },
      select: { id: true, line_amount: true, line_no: true },
      where: { sales_bill_id: input.salesBillId, status: 'active' },
    }),
    tx.trading_allocation_facts.findMany({
      select: { matched_cogs: true, sales_line_no: true },
      where: { sales_bill_id: input.salesBillId, status: 'active' },
    }),
    tx.sales_bill_source_allocations.findMany({
      select: { allocated_qty: true, product_id: true, sales_line_no: true, source_type: true },
      where: { sales_bill_id: input.salesBillId, status: 'active' },
    }),
    tx.stock_ledger.findMany({
      select: { product_id: true, qty_in: true, qty_out: true, value_in: true, value_out: true },
      where: {
        ref_type: 'SB',
        OR: [{ ref_id: input.salesBillDocNo }, { ref_no: input.salesBillDocNo }],
      },
    }),
  ])
  if (!bill) throw new Error(`Sales Bill ${input.salesBillDocNo} not found during COGS normalization`)

  const costsByLineNo = new Map<number, string>()
  const stockSourceLineNumbers = new Set(sourceAllocations.map((allocation) => {
    if (allocation.source_type !== 'WTO' && allocation.source_type !== 'STOCK') {
      throw new Error(`Sales Bill ${input.salesBillDocNo} has unsupported stock source type ${allocation.source_type}`)
    }
    return allocation.sales_line_no
  }))

  const stockByProduct = new Map<bigint, { qty: Prisma.Decimal; value: Prisma.Decimal }>()
  for (const row of ledgerRows) {
    if (row.product_id == null) throw new Error(`Sales Bill ${input.salesBillDocNo} stock ledger is missing product_id`)
    const current = stockByProduct.get(row.product_id) ?? {
      qty: new Prisma.Decimal(0),
      value: new Prisma.Decimal(0),
    }
    current.qty = current.qty.plus(row.qty_out ?? 0).minus(row.qty_in ?? 0)
    current.value = current.value.plus(row.value_out ?? 0).minus(row.value_in ?? 0)
    stockByProduct.set(row.product_id, current)
  }

  if (sourceAllocations.length > 0 || stockByProduct.size > 0) {
    const stockCosts = allocateStockCogsToSalesLines({
      consumed: [...stockByProduct.entries()].map(([productId, total]) => ({
        productId,
        qty: total.qty.toFixed(3),
        valueOut: total.value.toFixed(2),
      })),
      lines: sourceAllocations.map((allocation) => {
        if (allocation.product_id == null) {
          throw new Error(`Sales Bill line ${allocation.sales_line_no} source allocation is missing product_id`)
        }
        return {
          lineNo: allocation.sales_line_no,
          productId: allocation.product_id,
          qty: allocation.allocated_qty.toFixed(3),
        }
      }),
    })
    stockCosts.forEach((amount, lineNo) => {
      costsByLineNo.set(lineNo, amount)
    })
  }

  for (const fact of tradingFacts) {
    if (fact.sales_line_no == null) {
      if (stockSourceLineNumbers.size > 0) continue
      throw new Error(`Trading allocation for Sales Bill ${input.salesBillDocNo} is missing sales_line_no`)
    }
    if (stockSourceLineNumbers.has(fact.sales_line_no)) continue
    if (costsByLineNo.has(fact.sales_line_no)) {
      throw new Error(`Duplicate trading COGS for Sales Bill ${input.salesBillDocNo} line ${fact.sales_line_no}`)
    }
    costsByLineNo.set(fact.sales_line_no, fact.matched_cogs.toFixed(2))
  }

  const headerCogs = [...costsByLineNo.values()]
    .reduce((sum, amount) => sum.plus(amount), new Prisma.Decimal(0))
    .toFixed(2)
  const normalized = requireSalesLineCosts({
    headerCogsAmount: headerCogs,
    lines: [...costsByLineNo.entries()].map(([lineNo, cogsAmount]) => ({ cogsAmount, lineNo })),
    salesLineNumbers: lines.map((line) => line.line_no),
  })

  let lineGrossProfit = new Prisma.Decimal(0)
  for (const line of lines) {
    const cogsAmount = normalized.get(line.line_no)
    if (!cogsAmount) throw new Error(`Sales Bill line ${line.line_no} has no normalized COGS`)
    const grossProfit = calculateSalesLineProfit({
      cogsAmount,
      lineAmount: line.line_amount.toFixed(2),
    })
    lineGrossProfit = lineGrossProfit.plus(grossProfit)
    await tx.sales_bill_lines.update({
      data: {
        cogs_amount: new Prisma.Decimal(cogsAmount),
        gross_profit: new Prisma.Decimal(grossProfit),
        updated_by: input.actor,
      },
      where: { id: line.id },
    })
  }

  const headerGrossProfit = lineGrossProfit.minus(bill.discount_total ?? 0).toDecimalPlaces(2)
  await tx.sales_bills.update({
    data: {
      cogs_amount: new Prisma.Decimal(headerCogs),
      gross_profit: headerGrossProfit,
      total_cost: new Prisma.Decimal(headerCogs),
      updated_by: input.actor,
    },
    where: { id: input.salesBillId },
  })
}
