import type { Prisma } from '../../../generated/prisma/client'
import { outwardCustomerReference } from '@/lib/server/customer-reference'
import { requireBusinessCode } from '@/lib/business-code'
import { PURCHASE_BILL_CANCELLED_STATUSES } from '@/lib/purchase-bill-status'
import { toDateOnly, toNumber } from '@/lib/server/daily'
import { getSalesPlanLmeConfig, type SalesPlanLmeConfig } from './sales-plan-lme'
import { prisma } from '@/lib/server/prisma'
import { purchaseBillItemRows } from '@/lib/server/purchase-bill-items'
import { listSalesPlans } from './sales-plans'

type JsonItem = Prisma.JsonObject

type ProductRef = {
  code: string
  id: bigint
  itemStatus: string
  metalGroup: string
  name: string
  wac: number
}

type PendingProductRow = {
  avgPriceRemain: number
  avgPriceAll: number
  diffPctLme: number
  diffPctWac: number
  gainVsLme: number
  gainVsWac: number
  lmeBuyPercent: number
  lmeTarget: number
  metalGroup: string
  poCount: number
  productCode: string
  productId: string
  productName: string
  remainQty: number
  remainValue: number
  soldQty: number
  soldValue: number
  wac: number
}

function isCostPoolEligibleMetalGroup(metalGroup: string) {
  const normalized = metalGroup.toLowerCase()
  return ['ทองแดง', 'ทองเหลือง', 'copper', 'brass'].some((key) => normalized.includes(key))
}

function jsonNumber(value: unknown) {
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0
  if (typeof value === 'string') {
    const parsed = Number(value.replace(/,/g, ''))
    return Number.isFinite(parsed) ? parsed : 0
  }
  if (value && typeof value === 'object' && 'toNumber' in value && typeof value.toNumber === 'function') return value.toNumber()
  return 0
}

