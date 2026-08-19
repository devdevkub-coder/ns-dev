import type { PurchaseBillFormValues } from '@/lib/purchase-bill'

type ExistingPurchaseBillItem = {
  qty: unknown
  source_snapshot: unknown
}

type SupplierChangeSourceSnapshot = {
  deductWeight: number
  grossWeight: number
  productId: string | null
  receiptLineId: string | null
  receiptLineIds: string[]
  receiptSummaryId: string | null
  receiptTicketId: string | null
  qty: number
}

const SOURCE_FIELDS: Array<keyof SupplierChangeSourceSnapshot> = [
  'deductWeight',
  'grossWeight',
  'receiptTicketId',
  'receiptSummaryId',
  'receiptLineId',
  'receiptLineIds',
  'productId',
  'qty',
]

function parseNullableString(value: unknown) {
  if (value === null) return null
  if (typeof value === 'string') return value
  return undefined
}

function parseFiniteNumber(value: unknown) {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value)
    if (Number.isFinite(parsed)) return parsed
  }
  return undefined
}

function parseSourceSnapshot(value: unknown): SupplierChangeSourceSnapshot | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const snapshot = value as Record<string, unknown>
  const parsedValues = Object.fromEntries(SOURCE_FIELDS
    .filter((field) => field !== 'receiptLineIds' && field !== 'deductWeight' && field !== 'grossWeight' && field !== 'qty')
    .map((field) => [field, parseNullableString(snapshot[field])]))
  const deductWeight = parseFiniteNumber(snapshot.deductWeight)
  const grossWeight = parseFiniteNumber(snapshot.grossWeight)
  const qty = parseFiniteNumber(snapshot.qty)
  if (Object.values(parsedValues).some((field) => field === undefined) || deductWeight === undefined || grossWeight === undefined || qty === undefined) return null
  if (!Array.isArray(snapshot.receiptLineIds) || snapshot.receiptLineIds.some((id) => typeof id !== 'string')) return null
  if (snapshot.receiptTicketId !== null && snapshot.receiptLineIds.length === 0) return null

  return {
    ...(parsedValues as Omit<SupplierChangeSourceSnapshot, 'receiptLineIds' | 'deductWeight' | 'grossWeight' | 'qty'>),
    deductWeight,
    grossWeight,
    receiptLineIds: [...snapshot.receiptLineIds].sort(),
    qty,
  }
}

function sourceValuesMatch(values: PurchaseBillFormValues['items'][number], snapshot: SupplierChangeSourceSnapshot) {
  return values.receiptTicketId === snapshot.receiptTicketId
    && values.receiptSummaryId === snapshot.receiptSummaryId
    && values.receiptLineId === snapshot.receiptLineId
    && JSON.stringify([...values.receiptLineIds].sort()) === JSON.stringify(snapshot.receiptLineIds)
    && values.productId === snapshot.productId
    && Math.abs(values.deductWeight - snapshot.deductWeight) <= 0.0001
    && Math.abs(values.grossWeight - snapshot.grossWeight) <= 0.0001
}

export function validateSupplierChangeSourceItems(
  values: PurchaseBillFormValues,
  existingBillItems: ExistingPurchaseBillItem[],
) {
  if (values.items.length !== existingBillItems.length) {
    return 'เปลี่ยน Supplier ต้องคงรายการจากใบรับของเดิม ห้ามเพิ่มหรือลบแถว'
  }

  for (const [index, item] of values.items.entries()) {
    const originalItem = existingBillItems[index]
    const snapshot = parseSourceSnapshot(originalItem?.source_snapshot)
    if (!originalItem || !snapshot) {
      return 'ข้อมูล source รายการเดิมไม่ครบ จึงเปลี่ยน Supplier ไม่ได้'
    }
    if (!sourceValuesMatch(item, snapshot)) {
      return 'เปลี่ยน Supplier ต้องคงสินค้า/ใบรับของเดิม ห้ามเปลี่ยน source รายการ'
    }

    const originalQty = Number(String(originalItem.qty))
    if (!Number.isFinite(originalQty) || Math.abs(item.qty - snapshot.qty) > 0.0001 || Math.abs(item.qty - originalQty) > 0.0001) {
      return 'เปลี่ยน Supplier ต้องคงน้ำหนักเดิม แก้ได้เฉพาะราคา'
    }
  }

  return null
}
