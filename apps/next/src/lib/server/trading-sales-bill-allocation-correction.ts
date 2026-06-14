import { z } from 'zod'
import { normalizeDate, toDateOnly, toNumber } from '@/lib/server/daily'
import { appendSalesBillStatusLog, SALES_BILL_STATUS_ACTION } from '@/lib/server/sales-bill-history'
import { isSalesBillActiveForCancel } from '@/lib/server/sales-bill-cancel-policy'
import type { Prisma } from '../../../generated/prisma/client'

const safeSourceIdPattern = /^[A-Za-z0-9_.:-]+$/

export const correctTradingAllocationsSchema = z.object({
  action: z.literal('correct_trading_allocations'),
  allocations: z.array(z.object({
    salesLineNo: z.coerce.number().int().positive('ระบุแถวบิลขายให้ถูกต้อง'),
    tradingCostSourceId: z.string()
      .trim()
      .min(1, 'เลือก Trading Cost Source')
      .max(80, 'Trading Cost Source ยาวเกินไป')
      .regex(safeSourceIdPattern, 'Trading Cost Source มีรูปแบบไม่ถูกต้อง'),
  })).min(1, 'ระบุรายการ Trading allocation อย่างน้อย 1 รายการ').max(50, 'รายการ Trading allocation มากเกินไป'),
  note: z.string()
    .trim()
    .min(1, 'กรอกเหตุผลการแก้ไข allocation')
    .max(500, 'เหตุผลการแก้ไข allocation ยาวเกินไป'),
})

function itemNumber(record: Record<string, unknown>, key: string) {
  const value = record[key]
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0
  if (typeof value === 'string') {
    const parsed = Number(value.replace(/,/g, ''))
    return Number.isFinite(parsed) ? parsed : 0
  }
  return toNumber(value as { toNumber: () => number } | null | undefined)
}

function salesItemUnitPrice(record: Record<string, unknown>) {
  const explicitPrice = itemNumber(record, 'price')
  if (explicitPrice > 0) return explicitPrice
  return itemNumber(record, 'unitPrice')
}

function itemText(record: Record<string, unknown>, key: string) {
  const value = record[key]
  return typeof value === 'string' ? value.trim() : ''
}

function itemProductCode(record: Record<string, unknown>) {
  return itemText(record, 'productCode') || itemText(record, 'productId')
}

function itemProductName(record: Record<string, unknown>) {
  return itemText(record, 'productName') || itemText(record, 'name') || itemProductCode(record)
}

function itemQty(record: Record<string, unknown>) {
  const explicitQty = itemNumber(record, 'qty')
  if (explicitQty > 0) return explicitQty
  return itemNumber(record, 'netWeight')
}

function itemAmount(record: Record<string, unknown>) {
  const explicitAmount = itemNumber(record, 'amount')
  if (explicitAmount > 0) return explicitAmount
  return Math.max(0, itemQty(record) * salesItemUnitPrice(record))
}