function isJsonItem(value: unknown): value is JsonItem {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function itemQty(item: JsonItem) {
  return jsonNumber(item.qty ?? item.quantity ?? item.netWeight ?? item.weight)
}

function itemRemainingQty(item: JsonItem) {
  return jsonNumber(item.remainingQty ?? item.remaining_qty ?? item.remaining ?? itemQty(item))
}

function itemUnitPrice(item: JsonItem) {
  return jsonNumber(item.unitPrice ?? item.price ?? item.itemPrice)
}

function itemAmount(item: JsonItem) {
  const amount = jsonNumber(item.totalAmount ?? item.totalRevenue ?? item.amount ?? item.total)
  if (amount) return amount
  return itemQty(item) * itemUnitPrice(item)
}

function itemProductId(item: JsonItem) {
  return String(item.productId ?? item.product_id ?? item.id ?? '').trim()
}

function itemProductName(item: JsonItem) {
  return String(item.productName ?? item.displayName ?? item.name ?? item.productCode ?? item.code ?? '').trim()
}

function itemProductCode(item: JsonItem) {
  return String(item.productCode ?? item.code ?? '').trim()
}

function productKey(product: ProductRef) {
  return [String(product.id), product.code, product.name].map((value) => value.trim().toLowerCase()).filter(Boolean)
}

function lookupProduct(item: JsonItem, productsByKey: Map<string, ProductRef>) {
  return [
    item.productId,
    item.product_id,
    item.id,
    item.productCode,
    item.code,
    item.productName,
    item.displayName,
    item.name,
  ].map((value) => String(value ?? '').trim().toLowerCase()).filter(Boolean).map((key) => productsByKey.get(key)).find(Boolean)
}

function lmeBaseFor(metalGroup: string, config: SalesPlanLmeConfig) {
  const group = metalGroup.toLowerCase()
  if (group.includes('ทองแดง') || group.includes('copper')) return config.lmeCopperUSD
  if (group.includes('ทองเหลือง') || group.includes('brass')) return config.lmeBrassUSD
  if (group.includes('อลูมิ') || group.includes('aluminum')) return config.lmeAluminumUSD
  return 0
}

function lmeBuyPercentFor(metalGroup: string) {
  const group = metalGroup.toLowerCase()
  if (group.includes('ทองแดง') || group.includes('copper')) return 88
  if (group.includes('ทองเหลือง') || group.includes('brass')) return 82
  if (group.includes('อลูมิ') || group.includes('aluminum')) return 76
  return 0
}

function lmeTarget(metalGroup: string, config: SalesPlanLmeConfig) {
  const base = lmeBaseFor(metalGroup, config)
  const pct = lmeBuyPercentFor(metalGroup)
  return base > 0 && pct > 0 ? (base / 1000) * config.fxRate * (pct / 100) : 0
}

function activeStatus(status?: string | null) {
  return !['cancelled', 'void', 'reversed'].includes((status ?? '').toLowerCase())
}

function activePoSellStatus(status?: string | null) {
  return activeStatus(status) && !['canceled', 'closed', 'completed', 'fully matched', 'received', 'short closed'].includes((status ?? '').toLowerCase())
}

async function productsContext() {
  const products = await prisma.products.findMany({
    orderBy: [{ code: 'asc' }],
    select: { code: true, id: true, metal_group: true, name: true, std_cost: true },
    where: { active: { not: false } },
  })
  const refs = products.map((product) => ({
    code: product.code,
    id: product.id,
    itemStatus: '',
    metalGroup: product.metal_group ?? '',
    name: product.name,
    wac: toNumber(product.std_cost),
  }))
  const byKey = new Map<string, ProductRef>()
  refs.forEach((product) => productKey(product).forEach((key) => byKey.set(key, product)))
  return { byKey, refs }
}

function poSellItems(row: { items: unknown; product_id: bigint | null; qty: unknown; remaining_qty: unknown; unit_price: unknown }, productsByKey: Map<string, ProductRef>) {
  if (Array.isArray(row.items) && row.items.length) {
    return row.items.filter(isJsonItem).map((item) => {
      const product = lookupProduct(item, productsByKey)
      const qty = itemQty(item)
      const remainingQty = itemRemainingQty(item)
      const unitPrice = itemUnitPrice(item) || (qty > 0 ? itemAmount(item) / qty : 0)
      return {
        product,
        productCode: product?.code ?? itemProductCode(item),
        productId: product?.code ?? '',
        productName: product?.name ?? (itemProductName(item) || 'ไม่ระบุสินค้า'),
        qty,
        remainingQty,
        unitPrice,
      }
    })
  }
  const product = row.product_id != null ? productsByKey.get(String(row.product_id).trim().toLowerCase()) : undefined
  return [{
    product,
    productCode: product?.code ?? '',
    productId: product?.code ?? '',
    productName: product?.name ?? 'ไม่ระบุสินค้า',
    qty: jsonNumber(row.qty),
    remainingQty: jsonNumber(row.remaining_qty ?? row.qty),
    unitPrice: jsonNumber(row.unit_price),
  }]
}

async function buildSalesPlanningSnapshot() {
  const config = await getSalesPlanLmeConfig()
  const { byKey, refs } = await productsContext()
  const salesPlanRefs = refs.filter((product) => isCopperOrBrassGroup(product.metalGroup))
  const [poSells, poBuys, stockRows, customers, salesChannels, tradingDeals, purchaseBills] = await Promise.all([
    prisma.po_sells.findMany({ include: { customers: true }, orderBy: [{ date: 'desc' }, { doc_no: 'desc' }], take: 5000 }),
    prisma.po_buys.findMany({ orderBy: [{ date: 'desc' }, { doc_no: 'desc' }], take: 5000 }),
    prisma.stock_ledger.findMany({ orderBy: [{ date: 'desc' }], take: 50000 }),
    prisma.customers.findMany({ orderBy: [{ name: 'asc' }], select: { active: true, code: true, id: true, market_scope: true, name: true } }),
    prisma.sales_channels.findMany({ orderBy: [{ name: 'asc' }], select: { active: true, code: true, id: true, name: true }, where: { active: true } }),
    prisma.trading_deals.findMany({ orderBy: [{ date: 'desc' }], take: 10000, where: { NOT: { status: { in: ['Cancelled', 'cancelled'] } } } }),
    prisma.purchase_bills.findMany({ include: { purchase_bill_items: { orderBy: { line_no: 'asc' }, where: { item_status: 'active' } } }, orderBy: [{ date: 'desc' }], take: 10000, where: { status: { notIn: [...PURCHASE_BILL_CANCELLED_STATUSES] } } }),
  ])

  const productAgg = new Map<string, PendingProductRow>()
  const details: Array<{ customerId: string; customerName: string; date: string; deliveryDate: string; docNo: string; id: string; itemPrice: number; itemQty: number; matched: number; productId: string; remaining: number; remainValue: number }> = []
  const ensureAgg = (values: { product?: ProductRef; productCode: string; productId: string; productName: string }) => {
    const product = values.product
    const key = product ? String(product.id) : values.productId
    const metalGroup = product?.metalGroup ?? ''
    if (!productAgg.has(key)) {
      productAgg.set(key, {
        avgPriceAll: 0,
        avgPriceRemain: 0,
        diffPctLme: 0,
        diffPctWac: 0,
        gainVsLme: 0,
        gainVsWac: 0,
        lmeBuyPercent: lmeBuyPercentFor(metalGroup),
        lmeTarget: lmeTarget(metalGroup, config),
        metalGroup,
        poCount: 0,
        productCode: product?.code ?? values.productCode,
        productId: key,
        productName: product?.name ?? values.productName,
        remainQty: 0,
        remainValue: 0,
        soldQty: 0,
        soldValue: 0,
        wac: product?.wac ?? 0,
      })
    }
    return productAgg.get(key)!
  }

  poSells.filter((po) => activePoSellStatus(po.status)).forEach((po) => {
    poSellItems(po, byKey).forEach((item) => {
      const qty = item.qty
      const remaining = Math.max(0, item.remainingQty)
      const sold = Math.max(0, qty - remaining)
      const row = ensureAgg(item)
      row.poCount += 1
      row.remainQty += remaining
      row.soldQty += sold
      row.remainValue += remaining * item.unitPrice
      row.soldValue += sold * item.unitPrice
      const customerRef = outwardCustomerReference(po.customers, po.customer_id)
      details.push({
        customerId: customerRef.customerId ?? '',
        customerName: customerRef.customerName ?? '-',
        date: toDateOnly(po.date),
        deliveryDate: toDateOnly(po.delivery_date ?? po.expected_delivery),
        docNo: po.doc_no,
        id: `${po.doc_no}:${item.productId}`,
        itemPrice: item.unitPrice,
        itemQty: qty,
        matched: sold,
        productId: row.productId,
        remaining,
        remainValue: remaining * item.unitPrice,
      })
    })
  })

  const productRows = Array.from(productAgg.values()).map((row) => {
    const qty = row.remainQty + row.soldQty
    const value = row.remainValue + row.soldValue
    const avgPriceAll = qty > 0 ? value / qty : 0
    const avgPriceRemain = row.remainQty > 0 ? row.remainValue / row.remainQty : avgPriceAll
    const target = row.lmeTarget
    return {
      ...row,
      avgPriceAll,
      avgPriceRemain,
      diffPctLme: target > 0 ? ((avgPriceRemain - target) / target) * 100 : 0,
      diffPctWac: row.wac > 0 ? ((avgPriceRemain - row.wac) / row.wac) * 100 : 0,
      gainVsLme: target > 0 ? (avgPriceRemain - target) * row.remainQty : 0,
      gainVsWac: (avgPriceRemain - row.wac) * row.remainQty,
    }
  }).sort((left, right) => right.remainValue - left.remainValue)

  const stockByProduct = new Map<bigint, { qty: number; value: number }>()
  stockRows.forEach((stock) => {
    if (stock.product_id == null) return
    const current = stockByProduct.get(stock.product_id) ?? { qty: 0, value: 0 }
    current.qty += toNumber(stock.qty_in) - toNumber(stock.qty_out)
    current.value += toNumber(stock.value_in) - toNumber(stock.value_out)
    stockByProduct.set(stock.product_id, current)
  })

  const matchedByProduct = new Map<bigint, number>()
  tradingDeals.forEach((deal) => {
    if (deal.product_id == null) return
    matchedByProduct.set(deal.product_id, (matchedByProduct.get(deal.product_id) ?? 0) + toNumber(deal.matched_qty))
  })

  const spotByProduct = new Map<bigint, { amount: number; qty: number }>()
  purchaseBills.forEach((bill) => {
    purchaseBillItemRows(bill).filter(isJsonItem).forEach((item) => {
      const product = lookupProduct(item, byKey)
      if (!product) return
      const current = spotByProduct.get(product.id) ?? { amount: 0, qty: 0 }
      current.qty += itemQty(item)
      current.amount += itemAmount(item)
      spotByProduct.set(product.id, current)
    })
  })

  const poBuyByProduct = new Map<bigint, { amount: number; qty: number }>()
  poBuys.filter((po) => activeStatus(po.status)).forEach((po) => {
    const product = po.product_id != null ? byKey.get(String(po.product_id).trim().toLowerCase()) : undefined
    if (!product) return
    const qty = toNumber(po.remaining_qty ?? po.qty)
    const amount = toNumber(po.remaining_amount) || qty * toNumber(po.unit_price)
    const current = poBuyByProduct.get(product.id) ?? { amount: 0, qty: 0 }
    current.qty += qty
    current.amount += amount
    poBuyByProduct.set(product.id, current)
  })

  const poSellOpenByProduct = new Map<string, number>()
  poSells.filter((po) => activePoSellStatus(po.status)).forEach((po) => {
    poSellItems(po, byKey).forEach((item) => {
      if (!item.product?.id && !item.productId) return
      const key = item.product ? String(item.product.id) : item.productId
      poSellOpenByProduct.set(key, (poSellOpenByProduct.get(key) ?? 0) + Math.max(0, item.remainingQty))
    })
  })

  const reconciliation = salesPlanRefs.map((product) => {
    const stock = stockByProduct.get(product.id) ?? { qty: 0, value: 0 }
    const spotRaw = spotByProduct.get(product.id) ?? { amount: 0, qty: 0 }
    const matched = matchedByProduct.get(product.id) ?? 0
    const spotQty = Math.max(0, spotRaw.qty - matched)
    const spotAvgPrice = spotRaw.qty > 0 ? spotRaw.amount / spotRaw.qty : 0
    const po = poBuyByProduct.get(product.id) ?? { amount: 0, qty: 0 }
    return {
      itemStatus: product.itemStatus,
      metalGroup: product.metalGroup,
      poAvgPrice: po.qty > 0 ? po.amount / po.qty : 0,
      poOnOrderQty: po.qty,
      poOnOrderValue: po.amount,
      productCode: product.code,
      productId: product.code,
      productName: product.name,
      spotAvgPrice,
      spotInPoolQty: spotQty,
      spotInPoolValue: spotQty * spotAvgPrice,
      stockQty: stock.qty,
      stockValue: stock.value,
      stockWAC: stock.qty > 0 ? stock.value / stock.qty : product.wac,
    }
  }).filter((row) => row.poOnOrderQty > 0 || row.spotInPoolQty > 0 || row.stockQty !== 0)

  const pendingSaleTable = salesPlanRefs
    .map((product) => {
      const stock = stockByProduct.get(product.id) ?? { qty: 0, value: 0 }
      const spotRaw = spotByProduct.get(product.id) ?? { amount: 0, qty: 0 }
      const matched = matchedByProduct.get(product.id) ?? 0
      const pendingSaleQty = Math.max(0, spotRaw.qty - matched)
      const avgPrice = spotRaw.qty > 0 ? spotRaw.amount / spotRaw.qty : 0
      const pendingSaleValue = pendingSaleQty * avgPrice
      const lockedSell = poSellOpenByProduct.get(String(product.id)) ?? 0
      const lockedBuy = poBuyByProduct.get(product.id)?.qty ?? 0
      const realPendingSale = stock.qty + lockedBuy - lockedSell
      const base = lmeBaseFor(product.metalGroup, config)
      const bestPlanPct = lmeBuyPercentFor(product.metalGroup)
      const bestPlanPrice = base > 0 && bestPlanPct > 0 ? (base / 1000) * config.fxRate * (bestPlanPct / 100) : 0
      const projectedProfit = pendingSaleQty > 0 ? pendingSaleQty * (bestPlanPrice - avgPrice) : 0
      const projectedMarginPct = avgPrice > 0 ? ((bestPlanPrice - avgPrice) / avgPrice) * 100 : 0
      return {
        avgPrice,
        bestPlanPct,
        bestPlanPrice,
        itemStatus: product.itemStatus,
        lockedBuy,
        lockedSell,
        metalGroup: product.metalGroup,
        pendingSaleQty,
        pendingSaleValue,
        productCode: product.code,
        productId: product.id,
        productName: product.name,
        projectedMarginPct,
        projectedProfit,
        realPendingSale,
        stock: stock.qty,
        stockWAC: stock.qty > 0 ? stock.value / stock.qty : product.wac,
      }
    })
    .filter((row) => row.pendingSaleQty > 0 || row.lockedSell > 0 || row.lockedBuy > 0 || row.stock !== 0)
    .sort((left, right) => {
      if (left.realPendingSale < 0 && right.realPendingSale >= 0) return -1
      if (right.realPendingSale < 0 && left.realPendingSale >= 0) return 1
      return right.pendingSaleValue - left.pendingSaleValue
    })
  const pendingSaleTotals = {
    count: pendingSaleTable.length,
    shortageCount: pendingSaleTable.filter((row) => row.realPendingSale < 0).length,
    totalLockedBuy: pendingSaleTable.reduce((sum, row) => sum + row.lockedBuy, 0),
    totalLockedSell: pendingSaleTable.reduce((sum, row) => sum + row.lockedSell, 0),
    totalPendingSaleQty: pendingSaleTable.reduce((sum, row) => sum + row.pendingSaleQty, 0),
    totalPendingSaleValue: pendingSaleTable.reduce((sum, row) => sum + row.pendingSaleValue, 0),
    totalRealPending: pendingSaleTable.reduce((sum, row) => sum + row.realPendingSale, 0),
    totalStock: pendingSaleTable.reduce((sum, row) => sum + row.stock, 0),
  }

  const summary = {
    avgRemainPrice: productRows.reduce((sum, row) => sum + row.remainValue, 0) / Math.max(1, productRows.reduce((sum, row) => sum + row.remainQty, 0)),
    productCount: productRows.length,
    totalGainVsLme: productRows.reduce((sum, row) => sum + row.gainVsLme, 0),
    totalGainVsWac: productRows.reduce((sum, row) => sum + row.gainVsWac, 0),
    totalRemainQty: productRows.reduce((sum, row) => sum + row.remainQty, 0),
    totalRemainValue: productRows.reduce((sum, row) => sum + row.remainValue, 0),
  }
  const reconTotals = {
    productCount: reconciliation.length,
    totalPoOnOrderQty: reconciliation.reduce((sum, row) => sum + row.poOnOrderQty, 0),
    totalPoOnOrderValue: reconciliation.reduce((sum, row) => sum + row.poOnOrderValue, 0),
    totalSpotInPoolQty: reconciliation.reduce((sum, row) => sum + row.spotInPoolQty, 0),
    totalSpotInPoolValue: reconciliation.reduce((sum, row) => sum + row.spotInPoolValue, 0),
    totalStockQty: reconciliation.reduce((sum, row) => sum + row.stockQty, 0),
    totalStockValue: reconciliation.reduce((sum, row) => sum + row.stockValue, 0),
  }

  return {
    channels: salesChannels.map((channel) => {
      const code = requireBusinessCode(channel.code, `ช่องทางขาย ${channel.id}`)
      return { id: code, name: channel.name }
    }),
    customers: customers.map((customer) => {
      const code = requireBusinessCode(customer.code, `ลูกค้า ${customer.id}`)
      return { active: customer.active ?? true, code, id: code, marketScope: customer.market_scope === 'ต่างประเทศ' ? 'ต่างประเทศ' : 'ในประเทศ', name: customer.name }
    }),
    lmeConfig: config,
    metalGroups: Array.from(new Set(salesPlanRefs.map((product) => product.metalGroup).filter(Boolean))).sort(),
    pendingSaleTable,
    pendingSaleTotals,
    planProductOptions: refs.map((product) => ({
      code: product.code,
      id: product.code,
      metalGroup: product.metalGroup,
      name: product.name,
      wac: product.wac,
    })),
    productDetails: details,
    productRows,
    reconciliation,
    reconTotals,
    sourceState: {
      basis: 'Sales planning design source from PO Sell, WTO pending_out, PO Buy, purchase bills, trading deals, stock ledger, and product master.',
      limitations: ['LME reference pricing บันทึกได้แล้ว แต่การบันทึกแผนขาย, matching, และ sales-plan locks ยังปิดอยู่จนกว่าจะออกแบบ persistence/audit ครบ'],
      writeActionsEnabled: false,
    },
    summary,
  }
}

export async function buildSalesPlan() {
  const pending = await buildSalesPlanningSnapshot()
  const config = pending.lmeConfig
  const month = new Date().toISOString().slice(0, 7)
  const planRows = await listSalesPlans(month)
  const lockedKgByProduct = new Map<string, number>()
  planRows.forEach((plan) => {
    if (!['locked', 'po_created'].includes(String(plan.status))) return
    const key = String(plan.productId).trim().toLowerCase()
    lockedKgByProduct.set(key, (lockedKgByProduct.get(key) ?? 0) + Number(plan.totalKg ?? 0))
  })
  const remainRows = pending.reconciliation.map((row) => {
    const lockedKg = lockedKgByProduct.get(row.productCode.trim().toLowerCase()) ?? 0
    const remainingKg = Math.max(0, row.stockQty - lockedKg)
    const base = lmeBaseFor(row.metalGroup, config)
    const pct = lmeBuyPercentFor(row.metalGroup)
    const bestPlanPrice = base > 0 && pct > 0 ? (base / 1000) * config.fxRate * (pct / 100) : 0
    const projectedRevenue = remainingKg * bestPlanPrice
    const value = remainingKg * row.stockWAC
    const projectedProfit = projectedRevenue - value
    const projectedMarginPct = projectedRevenue > 0 ? (projectedProfit / projectedRevenue) * 100 : 0
    return {
      bestPlanPct: pct,
      bestPlanPrice,
      code: row.productCode,
      lockedKg,
      metalGroup: row.metalGroup,
      name: row.productName,
      projectedMarginPct,
      projectedProfit,
      recommendation: remainingKg <= 0 ? 'ล็อกครบแล้ว' : bestPlanPrice > row.stockWAC * 1.05 ? 'ควรขาย (กำไรดี)' : bestPlanPrice >= row.stockWAC ? 'พอกำไร' : bestPlanPrice > 0 ? 'ขาดทุน - รอราคา' : 'ยังไม่มีแผนเสนอ',
      remainingContainers: remainingKg / config.kgPerContainer,
      remainingKg,
      stock: row.stockQty,
      value,
      wac: row.stockWAC,
    }
  }).sort((left, right) => right.value - left.value)

  return {
    customers: pending.customers,
    filters: {
      channels: pending.channels,
      metalGroups: pending.metalGroups,
      month,
    },
    customers: pending.customers,
    lmeConfig: config,
    planProductOptions: pending.planProductOptions,
    pendingSaleTable: pending.pendingSaleTable.map((row) => ({
      avgPrice: row.avgPrice,
      bestPlanPct: row.bestPlanPct,
      bestPlanPrice: row.bestPlanPrice,
      lockedBuy: row.lockedBuy,
      lockedSell: row.lockedSell,
      metalGroup: row.metalGroup,
      pendingSaleQty: row.pendingSaleQty,
      pendingSaleValue: row.pendingSaleValue,
      productCode: row.productCode,
      productId: String(row.productId),
      productName: row.productName,
      projectedMarginPct: row.projectedMarginPct,
      projectedProfit: row.projectedProfit,
      realPendingSale: row.realPendingSale,
      stock: row.stock,
      stockWAC: row.stockWAC,
    })),
    pendingSaleTotals: pending.pendingSaleTotals,
    planProductOptions: pending.planProductOptions,
    planRows,
    productAnalysis: remainRows,
    sourceState: {
      basis: 'Sales Plan design source from current stock, WTO pending_out, and LME reference values.',
      limitations: ['บันทึกแผนขายและล็อก % ได้แล้ว การหักสต๊อกจริงจะเกิดเมื่อเปิด PO ขายจากแผน'],
      writeActionsEnabled: true,
    },
    summary: {
      avgPctLme: remainRows.length ? remainRows.reduce((sum, row) => sum + row.bestPlanPct, 0) / remainRows.length : 0,
      lockedContainers: planRows.filter((row) => ['locked', 'po_created'].includes(String(row.status))).reduce((sum, row) => sum + Number(row.containers ?? 0), 0),
      lockedCount: planRows.filter((row) => ['locked', 'po_created'].includes(String(row.status))).length,
      pendingCount: planRows.filter((row) => String(row.status) === 'draft').length,
      plansCount: planRows.length,
      stockRemainingKg: remainRows.reduce((sum, row) => sum + row.remainingKg, 0),
      stockRemainingValue: remainRows.reduce((sum, row) => sum + row.value, 0),
      totalContainers: planRows.reduce((sum, row) => sum + Number(row.containers ?? 0), 0),
      totalKg: planRows.reduce((sum, row) => sum + Number(row.totalKg ?? 0), 0),
      totalLockedProfit: 0,
      totalProjectedProfit: remainRows.reduce((sum, row) => sum + row.projectedProfit, 0),
    },
  }
}

export async function buildSalesCommission(filters?: { dateFrom?: string; dateTo?: string; branchId?: string }) {
  const periodFrom = filters?.dateFrom ? new Date(`${filters.dateFrom}T00:00:00.000Z`) : new Date(`${new Date().toISOString().slice(0, 7)}-01T00:00:00.000Z`)
  const periodTo = filters?.dateTo ? new Date(`${filters.dateTo}T23:59:59.999Z`) : new Date()
  const year = periodFrom.getFullYear()

  const currentWhere: Prisma.purchase_billsWhereInput = {
    date: { gte: periodFrom, lte: periodTo },
    status: { notIn: [...PURCHASE_BILL_CANCELLED_STATUSES] }
  }
  if (filters?.branchId) {
    currentWhere.branch_id = BigInt(filters.branchId)
  }

  const annualWhere: Prisma.purchase_billsWhereInput = {
    date: {
      gte: new Date(`${year}-01-01T00:00:00.000Z`),
      lte: new Date(`${year}-12-31T23:59:59.999Z`),
    },
    status: { notIn: [...PURCHASE_BILL_CANCELLED_STATUSES] }
  }
  if (filters?.branchId) {
    annualWhere.branch_id = BigInt(filters.branchId)
  }

  const [salespersons, suppliers, currentBills, annualBills, branches] = await Promise.all([
    prisma.salespersons.findMany({ orderBy: [{ name: 'asc' }], where: { active: { not: false } } }),
    prisma.suppliers.findMany({ orderBy: [{ name: 'asc' }], where: { active: { not: false } } }),
    prisma.purchase_bills.findMany({
      include: {
        purchase_bill_items: {
          orderBy: { line_no: 'asc' },
          where: { item_status: 'active' },
          include: { products: true }
        },
        suppliers: true
      },
      orderBy: [{ date: 'desc' }, { doc_no: 'desc' }],
      where: currentWhere,
    }),
    prisma.purchase_bills.findMany({
      include: {
        purchase_bill_items: {
          where: { item_status: 'active' }
        }
      },
      where: annualWhere,
    }),
    prisma.branches.findMany({ orderBy: [{ code: 'asc' }], where: { active: { not: false } } }),
  ])

  const salesById = new Map(salespersons.map((sales) => [String(sales.id), sales]))
  const salesCodeById = new Map(salespersons.map((sales) => [String(sales.id), requireBusinessCode(sales.code, `พนักงานขาย ${sales.id}`)]))
  const supplierSalesById = new Map(suppliers.map((supplier) => [String(supplier.id), supplier.sales_id != null ? (salesCodeById.get(String(supplier.sales_id)) ?? '') : '']))

  const getSalesIdForBill = (bill: { sales_id: bigint | null; supplier_id: bigint | null }) => {
    return bill.sales_id != null
      ? (salesCodeById.get(String(bill.sales_id)) ?? '_UNASSIGNED_')
      : (bill.supplier_id ? (supplierSalesById.get(String(bill.supplier_id)) || '_UNASSIGNED_') : '_UNASSIGNED_')
  }

  const supplierCounts = new Map<string, Set<string>>()
  suppliers.forEach((supplier) => {
    const salesId = supplier.sales_id != null ? (salesCodeById.get(String(supplier.sales_id)) ?? '_UNASSIGNED_') : '_UNASSIGNED_'
    const set = supplierCounts.get(salesId) ?? new Set<string>()
    if (supplier.code) set.add(requireBusinessCode(supplier.code, `ผู้ขาย ${supplier.id}`))
    supplierCounts.set(salesId, set)
  })

  const summary = new Map<string, {
    billCount: number
    id: string
    name: string
    code: string
    phone: string
    commissionEligible: boolean
    qty: number
    amount: number
    commissionableQty: number
    commissionableAmount: number
    nonCommissionableQty: number
    nonCommissionableAmount: number
    supplierIds: Set<string>
    annualQty: number
    annualAmount: number
  }>()

  const ensure = (salesId: string) => {
    if (!summary.has(salesId)) {
      const sales = salespersons.find((s) => requireBusinessCode(s.code, `พนักงานขาย ${s.id}`) === salesId)
      summary.set(salesId, {
        billCount: 0,
        id: salesId,
        name: salesId === '_UNASSIGNED_' ? '(ไม่ได้กำหนด Sales)' : sales?.name ?? '-',
        code: salesId === '_UNASSIGNED_' ? '-' : salesId,
        phone: salesId === '_UNASSIGNED_' ? '' : sales?.phone ?? '',
        commissionEligible: salesId === '_UNASSIGNED_' ? false : sales?.commission_eligible ?? false,
        qty: 0,
        amount: 0,
        commissionableQty: 0,
        commissionableAmount: 0,
        nonCommissionableQty: 0,
        nonCommissionableAmount: 0,
        supplierIds: supplierCounts.get(salesId) ?? new Set<string>(),
        annualQty: 0,
        annualAmount: 0
      })
    }
    return summary.get(salesId)!
  }

  // Pre-populate summary mapping for all active salespeople to guarantee they exist on dashboard
  salespersons.forEach((sales) => {
    const code = requireBusinessCode(sales.code, `พนักงานขาย ${sales.id}`)
    ensure(code)
  })
  ensure('_UNASSIGNED_')

  const billRows: any[] = []

  for (const bill of currentBills) {
    const salesId = getSalesIdForBill(bill)
    const row = ensure(salesId)
    row.billCount += 1
    if (bill.suppliers?.code) {
      row.supplierIds.add(requireBusinessCode(bill.suppliers.code, `ผู้ขายบิลซื้อ ${bill.id}`))
    }

    const items = bill.purchase_bill_items || []
    for (const item of items) {
      const qty = toNumber(item.qty)
      const amount = toNumber(item.amount)
      const price = toNumber(item.price)
      const salesPrice = toNumber(item.sales_price)

      const isCommissionable = row.commissionEligible && price > 0 && salesPrice > 0 && price <= salesPrice

      row.qty += qty
      row.amount += amount

      if (isCommissionable) {
        row.commissionableQty += qty
        row.commissionableAmount += amount
      } else {
        row.nonCommissionableQty += qty
        row.nonCommissionableAmount += amount
      }

      billRows.push({
        id: String(item.id),
        billId: String(bill.id),
        docNo: bill.doc_no,
        date: toDateOnly(bill.date),
        supplierName: bill.suppliers?.name ?? '-',
        productName: item.product_name ?? item.display_name ?? '-',
        productCategory: item.products?.metal_group || 'ทั่วไป',
        qty,
        price,
        salesPrice,
        amount,
        salesId,
        status: bill.status ?? '',
        isCommissionable
      })
    }
  }

  for (const bill of annualBills) {
    const salesId = getSalesIdForBill(bill)
    const row = ensure(salesId)

    const items = bill.purchase_bill_items || []
    for (const item of items) {
      const qty = toNumber(item.qty)
      const amount = toNumber(item.amount)

      row.annualQty += qty
      row.annualAmount += amount
    }
  }

  const calculateCommission = (amount: number) => {
    if (amount < 1000000) return 0
    const diff = amount - 1000000
    const steps = diff > 0 ? Math.floor((diff - 0.001) / 500000) : 0
    return 1000 + steps * 500
  }

  const salesRows = Array.from(summary.values()).map((row) => {
    const commission = calculateCommission(row.commissionableAmount)
    return {
      avgPrice: row.qty > 0 ? row.amount / row.qty : 0,
      billCount: row.billCount,
      code: row.code,
      commissionEligible: row.commissionEligible,
      commission,
      id: row.id,
      name: row.name,
      phone: row.phone,
      progressPct: Math.min(100, Math.round((row.commissionableAmount / 1000000) * 100)),
      purchaseAmt: row.amount,
      qty: row.qty,
      commissionableQty: row.commissionableQty,
      commissionableAmount: row.commissionableAmount,
      nonCommissionableQty: row.nonCommissionableQty,
      nonCommissionableAmount: row.nonCommissionableAmount,
      remainingToTarget: Math.max(0, 1000000 - row.commissionableAmount),
      supplierCount: row.supplierIds.size,
      annualQty: row.annualQty,
      annualAmount: row.annualAmount
    }
  }).sort((left, right) => right.purchaseAmt - left.purchaseAmt)

  const totals = {
    bills: salesRows.reduce((sum, row) => sum + row.billCount, 0),
    qty: salesRows.reduce((sum, row) => sum + row.qty, 0),
    amount: salesRows.reduce((sum, row) => sum + row.purchaseAmt, 0),
    commissionableQty: salesRows.reduce((sum, row) => sum + row.commissionableQty, 0),
    commissionableAmount: salesRows.reduce((sum, row) => sum + row.commissionableAmount, 0),
    nonCommissionableQty: salesRows.reduce((sum, row) => sum + row.nonCommissionableQty, 0),
    nonCommissionableAmount: salesRows.reduce((sum, row) => sum + row.nonCommissionableAmount, 0),
    annualQty: salesRows.reduce((sum, row) => sum + row.annualQty, 0),
    annualAmount: salesRows.reduce((sum, row) => sum + row.annualAmount, 0),
  }

  return {
    billRows,
    filters: {
      dateFrom: toDateOnly(periodFrom),
      dateTo: toDateOnly(periodTo),
      periods: ['today', 'week', 'month', 'quarter', 'year'],
      branches: branches.map((b) => ({ id: b.id.toString(), name: b.name }))
    },
    salesRows,
    sourceState: {
      basis: 'Sales Commission design source from purchase bills, salespersons, and supplier owner assignments.',
      limitations: ['Period changes, CSV export, supplier assignment, bulk assignment, and persisted commission closing remain disabled until authorization and audit are designed.'],
      writeActionsEnabled: false,
    },
    suppliers: suppliers.map((supplier) => {
      const code = requireBusinessCode(supplier.code, `ผู้ขาย ${supplier.id}`)
      return { code, id: code, name: supplier.name, phone: supplier.phone ?? '', salesId: supplier.sales_id != null ? (salesCodeById.get(String(supplier.sales_id)) ?? '') : '' }
    }),
    totals,
  }
}
