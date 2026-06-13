import { NextResponse } from 'next/server'
import * as XLSX from 'xlsx'
import { parseInternalBigIntId, requireBusinessCode } from '@/lib/business-code'
import { PURCHASE_BILL_CANCELLED_STATUSES } from '@/lib/purchase-bill-status'
import { apiErrorResponse } from '@/lib/server/api-error'
import { AuthContextError, authContextErrorResponse, getCurrentAuthContext, requirePermission } from '@/lib/server/auth-context'
import { findActiveBranchReferenceByCodeOrId } from '@/lib/server/branch-reference'
import { toDateOnly, toNumber } from '@/lib/server/daily'
import { prisma } from '@/lib/server/prisma'
import { purchaseBillItemRows } from '@/lib/server/purchase-bill-items'
import { applyWorksheetTableLayout } from '@/lib/server/xlsx'

export const runtime = 'nodejs'

type JsonItem = {
  amount?: number | string
  cogs?: number | string
  code?: string
  displayName?: string
  grossProfit?: number | string
  id?: string | bigint
  name?: string
  netAmount?: number | string
  netWeight?: number | string
  price?: number | string
  productCode?: string
  productId?: string | bigint
  productName?: string
  product_id?: string | bigint
  profit?: number | string
  qty?: number | string
  total?: number | string
  totalAmount?: number | string
  totalCost?: number | string
  total_cost?: number | string
  unitCost?: number | string
  weight?: number | string
}

type ProductRef = {
  active: boolean | null
  code: string
  id: bigint
  metal_group: string | null
  name: string
  type: string | null
  unit: string | null
}

type ProductAgg = {
  buyAmount: number
  buyBills: Set<string>
  buyQty: number
  code: string
  cogs: number
  gp: number
  id: string
  itemStatus: string
  matchKey: string
  metalGroup: string
  name: string
  sellBills: Set<string>
  sellQty: number
  stockQty: number
  stockValue: number
  type: string
  unit: string
  revenue: number
}

function jsonNumber(value: unknown) {
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0
  if (typeof value === 'string') {
    const parsed = Number(value.replace(/,/g, ''))
    return Number.isFinite(parsed) ? parsed : 0
  }
  return 0
}

function isJsonItem(value: unknown): value is JsonItem {
  return typeof value === 'object' && value !== null
}

function inYearMonth(date: Date, year: string | null, month: string | null) {
  const value = toDateOnly(date)
  if (year && value.slice(0, 4) !== year) return false
  if (month && value.slice(5, 7) !== month.padStart(2, '0')) return false
  return true
}

function itemQty(item: JsonItem) {
  return jsonNumber(item.netWeight ?? item.weight ?? item.qty)
}

function itemAmount(item: JsonItem) {
  const amount = jsonNumber(item.netAmount ?? item.amount ?? item.totalAmount ?? item.total)
  if (amount) return amount
  return itemQty(item) * jsonNumber(item.price)
}

function itemCost(item: JsonItem) {
  const cost = jsonNumber(item.totalCost ?? item.total_cost ?? item.cogs)
  if (cost) return cost
  return itemQty(item) * jsonNumber(item.unitCost)
}

function productLookupKeys(product: ProductRef) {
  return [String(product.id), product.code, product.name].map((value) => value.trim().toLowerCase()).filter(Boolean)
}

function itemLookupKeys(item: JsonItem) {
  return [
    item.productId,
    item.product_id,
    item.id,
    item.productCode,
    item.code,
    item.productName,
    item.displayName,
    item.name,
  ].map((value) => String(value ?? '').trim().toLowerCase()).filter(Boolean)
}

function itemFallbackName(item: JsonItem) {
  return item.productName ?? item.displayName ?? item.name ?? item.productCode ?? item.code ?? 'ไม่ระบุสินค้า'
}

function buildWorkbook(rows: Array<Record<string, string | number>>) {
  const workbook = XLSX.utils.book_new()
  const sheet = XLSX.utils.json_to_sheet(rows)
  const headers = rows[0] ? Object.keys(rows[0]) : []
  sheet['!cols'] = headers.map((header) => ({ wch: Math.max(12, header.length + 4) }))
  applyWorksheetTableLayout(sheet, headers.length, rows.length + 1)
  XLSX.utils.book_append_sheet(workbook, sheet, 'Product Tracking')
  return XLSX.write(workbook, { bookType: 'xlsx', type: 'buffer' }) as Buffer
}

