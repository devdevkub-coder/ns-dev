import { NextResponse } from 'next/server'
import * as XLSX from 'xlsx'
import { apiErrorResponse } from '@/lib/server/api-error'
import { AuthContextError, authContextErrorResponse, getCurrentAuthContext, requirePermission } from '@/lib/server/auth-context'
import { toDateOnly, toNumber } from '@/lib/server/daily'
import { prisma } from '@/lib/server/prisma'
import { applyWorksheetTableLayout } from '@/lib/server/xlsx'

export const runtime = 'nodejs'

type CostPoolRow = {
  availableQty: number
  availableValue: number
  branchName: string
  costPoolId: string
  costType: 'Production' | 'Purchase' | 'Regrade'
  counterparty: string
  date: string
  productId: string
  productName: string
  qty: number
  sourceId: string
  sourceLineId: string
  sourceNo: string
  sourceType: 'PO_Buy' | 'Production' | 'Regrade' | 'Spot_Buy'
  status: 'Available' | 'Fully Used' | 'Partially Used'
  totalCost: number
  unitCost: number
  usedQty: number
}

type PurchaseItem = {
  amount?: number | string | null
  displayName?: string | null
  netAmount?: number | string | null
  netWeight?: number | string | null
  productName?: string | null
  price?: number | string | null
  productId?: string | null
  qty?: number | string | null
}

type PoItem = {
  productId?: string | null
  productName?: string | null
  qty?: number | string | null
  remainingQty?: number | string | null
  unitPrice?: number | string | null
}

function jsonNumber(value: unknown) {
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0
  if (typeof value === 'string') {
    const parsed = Number(value.replace(/,/g, ''))
    return Number.isFinite(parsed) ? parsed : 0
  }
  return toNumber(value as { toNumber: () => number } | null | undefined)
}

function isCancelled(status: string | null | undefined) {
  return status === 'cancelled' || status === 'Cancelled'
}

function itemsFromPo(row: {
  items: unknown
  product_id: string | null
  qty: unknown
  remaining_qty: unknown
  unit_price: unknown
}, productById: Map<string, string>) {
  if (Array.isArray(row.items) && row.items.length) {
    return row.items
      .filter((item): item is PoItem => typeof item === 'object' && item !== null)
      .map((item, index) => {
        const productId = item.productId ?? row.product_id ?? ''
        const qty = jsonNumber(item.remainingQty ?? item.qty)
        return {
          lineId: `${productId || 'line'}-${index}`,
          productId,
          productName: item.productName ?? (productId ? productById.get(productId) : null) ?? productId ?? '-',
          qty,
          unitCost: jsonNumber(item.unitPrice ?? row.unit_price),
        }
      })
  }

  return [{
    lineId: row.product_id ?? 'header',
    productId: row.product_id ?? '',
    productName: row.product_id ? productById.get(row.product_id) ?? row.product_id : '-',
    qty: jsonNumber(row.remaining_qty ?? row.qty),
    unitCost: jsonNumber(row.unit_price),
  }]
}

function statusFromQty(qty: number, usedQty: number): CostPoolRow['status'] {
  if (qty <= 0 || usedQty >= qty - 0.001) return 'Fully Used'
  if (usedQty > 0) return 'Partially Used'
  return 'Available'
}

function applyUsedValue(rows: CostPoolRow[], usedValueBySourceId: Map<string, number>, sourceIdByPoolId: Map<string, string>) {
  const remainingBySource = new Map(usedValueBySourceId)
  return rows.map((row) => {
    const sourceId = sourceIdByPoolId.get(row.costPoolId)
    const remainingUsedValue = sourceId ? remainingBySource.get(sourceId) ?? 0 : 0
    const usedValue = Math.min(row.totalCost, remainingUsedValue)
    if (sourceId) remainingBySource.set(sourceId, Math.max(0, remainingUsedValue - usedValue))
    const usedQty = row.unitCost > 0 ? Math.min(row.qty, usedValue / row.unitCost) : 0
    const availableQty = Math.max(0, row.qty - usedQty)
    return {
      ...row,
      availableQty,
      availableValue: availableQty * row.unitCost,
      status: statusFromQty(row.qty, usedQty),
      usedQty,
    }
  })
}

