import { NextResponse } from 'next/server'
import { XLSX } from '@/lib/server/xlsx'
import { Prisma } from '../../../../../generated/prisma/client'
import { parseInternalBigIntId, requireBusinessCode } from '@/lib/business-code'
import { PURCHASE_BILL_CANCELLED_STATUSES } from '@/lib/purchase-bill-status'
import { apiErrorResponse } from '@/lib/server/api-error'
import { AuthContextError, authContextErrorResponse, getCurrentAuthContext, requirePermission } from '@/lib/server/auth-context'
import { getAllowedBranchIds } from '@/lib/server/branch-scope'
import { findActiveBranchReferenceByCodeOrId } from '@/lib/server/branch-reference'
import { findActiveCustomerReferenceByCodeOrId } from '@/lib/server/customer-reference'
import { toDateOnly, toNumber } from '@/lib/server/daily'
import { prisma } from '@/lib/server/prisma'
import { listActiveCustomers, listActiveSuppliers } from '@/lib/server/reference-master-cache'
import { purchaseBillItemRows } from '@/lib/server/purchase-bill-items'
import { salesBillLineFactsForBills, type SalesBillLineFactRow } from '@/lib/server/sales-bill-line-facts'
import { findActiveSupplierReferenceByCodeOrId } from '@/lib/server/supplier-reference'
import { applyWorksheetTableLayout } from '@/lib/server/xlsx'

export const runtime = 'nodejs'

