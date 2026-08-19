import type { PurchaseBillFormValues } from '@/lib/purchase-bill'

export type PurchaseBillSupplierChangeSourceFact = {
  deductWeight: number
  grossWeight: number
  lineNo: number
  productId: string
  qty: number
  receiptLineId: string | null
  receiptLineIds: string[]
  receiptSummaryId: string | null
  receiptTicketId: string | null
}

function numbersMatch(left: number, right: number) {
  return Math.abs(left - right) <= 0.0001
}

function sortedStrings(values: string[]) {
  return [...values].sort()
}

function sourceReferencesMatch(
  values: PurchaseBillFormValues['items'][number],
  source: PurchaseBillSupplierChangeSourceFact,
) {
  return values.receiptTicketId === source.receiptTicketId
    && values.receiptSummaryId === source.receiptSummaryId
    && values.receiptLineId === source.receiptLineId
    && JSON.stringify(sortedStrings(values.receiptLineIds)) === JSON.stringify(sortedStrings(source.receiptLineIds))
    && values.productId === source.productId
    && numbersMatch(values.deductWeight, source.deductWeight)
    && numbersMatch(values.grossWeight, source.grossWeight)
}

export function validateSupplierChangeSourceItems(
  values: PurchaseBillFormValues,
  existingSourceFacts: PurchaseBillSupplierChangeSourceFact[],
) {
  if (values.items.length !== existingSourceFacts.length) {
    return 'เปลี่ยน Supplier ต้องคงรายการจากใบรับของเดิม ห้ามเพิ่มหรือลบแถว'
  }

  const sourceByLineNo = new Map<number, PurchaseBillSupplierChangeSourceFact>()
  for (const source of existingSourceFacts) {
    if (!Number.isInteger(source.lineNo) || source.lineNo <= 0 || sourceByLineNo.has(source.lineNo)) {
      return 'ข้อมูล source รายการเดิมไม่ครบ จึงเปลี่ยน Supplier ไม่ได้'
    }
    sourceByLineNo.set(source.lineNo, source)
  }

  const submittedLineNos = new Set<number>()
  for (const item of values.items) {
    const lineNo = item.lineNo
    if (lineNo == null || !Number.isInteger(lineNo) || lineNo <= 0 || submittedLineNos.has(lineNo)) {
      return 'เปลี่ยน Supplier ต้องคงรายการเดิมของบิลรับซื้อ'
    }
    submittedLineNos.add(lineNo)

    const source = sourceByLineNo.get(lineNo)
    if (!source || !source.productId || (source.receiptTicketId != null && (
      source.receiptSummaryId == null
      || source.receiptLineId == null
      || source.receiptLineIds.length === 0
      || !source.receiptLineIds.every((lineId) => Boolean(lineId))
    ))) {
      return 'ข้อมูล source รายการเดิมไม่ครบ จึงเปลี่ยน Supplier ไม่ได้'
    }
    if (!sourceReferencesMatch(item, source)) {
      return 'เปลี่ยน Supplier ต้องคงสินค้า/ใบรับของเดิม ห้ามเปลี่ยน source รายการ'
    }
    if (!numbersMatch(item.qty, source.qty)) {
      return 'เปลี่ยน Supplier ต้องคงน้ำหนักเดิม แก้ได้เฉพาะราคา'
    }
  }

  if (submittedLineNos.size !== sourceByLineNo.size) {
    return 'เปลี่ยน Supplier ต้องคงรายการเดิมของบิลรับซื้อ'
  }

  return null
}
