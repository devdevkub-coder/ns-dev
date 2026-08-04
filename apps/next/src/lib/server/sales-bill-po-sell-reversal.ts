import { toNumber } from '@/lib/server/daily'
import { derivePoSellFulfillmentStatus } from '@/lib/po-sell-status'
import type { Prisma } from '../../../generated/prisma/client'

function itemNumber(record: Record<string, unknown>, key: string) {
  const value = record[key]
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0
  if (typeof value === 'string') {
    const parsed = Number(value.replace(/,/g, ''))
    return Number.isFinite(parsed) ? parsed : 0
  }
  return toNumber(value as { toNumber: () => number } | null | undefined)
}

function poSellDocNoFromItem(record: Record<string, unknown>) {
  const value = record.poSellId
  return typeof value === 'string' ? value.trim() : ''
}

function productCodeFromItem(record: Record<string, unknown>) {
  const value = record.productCode ?? record.productId
  return typeof value === 'string' ? value.trim() : ''
}

function salesItemUnitPrice(record: Record<string, unknown>) {
  const explicitPrice = itemNumber(record, 'price')
  if (explicitPrice > 0) return explicitPrice
  return itemNumber(record, 'unitPrice')
}

type PoSellReverseLine = {
  productCode: string
  qty: number
}

function restorePoSellItems(items: unknown, lines: PoSellReverseLine[]) {
  if (!Array.isArray(items)) return null
  const nextItems = items.map((item) => (
    item && typeof item === 'object' && !Array.isArray(item)
      ? { ...(item as Record<string, unknown>) }
      : item
  ))

  for (const line of lines) {
    if (line.qty <= 0) continue
    let remainingQtyToRestore = line.qty
    const candidates = nextItems.filter((item): item is Record<string, unknown> => {
      if (!item || typeof item !== 'object' || Array.isArray(item)) return false
      const itemProductCode = productCodeFromItem(item)
      return !itemProductCode || itemProductCode === line.productCode
    })

    for (const candidate of candidates) {
      if (remainingQtyToRestore <= 0.001) break
      const currentRemainingQty = itemNumber(candidate, 'remainingQty')
      const originalQty = itemNumber(candidate, 'qty')
      const capacity = originalQty > 0 ? Math.max(0, originalQty - currentRemainingQty) : remainingQtyToRestore
      const qtyToRestore = Math.min(capacity, remainingQtyToRestore)
      if (qtyToRestore <= 0) continue
      candidate.remainingQty = currentRemainingQty + qtyToRestore
      remainingQtyToRestore -= qtyToRestore
    }
  }

  return nextItems as Prisma.InputJsonValue
}

export async function reversePoSellUsage(tx: Prisma.TransactionClient, billItems: unknown, actor: string, cancelledAt: Date) {
  if (!Array.isArray(billItems)) return
  const usageByPoSellDocNo = new Map<string, { amount: number; lines: PoSellReverseLine[]; qty: number }>()
  billItems.forEach((item) => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) return
    const record = item as Record<string, unknown>
    const poSellDocNo = poSellDocNoFromItem(record)
    if (!poSellDocNo) return
    const qty = itemNumber(record, 'qty')
    const amount = qty * salesItemUnitPrice(record)
    const productCode = productCodeFromItem(record)
    const current = usageByPoSellDocNo.get(poSellDocNo) ?? { amount: 0, lines: [], qty: 0 }
    current.amount += amount
    current.qty += qty
    current.lines.push({ productCode, qty })
    usageByPoSellDocNo.set(poSellDocNo, current)
  })
  if (!usageByPoSellDocNo.size) return

  const poSells = await tx.po_sells.findMany({
    select: { cut_amount: true, doc_no: true, id: true, items: true, qty: true, remaining_amount: true, remaining_qty: true, status: true },
    where: { doc_no: { in: [...usageByPoSellDocNo.keys()] } },
  })
  await Promise.all(poSells.map((poSell) => {
    const usage = usageByPoSellDocNo.get(poSell.doc_no)
    if (!usage) return Promise.resolve()
    const nextRemainingQty = toNumber(poSell.remaining_qty) + usage.qty
    const nextRemainingAmount = toNumber(poSell.remaining_amount) + usage.amount
    const nextItems = restorePoSellItems(poSell.items, usage.lines)
    return tx.po_sells.update({
      data: {
        cut_amount: Math.max(0, toNumber(poSell.cut_amount) - usage.amount),
        ...(nextItems ? { items: nextItems } : {}),
        remaining_amount: nextRemainingAmount,
        remaining_qty: nextRemainingQty,
        status: derivePoSellFulfillmentStatus({
          currentStatus: poSell.status,
          docNo: poSell.doc_no,
          remainingQty: nextRemainingQty,
          totalQty: toNumber(poSell.qty),
        }),
        updated_at: cancelledAt,
        updated_by: actor,
      },
      where: { id: poSell.id },
    })
  }))
}
