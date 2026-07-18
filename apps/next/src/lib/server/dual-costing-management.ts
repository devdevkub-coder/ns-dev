import { toDateOnly, toNumber } from '@/lib/server/daily'
import { buildDualCostingMatchIdMap } from '@/lib/server/dual-costing-match-id'
import { getDualCostingBranch } from '@/lib/server/dual-costing-branch'
import { prisma } from '@/lib/server/prisma'
import { listProductReferences } from '@/lib/server/reference-master-cache'

type JsonItem = Record<string, unknown>
type ProductRef = { code: string; id: bigint; metal_group: string | null; name: string }

export type WaitingAllocationRow = {
  allocatedQty: number
  allocationStatus: 'partially_allocated' | 'pending_allocation'
  branchName: string
  customerName: string
  date: string
  docNo: string
  id: string
  itemId: string
  metalGroup: string
  productId: string
  productName: string
  qty: number
  remainingQty: number
  revenuePending: number
  salesBillId: string
  unitPrice: number
}

export type CostAllocationLedgerRow = {
  allocatedAt: string
  allocatedBy: string
  allocatedQty: number
  allocatedRevenue: number
  costPerKg: number
  costPoolNo: string
  date: string
  gpPct: number
  grossProfit: number
  id: string
  matchId: string
  productCategory: string
  productId: string
  productName: string
  saleDocNo: string
  saleQty: number
  sourceNo: string
  status: 'approved' | 'reversed'
  targetType: 'PO_SELL' | 'SPOT_SELL'
  totalCost: number
}

function jsonNumber(value: unknown) {
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0
  if (typeof value === 'string') {
    const parsed = Number(value.replace(/,/g, ''))
    return Number.isFinite(parsed) ? parsed : 0
  }
  if (value && typeof value === 'object' && 'toNumber' in value && typeof value.toNumber === 'function') {
    return toNumber(value as { toNumber: () => number })
  }
  return 0
}

function jsonString(...values: unknown[]) {
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) return value.trim()
  }
  return ''
}

function isJsonItem(value: unknown): value is JsonItem {
  return typeof value === 'object' && value !== null
}

function itemProductCode(item: JsonItem, productById: Map<string, ProductRef>) {
  const direct = jsonString(item.productCode, item.code, item.productId)
  if (direct) {
    if (/^\d+$/.test(direct)) return productById.get(direct)?.code ?? ''
    return direct
  }
  const rawInternal = item.product_id ?? item.id
  if (typeof rawInternal === 'number' || typeof rawInternal === 'bigint') {
    return productById.get(String(rawInternal))?.code ?? ''
  }
  return ''
}

function itemProductName(item: JsonItem, productById: Map<string, ProductRef>) {
  const direct = jsonString(item.productName, item.displayName, item.name)
  if (direct) return direct
  const code = itemProductCode(item, productById)
  if (!code) return '-'
  for (const product of productById.values()) {
    if (product.code === code) return product.name
  }
  return '-'
}

function itemQty(item: JsonItem) {
  return jsonNumber(item.qty ?? item.quantity ?? item.weight ?? item.netWeight ?? item.net_weight)
}

function itemAmount(item: JsonItem) {
  return jsonNumber(item.netAmount ?? item.totalAmount ?? item.amount ?? item.lineTotal ?? item.total)
}

function itemUnitPrice(item: JsonItem) {
  const qty = itemQty(item)
  return jsonNumber(item.unitPrice ?? item.price ?? item.unit_price) || (qty > 0 ? itemAmount(item) / qty : 0)
}

function isCancelled(status?: string | null) {
  return ['cancelled', 'void', 'reversed', 'short closed'].includes((status ?? '').toLowerCase())
}

function isDualCostingGroup(group?: string | null) {
  const normalized = (group ?? '').toLowerCase()
  return ['ทองแดง', 'ทองเหลือง', 'copper', 'brass'].some((key) => normalized.includes(key))
}

function pct(grossProfit: number, revenue: number) {
  return revenue > 0 ? (grossProfit / revenue) * 100 : 0
}