function sortRows(rows: CostPoolRow[], sort: string | null) {
  const nextRows = [...rows]
  if (sort === 'LIFO') return nextRows.sort((left, right) => right.date.localeCompare(left.date))
  if (sort === 'Cheap') return nextRows.sort((left, right) => left.unitCost - right.unitCost)
  if (sort === 'Expensive') return nextRows.sort((left, right) => right.unitCost - left.unitCost)
  return nextRows.sort((left, right) => left.date.localeCompare(right.date))
}

function buildWorkbook(rows: CostPoolRow[]) {
  const workbook = XLSX.utils.book_new()
  const dataRows = rows.map((row) => ({
    AvailableQty: row.availableQty,
    AvailableValue: row.availableValue,
    Branch: row.branchName,
    CostPoolId: row.costPoolId,
    CostType: row.costType,
    Counterparty: row.counterparty,
    Date: row.date,
    OriginalQty: row.qty,
    Product: row.productName,
    SourceNo: row.sourceNo,
    SourceType: row.sourceType,
    Status: row.status,
    TotalCost: row.totalCost,
    UnitCost: row.unitCost,
    UsedQty: row.usedQty,
  }))
  const sheet = XLSX.utils.json_to_sheet(dataRows)
  const headers = dataRows[0] ? Object.keys(dataRows[0]) : []
  sheet['!cols'] = headers.map((header) => ({ wch: Math.max(12, String(header).length + 4) }))
  applyWorksheetTableLayout(sheet, headers.length, rows.length + 1)
  XLSX.utils.book_append_sheet(workbook, sheet, 'Cost Pool')
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

export async function GET(request: Request) {
  try {
    const context = await getCurrentAuthContext()
    requirePermission(context, 'finance.cash.view')

    const url = new URL(request.url)
    const costType = url.searchParams.get('costType')
    const productId = url.searchParams.get('productId')
    const q = url.searchParams.get('q')?.trim().toLowerCase()
    const showAvailableOnly = url.searchParams.get('availableOnly') !== 'false'
    const sort = url.searchParams.get('sort') ?? 'FIFO'
    const sourceType = url.searchParams.get('sourceType')
    const status = url.searchParams.get('status')
    const from = url.searchParams.get('from')
    const to = url.searchParams.get('to')

    const [poBuys, purchaseBills, productionOutputs, gradeAdjustments, tradingDeals, products, branches] = await Promise.all([
      prisma.po_buys.findMany({
        include: { suppliers: true },
        orderBy: [{ date: 'desc' }, { doc_no: 'desc' }],
        take: 5000,
        where: { cost_deducted: { not: true }, NOT: { status: { in: ['cancelled', 'Cancelled'] } } },
      }),
      prisma.purchase_bills.findMany({
        include: { branches: true, suppliers: true },
        orderBy: [{ date: 'desc' }, { doc_no: 'desc' }],
        take: 5000,
        where: { NOT: { status: { in: ['cancelled', 'Cancelled'] } } },
      }),
      prisma.production_outputs.findMany({
        include: { production_orders: { include: { branches: true } } },
        orderBy: [{ date: 'desc' }],
        take: 5000,
        where: { total_cost: { gt: 0 } },
      }),
      prisma.grade_adjustments.findMany({
        include: { warehouses: true },
        orderBy: [{ date: 'desc' }, { doc_no: 'desc' }],
        take: 5000,
      }),
      prisma.trading_deals.findMany({
        orderBy: [{ date: 'desc' }],
        take: 10000,
        where: { NOT: { status: { in: ['cancelled', 'Cancelled'] } } },
      }),
      prisma.products.findMany({ select: { id: true, name: true } }),
      prisma.branches.findMany({ select: { id: true, name: true } }),
    ])

    const productById = new Map(products.map((product) => [product.id, product.name]))
    const branchById = new Map(branches.map((branch) => [branch.id, branch.name]))
    const sourceIdByPoolId = new Map<string, string>()

    const rows: CostPoolRow[] = []

    poBuys.forEach((po) => {
      const poItems = itemsFromPo(po, productById)
      poItems.forEach((item) => {
        const qty = item.qty
        const unitCost = item.unitCost
        if (qty <= 0 || unitCost <= 0) return
        const costPoolId = `CP-POB-${po.id}-${item.lineId}`
        sourceIdByPoolId.set(costPoolId, po.id)
        rows.push({
          availableQty: qty,
          availableValue: qty * unitCost,
          branchName: po.branch_id ? branchById.get(po.branch_id) ?? po.branch_id : '-',
          costPoolId,
          costType: 'Purchase',
          counterparty: po.suppliers?.name ?? po.supplier_id ?? '-',
          date: toDateOnly(po.date),
          productId: item.productId,
          productName: item.productName,
          qty,
          sourceId: po.id,
          sourceLineId: item.lineId,
          sourceNo: po.doc_no,
          sourceType: 'PO_Buy',
          status: 'Available',
          totalCost: qty * unitCost,
          unitCost,
          usedQty: 0,
        })
      })
    })

    purchaseBills.forEach((bill) => {
      const items = Array.isArray(bill.items) ? bill.items.filter((item): item is PurchaseItem => typeof item === 'object' && item !== null) : []
      items.forEach((item, index) => {
        const qty = jsonNumber(item.netWeight ?? item.qty)
        const totalCost = jsonNumber(item.netAmount ?? item.amount) || qty * jsonNumber(item.price)
        const unitCost = qty > 0 ? totalCost / qty : 0
        if (qty <= 0 || unitCost <= 0) return
        const product = item.productId ?? ''
        const costPoolId = `CP-SPT-${bill.id}-${index}-${product || 'line'}`
        sourceIdByPoolId.set(costPoolId, bill.id)
        rows.push({
          availableQty: qty,
          availableValue: qty * unitCost,
          branchName: bill.branches?.name ?? bill.branch_id ?? '-',
          costPoolId,
          costType: 'Purchase',
          counterparty: bill.suppliers?.name ?? bill.supplier_id ?? '-',
          date: toDateOnly(bill.date),
          productId: product,
          productName: product ? productById.get(product) ?? item.productName ?? item.displayName ?? product : item.productName ?? item.displayName ?? '-',
          qty,
          sourceId: bill.id,
          sourceLineId: String(index),
          sourceNo: bill.doc_no,
          sourceType: 'Spot_Buy',
          status: 'Available',
          totalCost,
          unitCost,
          usedQty: 0,
        })
      })
    })

    productionOutputs.forEach((output) => {
      const category = output.output_category ?? ''
      if (category === 'LOSS' || category === 'CUSTOMER_RETURN') return
      const qty = toNumber(output.qty)
      const totalCost = toNumber(output.total_cost)
      const unitCost = qty > 0 ? totalCost / qty : 0
      if (qty <= 0 || unitCost <= 0) return
      const costPoolId = `CP-PRD-${output.id}`
      sourceIdByPoolId.set(costPoolId, output.id)
      rows.push({
        availableQty: qty,
        availableValue: qty * unitCost,
        branchName: output.production_orders?.branches?.name ?? output.production_orders?.branch_id ?? '-',
        costPoolId,
        costType: 'Production',
        counterparty: output.production_orders?.doc_no ? `Production Order ${output.production_orders.doc_no}` : 'Production',
        date: toDateOnly(output.date),
        productId: output.product_id ?? '',
        productName: output.product_id ? productById.get(output.product_id) ?? output.product_id : '-',
        qty,
        sourceId: output.id,
        sourceLineId: '',
        sourceNo: output.production_orders?.doc_no ?? output.id,
        sourceType: 'Production',
        status: 'Available',
        totalCost,
        unitCost,
        usedQty: 0,
      })
    })

    gradeAdjustments.forEach((adjustment) => {
      const qty = Math.max(0, toNumber(adjustment.qty_diff))
      const totalCost = Math.max(0, toNumber(adjustment.value_diff))
      const unitCost = qty > 0 ? totalCost / qty : 0
      if (qty <= 0 || unitCost <= 0) return
      const costPoolId = `CP-RGD-${adjustment.id}`
      sourceIdByPoolId.set(costPoolId, adjustment.id)
      rows.push({
        availableQty: qty,
        availableValue: qty * unitCost,
        branchName: adjustment.warehouses?.name ?? adjustment.warehouse_id ?? '-',
        costPoolId,
        costType: 'Regrade',
        counterparty: 'Regrade / Grade Adjustment',
        date: toDateOnly(adjustment.date),
        productId: adjustment.product_id ?? '',
        productName: adjustment.product_id ? productById.get(adjustment.product_id) ?? adjustment.product_id : '-',
        qty,
        sourceId: adjustment.id,
        sourceLineId: '',
        sourceNo: adjustment.doc_no,
        sourceType: 'Regrade',
        status: 'Available',
        totalCost,
        unitCost,
        usedQty: 0,
      })
    })

    const usedValueByPurchaseBillId = new Map<string, number>()
    tradingDeals.forEach((deal) => {
      if (!deal.purchase_bill_id || isCancelled(deal.status)) return
      usedValueByPurchaseBillId.set(deal.purchase_bill_id, (usedValueByPurchaseBillId.get(deal.purchase_bill_id) ?? 0) + toNumber(deal.matched_purchase_amount))
    })

    const withUsage = applyUsedValue(rows, usedValueByPurchaseBillId, sourceIdByPoolId)
      .filter((row) => !showAvailableOnly || row.availableQty > 0)
      .filter((row) => !costType || costType === 'all' || row.costType === costType)
      .filter((row) => !sourceType || sourceType === 'all' || row.sourceType === sourceType)
      .filter((row) => !status || status === 'all' || row.status === status)
      .filter((row) => !productId || productId === 'all' || row.productId === productId)
      .filter((row) => !from || row.date >= from)
      .filter((row) => !to || row.date <= to)
      .filter((row) => !q || `${row.sourceNo} ${row.counterparty} ${row.productName} ${row.sourceType} ${row.costType} ${row.status}`.toLowerCase().includes(q))

    const filteredRows = sortRows(withUsage, sort)

    if (url.searchParams.get('format') === 'xlsx') {
      return xlsxResponse(buildWorkbook(filteredRows), 'cost_pool.xlsx')
    }
    const summaryByCostType = ['Purchase', 'Production', 'Regrade'].map((type) => {
      const costRows = withUsage.filter((row) => row.costType === type)
      return {
        availableQty: costRows.reduce((sum, row) => sum + row.availableQty, 0),
        availableValue: costRows.reduce((sum, row) => sum + row.availableValue, 0),
        count: costRows.length,
        costType: type,
      }
    })

    return NextResponse.json({
      filters: {
        costTypes: Array.from(new Set(rows.map((row) => row.costType))).sort(),
        products: Array.from(new Map(rows.filter((row) => row.productId).map((row) => [row.productId, { id: row.productId, name: row.productName }])).values()).sort((left, right) => left.name.localeCompare(right.name)),
        sourceTypes: Array.from(new Set(rows.map((row) => row.sourceType))).sort(),
        statuses: Array.from(new Set(rows.map((row) => row.status))).sort(),
      },
      rows: filteredRows,
      summary: {
        availableQty: filteredRows.reduce((sum, row) => sum + row.availableQty, 0),
        availableValue: filteredRows.reduce((sum, row) => sum + row.availableValue, 0),
        originalQty: filteredRows.reduce((sum, row) => sum + row.qty, 0),
        originalValue: filteredRows.reduce((sum, row) => sum + row.totalCost, 0),
        rows: filteredRows.length,
        usedQty: filteredRows.reduce((sum, row) => sum + row.usedQty, 0),
      },
      summaryByCostType,
    })
  } catch (caught) {
    if (caught instanceof AuthContextError) return authContextErrorResponse(caught)
    return apiErrorResponse(caught, 'โหลด Cost Pool ไม่ได้', 500)
  }
}
