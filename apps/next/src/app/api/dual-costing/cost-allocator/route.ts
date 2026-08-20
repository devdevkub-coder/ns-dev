import { NextResponse } from 'next/server'
import { parseInternalBigIntId, requireBusinessCode, stringifyBusinessValue } from '@/lib/business-code'
import { PO_SELL_STATUS, requirePoSellStatus } from '@/lib/po-sell-status'
import { apiErrorResponse } from '@/lib/server/api-error'
import { AuthContextError, authContextErrorResponse, getCurrentAuthContext, requirePermission } from '@/lib/server/auth-context'
import { canAccessBranchId, getAllowedBranchIds } from '@/lib/server/branch-scope'
import {
  COST_POOL_EPSILON,
  DUAL_COSTING_ALLOCATION_ADVISORY_LOCK,
  getCostPoolAvailableQty,
  getCostPoolStatus,
} from '@/lib/server/dual-costing-allocation-contract'
import { getDualCostingBranch } from '@/lib/server/dual-costing-branch'
import { toDateOnly, toNumber } from '@/lib/server/daily'
import { formatDualCostingMatchId, getDualCostingMatchIdPrefix } from '@/lib/server/dual-costing-match-id'
import { prisma } from '@/lib/server/prisma'
import { listProductReferences } from '@/lib/server/reference-master-cache'
import { DealMarginDataIntegrityError } from '@/lib/server/deal-margin-data-integrity'
import { getCostPoolRowsData } from '../cost-pool/handler'
export const runtime = 'nodejs'

type CostPoolRow = {
  availableQty: number
  availableValue: number
  branchName: string
  costPoolId: string
  costType: string
  counterparty: string
  date: string
  productId: string
  productName: string
  qty: number
  sourceNo: string
  sourceType: string
  status: string
  totalCost: number
  unitCost: number
  usedQty: number
}

type PoSellItem = {
  productCode?: string | null
  productId?: string | number | bigint | null
  productName?: string | null
  qty?: number | string | null
  remainingQty?: number | string | null
  totalAmount?: number | string | null
  totalRevenue?: number | string | null
  unitPrice?: number | string | null
}

type ProductRef = {
  code: string
  id: bigint
  metal_group: string | null
  name: string
}

type PoSellSourceRow = {
  items: unknown
  product_id: bigint | null
  qty: unknown
  remaining_qty: unknown
  unit_price: unknown
}

type SaleRow = {
  customerName: string
  date: string
  docNo: string
  id: string
  matchedQty: number
  productId: string
  productName: string
  qty: number
  remainingQty: number
  unitPrice: number
}

type ConfirmCandidate = {
  costPoolId: string
  qtyToUse: number
}

function jsonNumber(value: unknown) {
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0
  if (typeof value === 'string') {
    const parsed = Number(value.replace(/,/g, ''))
    return Number.isFinite(parsed) ? parsed : 0
  }
  return toNumber(value as { toNumber: () => number } | null | undefined)
}

function resolveProductCode(value: string | number | bigint | null | undefined, productById: Map<bigint, ProductRef>) {
  if (typeof value === 'string' && value.trim()) {
    const trimmed = value.trim()
    if (/^\d+$/.test(trimmed)) {
      const product = productById.get(BigInt(trimmed))
      return product ? requireBusinessCode(product.code, `สินค้า ${product.id}`) : ''
    }
    return trimmed
  }
  if (typeof value === 'number' || typeof value === 'bigint') {
    const product = productById.get(BigInt(value))
    return product ? requireBusinessCode(product.code, `สินค้า ${product.id}`) : ''
  }
  return ''
}

function itemRows(row: PoSellSourceRow, fallbackProduct: ProductRef | null, productById: Map<bigint, ProductRef>) {
  if (Array.isArray(row.items) && row.items.length) {
    return row.items
      .filter((item): item is PoSellItem => typeof item === 'object' && item !== null)
      .map((item, index) => ({
        lineId: `${resolveProductCode(item.productCode ?? item.productId ?? row.product_id, productById) || 'line'}-${index}`,
        productId: resolveProductCode(item.productCode ?? item.productId ?? row.product_id, productById),
        productName: item.productName ?? item.productCode ?? fallbackProduct?.name ?? '-',
        qty: jsonNumber(item.qty),
        remainingQty: jsonNumber(item.remainingQty ?? item.qty),
        totalAmount: jsonNumber(item.totalRevenue ?? item.totalAmount),
        unitPrice: jsonNumber(item.unitPrice ?? row.unit_price),
      }))
  }

  return [{
    lineId: fallbackProduct?.code || 'header',
    productId: fallbackProduct?.code ?? '',
    productName: fallbackProduct?.name ?? '-',
    qty: jsonNumber(row.qty),
    remainingQty: jsonNumber(row.remaining_qty ?? row.qty),
    totalAmount: 0,
    unitPrice: jsonNumber(row.unit_price),
  }]
}

function isCancelled(status: string | null | undefined) {
  return ['cancelled', 'canceled', 'short closed'].includes((status ?? '').trim().toLowerCase())
}

function isUnavailablePoSellForCosting(status: string | null | undefined, docNo: string) {
  const canonical = requirePoSellStatus(status, docNo)
  return canonical === PO_SELL_STATUS.CANCELLED || canonical === PO_SELL_STATUS.SHORT_CLOSED
}