export async function buildDualCostingManagement() {
  const branch = await getDualCostingBranch()
  const [salesBills, tradingDeals, products, poSells, productionOrders, tradingAllocationFacts] = await Promise.all([
    prisma.sales_bills.findMany({
      include: {
        branches: true,
        customers: true,
        sales_bill_lines: {
          include: {
            products: true,
            sales_bill_po_sell_allocations: { orderBy: { id: 'asc' } },
          },
          orderBy: { line_no: 'asc' },
          where: { status: 'active' },
        },
      },
      orderBy: [{ date: 'desc' }, { doc_no: 'desc' }],
      take: 10000,
      where: {
        branch_id: branch.id,
        NOT: { status: { in: ['cancelled', 'Cancelled'] } },
      },
    }),
    prisma.trading_deals.findMany({
      include: { customers: true, products: true, purchase_bills: true, sales_bills: true, suppliers: true },
      orderBy: [{ date: 'desc' }, { deal_no: 'desc' }],
      take: 10000,
    }),
    listProductReferences().then((rows) => rows.map((row) => ({ ...row, metal_group: row.metalGroup }))),
    prisma.po_sells.findMany({
      include: { customers: true },
      orderBy: [{ date: 'desc' }, { doc_no: 'desc' }],
      take: 5000,
      where: {
        branch_id: branch.id,
        NOT: {
          status: {
            in: [
              'Cancelled', 'cancelled', 'Canceled', 'canceled', 'Short Closed', 'short closed'
            ]
          }
        }
      }
    }),
    prisma.production_orders.findMany({
      include: {
        products: true,
        production_inputs: { include: { products: true }, where: { status: 'active' } },
        production_outputs: { include: { products: true }, where: { status: 'active' } }
      },
      orderBy: [{ date: 'desc' }, { doc_no: 'desc' }],
      take: 5000,
      where: {
        branch_id: branch.id,
        NOT: { status: 'Cancelled' }
      }
    }),
    prisma.trading_allocation_facts.findMany({
      where: { status: 'active' },
      take: 10000,
    })
  ])

  const productById = new Map(products.map((product) => [String(product.id), { ...product, code: product.code }]))
  const productByCode = new Map(Array.from(productById.values()).map((product) => [product.code, product]))
  const matchIdByDealId = buildDualCostingMatchIdMap(tradingDeals)
  const salesBillDocNoToSalesBillId = new Map<string, bigint>()
  salesBills.forEach((bill) => {
    salesBillDocNoToSalesBillId.set(bill.doc_no, bill.id)
  })

  const poSellDocNoToPoSellId = new Map<string, bigint>()
  poSells.forEach((po) => {
    poSellDocNoToPoSellId.set(po.doc_no, po.id)
  })

  const salesBillIdToPoSellId = new Map<bigint, bigint>()
  salesBills.forEach((bill) => {
    if (bill.po_sell_id) {
      salesBillIdToPoSellId.set(bill.id, bill.po_sell_id)
    }
  })
  const allowedSalesBillIds = new Set(salesBills.map((bill) => bill.id.toString()))
  const allowedPoSellIds = new Set(poSells.map((po) => po.id.toString()))

  const matchedBySaleProduct = new Map<string, { cost: number; qty: number; revenue: number }>()
  const matchedQtyByPoSellProduct = new Map<string, number>() // key: `${po_sell_id}|${product_id}`

  // Process active allocation facts first
  tradingAllocationFacts.forEach((fact) => {
    if (fact.status !== 'active') return
    if (!fact.product_id) return

    let resolvedSalesBillId = fact.sales_bill_id ?? null
    if (!resolvedSalesBillId && fact.sales_doc_no) {
      resolvedSalesBillId = salesBillDocNoToSalesBillId.get(fact.sales_doc_no) ?? null
    }

    let resolvedPoSellId: bigint | null = null
    if (resolvedSalesBillId) {
      resolvedPoSellId = salesBillIdToPoSellId.get(resolvedSalesBillId) ?? null
    }
    if (!resolvedPoSellId && fact.sales_doc_no) {
      resolvedPoSellId = poSellDocNoToPoSellId.get(fact.sales_doc_no) ?? null
    }
    const inBranchScope = (resolvedSalesBillId && allowedSalesBillIds.has(resolvedSalesBillId.toString()))
      || (resolvedPoSellId && allowedPoSellIds.has(resolvedPoSellId.toString()))
    if (!inBranchScope) return

    if (resolvedSalesBillId) {
      const key = `${resolvedSalesBillId}|${fact.product_id}`
      const current = matchedBySaleProduct.get(key) ?? { cost: 0, qty: 0, revenue: 0 }
      current.cost += toNumber(fact.matched_cogs)
      current.qty += toNumber(fact.qty)
      current.revenue += toNumber(fact.sales_amount)
      matchedBySaleProduct.set(key, current)
    }

    if (resolvedPoSellId) {
      const key = `${resolvedPoSellId}|${fact.product_id}`
      matchedQtyByPoSellProduct.set(key, (matchedQtyByPoSellProduct.get(key) ?? 0) + toNumber(fact.qty))
    }
  })

  // Track deal IDs covered by active facts
  const accountedDealIds = new Set<bigint>()
  tradingAllocationFacts.forEach((fact) => {
    if (fact.status === 'active' && fact.trading_deal_id) {
      accountedDealIds.add(fact.trading_deal_id)
    }
  })

  // Process active deals not covered by facts
  tradingDeals.forEach((deal) => {
    if (isCancelled(deal.status)) return
    if (accountedDealIds.has(deal.id)) return
    if (!deal.product_id) return

    let resolvedSalesBillId = deal.sales_bill_id ?? null
    if (!resolvedSalesBillId && deal.sales_bill_no) {
      resolvedSalesBillId = salesBillDocNoToSalesBillId.get(deal.sales_bill_no) ?? null
    }

    let resolvedPoSellId: bigint | null = null
    if (resolvedSalesBillId) {
      resolvedPoSellId = salesBillIdToPoSellId.get(resolvedSalesBillId) ?? null
    }
    if (!resolvedPoSellId && deal.sales_bill_no) {
      resolvedPoSellId = poSellDocNoToPoSellId.get(deal.sales_bill_no) ?? null
    }
    const inBranchScope = (resolvedSalesBillId && allowedSalesBillIds.has(resolvedSalesBillId.toString()))
      || (resolvedPoSellId && allowedPoSellIds.has(resolvedPoSellId.toString()))
    if (!inBranchScope) return

    if (resolvedSalesBillId) {
      const key = `${resolvedSalesBillId}|${deal.product_id}`
      const current = matchedBySaleProduct.get(key) ?? { cost: 0, qty: 0, revenue: 0 }
      current.cost += toNumber(deal.matched_purchase_amount)
      current.qty += toNumber(deal.matched_qty)
      current.revenue += toNumber(deal.matched_sales_amount)
      matchedBySaleProduct.set(key, current)
    }

    if (resolvedPoSellId) {
      const key = `${resolvedPoSellId}|${deal.product_id}`
      matchedQtyByPoSellProduct.set(key, (matchedQtyByPoSellProduct.get(key) ?? 0) + toNumber(deal.matched_qty))
    }
  })


  const waitingRows: WaitingAllocationRow[] = []
  salesBills.forEach((bill) => {
    if (isCancelled(bill.status) || bill.transaction_mode === 'TRADING') return
    if (bill.po_sell_id) return

    if (bill.sales_bill_lines.length) {
      bill.sales_bill_lines.forEach((line) => {
        if (!line.product_id) return
        const hasPoSellAllocation = line.sales_bill_po_sell_allocations.some((allocation) => allocation.status === 'active' && allocation.po_sell_id != null)
        if (hasPoSellAllocation) return

        const product = line.products
        if (!isDualCostingGroup(product?.metal_group)) return

        const qty = jsonNumber(line.qty) || jsonNumber(line.net_weight)
        if (qty <= 0) return

        const unitPrice = jsonNumber(line.unit_price)
        const matched = matchedBySaleProduct.get(`${bill.id}|${line.product_id}`) ?? { cost: 0, qty: 0, revenue: 0 }
        const allocatedQty = Math.min(qty, matched.qty)
        const remainingQty = Math.max(0, qty - allocatedQty)
        if (remainingQty <= 0.001) return

        const productCode = line.product_code_snapshot || product?.code || ''
        waitingRows.push({
          allocatedQty,
          allocationStatus: allocatedQty > 0 ? 'partially_allocated' : 'pending_allocation',
          branchName: bill.branches?.name ?? '-',
          customerName: bill.customers?.name ?? '-',
          date: toDateOnly(bill.date),
          docNo: bill.doc_no,
          id: `${bill.doc_no}-${line.line_no}-${productCode || line.product_id.toString()}`,
          itemId: String(line.line_no),
          metalGroup: product?.metal_group ?? '-',
          productId: productCode,
          productName: product?.name ?? line.product_name_snapshot,
          qty,
          remainingQty,
          revenuePending: remainingQty * unitPrice,
          salesBillId: bill.doc_no,
          unitPrice,
        })
      })
      return
    }

    if (!Array.isArray(bill.items)) return

    const items = (bill.items as unknown[]).filter(isJsonItem)
    items.forEach((item, index) => {
      const productId = itemProductCode(item, productById)
      if (!productId) return

      const product = productByCode.get(productId)
      if (!isDualCostingGroup(product?.metal_group)) return

      const qty = itemQty(item)
      if (qty <= 0) return

      const unitPrice = itemUnitPrice(item)
      const matched = matchedBySaleProduct.get(`${bill.id}|${productId}`) ?? { cost: 0, qty: 0, revenue: 0 }
      const allocatedQty = Math.min(qty, matched.qty)
      const remainingQty = Math.max(0, qty - allocatedQty)
      if (remainingQty <= 0.001) return

      waitingRows.push({
        allocatedQty,
        allocationStatus: allocatedQty > 0 ? 'partially_allocated' : 'pending_allocation',
        branchName: bill.branches?.name ?? '-',
        customerName: bill.customers?.name ?? '-',
        date: toDateOnly(bill.date),
        docNo: bill.doc_no,
        id: `${bill.doc_no}-${productId}-${index}`,
        itemId: jsonString(item.id, item.lineId, `${index}`),
        metalGroup: product?.metal_group ?? '-',
        productId,
        productName: product?.name ?? itemProductName(item, productById),
        qty,
        remainingQty,
        revenuePending: remainingQty * unitPrice,
        salesBillId: bill.doc_no,
        unitPrice,
      })
    })
  })

  // Map PO Sells to waitingPoSellRows (already built above)


  const waitingPoSellRows: WaitingAllocationRow[] = []
  poSells.forEach((po) => {
    const fallbackProduct = po.product_id ? productById.get(String(po.product_id)) ?? null : null
    
    let items: Array<{
      lineId: string
      productId: string
      productName: string
      qty: number
      unitPrice: number
      metalGroup: string
    }> = []

    const poItems = po.items as unknown
    if (Array.isArray(poItems) && poItems.length) {
      items = poItems
        .filter((item): item is JsonItem => typeof item === 'object' && item !== null)
        .map((item, index) => {
          const rawProdId = jsonString(item.productCode, item.code, item.productId)
          let resolvedCode = ''
          if (rawProdId) {
            if (/^\d+$/.test(rawProdId)) {
              resolvedCode = productById.get(rawProdId)?.code ?? ''
            } else {
              resolvedCode = rawProdId
            }
          } else {
            resolvedCode = fallbackProduct?.code ?? ''
          }

          const product = productByCode.get(resolvedCode)
          const name = product?.name || jsonString(item.productName, item.displayName, item.name) || fallbackProduct?.name || '-'

          return {
            lineId: `${resolvedCode || 'line'}-${index}`,
            productId: resolvedCode,
            productName: name,
            qty: jsonNumber(item.remainingQty ?? item.remaining_qty ?? item.qty),
            unitPrice: jsonNumber(item.unitPrice ?? po.unit_price),
            metalGroup: product?.metal_group ?? fallbackProduct?.metal_group ?? '',
          }
        })
    } else {
      items = [{
        lineId: fallbackProduct?.code || 'header',
        productId: fallbackProduct?.code ?? '',
        productName: fallbackProduct?.name ?? '-',
        qty: jsonNumber(po.remaining_qty ?? po.qty),
        unitPrice: jsonNumber(po.unit_price),
        metalGroup: fallbackProduct?.metal_group ?? '',
      }]
    }

    items.forEach((item) => {
      if (!isDualCostingGroup(item.metalGroup)) return

      const qty = item.qty
      const productObj = productByCode.get(item.productId) ?? fallbackProduct
      const productIdBigInt = productObj?.id ?? null

      let matchedQty = 0
      if (productIdBigInt) {
        matchedQty = matchedQtyByPoSellProduct.get(`${po.id}|${productIdBigInt}`) ?? 0
      }

      const allocatedQty = Math.min(qty, matchedQty)
      const remainingQty = Math.max(0, qty - allocatedQty)
      if (remainingQty <= 0.001) return

      waitingPoSellRows.push({
        allocatedQty,
        allocationStatus: allocatedQty > 0 ? 'partially_allocated' : 'pending_allocation',
        branchName: '-',
        customerName: po.customers?.name ?? '-',
        date: toDateOnly(po.date),
        docNo: po.doc_no,
        id: `${po.id.toString()}-${item.lineId}`,
        itemId: item.lineId,
        metalGroup: item.metalGroup ?? '-',
        productId: item.productId,
        productName: item.productName,
        qty,
        remainingQty,
        revenuePending: remainingQty * item.unitPrice,
        salesBillId: po.doc_no,
        unitPrice: item.unitPrice,
      })
    })
  })

  // Map Production Orders to waitingProductionRows
  const waitingProductionRows: WaitingAllocationRow[] = []
  productionOrders.forEach((order) => {
    const product = order.products
    if (!product || !isDualCostingGroup(product.metal_group)) return

    const inputQty = order.production_inputs.reduce((sum, input) => sum + toNumber(input.qty), 0)
    const inputCost = order.production_inputs.reduce((sum, input) => sum + toNumber(input.total_cost), 0)

    const qty = inputQty > 0 ? inputQty : (toNumber(order.planned_input_qty) || toNumber(order.qty_planned) || 0)
    if (qty <= 0) return

    const unitPrice = inputQty > 0 ? inputCost / inputQty : 0
    const allocatedQty = 0
    const remainingQty = qty

    waitingProductionRows.push({
      allocatedQty,
      allocationStatus: 'pending_allocation',
      branchName: '-',
      customerName: '-',
      date: order.production_inputs.length > 0 ? toDateOnly(order.production_inputs[0].date) : toDateOnly(order.date),
      docNo: order.doc_no,
      id: `production-${order.id.toString()}`,
      itemId: '0',
      metalGroup: product.metal_group ?? '-',
      productId: product.code,
      productName: product.name,
      qty,
      remainingQty,
      revenuePending: remainingQty * unitPrice,
      salesBillId: order.doc_no,
      unitPrice,
    })
  })

  const ledgerRows: CostAllocationLedgerRow[] = tradingDeals.flatMap((deal, index) => {
    const qty = toNumber(deal.matched_qty)
    const totalCost = toNumber(deal.matched_purchase_amount)
    const allocatedRevenue = toNumber(deal.matched_sales_amount)
    const grossProfit = allocatedRevenue - totalCost
    let resolvedPoSellId: bigint | null = deal.sales_bills?.po_sell_id ?? null
    if (!resolvedPoSellId && deal.sales_bill_id) {
      resolvedPoSellId = salesBillIdToPoSellId.get(deal.sales_bill_id) ?? null
    }
    if (!resolvedPoSellId && deal.sales_bill_no) {
      resolvedPoSellId = poSellDocNoToPoSellId.get(deal.sales_bill_no) ?? null
      if (!resolvedPoSellId) {
        const resolvedSalesBillId = salesBillDocNoToSalesBillId.get(deal.sales_bill_no) ?? null
        if (resolvedSalesBillId) {
          resolvedPoSellId = salesBillIdToPoSellId.get(resolvedSalesBillId) ?? null
        }
      }
    }
    const inBranchScope = (deal.sales_bill_id && allowedSalesBillIds.has(deal.sales_bill_id.toString()))
      || (resolvedPoSellId && allowedPoSellIds.has(resolvedPoSellId.toString()))
    if (!inBranchScope) return []
    const targetType = resolvedPoSellId ? 'PO_SELL' : 'SPOT_SELL'
    const product = deal.products ?? (deal.product_id != null ? productById.get(String(deal.product_id)) : null)
    const saleDocNo = deal.sales_bill_no ?? deal.sales_bills?.doc_no ?? deal.customers?.name ?? '-'
    const sourceNo = deal.purchase_bill_no ?? deal.purchase_bills?.doc_no ?? deal.suppliers?.name ?? '-'
    const productCode = product?.code ?? '-'
    const allocatedAt = deal.created_at?.toISOString() ?? toDateOnly(deal.date)
    const matchId = matchIdByDealId.get(String(deal.id)) ?? deal.deal_no
    return [{
      allocatedAt,
      allocatedBy: deal.created_by ?? '-',
      allocatedQty: qty,
      allocatedRevenue,
      costPerKg: qty > 0 ? totalCost / qty : 0,
      costPoolNo: deal.purchase_bill_no ?? deal.purchase_bills?.doc_no ?? '-',
      date: toDateOnly(deal.date),
      gpPct: pct(grossProfit, allocatedRevenue),
      grossProfit,
      id: `${matchId}:${saleDocNo}:${sourceNo}:${productCode}:${allocatedAt}:${deal.status ?? '-'}:${index}`,
      matchId,
      productCategory: product?.metal_group ?? '-',
      productId: product?.code ?? '',
      productName: product?.name ?? '-',
      saleDocNo,
      saleQty: qty,
      sourceNo,
      status: isCancelled(deal.status) ? 'reversed' : 'approved',
      targetType,
      totalCost,
    }]
  })

  const activeLedgerRows = ledgerRows.filter((row) => row.status === 'approved')
  const byCategory = new Map<string, { allocatedQty: number; cost: number; gp: number; pendingQty: number; pendingRevenue: number; revenue: number; rows: number }>()
  const ensureCategory = (category: string) => {
    const key = category || '-'
    const current = byCategory.get(key) ?? { allocatedQty: 0, cost: 0, gp: 0, pendingQty: 0, pendingRevenue: 0, revenue: 0, rows: 0 }
    byCategory.set(key, current)
    return current
  }
  activeLedgerRows.forEach((row) => {
    const current = ensureCategory(row.productCategory)
    current.allocatedQty += row.allocatedQty
    current.cost += row.totalCost
    current.gp += row.grossProfit
    current.revenue += row.allocatedRevenue
    current.rows += 1
  })
  waitingRows.forEach((row) => {
    const current = ensureCategory(row.metalGroup)
    current.pendingQty += row.remainingQty
    current.pendingRevenue += row.revenuePending
  })

  const poRows = activeLedgerRows.filter((row) => row.targetType === 'PO_SELL')
  const spotRows = activeLedgerRows.filter((row) => row.targetType === 'SPOT_SELL')
  const sumRows = (rows: CostAllocationLedgerRow[]) => {
    const revenue = rows.reduce((sum, row) => sum + row.allocatedRevenue, 0)
    const cost = rows.reduce((sum, row) => sum + row.totalCost, 0)
    const gp = revenue - cost
    const qty = rows.reduce((sum, row) => sum + row.allocatedQty, 0)
    return { cost, count: rows.length, gp, gpPct: pct(gp, revenue), qty, revenue }
  }

  return {
    ledgerRows,
    report: {
      byCategory: Array.from(byCategory.entries()).map(([category, values]) => ({ category, ...values, gpPct: pct(values.gp, values.revenue) })),
      po: sumRows(poRows),
      spotAllocated: sumRows(spotRows),
      total: sumRows(activeLedgerRows),
      waiting: {
        count: waitingRows.length,
        qty: waitingRows.reduce((sum, row) => sum + row.remainingQty, 0),
        revenue: waitingRows.reduce((sum, row) => sum + row.revenuePending, 0),
      },
    },
    waitingRows,
    waitingPoSellRows,
    waitingProductionRows,
  }
}
