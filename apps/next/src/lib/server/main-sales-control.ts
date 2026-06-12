import type { Prisma } from '../../../generated/prisma/client'
import { outwardCustomerReference } from '@/lib/server/customer-reference'
import { requireBusinessCode } from '@/lib/business-code'
import { PURCHASE_BILL_CANCELLED_STATUSES } from '@/lib/purchase-bill-status'
import { toDateOnly, toNumber } from '@/lib/server/daily'
import { prisma } from '@/lib/server/prisma'
import { purchaseBillItemRows } from '@/lib/server/purchase-bill-items'

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

function lmeConfig() {
  return {
    fxRate: 36,
    kgPerContainer: 25000,
    lmeAluminumUSD: 2400,
    lmeBrassUSD: 7000,
    lmeCopperUSD: 9000,
    updatedAt: '2026-05-19T00:00:00',
    updatedBy: 'read-baseline',
  }
}

function lmeBaseFor(metalGroup: string) {
  const group = metalGroup.toLowerCase()
  if (group.includes('ทองแดง') || group.includes('copper')) return lmeConfig().lmeCopperUSD
  if (group.includes('ทองเหลือง') || group.includes('brass')) return lmeConfig().lmeBrassUSD
  if (group.includes('อลูมิ') || group.includes('aluminum')) return lmeConfig().lmeAluminumUSD
  return 0
}

function lmeBuyPercentFor(metalGroup: string) {
  const group = metalGroup.toLowerCase()
  if (group.includes('ทองแดง') || group.includes('copper')) return 88
  if (group.includes('ทองเหลือง') || group.includes('brass')) return 82
  if (group.includes('อลูมิ') || group.includes('aluminum')) return 76
  return 0
}

function lmeTarget(metalGroup: string) {
  const config = lmeConfig()
  const base = lmeBaseFor(metalGroup)
  const pct = lmeBuyPercentFor(metalGroup)
  return base > 0 && pct > 0 ? (base / 1000) * config.fxRate * (pct / 100) : 0
}

function activeStatus(status?: string | null) {
  return !['cancelled', 'void', 'reversed'].includes((status ?? '').toLowerCase())
}