function isDualCostingGroup(group?: string | null) {
  const normalized = (group ?? '').toLowerCase()
  return ['ทองแดง', 'ทองเหลือง', 'copper', 'brass'].some((key) => normalized.includes(key))
}

function sortPool(rows: CostPoolRow[], mode: string, targetCost: number) {
  const nextRows = [...rows]
  const incomingAsc = (left: CostPoolRow, right: CostPoolRow) =>
    left.date.localeCompare(right.date) ||
    left.sourceNo.localeCompare(right.sourceNo, undefined, { numeric: true }) ||
    left.costPoolId.localeCompare(right.costPoolId, undefined, { numeric: true })
  if (mode === 'Cheap') return nextRows.sort((left, right) => left.unitCost - right.unitCost || incomingAsc(left, right))
  if (mode === 'Expensive') return nextRows.sort((left, right) => right.unitCost - left.unitCost || incomingAsc(left, right))
  if (mode === 'LIFO') return nextRows.sort((left, right) => right.date.localeCompare(left.date) || left.sourceNo.localeCompare(right.sourceNo, undefined, { numeric: true }) || left.costPoolId.localeCompare(right.costPoolId, undefined, { numeric: true }))
  if (mode === 'Manual') return nextRows.sort((left, right) => Math.abs(left.unitCost - targetCost) - Math.abs(right.unitCost - targetCost) || incomingAsc(left, right))
  return nextRows.sort(incomingAsc)
}

function isFullQuantity(actualQty: number, expectedQty: number) {
  return Math.abs(actualQty - expectedQty) <= COST_POOL_EPSILON
}

function allocationFactSourceType(sourceType: string | null | undefined) {
  const normalized = (sourceType ?? '').trim().toLowerCase()
  if (normalized.includes('production')) return 'PRODUCTION'
  if (normalized.includes('regrade') || normalized.includes('grade')) return 'REGRADE'
  return 'TRADING_PURCHASE_BILL'
}

function nextMatchSequence(dealNumbers: Array<string | null>, prefix: string) {
  const pattern = new RegExp(`^${prefix}-(\\d{4})$`)
  return dealNumbers.reduce((highest, dealNo) => {
    const sequence = pattern.exec(dealNo ?? '')?.[1]
    return sequence ? Math.max(highest, Number(sequence)) : highest
  }, 0) + 1
}

function isAllocatableProductionStatus(status: string | null | undefined) {
  return ['open', 'in production', 'partially completed'].includes((status ?? 'Open').trim().toLowerCase())
}

function sumFactQty(facts: Array<{ qty: unknown }>) {
  return facts.reduce((sum, fact) => sum + toNumber(fact.qty as { toNumber: () => number }), 0)
}