function parseTradingCostSourceId(sourceId: string) {
  const parts = sourceId.split(':')
  const sourceType = parts[0] === 'SRC' ? 'MANUAL' : 'PB'
  const [docNo, lineNoText] = sourceType === 'MANUAL' ? [parts[1], parts[2] ?? '1'] : parts[0] === 'PB' ? [parts[1], parts[2]] : parts
  const lineNo = Number(lineNoText)
  if (!docNo || !Number.isInteger(lineNo) || lineNo <= 0) return null
  return { docNo, lineNo, sourceType }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

type TradingCorrectionSource = {
  amount: number
  billId: bigint | null
  costSourceId: bigint | null
  docNo: string
  lineNo: number
  productCode: string
  productId: bigint | null
  productName: string
  qty: number
  remainingAmount: number
  remainingQty: number
  supplierId: bigint | null
  supplierName: string | null
  type: 'MANUAL' | 'PB'
  unitCost: number
}

async function resolveTradingCorrectionSources(
  tx: Prisma.TransactionClient,
  params: {
    allocations: z.infer<typeof correctTradingAllocationsSchema>['allocations']
    billId: bigint
    billItems: Record<string, unknown>[]
  },
) {
  const parsedSources = params.allocations.map((allocation, index) => {
    const parsed = parseTradingCostSourceId(allocation.tradingCostSourceId)
    if (!parsed) throw new Error(`Trading Cost Source รายการที่ ${index + 1} ไม่ถูกต้อง`)
    return { ...parsed, salesLineNo: allocation.salesLineNo }
  })
  const sourceDocNos = [...new Set(parsedSources.filter((source) => source.sourceType === 'PB').map((source) => source.docNo))]
  const manualSourceNos = [...new Set(parsedSources.filter((source) => source.sourceType === 'MANUAL').map((source) => source.docNo))]

  const [sourceBills, manualSources] = await Promise.all([
    sourceDocNos.length ? tx.purchase_bills.findMany({
      include: {
        purchase_bill_items: {
          orderBy: { line_no: 'asc' },
          select: {
            amount: true,
            line_no: true,
            product_code: true,
            product_id: true,
            product_name: true,
            qty: true,
          },
        },
        suppliers: { select: { name: true } },
      },
      where: {
        doc_no: { in: sourceDocNos },
        status: { notIn: ['cancelled', 'Cancelled', 'void', 'voided', 'reversed'] },
        transaction_mode: 'TRADING',
      },
    }) : Promise.resolve([]),
    manualSourceNos.length ? tx.trading_cost_sources.findMany({
      include: {
        products: { select: { code: true, name: true } },
        suppliers: { select: { name: true } },
      },
      where: {
        source_no: { in: manualSourceNos },
        status: 'active',
      },
    }) : Promise.resolve([]),
  ])

  const productIds = [
    ...sourceBills.flatMap((bill) => bill.purchase_bill_items.map((line) => line.product_id).filter((id): id is bigint => id != null)),
    ...manualSources.map((source) => source.product_id).filter((id): id is bigint => id != null),
  ]
  const products = productIds.length
    ? await tx.products.findMany({ select: { code: true, id: true }, where: { id: { in: [...new Set(productIds)] } } })
    : []
  const productCodeById = new Map(products.map((product) => [product.id, product.code ?? '']))
  const sourceBillByDocNo = new Map(sourceBills.map((bill) => [bill.doc_no, bill] as const))
  const manualSourceByNo = new Map(manualSources.map((source) => [source.source_no, source] as const))
  const sourceBillIds = sourceBills.map((bill) => bill.id)
  const manualSourceIds = manualSources.map((source) => source.id)
  const activeFacts = sourceBillIds.length || manualSourceIds.length
    ? await tx.trading_allocation_facts.findMany({
        select: {
          matched_cogs: true,
          purchase_bill_id: true,
          qty: true,
          source_doc_no: true,
          source_line_no: true,
          trading_cost_source_id: true,
        },
        where: {
          NOT: { sales_bill_id: params.billId },
          OR: [
            ...(sourceBillIds.length ? [{ purchase_bill_id: { in: sourceBillIds } }] : []),
            ...(manualSourceIds.length ? [{ trading_cost_source_id: { in: manualSourceIds } }] : []),
          ],
          status: 'active',
        },
      })
    : []
  const matchedBySource = new Map<string, { amount: number; qty: number }>()
  activeFacts.forEach((fact) => {
    const sourceLineNo = fact.source_line_no
    if (sourceLineNo == null) return
    const keys = [
      fact.purchase_bill_id != null ? `${fact.purchase_bill_id.toString()}:${sourceLineNo}` : null,
      fact.trading_cost_source_id != null ? `SRC:${fact.trading_cost_source_id.toString()}:1` : null,
      fact.source_doc_no ? `${fact.source_doc_no}:${sourceLineNo}` : null,
      fact.source_doc_no ? `SRC:${fact.source_doc_no}:1` : null,
    ].filter((key): key is string => Boolean(key))
    keys.forEach((key) => {
      const current = matchedBySource.get(key) ?? { amount: 0, qty: 0 }
      current.amount += toNumber(fact.matched_cogs)
      current.qty += toNumber(fact.qty)
      matchedBySource.set(key, current)
    })
  })

  const requestedQtyBySource = new Map<string, number>()
  const requestedCostBySource = new Map<string, number>()
  const resolved = new Map<number, { matchedCogs: number; source: TradingCorrectionSource }>()

  for (const parsed of parsedSources) {
    const item = params.billItems[parsed.salesLineNo - 1]
    if (!item) throw new Error(`ไม่พบรายการบิลขายแถวที่ ${parsed.salesLineNo}`)
    const itemCode = itemProductCode(item)
    const requestedQty = itemQty(item)
    if (!itemCode || requestedQty <= 0.0001) throw new Error(`รายการบิลขายแถวที่ ${parsed.salesLineNo} ไม่มีสินค้า/จำนวนที่ถูกต้อง`)

    if (parsed.sourceType === 'MANUAL') {
      const manualSource = manualSourceByNo.get(parsed.docNo)
      if (!manualSource) throw new Error(`ไม่พบ Trading Cost Source ${parsed.docNo}`)
      const sourceProductCode = manualSource.product_id != null
        ? productCodeById.get(manualSource.product_id) ?? manualSource.products?.code ?? manualSource.product_code_snapshot ?? ''
        : manualSource.product_code_snapshot ?? manualSource.products?.code ?? ''
      if (sourceProductCode && sourceProductCode !== itemCode) throw new Error(`สินค้าบิลขายแถวที่ ${parsed.salesLineNo} ไม่ตรงกับต้นทุน ${manualSource.source_no}`)
      const sourceKeyById = `SRC:${manualSource.id.toString()}:1`
      const sourceKeyByNo = `SRC:${manualSource.source_no}:1`
      const matched = matchedBySource.get(sourceKeyById) ?? matchedBySource.get(sourceKeyByNo) ?? { amount: 0, qty: 0 }
      const sourceQty = toNumber(manualSource.qty)
      const sourceAmount = toNumber(manualSource.total_amount)
      if (sourceQty <= 0.0001 || sourceAmount <= 0.01) throw new Error(`ต้นทุน ${manualSource.source_no} ไม่มีจำนวน/มูลค่าพร้อมใช้`)
      const remainingQty = Math.max(0, sourceQty - matched.qty)
      const remainingAmount = Math.max(0, sourceAmount - matched.amount)
      const alreadyRequestedQty = requestedQtyBySource.get(sourceKeyByNo) ?? 0
      if (alreadyRequestedQty + requestedQty > remainingQty + 0.0001) throw new Error(`จำนวนแถวที่ ${parsed.salesLineNo} เกินต้นทุนคงเหลือของ ${manualSource.source_no}`)
      const unitCost = sourceAmount / sourceQty
      const alreadyRequestedCost = requestedCostBySource.get(sourceKeyByNo) ?? 0
      const matchedCogs = Math.min(Math.max(0, remainingAmount - alreadyRequestedCost), requestedQty * unitCost)
      requestedQtyBySource.set(sourceKeyByNo, alreadyRequestedQty + requestedQty)
      requestedCostBySource.set(sourceKeyByNo, alreadyRequestedCost + matchedCogs)
      resolved.set(parsed.salesLineNo, {
        matchedCogs,
        source: {
          amount: sourceAmount,
          billId: null,
          costSourceId: manualSource.id,
          docNo: manualSource.source_no,
          lineNo: 1,
          productCode: sourceProductCode,
          productId: manualSource.product_id,
          productName: manualSource.product_name_snapshot ?? manualSource.products?.name ?? itemProductName(item),
          qty: sourceQty,
          remainingAmount,
          remainingQty,
          supplierId: manualSource.supplier_id,
          supplierName: manualSource.supplier_name_snapshot ?? manualSource.suppliers?.name ?? null,
          type: 'MANUAL',
          unitCost,
        },
      })
      continue
    }

    const sourceBill = sourceBillByDocNo.get(parsed.docNo)
    if (!sourceBill) throw new Error(`ไม่พบ Trading PB ${parsed.docNo}`)
    const sourceLine = sourceBill.purchase_bill_items.find((line) => line.line_no === parsed.lineNo)
    if (!sourceLine) throw new Error(`ไม่พบรายการต้นทุน ${parsed.docNo}:${parsed.lineNo}`)
    const sourceProductCode = sourceLine.product_id != null ? productCodeById.get(sourceLine.product_id) ?? sourceLine.product_code ?? '' : sourceLine.product_code ?? ''
    if (sourceProductCode && sourceProductCode !== itemCode) throw new Error(`สินค้าบิลขายแถวที่ ${parsed.salesLineNo} ไม่ตรงกับต้นทุน ${sourceBill.doc_no}:${parsed.lineNo}`)
    const sourceKeyById = `${sourceBill.id.toString()}:${parsed.lineNo}`
    const sourceKeyByDoc = `${sourceBill.doc_no}:${parsed.lineNo}`
    const matched = matchedBySource.get(sourceKeyById) ?? matchedBySource.get(sourceKeyByDoc) ?? { amount: 0, qty: 0 }
    const sourceQty = toNumber(sourceLine.qty)
    const sourceAmount = toNumber(sourceLine.amount)
    if (sourceQty <= 0.0001 || sourceAmount <= 0.01) throw new Error(`ต้นทุน ${sourceBill.doc_no}:${parsed.lineNo} ไม่มีจำนวน/มูลค่าพร้อมใช้`)
    const remainingQty = Math.max(0, sourceQty - matched.qty)
    const remainingAmount = Math.max(0, sourceAmount - matched.amount)
    const alreadyRequestedQty = requestedQtyBySource.get(sourceKeyByDoc) ?? 0
    if (alreadyRequestedQty + requestedQty > remainingQty + 0.0001) throw new Error(`จำนวนแถวที่ ${parsed.salesLineNo} เกินต้นทุนคงเหลือของ ${sourceBill.doc_no}:${parsed.lineNo}`)
    const unitCost = sourceAmount / sourceQty
    const alreadyRequestedCost = requestedCostBySource.get(sourceKeyByDoc) ?? 0
    const matchedCogs = Math.min(Math.max(0, remainingAmount - alreadyRequestedCost), requestedQty * unitCost)
    requestedQtyBySource.set(sourceKeyByDoc, alreadyRequestedQty + requestedQty)
    requestedCostBySource.set(sourceKeyByDoc, alreadyRequestedCost + matchedCogs)
    resolved.set(parsed.salesLineNo, {
      matchedCogs,
      source: {
        amount: sourceAmount,
        billId: sourceBill.id,
        costSourceId: null,
        docNo: sourceBill.doc_no,
        lineNo: parsed.lineNo,
        productCode: sourceProductCode,
        productId: sourceLine.product_id,
        productName: sourceLine.product_name ?? itemProductName(item),
        qty: sourceQty,
        remainingAmount,
        remainingQty,
        supplierId: sourceBill.supplier_id,
        supplierName: sourceBill.suppliers?.name ?? sourceBill.supplier_name_snapshot ?? null,
        type: 'PB',
        unitCost,
      },
    })
  }

  return resolved
}

export async function correctTradingSalesBillAllocations(
  tx: Prisma.TransactionClient,
  params: {
    actor: string
    allocations: z.infer<typeof correctTradingAllocationsSchema>['allocations']
    billRef: string
    correctedAt?: Date
    note: string
  },
) {
  const correctedAt = params.correctedAt ?? new Date()
  const revisionKey = correctedAt.getTime().toString(36)
  const bill = await tx.sales_bills.findFirst({
    include: {
      customers: { select: { name: true } },
    },
    where: { doc_no: params.billRef },
  })
  if (!bill) throw new Error('ไม่พบบิลขายที่ต้องการแก้ไข allocation')
  if ((bill.transaction_mode ?? 'STOCK') !== 'TRADING') throw new Error('แก้ไข Trading allocation ได้เฉพาะบิลขาย Trading')
  if (!isSalesBillActiveForCancel(bill.status)) throw new Error('บิลขายนี้ถูกยกเลิกแล้ว แก้ไข allocation ไม่ได้')
  if (!Array.isArray(bill.items)) throw new Error('บิลขายนี้ไม่มีรายการสินค้าให้แก้ไข allocation')

  const rawBillItems = bill.items as unknown[]
  const billItems = rawBillItems.filter(isRecord)
  if (billItems.length !== rawBillItems.length) throw new Error('รายการสินค้าในบิลขายมีรูปแบบไม่ถูกต้อง')
  const requestedLines = new Set(params.allocations.map((allocation) => allocation.salesLineNo))
  if (requestedLines.size !== params.allocations.length) throw new Error('มีรายการแก้ไข allocation ซ้ำแถว')
  if (requestedLines.size !== billItems.length || billItems.some((_, index) => !requestedLines.has(index + 1))) {
    throw new Error('ต้องระบุ Trading Cost Source ให้ครบทุกรายการในบิลขาย')
  }

  const resolvedSources = await resolveTradingCorrectionSources(tx, {
    allocations: params.allocations,
    billId: bill.id,
    billItems,
  })
  const totalCost = [...resolvedSources.values()].reduce((sum, row) => sum + row.matchedCogs, 0)

  await tx.trading_allocation_facts.updateMany({
    data: {
      notes: `Reversed by Sales Bill allocation correction ${bill.doc_no}: ${params.note}`,
      status: 'reversed',
      updated_at: correctedAt,
      updated_by: params.actor,
    },
    where: {
      sales_bill_id: bill.id,
      status: 'active',
    },
  })

  await tx.trading_allocation_facts.createMany({
    data: billItems.map((item, index) => {
      const salesLineNo = index + 1
      const resolved = resolvedSources.get(salesLineNo)
      if (!resolved) throw new Error(`ไม่พบ Trading allocation สำหรับแถวที่ ${salesLineNo}`)
      return {
        allocation_method: 'RECORDED_LINE',
        allocation_no: `TAF-${bill.doc_no}-COR-${revisionKey}-${String(salesLineNo).padStart(3, '0')}`,
        created_at: correctedAt,
        created_by: params.actor,
        customer_id: bill.customer_id,
        customer_name_snapshot: bill.customers?.name ?? null,
        date: normalizeDate(toDateOnly(bill.date)),
        matched_cogs: resolved.matchedCogs,
        notes: `Sales Bill allocation correction: ${params.note}`,
        product_code_snapshot: resolved.source.productCode || itemProductCode(item),
        product_id: resolved.source.productId,
        product_name_snapshot: resolved.source.productName || itemProductName(item),
        purchase_bill_id: resolved.source.billId,
        qty: itemQty(item),
        sales_amount: itemAmount(item),
        sales_bill_id: bill.id,
        sales_doc_no: bill.doc_no,
        sales_line_no: salesLineNo,
        source_doc_no: resolved.source.docNo,
        source_line_no: resolved.source.lineNo,
        source_type: resolved.source.type === 'MANUAL' ? 'TRADING_COST_SOURCE' : 'TRADING_PURCHASE_BILL',
        status: 'active',
        supplier_id: resolved.source.supplierId,
        supplier_name_snapshot: resolved.source.supplierName,
        trading_cost_source_id: resolved.source.costSourceId,
        updated_at: correctedAt,
        updated_by: params.actor,
      }
    }),
  })

  const updated = await tx.sales_bills.update({
    data: {
      gross_profit: toNumber(bill.total_amount) - totalCost,
      total_cost: totalCost,
      updated_at: correctedAt,
      updated_by: params.actor,
    },
    select: { doc_no: true, id: true },
    where: { id: bill.id },
  })
  await appendSalesBillStatusLog(tx, {
    action: SALES_BILL_STATUS_ACTION.ALLOCATION_CORRECTED,
    actor: params.actor,
    createdAt: correctedAt,
    fromStatus: bill.status,
    meta: { reason: 'trading_allocation_correction', revisionKey },
    note: params.note,
    salesBillId: updated.id,
    toStatus: bill.status ?? 'unreceived',
  })

  return { docNo: updated.doc_no, totalCost }
}