function activePoSellStatus(status?: string | null) {
  return activeStatus(status) && !['canceled', 'closed', 'completed', 'fully matched', 'received'].includes((status ?? '').toLowerCase())
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

export async function buildPendingSales() {
  const { byKey, refs } = await productsContext()
  const [poSells, poBuys, stockRows, customers, tradingDeals, purchaseBills] = await Promise.all([
    prisma.po_sells.findMany({ include: { customers: true }, orderBy: [{ date: 'desc' }, { doc_no: 'desc' }], take: 5000 }),
    prisma.po_buys.findMany({ orderBy: [{ date: 'desc' }, { doc_no: 'desc' }], take: 5000 }),
    prisma.stock_ledger.findMany({ orderBy: [{ date: 'desc' }], take: 50000 }),
    prisma.customers.findMany({ orderBy: [{ name: 'asc' }], select: { active: true, code: true, id: true, name: true } }),
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
        lmeTarget: lmeTarget(metalGroup),
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

  const reconciliation = refs.map((product) => {
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

  const dualGroups = ['ทองแดง', 'ทองเหลือง']
  const pendingSaleTable = refs
    .filter((product) => dualGroups.some((group) => product.metalGroup.includes(group)) || ['copper', 'brass'].some((group) => product.metalGroup.toLowerCase().includes(group)))
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
      return {
        avgPrice,
        itemStatus: product.itemStatus,
        lockedBuy,
        lockedSell,
        metalGroup: product.metalGroup,
        pendingSaleQty,
        pendingSaleValue,
        productCode: product.code,
        productId: product.id,
        productName: product.name,
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
    customers: customers.map((customer) => {
      const code = requireBusinessCode(customer.code, `ลูกค้า ${customer.id}`)
      return { active: customer.active ?? true, code, id: code, name: customer.name }
    }),
    lmeConfig: lmeConfig(),
    metalGroups: Array.from(new Set(refs.map((product) => product.metalGroup).filter(Boolean))).sort(),
    pendingSaleTable,
    pendingSaleTotals,
    productDetails: details,
    productRows,
    reconciliation,
    reconTotals,
    sourceState: {
      basis: 'Pending Sales read/design baseline from PO Sell, PO Buy, purchase bills, trading deals, stock ledger, and product master.',
      limitations: ['LME config, LME percent save, export, matching, and sales-plan locks are disabled until target schemas and audit rules are designed.'],
      writeActionsEnabled: false,
    },
    summary,
  }
}

export async function buildSalesPlan() {
  const pending = await buildPendingSales()
  const config = pending.lmeConfig
  const remainRows = pending.reconciliation.map((row) => {
    const lockedKg = 0
    const remainingKg = Math.max(0, row.stockQty - lockedKg)
    const base = lmeBaseFor(row.metalGroup)
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
    filters: {
      channels: [{ id: 'export', name: 'ส่งออก' }, { id: 'domestic', name: 'ในประเทศ' }],
      metalGroups: pending.metalGroups,
      month: new Date().toISOString().slice(0, 7),
    },
    lmeConfig: config,
    planRows: [],
    productAnalysis: remainRows,
    sourceState: {
      basis: 'Sales Plan read/design baseline from current stock/pending sales and LME reference values.',
      limitations: ['Add plan, remove plan, lock/unlock price, and export remain disabled until sales-plan persistence, stock reservation, permissions, and audit are designed.'],
      writeActionsEnabled: false,
    },
    summary: {
      avgPctLme: remainRows.length ? remainRows.reduce((sum, row) => sum + row.bestPlanPct, 0) / remainRows.length : 0,
      lockedContainers: 0,
      lockedCount: 0,
      pendingCount: 0,
      plansCount: 0,
      stockRemainingKg: remainRows.reduce((sum, row) => sum + row.remainingKg, 0),
      stockRemainingValue: remainRows.reduce((sum, row) => sum + row.value, 0),
      totalContainers: 0,
      totalKg: 0,
      totalLockedProfit: 0,
      totalProjectedProfit: remainRows.reduce((sum, row) => sum + row.projectedProfit, 0),
    },
  }
}

export async function buildSalesCommission() {
  const periodFrom = new Date(`${new Date().toISOString().slice(0, 7)}-01T00:00:00.000Z`)
  const periodTo = new Date()
  const [salespersons, suppliers, purchaseBills] = await Promise.all([
    prisma.salespersons.findMany({ orderBy: [{ name: 'asc' }], where: { active: { not: false } } }),
    prisma.suppliers.findMany({ orderBy: [{ name: 'asc' }], where: { active: { not: false } } }),
    prisma.purchase_bills.findMany({
      include: { purchase_bill_items: { orderBy: { line_no: 'asc' }, where: { item_status: 'active' } }, suppliers: true },
      orderBy: [{ date: 'desc' }, { doc_no: 'desc' }],
      take: 10000,
      where: { date: { gte: periodFrom, lte: periodTo }, status: { notIn: [...PURCHASE_BILL_CANCELLED_STATUSES] } },
    }),
  ])
  const salesById = new Map(salespersons.map((sales) => [String(sales.id), sales]))
  const salesCodeById = new Map(salespersons.map((sales) => [String(sales.id), requireBusinessCode(sales.code, `พนักงานขาย ${sales.id}`)]))
  const supplierSalesById = new Map(suppliers.map((supplier) => [String(supplier.id), supplier.sales_id != null ? (salesCodeById.get(String(supplier.sales_id)) ?? '') : '']))
  const supplierCounts = new Map<string, Set<string>>()
  suppliers.forEach((supplier) => {
    const salesId = supplier.sales_id != null ? (salesCodeById.get(String(supplier.sales_id)) ?? '_UNASSIGNED_') : '_UNASSIGNED_'
    const set = supplierCounts.get(salesId) ?? new Set<string>()
    if (supplier.code) set.add(requireBusinessCode(supplier.code, `ผู้ขาย ${supplier.id}`))
    supplierCounts.set(salesId, set)
  })
  const summary = new Map<string, { billCount: number; id: string; name: string; phone: string; purchaseAmt: number; qty: number; supplierIds: Set<string> }>()
  const ensure = (id: string) => {
    if (!summary.has(id)) {
      const sales = salesById.get(id)
      summary.set(id, { billCount: 0, id, name: id === '_UNASSIGNED_' ? '(ไม่ได้กำหนด Sales)' : sales?.name ?? '-', phone: sales?.phone ?? '', purchaseAmt: 0, qty: 0, supplierIds: supplierCounts.get(id) ?? new Set<string>() })
    }
    return summary.get(id)!
  }
  const billRows = purchaseBills.map((bill) => {
    const salesId = bill.sales_id != null
      ? (salesCodeById.get(String(bill.sales_id)) ?? '_UNASSIGNED_')
      : (bill.supplier_id ? (supplierSalesById.get(String(bill.supplier_id)) || '_UNASSIGNED_') : '_UNASSIGNED_')
    const items = purchaseBillItemRows(bill).filter(isJsonItem)
    const qty = items.reduce((sum, item) => sum + itemQty(item), 0)
    const row = ensure(salesId)
    row.billCount += 1
    row.purchaseAmt += toNumber(bill.total_amount)
    row.qty += qty
    if (bill.suppliers?.code) row.supplierIds.add(requireBusinessCode(bill.suppliers.code, `ผู้ขายบิลซื้อ ${bill.id}`))
    return {
      amount: toNumber(bill.total_amount),
      date: toDateOnly(bill.date),
      docNo: bill.doc_no,
      facePrice: 0,
      id: bill.doc_no,
      price: qty > 0 ? toNumber(bill.total_amount) / qty : 0,
      productName: items.map(itemProductName).filter(Boolean).slice(0, 2).join(', ') || '-',
      qty,
      salesId,
      status: bill.status ?? '',
      supplierName: bill.suppliers?.name ?? '-',
    }
  })
  const threshold = 1000000
  const salesRows = Array.from(summary.values()).map((row) => ({
    avgPrice: row.qty > 0 ? row.purchaseAmt / row.qty : 0,
    billCount: row.billCount,
    code: row.id === '_UNASSIGNED_' ? '-' : (salesById.get(row.id)?.code ? requireBusinessCode(salesById.get(row.id)!.code, `พนักงานขาย ${salesById.get(row.id)!.id}`) : ''),
    commission: row.purchaseAmt >= threshold ? Math.floor(row.purchaseAmt / 500000) * 500 : 0,
    eligible: row.purchaseAmt >= threshold,
    id: row.id,
    name: row.name,
    phone: row.phone,
    progressPct: Math.min(100, Math.round((row.purchaseAmt / threshold) * 100)),
    purchaseAmt: row.purchaseAmt,
    qty: row.qty,
    remainingToTarget: Math.max(0, threshold - row.purchaseAmt),
    supplierCount: row.supplierIds.size,
  })).sort((left, right) => right.purchaseAmt - left.purchaseAmt)
  return {
    billRows,
    filters: { dateFrom: toDateOnly(periodFrom), dateTo: toDateOnly(periodTo), periods: ['today', 'week', 'month', 'quarter', 'year'] },
    salesRows,
    sourceState: {
      basis: 'Sales Commission read/design baseline from purchase bills, salespersons, and supplier owner assignments.',
      limitations: ['Period changes, CSV export, supplier assignment, bulk assignment, and persisted commission closing remain disabled until authorization and audit are designed.'],
      writeActionsEnabled: false,
    },
    suppliers: suppliers.map((supplier) => {
      const code = requireBusinessCode(supplier.code, `ผู้ขาย ${supplier.id}`)
      return { code, id: code, name: supplier.name, phone: supplier.phone ?? '', salesId: supplier.sales_id != null ? (salesCodeById.get(String(supplier.sales_id)) ?? '') : '' }
    }),
    totals: {
      bills: salesRows.reduce((sum, row) => sum + row.billCount, 0),
      purchaseAmt: salesRows.reduce((sum, row) => sum + row.purchaseAmt, 0),
      qty: salesRows.reduce((sum, row) => sum + row.qty, 0),
    },
  }
}