type JsonItem = {
  amount?: number | string
  cogs?: number | string
  code?: string
  displayName?: string
  grossProfit?: number | string
  id?: string | number
  name?: string
  netAmount?: number | string
  netWeight?: number | string
  price?: number | string
  productCode?: string
  productId?: string | number
  productName?: string
  product_id?: string | number
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
  allocationCogs: number
  allocationQty: number
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
  productionInputQty: number
  productionLossQty: number
  productionOutputQty: number
  sellBills: Set<string>
  sellQty: number
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

function normalizedDateParam(value: string | null) {
  const trimmed = value?.trim()
  return trimmed && /^\d{4}-\d{2}-\d{2}$/.test(trimmed) ? trimmed : null
}

function inYearMonth(date: Date, year: string | null, month: string | null, dateFrom?: string | null, dateTo?: string | null) {
  const value = toDateOnly(date)
  if (year && value.slice(0, 4) !== year) return false
  if (month && value.slice(5, 7) !== month.padStart(2, '0')) return false
  if (dateFrom && value < dateFrom) return false
  if (dateTo && value > dateTo) return false
  return true
}

function isLossOutput(output: { category_code?: string | null; output_status?: string | null; output_type?: string | null }) {
  const value = `${output.output_type ?? ''} ${output.output_status ?? ''} ${output.category_code ?? ''}`.toLowerCase()
  return value.includes('loss') || value.includes('waste') || value.includes('เสีย') || value.includes('สูญเสีย')
}

function itemQty(item: JsonItem) {
  return jsonNumber(item.netWeight ?? item.weight ?? item.qty)
}

function itemAmount(item: JsonItem) {
  const amount = jsonNumber(item.netAmount ?? item.amount ?? item.totalAmount ?? item.total)
  if (amount) return amount
  return itemQty(item) * jsonNumber(item.price)
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

function lineLookupKeys(line: SalesBillLineFactRow) {
  return [
    line.productId,
    line.productCode,
    line.productName,
  ].map((value) => String(value ?? '').trim().toLowerCase()).filter(Boolean)
}

async function buildWorkbook(rows: Array<Record<string, string | number>>) {
  const workbook = XLSX.utils.book_new()
  const sheet = XLSX.utils.json_to_sheet(rows)
  const headers = rows[0] ? Object.keys(rows[0]) : []
  sheet['!cols'] = headers.map((header) => ({ wch: Math.max(12, header.length + 4) }))
  applyWorksheetTableLayout(sheet, headers.length, rows.length + 1)
  XLSX.utils.book_append_sheet(workbook, sheet, 'Product Tracking')
  return XLSX.write(workbook, { bookType: 'xlsx', type: 'buffer' })
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
    allocationCogs: 0,
    allocationQty: 0,
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
    productionInputQty: 0,
    productionLossQty: 0,
    productionOutputQty: 0,
    revenue: 0,
    sellBills: new Set<string>(),
    sellQty: 0,
    type: product?.type ?? '',
    unit: product?.unit ?? 'kg',
  }
}

function isAllowedBranch(allowedBranchIds: bigint[] | null, branchId: bigint) {
  return allowedBranchIds === null || allowedBranchIds.some((allowedBranchId) => allowedBranchId === branchId)
}

function branchScopedPurchaseBillWhere(allowedBranchIds: bigint[] | null, requestedBranchId?: bigint): Prisma.purchase_billsWhereInput {
  if (requestedBranchId != null) return isAllowedBranch(allowedBranchIds, requestedBranchId) ? { branch_id: requestedBranchId } : { branch_id: { in: [] } }
  if (allowedBranchIds === null) return {}
  return {
    OR: [
      { branch_id: null },
      { branch_id: { in: allowedBranchIds } },
    ],
  }
}

function branchScopedSalesBillWhere(allowedBranchIds: bigint[] | null, requestedBranchId?: bigint): Prisma.sales_billsWhereInput {
  if (requestedBranchId != null) return isAllowedBranch(allowedBranchIds, requestedBranchId) ? { branch_id: requestedBranchId } : { branch_id: { in: [] } }
  if (allowedBranchIds === null) return {}
  return {
    OR: [
      { branch_id: null },
      { branch_id: { in: allowedBranchIds } },
    ],
  }
}

function branchScopedProductionOrderWhere(allowedBranchIds: bigint[] | null, requestedBranchId?: bigint): Prisma.production_ordersWhereInput {
  if (requestedBranchId != null) return isAllowedBranch(allowedBranchIds, requestedBranchId) ? { branch_id: requestedBranchId } : { branch_id: { in: [] } }
  if (allowedBranchIds === null) return {}
  return {
    OR: [
      { branch_id: null },
      { branch_id: { in: allowedBranchIds } },
    ],
  }
}

export async function GET(request: Request) {
  try {
    const context = await getCurrentAuthContext()
    requirePermission(context, 'reports.reports.view')
    const allowedBranchIds = await getAllowedBranchIds(context)

    const url = new URL(request.url)
    const year = url.searchParams.get('year') || String(new Date().getFullYear())
    const month = url.searchParams.get('month')
    const dateFrom = normalizedDateParam(url.searchParams.get('dateFrom') ?? url.searchParams.get('from'))
    const dateTo = normalizedDateParam(url.searchParams.get('dateTo') ?? url.searchParams.get('to'))
    const productId = url.searchParams.get('productId')
    const detailId = url.searchParams.get('detailId')
    const metalGroup = url.searchParams.get('metalGroup')
    const branchId = url.searchParams.get('branchId')
    const supplierId = url.searchParams.get('supplierId')
    const customerId = url.searchParams.get('customerId')
    const search = url.searchParams.get('q')?.trim().toLowerCase()
    const branch = branchId ? await findActiveBranchReferenceByCodeOrId(branchId) : null
    const purchaseBranchWhere = branchScopedPurchaseBillWhere(allowedBranchIds, branch?.id)
    const salesBranchWhere = branchScopedSalesBillWhere(allowedBranchIds, branch?.id)
    const productionBranchWhere = branchScopedProductionOrderWhere(allowedBranchIds, branch?.id)
    const supplier = supplierId ? await findActiveSupplierReferenceByCodeOrId(supplierId) : null
    const customer = customerId ? await findActiveCustomerReferenceByCodeOrId(customerId) : null
    const normalizedProductId = productId ? await prisma.products.findFirst({
      select: { id: true },
      where: {
        OR: [
          { code: productId.trim().toUpperCase() },
          ...(parseInternalBigIntId(productId) != null ? [{ id: parseInternalBigIntId(productId) as bigint }] : []),
        ],
      },
    }) : null
    const detailProduct = detailId ? await prisma.products.findFirst({
      select: { active: true, code: true, id: true, metal_group: true, name: true, type: true, unit: true },
      where: {
        active: { not: false },
        OR: [
          { code: detailId.trim().toUpperCase() },
          ...(parseInternalBigIntId(detailId) != null ? [{ id: parseInternalBigIntId(detailId) as bigint }] : []),
        ],
      },
    }) : null

    const [products, purchaseBills, salesBills, suppliers, customers, productionOrders, allocationFacts] = await Promise.all([
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
        include: { purchase_bill_items: { orderBy: { line_no: 'asc' }, where: { item_status: 'active' } }, suppliers: { select: { code: true, name: true } } },
        orderBy: [{ date: 'desc' }, { doc_no: 'desc' }],
        take: 10000,
        where: {
          ...purchaseBranchWhere,
          status: { notIn: [...PURCHASE_BILL_CANCELLED_STATUSES] },
          ...(supplier ? { supplier_id: supplier.id } : {}),
        },
      }),
      prisma.sales_bills.findMany({
        include: { customers: { select: { code: true, name: true } } },
        orderBy: [{ date: 'desc' }, { doc_no: 'desc' }],
        take: 10000,
        where: {
          ...salesBranchWhere,
          NOT: { status: 'cancelled' },
          ...(customer ? { customer_id: customer.id } : {}),
        },
      }),
      listActiveSuppliers(),
      listActiveCustomers(),
      prisma.production_orders.findMany({
        include: {
          production_inputs: { where: { status: 'active' } },
          production_outputs: { where: { status: 'active' } },
        },
        orderBy: [{ date: 'desc' }, { doc_no: 'desc' }],
        take: 10000,
        where: {
          ...productionBranchWhere,
          status: { not: 'Cancelled' },
        },
      }),
      prisma.trading_allocation_facts.findMany({
        orderBy: [{ date: 'desc' }, { id: 'desc' }],
        take: 10000,
        where: {
          status: 'active',
          ...(supplier ? { supplier_id: supplier.id } : {}),
          ...(customer ? { customer_id: customer.id } : {}),
        },
      }),
    ])
    const visiblePurchaseBillIds = new Set(purchaseBills.map((bill) => bill.id.toString()))
    const visibleSalesBillIds = new Set(salesBills.map((bill) => bill.id.toString()))
    const visibleAllocationFacts = allowedBranchIds === null && branch?.id == null
      ? allocationFacts
      : allocationFacts.filter((fact) => {
        if (fact.purchase_bill_id != null && visiblePurchaseBillIds.has(fact.purchase_bill_id.toString())) return true
        if (fact.sales_bill_id != null && visibleSalesBillIds.has(fact.sales_bill_id.toString())) return true
        return false
      })
    const visibleSupplierIds = new Set(purchaseBills.map((bill) => bill.supplier_id).filter((id): id is bigint => id != null))
    const visibleCustomerIds = new Set(salesBills.map((bill) => bill.customer_id).filter((id): id is bigint => id != null))
    const visibleSuppliers = suppliers.filter((supplier) => visibleSupplierIds.has(supplier.id))
    const visibleCustomers = customers.filter((customer) => visibleCustomerIds.has(customer.id))
    const salesLines = await salesBillLineFactsForBills(salesBills.map((bill) => bill.id))

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
    const ensureRowForLine = (line: SalesBillLineFactRow) => {
      const product = lineLookupKeys(line).map((key) => productsByKey.get(key)).find(Boolean)
      if ((productId || metalGroup) && !product) return null
      const key = product ? String(product.id) : `line:${line.productName}`
      if (!rowsByKey.has(key)) rowsByKey.set(key, createAgg(product, line.productName, key))
      return rowsByKey.get(key) ?? null
    }

    purchaseBills
      .filter((bill) => inYearMonth(bill.date, year, month, dateFrom, dateTo))
      .forEach((bill) => {
        purchaseBillItemRows(bill).forEach((item) => {
            const row = ensureRow(item)
            if (!row) return
            row.buyQty += itemQty(item)
            row.buyAmount += itemAmount(item)
            row.buyBills.add(bill.doc_no)
          })
      })

    salesLines
      .filter((line) => inYearMonth(line.date, year, month, dateFrom, dateTo))
      .forEach((line) => {
        const row = ensureRowForLine(line)
        if (!row) return
        row.sellQty += line.qty
        row.revenue += line.lineAmount
        row.cogs += line.cogs
        row.gp += line.gp
        row.sellBills.add(line.docNo)
      })

    productionOrders
      .filter((order) => inYearMonth(order.date, year, month, dateFrom, dateTo))
      .forEach((order) => {
        order.production_inputs.forEach((input) => {
          const product = input.product_id != null ? productsByKey.get(String(input.product_id)) : undefined
          if ((productId || metalGroup) && !product) return
          const key = product ? String(product.id) : `production-input:${input.product_id ?? input.doc_no}`
          if (!rowsByKey.has(key)) rowsByKey.set(key, createAgg(product, input.doc_no, key))
          const row = rowsByKey.get(key)
          if (row) row.productionInputQty += toNumber(input.qty)
        })
        order.production_outputs.forEach((output) => {
          const product = output.product_id != null ? productsByKey.get(String(output.product_id)) : undefined
          if ((productId || metalGroup) && !product) return
          const key = product ? String(product.id) : `production-output:${output.product_id ?? output.doc_no}`
          if (!rowsByKey.has(key)) rowsByKey.set(key, createAgg(product, output.doc_no, key))
          const row = rowsByKey.get(key)
          if (!row) return
          const qty = toNumber(output.qty)
          if (isLossOutput(output)) row.productionLossQty += qty
          else row.productionOutputQty += qty
        })
      })

    visibleAllocationFacts
      .filter((fact) => inYearMonth(fact.date, year, month, dateFrom, dateTo))
      .forEach((fact) => {
        const product = fact.product_id != null ? productsByKey.get(String(fact.product_id)) : undefined
        if ((productId || metalGroup) && !product) return
        const key = product ? String(product.id) : `allocation:${fact.product_id ?? fact.product_code_snapshot ?? fact.product_name_snapshot ?? fact.allocation_no}`
        if (!rowsByKey.has(key)) rowsByKey.set(key, createAgg(product, fact.product_name_snapshot ?? fact.product_code_snapshot ?? fact.allocation_no, key))
        const row = rowsByKey.get(key)
        if (!row) return
        row.allocationQty += toNumber(fact.qty)
        row.allocationCogs += toNumber(fact.matched_cogs)
      })

    const productMonthlyMap = new Map<string, Array<{ qty: number; buyAmount: number; sellQty: number; salesAmount: number }>>()
    const getProductMonthly = (key: string) => {
      let arr = productMonthlyMap.get(key)
      if (!arr) {
        arr = Array.from({ length: 12 }, () => ({ qty: 0, buyAmount: 0, sellQty: 0, salesAmount: 0 }))
        productMonthlyMap.set(key, arr)
      }
      return arr
    }

    for (let mIdx = 0; mIdx < 12; mIdx++) {
      const mKey = String(mIdx + 1).padStart(2, '0')

      purchaseBills
        .filter((bill) => inYearMonth(bill.date, year, mKey, dateFrom, dateTo))
        .forEach((bill) => {
          purchaseBillItemRows(bill).forEach((item) => {
            const product = itemLookupKeys(item).map((k) => productsByKey.get(k)).find(Boolean)
            if (!product) return
            const key = product.code
            const arr = getProductMonthly(key)
            arr[mIdx].qty += itemQty(item)
            arr[mIdx].buyAmount += itemAmount(item)
          })
        })

      salesLines
        .filter((line) => inYearMonth(line.date, year, mKey, dateFrom, dateTo))
        .forEach((line) => {
          const product = lineLookupKeys(line).map((k) => productsByKey.get(k)).find(Boolean)
          if (!product) return
          const key = product.code
          const arr = getProductMonthly(key)
          arr[mIdx].sellQty += line.qty
          arr[mIdx].salesAmount += line.lineAmount
        })
    }

    const rows = Array.from(rowsByKey.values())
      .map((row) => {
        return {
          avgBuy: row.buyQty > 0 ? row.buyAmount / row.buyQty : 0,
          avgSell: row.sellQty > 0 ? row.revenue / row.sellQty : 0,
          allocationCogs: row.allocationCogs,
          allocationQty: row.allocationQty,
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
          productionInputQty: row.productionInputQty,
          productionLossPct: row.productionInputQty > 0 ? (row.productionLossQty / row.productionInputQty) * 100 : 0,
          productionLossQty: row.productionLossQty,
          productionOutputQty: row.productionOutputQty,
          productionYieldPct: row.productionInputQty > 0 ? (row.productionOutputQty / row.productionInputQty) * 100 : 0,
          purchaseAmount: row.buyAmount,
          purchaseBillCount: row.buyBills.size,
          purchaseQty: row.buyQty,
          sellBillCount: row.sellBills.size,
          sellQty: row.sellQty,
          salesAmount: row.revenue,
          salesBillCount: row.sellBills.size,
          salesQty: row.sellQty,
          type: row.type,
          unit: row.unit,
          revenue: row.revenue,
          monthlyData: productMonthlyMap.get(row.matchKey) ?? productMonthlyMap.get(row.id) ?? Array.from({ length: 12 }, () => ({ qty: 0, buyAmount: 0, sellQty: 0, salesAmount: 0 })),
        }
      })
      .filter((row) => !search || `${row.code} ${row.name} ${row.metalGroup} ${row.itemStatus}`.toLowerCase().includes(search))
      .filter((row) => row.buyQty > 0 || row.sellQty > 0 || row.productionInputQty > 0 || row.productionOutputQty > 0 || row.productionLossQty > 0 || row.allocationQty > 0)
      .sort((left, right) => (right.revenue - left.revenue) || (right.buyAmount - left.buyAmount))

    const monthly = Array.from({ length: 12 }, (_, index) => {
      const monthKey = String(index + 1).padStart(2, '0')
      const buy = purchaseBills.filter((bill) => inYearMonth(bill.date, year, monthKey, dateFrom, dateTo)).reduce((sum, bill) => {
        purchaseBillItemRows(bill).forEach((item) => {
          const row = ensureRow(item)
          if (row && rows.some((product) => product.matchKey === row.matchKey)) {
            sum.amount += itemAmount(item)
            sum.qty += itemQty(item)
          }
        })
        return sum
      }, { amount: 0, qty: 0 })
      const sell = salesLines.filter((line) => inYearMonth(line.date, year, monthKey, dateFrom, dateTo)).reduce((sum, line) => {
        const row = ensureRowForLine(line)
        if (row && rows.some((product) => product.matchKey === row.matchKey)) {
          sum.gp += line.gp
          sum.qty += line.qty
          sum.revenue += line.lineAmount
        }
        return sum
      }, { gp: 0, qty: 0, revenue: 0 })
      const production = productionOrders.filter((order) => inYearMonth(order.date, year, monthKey, dateFrom, dateTo)).reduce((sum, order) => {
        order.production_inputs.forEach((input) => {
          if (input.product_id != null && rows.some((product) => product.matchKey === String(input.product_id))) sum.inputQty += toNumber(input.qty)
        })
        order.production_outputs.forEach((output) => {
          if (output.product_id == null || !rows.some((product) => product.matchKey === String(output.product_id))) return
          const qty = toNumber(output.qty)
          if (isLossOutput(output)) sum.lossQty += qty
          else sum.outputQty += qty
        })
        return sum
      }, { inputQty: 0, lossQty: 0, outputQty: 0 })
      return {
        buyAmount: buy.amount,
        buyQty: buy.qty,
        gp: sell.gp,
        month: monthKey,
        productionInputQty: production.inputQty,
        productionLossQty: production.lossQty,
        productionOutputQty: production.outputQty,
        productionYieldPct: production.inputQty > 0 ? (production.outputQty / production.inputQty) * 100 : 0,
        purchaseAmount: buy.amount,
        purchaseQty: buy.qty,
        revenue: sell.revenue,
        salesAmount: sell.revenue,
        salesQty: sell.qty,
        sellQty: sell.qty,
      }
    })

    const detail = detailProduct ? (() => {
      const detailKeys = new Set(productLookupKeys(detailProduct))
      const matchesDetailProduct = (item: JsonItem) => itemLookupKeys(item).some((key) => detailKeys.has(key))
      const matchesDetailLine = (line: SalesBillLineFactRow) => lineLookupKeys(line).some((key) => detailKeys.has(key))
      const purchaseLines = purchaseBills
        .filter((bill) => inYearMonth(bill.date, year, month, dateFrom, dateTo))
        .flatMap((bill) => purchaseBillItemRows(bill)
          .filter(matchesDetailProduct)
          .map((item) => {
            const qty = itemQty(item)
            const amount = itemAmount(item)
            return {
              amount,
              avgBuy: qty > 0 ? amount / qty : 0,
              date: toDateOnly(bill.date),
              docNo: bill.doc_no,
              href: `/purchase/bills/${encodeURIComponent(bill.doc_no)}`,
              party: bill.suppliers?.name ?? '-',
              qty,
              status: bill.status ?? '-',
            }
          }))
        .slice(0, 80)
      const detailSalesLines = salesLines
        .filter((line) => inYearMonth(line.date, year, month, dateFrom, dateTo) && matchesDetailLine(line))
        .map((line) => ({
          avgSell: line.qty > 0 ? line.lineAmount / line.qty : 0,
          cogs: line.cogs,
          date: line.dateText,
          docNo: line.docNo,
          gp: line.gp,
          href: `/sales/bills/${encodeURIComponent(line.docNo)}`,
          party: line.customerName,
          qty: line.qty,
          revenue: line.lineAmount,
          status: line.status,
        }))
        .slice(0, 80)
      const detailProductionOrders = productionOrders
        .filter((order) => inYearMonth(order.date, year, month, dateFrom, dateTo))
        .map((order) => {
          const inputQty = order.production_inputs.filter((input) => input.product_id === detailProduct.id).reduce((sum, input) => sum + toNumber(input.qty), 0)
          const outputQty = order.production_outputs.filter((output) => output.product_id === detailProduct.id && !isLossOutput(output)).reduce((sum, output) => sum + toNumber(output.qty), 0)
          const lossQty = order.production_outputs.filter((output) => output.product_id === detailProduct.id && isLossOutput(output)).reduce((sum, output) => sum + toNumber(output.qty), 0)
          return {
            date: toDateOnly(order.date),
            docNo: order.doc_no,
            href: `/production/orders?q=${encodeURIComponent(order.doc_no)}`,
            inputQty,
            lossQty,
            outputQty,
            status: order.status ?? '-',
            yieldPct: inputQty > 0 ? (outputQty / inputQty) * 100 : 0,
          }
        })
        .filter((order) => order.inputQty > 0 || order.outputQty > 0 || order.lossQty > 0)
        .slice(0, 80)
      const allocationLines = visibleAllocationFacts
        .filter((fact) => fact.product_id === detailProduct.id && inYearMonth(fact.date, year, month, dateFrom, dateTo))
        .map((fact) => {
          const salesDocNo = fact.sales_doc_no ?? '-'
          const sourceDocNo = fact.source_doc_no ?? '-'
          const isPurchaseSource = ['TRADING_PURCHASE_BILL', 'PURCHASE_BILL', 'PB'].includes(fact.source_type ?? '')
          return {
            allocationNo: fact.allocation_no,
            date: toDateOnly(fact.date),
            matchedCogs: toNumber(fact.matched_cogs),
            method: fact.allocation_method,
            qty: toNumber(fact.qty),
            salesDocHref: fact.sales_doc_no ? `/sales/bills/${encodeURIComponent(fact.sales_doc_no)}` : null,
            salesDocNo,
            sourceDocHref: fact.source_doc_no && isPurchaseSource ? `/purchase/bills/${encodeURIComponent(fact.source_doc_no)}` : null,
            sourceDocNo,
            sourceType: fact.source_type,
            status: fact.status,
          }
        })
        .slice(0, 80)
      const detailMonthly = Array.from({ length: 12 }, (_, index) => {
        const monthKey = String(index + 1).padStart(2, '0')
        const buy = purchaseBills.filter((bill) => inYearMonth(bill.date, year, monthKey, dateFrom, dateTo)).reduce((sum, bill) => {
          purchaseBillItemRows(bill).filter(matchesDetailProduct).forEach((item) => {
            sum.amount += itemAmount(item)
            sum.qty += itemQty(item)
          })
          return sum
        }, { amount: 0, qty: 0 })
        const sell = salesLines.filter((line) => inYearMonth(line.date, year, monthKey, dateFrom, dateTo) && matchesDetailLine(line)).reduce((sum, line) => {
          sum.gp += line.gp
          sum.qty += line.qty
          sum.revenue += line.lineAmount
          return sum
        }, { gp: 0, qty: 0, revenue: 0 })
        const production = productionOrders.filter((order) => inYearMonth(order.date, year, monthKey, dateFrom, dateTo)).reduce((sum, order) => {
          sum.inputQty += order.production_inputs.filter((input) => input.product_id === detailProduct.id).reduce((total, input) => total + toNumber(input.qty), 0)
          sum.outputQty += order.production_outputs.filter((output) => output.product_id === detailProduct.id && !isLossOutput(output)).reduce((total, output) => total + toNumber(output.qty), 0)
          sum.lossQty += order.production_outputs.filter((output) => output.product_id === detailProduct.id && isLossOutput(output)).reduce((total, output) => total + toNumber(output.qty), 0)
          return sum
        }, { inputQty: 0, lossQty: 0, outputQty: 0 })
        return {
          buyAmount: buy.amount,
          buyQty: buy.qty,
          gp: sell.gp,
          month: monthKey,
          productionInputQty: production.inputQty,
          productionLossQty: production.lossQty,
          productionOutputQty: production.outputQty,
          productionYieldPct: production.inputQty > 0 ? (production.outputQty / production.inputQty) * 100 : 0,
          revenue: sell.revenue,
          sellQty: sell.qty,
        }
      })
      const productionTotals = detailMonthly.reduce((sum, row) => ({
        inputQty: sum.inputQty + row.productionInputQty,
        lossQty: sum.lossQty + row.productionLossQty,
        outputQty: sum.outputQty + row.productionOutputQty,
      }), { inputQty: 0, lossQty: 0, outputQty: 0 })

      return {
        allocationLines,
        monthly: detailMonthly,
        product: {
          code: requireBusinessCode(detailProduct.code, `สินค้า ${detailProduct.id}`),
          id: requireBusinessCode(detailProduct.code, `สินค้า ${detailProduct.id}`),
          metalGroup: detailProduct.metal_group,
          name: detailProduct.name,
          stockBalanceHref: `/stock/balance?productId=${encodeURIComponent(requireBusinessCode(detailProduct.code, `สินค้า ${detailProduct.id}`))}`,
          unit: detailProduct.unit ?? 'kg',
        },
        productionLines: detailProductionOrders,
        productionSignals: {
          allocationCogs: allocationLines.reduce((sum, row) => sum + row.matchedCogs, 0),
          allocationCount: allocationLines.length,
          allocationQty: allocationLines.reduce((sum, row) => sum + row.qty, 0),
          inputQty: productionTotals.inputQty,
          lossPct: productionTotals.inputQty > 0 ? (productionTotals.lossQty / productionTotals.inputQty) * 100 : 0,
          lossQty: productionTotals.lossQty,
          outputQty: productionTotals.outputQty,
          productionOrderCount: detailProductionOrders.length,
          yieldPct: productionTotals.inputQty > 0 ? (productionTotals.outputQty / productionTotals.inputQty) * 100 : 0,
        },
        purchaseLines,
        salesLines: detailSalesLines,
      }
    })() : null
    if (url.searchParams.get('format') === 'xlsx') {
      return xlsxResponse(await buildWorkbook(rows.map((row) => ({
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
      }))), `tracking_product_${year}${month ? `_${month}` : ''}.xlsx`)
    }

    return NextResponse.json({
      detail,
      filters: {
        metalGroups: Array.from(new Set(products.map((product) => product.metal_group).filter(Boolean))).sort(),
        products: products.map((product) => ({ active: product.active, code: product.code, id: requireBusinessCode(product.code, `สินค้า ${product.id}`), metalGroup: product.metal_group, name: product.name })),
        suppliers: visibleSuppliers.map((row) => ({ active: true, code: row.code, id: requireBusinessCode(row.code, `ผู้ขาย ${row.id}`), name: row.name })),
        customers: visibleCustomers.map((row) => ({ active: true, code: row.code, id: requireBusinessCode(row.code, `ลูกค้า ${row.id}`), name: row.name })),
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
      },
      top: {
        byBuy: [...rows].sort((left, right) => right.buyAmount - left.buyAmount).slice(0, 10),
        byGp: [...rows].sort((left, right) => right.gp - left.gp).slice(0, 10),
        byRevenue: [...rows].sort((left, right) => right.revenue - left.revenue).slice(0, 10),
      },
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