export async function GET(request: Request) {
  try {
    const context = await getCurrentAuthContext()
    requirePermission(context, 'finance.cash.view')

    const url = new URL(request.url)
    const productId = url.searchParams.get('productId')
    const poSellId = url.searchParams.get('poSellId')
    const mode = url.searchParams.get('mode') ?? 'FIFO'
    const sourceType = url.searchParams.get('sourceType') ?? 'spot-sell'
    const targetCost = Number(url.searchParams.get('targetCost')) || 0
    const branch = await getDualCostingBranch()
    const allowedBranchIds = await getAllowedBranchIds(context)
    if (!canAccessBranchId(allowedBranchIds, branch.id, { allowNull: false })) {
      return NextResponse.json({ error: 'ไม่มีสิทธิ์เข้าถึงข้อมูล Dual Costing ของสาขานี้' }, { status: 403 })
    }

    const [costPool, poSells, salesBills, spotSalesBills, tradingDeals, products, productionOrders, tradingAllocationFacts] = await Promise.all([
      getCostPoolRowsData({ showAvailableOnly: true }),
      prisma.po_sells.findMany({
        include: { customers: true },
        orderBy: [{ date: 'desc' }, { doc_no: 'desc' }],
        take: 5000,
        where: {
          branch_id: branch.id,
          status: { in: [PO_SELL_STATUS.OPEN, PO_SELL_STATUS.PARTIALLY_FULFILLED, PO_SELL_STATUS.COMPLETED] },
        },
      }),
      prisma.sales_bills.findMany({
        select: { id: true, po_sell_id: true, doc_no: true },
        take: 10000,
        where: {
          branch_id: branch.id,
          NOT: { status: 'cancelled' },
          po_sell_id: { not: null },
        },
      }),
      prisma.sales_bills.findMany({
        include: {
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
          NOT: [
            { status: { in: ['cancelled', 'Cancelled', 'canceled', 'Canceled'] } },
            { transaction_mode: 'TRADING' },
          ],
          po_sell_id: null,
        },
      }),
      prisma.trading_deals.findMany({
        orderBy: [{ date: 'desc' }],
        take: 10000,
        where: { NOT: { status: { in: ['Cancelled', 'cancelled'] } } },
      }),
      listProductReferences().then((rows) => rows.map((row) => ({ ...row, metal_group: row.metalGroup }))),
      prisma.production_orders.findMany({
        include: {
          products: true,
          production_inputs: { include: { products: true }, where: { status: 'active' } },
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

    const productById = new Map(products.map((product) => [product.id, { ...product, code: requireBusinessCode(product.code, `สินค้า ${product.id}`) }]))
    const productByCode = new Map(Array.from(productById.values()).map((product) => [product.code, product]))
    const salesBillIdToPoSellId = new Map<bigint, bigint>()
    const salesBillDocNoToSalesBillId = new Map<string, bigint>()
    salesBills.forEach((bill) => {
      salesBillDocNoToSalesBillId.set(bill.doc_no, bill.id)
      if (bill.po_sell_id) {
        salesBillIdToPoSellId.set(bill.id, bill.po_sell_id)
      }
    })

    const poSellDocNoToPoSellId = new Map<string, bigint>()
    poSells.forEach((po) => {
      poSellDocNoToPoSellId.set(po.doc_no, po.id)
    })
    const allowedSalesBillIds = new Set(salesBills.map((bill) => bill.id.toString()))
    const allowedPoSellIds = new Set(poSells.map((po) => po.id.toString()))

    const matchedQtyByPoSellProduct = new Map<string, number>() // key: `${po_sell_id}|${product_id}`
    const matchedQtyByPoSellTarget = new Map<string, number>()
    const poSellIdsWithExactTargetFacts = new Set<string>()
    const matchedQtyByProductionProduct = new Map<string, number>()
    const matchedQtyBySpotProduct = new Map<string, number>() // key: `${sales_bill_id}:${product_id}`

    const accountedDealIds = new Set<bigint>()
    tradingAllocationFacts.forEach((fact) => {
      if (fact.status === 'active' && fact.trading_deal_id) {
        accountedDealIds.add(fact.trading_deal_id)
      }
    })

    const productionDocNos = new Set(productionOrders.map((order) => order.doc_no))

    // Process facts
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
      const isProductionTarget = Boolean(fact.sales_doc_no && productionDocNos.has(fact.sales_doc_no))
      const inBranchScope = isProductionTarget
        || (resolvedSalesBillId && allowedSalesBillIds.has(resolvedSalesBillId.toString()))
        || (resolvedPoSellId && allowedPoSellIds.has(resolvedPoSellId.toString()))
      if (!inBranchScope) return

      if (resolvedSalesBillId) {
        const key = `${resolvedSalesBillId.toString()}:${fact.product_id.toString()}`
        matchedQtyBySpotProduct.set(key, (matchedQtyBySpotProduct.get(key) ?? 0) + toNumber(fact.qty))
      }

      if (resolvedPoSellId) {
        const key = `${resolvedPoSellId.toString()}|${fact.product_id.toString()}`
        matchedQtyByPoSellProduct.set(key, (matchedQtyByPoSellProduct.get(key) ?? 0) + toNumber(fact.qty))
      }
      if (fact.target_ref_id) {
        matchedQtyByPoSellTarget.set(fact.target_ref_id, (matchedQtyByPoSellTarget.get(fact.target_ref_id) ?? 0) + toNumber(fact.qty))
        const poSellIdFromTarget = fact.target_ref_id.match(/^(\d+)-/)?.[1]
        if (poSellIdFromTarget) poSellIdsWithExactTargetFacts.add(poSellIdFromTarget)
      }
      if (isProductionTarget && fact.sales_doc_no) {
        const key = `${fact.sales_doc_no}|${fact.product_id.toString()}`
        matchedQtyByProductionProduct.set(key, (matchedQtyByProductionProduct.get(key) ?? 0) + toNumber(fact.qty))
      }
    })

    // Process deals not covered by facts
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
    const isProductionTarget = Boolean(deal.sales_bill_no && productionDocNos.has(deal.sales_bill_no))
    const inBranchScope = isProductionTarget
      || (resolvedSalesBillId && allowedSalesBillIds.has(resolvedSalesBillId.toString()))
      || (resolvedPoSellId && allowedPoSellIds.has(resolvedPoSellId.toString()))
      if (!inBranchScope) return

      if (resolvedSalesBillId) {
        const key = `${resolvedSalesBillId.toString()}:${deal.product_id.toString()}`
        matchedQtyBySpotProduct.set(key, (matchedQtyBySpotProduct.get(key) ?? 0) + toNumber(deal.matched_qty))
      }

    if (resolvedPoSellId) {
      const key = `${resolvedPoSellId.toString()}|${deal.product_id.toString()}`
      matchedQtyByPoSellProduct.set(key, (matchedQtyByPoSellProduct.get(key) ?? 0) + toNumber(deal.matched_qty))
    }
    if (isProductionTarget && deal.sales_bill_no) {
      const key = `${deal.sales_bill_no}|${deal.product_id.toString()}`
      matchedQtyByProductionProduct.set(key, (matchedQtyByProductionProduct.get(key) ?? 0) + toNumber(deal.matched_qty))
    }
    })

    const salesRows: SaleRow[] = poSells.flatMap((po) => {
      const fallbackProduct = po.product_id ? productById.get(po.product_id) ?? null : null
      const items = itemRows(po, fallbackProduct, productById)
      return items.map((item) => {
        const qty = item.remainingQty || item.qty || jsonNumber(po.remaining_qty ?? po.qty)

        const productObj = productByCode.get(item.productId)
        let matchedQty = 0
        if (productObj) {
          matchedQty = matchedQtyByPoSellTarget.get(`${po.id.toString()}-${item.lineId}`)
            ?? (poSellIdsWithExactTargetFacts.has(po.id.toString())
              ? 0
              : matchedQtyByPoSellProduct.get(`${po.id.toString()}|${productObj.id.toString()}`) ?? 0)
        }

        const remainingQty = Math.max(0, qty - matchedQty)
        const unitPrice = item.unitPrice || (qty > 0 ? (item.totalAmount || toNumber(po.total_amount)) / qty : 0)
        return {
          customerName: po.customers?.name ?? '-',
          date: toDateOnly(po.date),
          docNo: po.doc_no,
          id: `${stringifyBusinessValue(po.id)}-${item.lineId}`,
          matchedQty,
          productId: item.productId,
          productName: item.productName || fallbackProduct?.name || '-',
          qty,
          remainingQty,
          unitPrice,
        }
      })
    }).filter((row) => row.productId && row.remainingQty > 0)

    const spotSalesRows: SaleRow[] = spotSalesBills.flatMap((bill) => bill.sales_bill_lines.flatMap((line) => {
      const product = line.products
      if (!product || !isDualCostingGroup(product.metal_group)) return []
      const hasPoSellAllocation = line.sales_bill_po_sell_allocations.some((allocation) => allocation.status === 'active' && allocation.po_sell_id != null)
      if (hasPoSellAllocation) return []
      const productCode = requireBusinessCode(line.product_code_snapshot || product.code, `สินค้า ${product.id}`)
      const qty = jsonNumber(line.qty) || jsonNumber(line.net_weight)
      if (qty <= 0) return []
      const matchedQty = matchedQtyBySpotProduct.get(`${bill.id.toString()}:${line.product_id?.toString() ?? ''}`) ?? 0
      const remainingQty = Math.max(0, qty - matchedQty)
      if (remainingQty <= 0.001) return []
      return [{
        customerName: bill.customers?.name ?? '-',
        date: toDateOnly(bill.date),
        docNo: bill.doc_no,
        id: `${bill.doc_no}:${line.line_no}`,
        matchedQty,
        productId: productCode,
        productName: line.product_name_snapshot || product.name,
        qty,
        remainingQty,
        unitPrice: jsonNumber(line.unit_price),
      }]
    }))

    const productionRows: SaleRow[] = productionOrders.flatMap((order) => {
      const product = order.products
      if (!product || !isDualCostingGroup(product.metal_group)) return []
      if (!isAllocatableProductionStatus(order.status)) return []

      const inputQty = order.production_inputs.reduce((sum, input) => sum + toNumber(input.qty), 0)
      const inputCost = order.production_inputs.reduce((sum, input) => sum + toNumber(input.total_cost), 0)

      const qty = inputQty > 0 ? inputQty : (toNumber(order.planned_input_qty) || toNumber(order.qty_planned) || 0)
      if (qty <= 0) return []

      const matchedQty = Math.min(qty, matchedQtyByProductionProduct.get(`${order.doc_no}|${product.id.toString()}`) ?? 0)
      const remainingQty = Math.max(0, qty - matchedQty)
      if (remainingQty <= COST_POOL_EPSILON) return []
      const unitPrice = inputQty > 0 ? inputCost / inputQty : 0
      const productCode = requireBusinessCode(product.code, `สินค้า ${product.id}`)

      return [{
        customerName: '-',
        date: order.production_inputs.length > 0 ? toDateOnly(order.production_inputs[0].date) : toDateOnly(order.date),
        docNo: order.doc_no,
        id: order.doc_no,
        matchedQty,
        productId: productCode,
        productName: product.name,
        qty,
        remainingQty,
        unitPrice,
      }]
    })

    const targetRows = sourceType === 'po-sell'
      ? salesRows
      : sourceType === 'production'
      ? productionRows
      : spotSalesRows

    const poolRows = costPool.rows.filter((row) => row.productId && row.availableQty > 0)
    const productIds = new Set([...targetRows.map((row) => row.productId), ...poolRows.map((row) => row.productId)])
    const productOptions = Array.from(productIds).map((id) => {
      const product = productByCode.get(id)
      const poolForProduct = poolRows.filter((row) => row.productId === id)
      const salesForProduct = targetRows.filter((row) => row.productId === id)
      return {
        code: product?.code ?? id,
        id,
        metalGroup: product?.metal_group ?? '',
        name: product?.name ?? poolRows.find((row) => row.productId === id)?.productName ?? salesRows.find((row) => row.productId === id)?.productName ?? '-',
        poolCount: poolForProduct.length,
        poolQty: poolForProduct.reduce((sum, row) => sum + row.availableQty, 0),
        poSellCount: salesForProduct.length,
      }
    }).sort((left, right) => `${left.code} ${left.name}`.localeCompare(`${right.code} ${right.name}`))

    const filteredPool = productId ? poolRows.filter((row) => row.productId === productId) : []
    const filteredSales = productId ? targetRows.filter((row) => row.productId === productId) : []
    const selectedSale = poSellId ? filteredSales.find((row) => row.id === poSellId) ?? null : null
    const visibleSales = poSellId ? (selectedSale ? [selectedSale] : []) : filteredSales
    const selectedPool = sortPool(filteredPool, mode, targetCost)

    let need = selectedSale?.remainingQty ?? 0
    const candidates = selectedPool.flatMap((row) => {
      if (!selectedSale || need <= 0) return []
      const qtyToUse = Math.min(row.availableQty, need)
      need -= qtyToUse
      return [{
        ...row,
        qtyToUse,
        totalCostUse: qtyToUse * row.unitCost,
      }]
    })

    const totalToMatch = candidates.reduce((sum, row) => sum + row.qtyToUse, 0)
    const totalCostMatch = candidates.reduce((sum, row) => sum + row.totalCostUse, 0)
    const expectedRevenue = selectedSale ? totalToMatch * selectedSale.unitPrice : 0
    const expectedMargin = expectedRevenue - totalCostMatch
    const poolQty = filteredPool.reduce((sum, row) => sum + row.availableQty, 0)
    const poolValue = filteredPool.reduce((sum, row) => sum + row.availableValue, 0)

    return NextResponse.json({
      candidates,
      filters: {
        modes: ['FIFO', 'LIFO', 'Cheap', 'Expensive', 'Manual'],
        products: productOptions,
        sourceTypes: ['po-sell', 'spot-sell', 'production'],
      },
      pool: selectedPool,
      poSells: visibleSales,
      selectedPoSell: selectedSale,
      summary: {
        expectedMargin,
        expectedRevenue,
        poolAvgCost: poolQty > 0 ? poolValue / poolQty : 0,
        poolCount: filteredPool.length,
        poolQty,
        poolValue,
        remainingAfterPreview: Math.max(0, need),
        totalCostMatch,
        totalToMatch,
      },
      writeDeferred: false,
    }, { headers: { 'Cache-Control': 'private, no-store' } })
  } catch (caught) {
    if (caught instanceof AuthContextError) return authContextErrorResponse(caught)
    return apiErrorResponse(caught, 'โหลด Cost Allocator ไม่ได้', 500)
  }
}

export async function POST(request: Request) {
  try {
    const context = await getCurrentAuthContext()
    requirePermission(context, 'finance.dual_costing.allocate')

    const body = await request.json()
    const { productId, poSellId, sourceType, candidates, notes } = body as {
      candidates?: ConfirmCandidate[]
      notes?: string
      poSellId?: string
      productId?: string
      sourceType?: string
    }

    const targetSourceType = String(sourceType ?? '').trim().toLowerCase()
    if (!productId || !poSellId || !targetSourceType || !Array.isArray(candidates) || candidates.length === 0) {
      return NextResponse.json({ error: 'ข้อมูลไม่ครบถ้วน' }, { status: 400 })
    }
    if (!['po-sell', 'production', 'spot-sell'].includes(targetSourceType)) {
      return NextResponse.json({ error: 'ประเภทเป้าหมายไม่ถูกต้อง' }, { status: 400 })
    }

    const normalizedCandidates = candidates
      .map((candidate) => ({
        costPoolId: String(candidate.costPoolId ?? '').trim(),
        qtyToUse: Number(candidate.qtyToUse ?? 0),
      }))
      .filter((candidate) => Number.isFinite(candidate.qtyToUse) && candidate.qtyToUse > 0)

    if (normalizedCandidates.length === 0) {
      return NextResponse.json({ error: 'ไม่มีรายการที่พร้อมยืนยันการจัดสรร' }, { status: 400 })
    }

    const invalidCandidate = normalizedCandidates.find((candidate) => !candidate.costPoolId)
    if (invalidCandidate) {
      return NextResponse.json({ error: 'ข้อมูลต้นทุนที่เลือกไม่สมบูรณ์ กรุณาเปิด Preview ใหม่แล้วลองอีกครั้ง' }, { status: 400 })
    }

    if (new Set(normalizedCandidates.map((candidate) => candidate.costPoolId)).size !== normalizedCandidates.length) {
      return NextResponse.json({ error: 'เลือกรายการ Cost Pool ซ้ำ กรุณาเปิด Preview ใหม่' }, { status: 400 })
    }

    const actor = context.appUser?.email?.trim() || context.authUser.email?.trim() || context.authUser.id
    const branch = await getDualCostingBranch()
    const allowedBranchIds = await getAllowedBranchIds(context)
    if (!canAccessBranchId(allowedBranchIds, branch.id, { allowNull: false })) {
      return NextResponse.json({ error: 'ไม่มีสิทธิ์จัดสรรต้นทุนของสาขานี้' }, { status: 403 })
    }
    const result = await prisma.$transaction(async (tx) => {
      // ponytail: one L5 allocation lock is intentionally global until measured contention justifies scoped locks.
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(${DUAL_COSTING_ALLOCATION_ADVISORY_LOCK})`

      // 1. Find product
      const product = await tx.products.findFirst({
        where: { code: productId }
      })
      if (!product) throw new Error(`ไม่พบรหัสสินค้า: ${productId}`)

      if (!isDualCostingGroup(product.metal_group)) {
        throw new Error(`Product ${product.code} is not eligible for Dual Costing`)
      }

      // 2. Resolve target document
      let customerId: bigint | null = null
      let salesBillId: bigint | null = null
      let salesDocNo: string | null = null
      let salesLineNo: number | null = null
      let customerNameSnapshot: string | null = null
      let targetRefId: string | null = null
      let targetQty = 0
      let unitPrice = 0

      if (targetSourceType === 'spot-sell') {
        const [docNo, lineNoStr] = poSellId.split(':')
        const lineNo = parseInt(lineNoStr)
        if (!docNo || !Number.isFinite(lineNo)) throw new Error(`เลขรายการขายไม่ถูกต้อง: ${poSellId}`)
        const salesBill = await tx.sales_bills.findFirst({
          where: {
            branch_id: branch.id,
            doc_no: docNo,
            NOT: { status: 'cancelled' },
          },
          include: {
            customers: true,
            sales_bill_lines: {
              include: {
                products: true,
                sales_bill_po_sell_allocations: { where: { status: 'active' } },
              },
              where: { line_no: lineNo, status: 'active' },
            }
          }
        })
        if (!salesBill) throw new Error(`ไม่พบเอกสารขาย: ${docNo}`)
        const line = salesBill.sales_bill_lines[0]
        if (!line) throw new Error(`ไม่พบไลน์ที่: ${lineNo} ในบิลขาย: ${docNo}`)
        
        if (isCancelled(salesBill.status) || salesBill.transaction_mode === 'TRADING') {
          throw new Error(`Sales Bill ${docNo} is not an active Spot Sell target`)
        }
        if (line.product_id !== product.id || !isDualCostingGroup(line.products?.metal_group)) {
          throw new Error(`Sales Bill ${docNo} line ${lineNo} does not match product ${product.code}`)
        }
        if (line.sales_bill_po_sell_allocations.some((allocation) => allocation.po_sell_id != null)) {
          throw new Error(`Sales Bill ${docNo} line ${lineNo} is already linked to PO Sell`)
        }
        targetQty = jsonNumber(line.qty) || jsonNumber(line.net_weight)
        if (targetQty <= COST_POOL_EPSILON) {
          throw new Error(`Sales Bill ${docNo} line ${lineNo} has no quantity available for allocation`)
        }

        salesBillId = salesBill.id
        salesDocNo = salesBill.doc_no
        customerId = salesBill.customer_id
        customerNameSnapshot = salesBill.customers?.name || null
        salesLineNo = line.line_no
        unitPrice = toNumber(line.unit_price)
      } else if (targetSourceType === 'po-sell') {
        const poId = parseInternalBigIntId(poSellId.split('-')[0])
        if (!poId) throw new Error(`เลข PO Sell ไม่ถูกต้อง: ${poSellId}`)
        const poSell = await tx.po_sells.findFirst({
          where: { id: poId, branch_id: branch.id },
          include: { customers: true }
        })
        if (!poSell) throw new Error(`ไม่พบ PO Sell ID: ${poId}`)
        if (isUnavailablePoSellForCosting(poSell.status, poSell.doc_no)) {
          throw new Error(`PO Sell ${poSell.doc_no} ถูกปิดหรือยกเลิกแล้ว`)
        }
        if (poSell.branch_id !== branch.id) throw new Error(`ไม่พบ PO Sell ID: ${poId}`)

        const productRows = await tx.products.findMany({
          select: { code: true, id: true, metal_group: true, name: true },
        })
        const productById = new Map(productRows.map((row) => [row.id, row]))
        const fallbackProduct = poSell.product_id ? productById.get(poSell.product_id) ?? null : null
        const targetItem = itemRows(poSell, fallbackProduct, productById).find((item) => `${poSell.id.toString()}-${item.lineId}` === poSellId)
        if (!targetItem) throw new Error(`PO Sell target line is not valid: ${poSellId}`)
        if (targetItem.productId !== product.code) {
          throw new Error(`PO Sell ${poSell.doc_no} target line does not match product ${product.code}`)
        }
        targetQty = targetItem.remainingQty
        if (targetQty <= COST_POOL_EPSILON) {
          throw new Error(`PO Sell ${poSell.doc_no} target line has no quantity available for allocation`)
        }
        targetRefId = poSellId

        const salesBill = await tx.sales_bills.findFirst({
          where: {
            branch_id: branch.id,
            po_sell_id: poId,
            NOT: { status: 'cancelled' },
          }
        })

        salesBillId = salesBill?.id || null
        salesDocNo = poSell.doc_no
        customerId = poSell.customer_id
        customerNameSnapshot = poSell.customers?.name || null
        unitPrice = targetItem.unitPrice || (targetQty > 0 ? targetItem.totalAmount / targetQty : 0)
      } else if (targetSourceType === 'production') {
        const prodOrder = await tx.production_orders.findFirst({
          where: {
            branch_id: branch.id,
            doc_no: poSellId,
          },
          include: {
            products: true,
            production_inputs: { where: { status: 'active' } },
          }
        })
        if (!prodOrder) throw new Error(`ไม่พบใบสั่งผลิต: ${poSellId}`)
        if (!isAllocatableProductionStatus(prodOrder.status)) {
          throw new Error(`Production order ${prodOrder.doc_no} is not open for allocation`)
        }
        if (prodOrder.product_id !== product.id || !isDualCostingGroup(prodOrder.products?.metal_group)) {
          throw new Error(`Production order ${prodOrder.doc_no} does not match product ${product.code}`)
        }
        const inputQty = prodOrder.production_inputs.reduce((sum, input) => sum + toNumber(input.qty), 0)
        targetQty = inputQty > 0 ? inputQty : (toNumber(prodOrder.planned_input_qty) || toNumber(prodOrder.qty_planned))
        if (targetQty <= COST_POOL_EPSILON) {
          throw new Error(`Production order ${prodOrder.doc_no} has no quantity available for allocation`)
        }
        salesDocNo = prodOrder.doc_no
        unitPrice = 0
      } else {
        throw new Error(`ไม่รองรับประเภทเป้าหมาย: ${targetSourceType}`)
      }

      const activeTargetFacts = await tx.trading_allocation_facts.findMany({
        where: targetSourceType === 'po-sell'
          ? {
              OR: [
                { target_ref_id: targetRefId },
                { sales_doc_no: salesDocNo, target_ref_id: null },
              ],
              product_id: product.id,
              status: 'active',
            }
          : targetSourceType === 'spot-sell'
            ? {
                product_id: product.id,
                sales_bill_id: salesBillId,
                sales_line_no: salesLineNo,
                status: 'active',
              }
            : {
                product_id: product.id,
                sales_bill_id: null,
                sales_doc_no: salesDocNo,
                status: 'active',
              },
      })
      const legacyPoFacts = targetSourceType === 'po-sell'
        ? activeTargetFacts.filter((fact) => fact.target_ref_id == null)
        : []
      if (legacyPoFacts.length > 0) {
        throw new Error(`PO Sell ${salesDocNo} has legacy allocation facts without an exact target line`)
      }
      const allocatedTargetQty = sumFactQty(activeTargetFacts)
      const remainingTargetQty = Math.max(0, targetQty - allocatedTargetQty)
      if (remainingTargetQty <= COST_POOL_EPSILON) {
        throw new Error(`Target ${salesDocNo} is already fully allocated`)
      }
      const requestedQty = normalizedCandidates.reduce((sum, candidate) => sum + candidate.qtyToUse, 0)
      if (!isFullQuantity(requestedQty, remainingTargetQty)) {
        throw new Error(`Allocation quantity must equal the latest target remaining quantity (${remainingTargetQty})`)
      }

      if (salesBillId != null && salesLineNo != null) {
        if (normalizedCandidates.length > 1) {
          throw new DealMarginDataIntegrityError(
            `ไม่สามารถจัดสรรหลาย Allocation ให้ Sales Bill ${salesDocNo ?? '-'}, Sales Line ${salesLineNo} ได้`,
            { allocationNos: [], salesDocNo, salesLineNo },
          )
        }

        const existingAllocations = await tx.trading_allocation_facts.findMany({
          where: { sales_bill_id: salesBillId, sales_line_no: salesLineNo, status: 'active' },
          select: { allocation_no: true },
        })
        if (existingAllocations.length > 0) {
          throw new DealMarginDataIntegrityError(
            `พบ Allocation ซ้ำใน Sales Bill ${salesDocNo ?? '-'}, Sales Line ${salesLineNo}`,
            {
              allocationNos: existingAllocations.map((allocation) => allocation.allocation_no),
              salesDocNo,
              salesLineNo,
            },
          )
        }
      }

      const allocationDate = new Date()
      const matchIdPrefix = getDualCostingMatchIdPrefix(allocationDate)
      const existingMatchRows = await tx.trading_deals.findMany({
        where: {
          deal_no: {
            startsWith: `${matchIdPrefix}-`,
          },
        },
        select: { deal_no: true },
      })
      const matchId = formatDualCostingMatchId(allocationDate, nextMatchSequence(existingMatchRows.map((row) => row.deal_no), matchIdPrefix))

      const createdDeals = []
      const createdFacts = []

      // 3. Process candidates
      for (let i = 0; i < normalizedCandidates.length; i++) {
        const cand = normalizedCandidates[i]
        const qtyToUse = cand.qtyToUse
        if (qtyToUse <= 0) continue

        let purchaseBillId: bigint | null = null
        let supplierId: bigint | null = null
        let supplierNameSnapshot: string | null = null
        let pb = null
        let poBuy = null
        const poolEntry = await tx.stock_cost_pool_entries.findFirst({
          where: {
            branch_id: branch.id,
            pool_key: cand.costPoolId,
          }
        })
        if (!poolEntry) {
          throw new Error(`ไม่พบ Cost Pool Entry สำหรับ key: ${cand.costPoolId}`)
        }
        const availableQty = getCostPoolAvailableQty(
          toNumber(poolEntry.original_qty),
          toNumber(poolEntry.allocated_qty),
          toNumber(poolEntry.released_qty),
        )
        if (qtyToUse > availableQty + 0.001) {
          throw new Error(`Cost Pool ${poolEntry.pool_key} คงเหลือไม่พอสำหรับยืนยัน กรุณาเปิด Preview ใหม่อีกครั้ง`)
        }
        if (poolEntry.branch_id !== branch.id) {
          throw new Error(`Cost Pool ${poolEntry.pool_key} ไม่ได้อยู่ในสาขา ${branch.name}`)
        }
        if (poolEntry.product_id !== product.id) {
          throw new Error(`Cost Pool ${poolEntry.pool_key} ไม่ตรงกับสินค้าที่ต้องการจัดสรร`)
        }
        const sourceNo = poolEntry.source_ref_no?.trim() || poolEntry.pool_key
        const sourceLineNo = poolEntry.source_line_id && /^\d+$/.test(poolEntry.source_line_id)
          ? Number(poolEntry.source_line_id)
          : null
        const unitCost = toNumber(poolEntry.unit_cost)

        const sourceRefId = parseInternalBigIntId(poolEntry.source_ref_id)
        const sourceRefType = (poolEntry.source_ref_type ?? '').trim().toLowerCase()
        const sourceKind = (poolEntry.source_type ?? '').trim().toLowerCase()
        const sourceFactType = allocationFactSourceType(poolEntry.source_type || poolEntry.source_ref_type)
        if (sourceRefType === 'pb' || sourceKind.includes('purchase') || sourceKind === 'spot_buy') {
          pb = sourceRefId
            ? await tx.purchase_bills.findFirst({
              where: { id: sourceRefId, NOT: { status: { in: ['cancelled', 'Cancelled'] } } },
              include: { suppliers: true },
            })
            : await tx.purchase_bills.findFirst({
              where: { doc_no: sourceNo, NOT: { status: { in: ['cancelled', 'Cancelled'] } } },
              include: { suppliers: true },
            })
          if (pb) {
            purchaseBillId = pb.id
            supplierId = pb.supplier_id
            supplierNameSnapshot = pb.suppliers?.name || null
          }
        }
        if (!pb && (sourceRefType === 'pob' || sourceKind.includes('po_buy') || sourceKind.includes('purchase'))) {
          poBuy = sourceRefId
            ? await tx.po_buys.findFirst({
              where: { id: sourceRefId, NOT: { status: { in: ['cancelled', 'Cancelled'] } } },
              include: { suppliers: true },
            })
            : await tx.po_buys.findFirst({
              where: { doc_no: sourceNo, NOT: { status: { in: ['cancelled', 'Cancelled'] } } },
              include: { suppliers: true },
            })
          if (poBuy) {
            supplierId = poBuy.supplier_id
            supplierNameSnapshot = poBuy.suppliers?.name || null
          }
        }
        if (!supplierNameSnapshot) {
          supplierNameSnapshot = sourceFactType === 'PRODUCTION'
            ? 'การผลิต'
            : sourceFactType === 'REGRADE'
              ? 'ปรับเกรด'
              : 'รับซื้อ'
        }

        const nextAllocatedQty = toNumber(poolEntry.allocated_qty) + qtyToUse
        const nextStatus = getCostPoolStatus(
          toNumber(poolEntry.original_qty),
          nextAllocatedQty,
          toNumber(poolEntry.released_qty),
        )
        await tx.stock_cost_pool_entries.update({
          where: { id: poolEntry.id },
          data: {
            allocated_qty: nextAllocatedQty,
            status: nextStatus,
            updated_at: new Date(),
            updated_by: actor
          }
        })

        // Create trading deal
        const deal = await tx.trading_deals.create({
          data: {
            deal_no: matchId,
            date: allocationDate,
            purchase_bill_id: purchaseBillId,
            purchase_bill_no: pb?.doc_no || sourceNo,
            sales_bill_id: salesBillId,
            sales_bill_no: salesDocNo,
            product_id: product.id,
            supplier_id: supplierId,
            customer_id: customerId,
            matched_qty: qtyToUse,
            matched_purchase_amount: qtyToUse * unitCost,
            matched_sales_amount: qtyToUse * unitPrice,
            ex_vat: true,
            status: 'Matched',
            notes: notes || 'Matched via Cost Allocator',
            created_by: actor,
            created_at: allocationDate,
            updated_at: allocationDate,
            updated_by: actor
          }
        })
        createdDeals.push(deal)

        // Create trading allocation fact
        const fact = await tx.trading_allocation_facts.create({
          data: {
            allocation_no: `TAF-${matchId}-${String(i + 1).padStart(3, '0')}`,
            date: allocationDate,
            trading_deal_id: deal.id,
            purchase_bill_id: purchaseBillId,
            sales_bill_id: salesBillId,
            supplier_id: supplierId,
            customer_id: customerId,
            product_id: product.id,
            cost_pool_entry_id: poolEntry.id,
            target_ref_id: targetRefId,
            source_type: sourceFactType,
            source_doc_no: sourceNo,
            source_line_no: sourceLineNo,
            sales_doc_no: salesDocNo,
            sales_line_no: salesLineNo,
            product_code_snapshot: product.code,
            product_name_snapshot: product.name,
            supplier_name_snapshot: supplierNameSnapshot,
            customer_name_snapshot: customerNameSnapshot || (targetSourceType === 'production' ? 'ภายในโรงงาน' : '-'),
            qty: qtyToUse,
            sales_amount: qtyToUse * unitPrice,
            matched_cogs: qtyToUse * unitCost,
            allocation_method: 'RECORDED_LINE',
            status: 'active',
            notes: notes || 'Matched via Cost Allocator',
            created_by: actor,
            created_at: allocationDate,
            updated_at: allocationDate,
            updated_by: actor
          }
        })
        createdFacts.push(fact)
      }

      return {
        dealsCount: createdDeals.length,
        factsCount: createdFacts.length,
        matchId,
      }
    })

    return NextResponse.json({
      success: true,
      message: 'ยืนยันการจัดสรรต้นทุนสำเร็จ',
      result
    }, { headers: { 'Cache-Control': 'private, no-store' } })
  } catch (caught) {
    if (caught instanceof AuthContextError) return authContextErrorResponse(caught)
    if (caught instanceof DealMarginDataIntegrityError) {
      return NextResponse.json({ code: caught.code, details: caught.details, error: caught.message }, { status: 409 })
    }
    if (
      caught instanceof Error
      && !('code' in caught && typeof (caught as { code?: unknown }).code === 'string' && (caught as { code: string }).code.startsWith('P'))
    ) {
      return NextResponse.json({ code: 'BAD_REQUEST', error: caught.message }, { status: 400 })
    }
    return apiErrorResponse(caught, 'ยืนยันการจัดสรรต้นทุนไม่สำเร็จ', 500)
  }
}