function xlsxResponse(body: Buffer, filename: string) {
  return new Response(new Uint8Array(body), {
    headers: {
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    },
  })
}

function createAgg(product: ProductRef | undefined, fallbackName: string, matchKey: string): ProductAgg {
  return {
    buyAmount: 0,
    buyBills: new Set<string>(),
    buyQty: 0,
    code: product?.code ?? '',
    cogs: 0,
    gp: 0,
    id: product?.code ?? '',
    itemStatus: '',
    matchKey,
    metalGroup: product?.metal_group ?? '',
    name: product?.name ?? fallbackName,
    revenue: 0,
    sellBills: new Set<string>(),
    sellQty: 0,
    stockQty: 0,
    stockValue: 0,
    type: product?.type ?? '',
    unit: product?.unit ?? 'kg',
  }
}

export async function GET(request: Request) {
  try {
    const context = await getCurrentAuthContext()
    requirePermission(context, 'reports.reports.view')

    const url = new URL(request.url)
    const year = url.searchParams.get('year') || String(new Date().getFullYear())
    const month = url.searchParams.get('month')
    const productId = url.searchParams.get('productId')
    const metalGroup = url.searchParams.get('metalGroup')
    const branchId = url.searchParams.get('branchId')
    const search = url.searchParams.get('q')?.trim().toLowerCase()
    const branch = branchId ? await findActiveBranchReferenceByCodeOrId(branchId) : null
    const normalizedProductId = productId ? await prisma.products.findFirst({
      select: { id: true },
      where: {
        OR: [
          { code: productId.trim().toUpperCase() },
          ...(parseInternalBigIntId(productId) != null ? [{ id: parseInternalBigIntId(productId) as bigint }] : []),
        ],
      },
    }) : null

    const [products, purchaseBills, salesBills, stockRows] = await Promise.all([
      prisma.products.findMany({
        orderBy: [{ code: 'asc' }, { name: 'asc' }],
        select: { active: true, code: true, id: true, metal_group: true, name: true, type: true, unit: true },
        where: {
          active: { not: false },
          ...(normalizedProductId?.id != null ? { id: normalizedProductId.id } : {}),
          ...(metalGroup ? { metal_group: metalGroup } : {}),
        },
      }),
      prisma.purchase_bills.findMany({
        include: { purchase_bill_items: { orderBy: { line_no: 'asc' }, where: { item_status: 'active' } } },
        orderBy: [{ date: 'desc' }, { doc_no: 'desc' }],
        take: 10000,
        where: { status: { notIn: [...PURCHASE_BILL_CANCELLED_STATUSES] }, ...(branch?.id != null ? { branch_id: branch.id } : {}) },
      }),
      prisma.sales_bills.findMany({
        orderBy: [{ date: 'desc' }, { doc_no: 'desc' }],
        take: 10000,
        where: { NOT: { status: 'cancelled' }, ...(branch?.id != null ? { branch_id: branch.id } : {}) },
      }),
      prisma.stock_ledger.findMany({
        orderBy: [{ date: 'desc' }],
        take: 20000,
        where: { ...(normalizedProductId?.id != null ? { product_id: normalizedProductId.id } : {}), ...(branch?.id != null ? { branch_id: branch.id } : {}) },
      }),
    ])

    const productsByKey = new Map<string, ProductRef>()
    products.forEach((product) => productLookupKeys(product).forEach((key) => productsByKey.set(key, product)))

    const rowsByKey = new Map<string, ProductAgg>()
    const ensureRow = (item: JsonItem) => {
      const product = itemLookupKeys(item).map((key) => productsByKey.get(key)).find(Boolean)
      if ((productId || metalGroup) && !product) return null
      const key = product ? String(product.id) : `name:${itemFallbackName(item)}`
      if (!rowsByKey.has(key)) rowsByKey.set(key, createAgg(product, itemFallbackName(item), key))
      return rowsByKey.get(key) ?? null
    }

    purchaseBills
      .filter((bill) => inYearMonth(bill.date, year, month))
      .forEach((bill) => {
        purchaseBillItemRows(bill).forEach((item) => {
            const row = ensureRow(item)
            if (!row) return
            row.buyQty += itemQty(item)
            row.buyAmount += itemAmount(item)
            row.buyBills.add(bill.doc_no)
          })
      })

    salesBills
      .filter((bill) => inYearMonth(bill.date, year, month))
      .forEach((bill) => {
        if (!Array.isArray(bill.items)) return
        const salesItems = bill.items as unknown[]
        salesItems
          .filter(isJsonItem)
          .forEach((item) => {
            const row = ensureRow(item)
            if (!row) return
            const revenue = itemAmount(item)
            const cogs = itemCost(item)
            const gp = jsonNumber(item.profit ?? item.grossProfit) || revenue - cogs
            row.sellQty += itemQty(item)
            row.revenue += revenue
            row.cogs += cogs
            row.gp += gp
            row.sellBills.add(bill.doc_no)
          })
      })

    stockRows.forEach((stock) => {
      if (!stock.product_id) return
      const product = productsByKey.get(String(stock.product_id).trim().toLowerCase())
      if (!product) return
      const productKey = String(product.id)
      if (!rowsByKey.has(productKey)) rowsByKey.set(productKey, createAgg(product, product.name, productKey))
      const row = rowsByKey.get(productKey)!
      row.stockQty += toNumber(stock.qty_in) - toNumber(stock.qty_out)
      row.stockValue += toNumber(stock.value_in) - toNumber(stock.value_out)
    })

    const rows = Array.from(rowsByKey.values())
      .map((row) => ({
        avgBuy: row.buyQty > 0 ? row.buyAmount / row.buyQty : 0,
        avgSell: row.sellQty > 0 ? row.revenue / row.sellQty : 0,
        buyAmount: row.buyAmount,
        buyBillCount: row.buyBills.size,
        buyQty: row.buyQty,
        code: row.code,
        cogs: row.cogs,
        gp: row.gp,
        gpPct: row.revenue > 0 ? (row.gp / row.revenue) * 100 : 0,
        id: row.id,
        itemStatus: row.itemStatus,
        matchKey: row.matchKey,
        metalGroup: row.metalGroup,
        name: row.name,
        productName: row.name,
        purchaseAmount: row.buyAmount,
        purchaseBillCount: row.buyBills.size,
        purchaseQty: row.buyQty,
        sellBillCount: row.sellBills.size,
        sellQty: row.sellQty,
        salesAmount: row.revenue,
        salesBillCount: row.sellBills.size,
        salesQty: row.sellQty,
        stockQty: row.stockQty,
        stockValue: row.stockValue,
        stockWac: row.stockQty > 0 ? row.stockValue / row.stockQty : 0,
        type: row.type,
        unit: row.unit,
        revenue: row.revenue,
        turnoverPct: row.stockQty > 0 ? (row.sellQty / row.stockQty) * 100 : 0,
      }))
      .filter((row) => !search || `${row.code} ${row.name} ${row.metalGroup} ${row.itemStatus}`.toLowerCase().includes(search))
      .filter((row) => row.buyQty > 0 || row.sellQty > 0 || row.stockQty !== 0 || row.stockValue !== 0)
      .sort((left, right) => (right.revenue - left.revenue) || (right.buyAmount - left.buyAmount))

    const monthly = Array.from({ length: 12 }, (_, index) => {
      const monthKey = String(index + 1).padStart(2, '0')
      const buy = purchaseBills.filter((bill) => inYearMonth(bill.date, year, monthKey)).reduce((sum, bill) => {
        purchaseBillItemRows(bill).forEach((item) => {
          const row = ensureRow(item)
          if (row && rows.some((product) => product.matchKey === row.matchKey)) {
            sum.amount += itemAmount(item)
            sum.qty += itemQty(item)
          }
        })
        return sum
      }, { amount: 0, qty: 0 })
      const sell = salesBills.filter((bill) => inYearMonth(bill.date, year, monthKey)).reduce((sum, bill) => {
        if (!Array.isArray(bill.items)) return sum
        const salesItems = bill.items as unknown[]
        salesItems.filter(isJsonItem).forEach((item) => {
          const row = ensureRow(item)
          if (row && rows.some((product) => product.matchKey === row.matchKey)) {
            const revenue = itemAmount(item)
            const cogs = itemCost(item)
            sum.gp += jsonNumber(item.profit ?? item.grossProfit) || revenue - cogs
            sum.qty += itemQty(item)
            sum.revenue += revenue
          }
        })
        return sum
      }, { gp: 0, qty: 0, revenue: 0 })
      return { buyAmount: buy.amount, buyQty: buy.qty, gp: sell.gp, month: monthKey, purchaseAmount: buy.amount, purchaseQty: buy.qty, revenue: sell.revenue, salesAmount: sell.revenue, salesQty: sell.qty, sellQty: sell.qty }
    })

    if (url.searchParams.get('format') === 'xlsx') {
      return xlsxResponse(buildWorkbook(rows.map((row) => ({
        AvgBuy: row.avgBuy,
        AvgSell: row.avgSell,
        BuyAmount: row.buyAmount,
        BuyQty: row.buyQty,
        COGS: row.cogs,
        Code: row.code,
        GP: row.gp,
        GPPct: row.gpPct,
        MetalGroup: row.metalGroup,
        Product: row.name,
        Revenue: row.revenue,
        SellQty: row.sellQty,
        StockQty: row.stockQty,
        StockValue: row.stockValue,
        StockWAC: row.stockWac,
        TurnoverPct: row.turnoverPct,
      }))), `tracking_product_${year}${month ? `_${month}` : ''}.xlsx`)
    }

    return NextResponse.json({
      filters: {
        metalGroups: Array.from(new Set(products.map((product) => product.metal_group).filter(Boolean))).sort(),
        products: products.map((product) => ({ active: product.active, code: product.code, id: requireBusinessCode(product.code, `สินค้า ${product.id}`), metalGroup: product.metal_group, name: product.name })),
      },
      monthly,
      rows,
      summary: {
        buyAmount: rows.reduce((sum, row) => sum + row.buyAmount, 0),
        buyQty: rows.reduce((sum, row) => sum + row.buyQty, 0),
        cogs: rows.reduce((sum, row) => sum + row.cogs, 0),
        gp: rows.reduce((sum, row) => sum + row.gp, 0),
        products: rows.length,
        purchaseAmount: rows.reduce((sum, row) => sum + row.buyAmount, 0),
        purchaseQty: rows.reduce((sum, row) => sum + row.buyQty, 0),
        revenue: rows.reduce((sum, row) => sum + row.revenue, 0),
        salesAmount: rows.reduce((sum, row) => sum + row.revenue, 0),
        salesQty: rows.reduce((sum, row) => sum + row.sellQty, 0),
        sellQty: rows.reduce((sum, row) => sum + row.sellQty, 0),
        stockQty: rows.reduce((sum, row) => sum + row.stockQty, 0),
        stockValue: rows.reduce((sum, row) => sum + row.stockValue, 0),
      },
      top: {
        byBuy: [...rows].sort((left, right) => right.buyAmount - left.buyAmount).slice(0, 10),
        byGp: [...rows].sort((left, right) => right.gp - left.gp).slice(0, 10),
        byRevenue: [...rows].sort((left, right) => right.revenue - left.revenue).slice(0, 10),
        slowMovers: rows.filter((row) => row.stockQty > 0 && row.turnoverPct < 50).sort((left, right) => right.stockValue - left.stockValue).slice(0, 10).map((row) => ({
          amount: row.stockValue,
          avgSell: row.avgSell,
          billCount: row.salesBillCount,
          code: row.code,
          id: row.id,
          productName: row.productName,
          qty: row.stockQty,
          salesAmount: row.salesAmount,
        })),
      },
      slowMovers: rows.filter((row) => row.stockQty > 0 && row.turnoverPct < 50).sort((left, right) => right.stockValue - left.stockValue).slice(0, 10).map((row) => ({
        amount: row.stockValue,
        avgSell: row.avgSell,
        billCount: row.salesBillCount,
        code: row.code,
        id: row.id,
        productName: row.productName,
        qty: row.stockQty,
        salesAmount: row.salesAmount,
      })),
      topMovers: [...rows].sort((left, right) => right.revenue - left.revenue).slice(0, 10).map((row) => ({
        amount: row.revenue,
        avgSell: row.avgSell,
        billCount: row.salesBillCount,
        code: row.code,
        id: row.id,
        productName: row.productName,
        qty: row.salesQty,
        salesAmount: row.salesAmount,
      })),
      year,
    })
  } catch (caught) {
    if (caught instanceof AuthContextError) return authContextErrorResponse(caught)
    return apiErrorResponse(caught, 'โหลด Product Tracking ไม่ได้', 500)
  }
}
