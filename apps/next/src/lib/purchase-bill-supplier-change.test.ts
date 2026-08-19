import { describe, expect, it } from 'vitest'
import { validateSupplierChangeSourceItems } from './purchase-bill-supplier-change'
import type { PurchaseBillFormValues } from './purchase-bill'

function valuesWithSource(overrides: Partial<PurchaseBillFormValues['items'][number]> = {}) {
  return {
    items: [{
      deductWeight: 2,
      grossWeight: 12,
      lineNo: 1,
      productId: 'product-1',
      qty: 10,
      receiptLineId: 'line-1',
      receiptLineIds: ['line-1', 'line-2'],
      receiptSummaryId: 'summary-1',
      receiptTicketId: 'ticket-1',
      ...overrides,
    }],
  } as PurchaseBillFormValues
}

function existingSourceFact(overrides: Partial<{
  deductWeight: number
  grossWeight: number
  lineNo: number
  productId: string
  qty: number
  receiptLineId: string | null
  receiptLineIds: string[]
  receiptSummaryId: string | null
  receiptTicketId: string | null
}> = {}) {
  return [{
    deductWeight: 2,
    grossWeight: 12,
    lineNo: 1,
    productId: 'product-1',
    qty: 10,
    receiptLineId: 'line-1',
    receiptLineIds: ['line-1', 'line-2'],
    receiptSummaryId: 'summary-1',
    receiptTicketId: 'ticket-1',
    ...overrides,
  }]
}

describe('supplier-change source contract', () => {
  it('rejects a changed receipt line id', () => {
    expect(validateSupplierChangeSourceItems(valuesWithSource({ receiptLineId: 'line-other' }), existingSourceFact())).toBe('เปลี่ยน Supplier ต้องคงสินค้า/ใบรับของเดิม ห้ามเปลี่ยน source รายการ')
  })

  it('accepts the same source line ids in a different order', () => {
    expect(validateSupplierChangeSourceItems(valuesWithSource({ receiptLineIds: ['line-2', 'line-1'] }), existingSourceFact())).toBeNull()
  })

  it('rejects incomplete relational source facts instead of substituting snapshot values', () => {
    expect(validateSupplierChangeSourceItems(valuesWithSource(), existingSourceFact({ receiptLineIds: [] }))).toBe('ข้อมูล source รายการเดิมไม่ครบ จึงเปลี่ยน Supplier ไม่ได้')
  })

  it('matches source facts by persisted line number instead of array position', () => {
    const values = {
      items: [
        { ...valuesWithSource().items[0], lineNo: 2, productId: 'product-2', receiptLineId: 'line-2', receiptLineIds: ['line-2'], receiptSummaryId: 'summary-2', receiptTicketId: 'ticket-2' },
        { ...valuesWithSource().items[0], lineNo: 1 },
      ],
    } as PurchaseBillFormValues
    const sourceFacts = [
      { ...existingSourceFact()[0], lineNo: 1 },
      { ...existingSourceFact()[0], lineNo: 2, productId: 'product-2', receiptLineId: 'line-2', receiptLineIds: ['line-2'], receiptSummaryId: 'summary-2', receiptTicketId: 'ticket-2' },
    ]
    expect(validateSupplierChangeSourceItems(values, sourceFacts)).toBeNull()
  })

  it('keeps source-owned weight fields immutable', () => {
    expect(validateSupplierChangeSourceItems(valuesWithSource({ grossWeight: 13 }), existingSourceFact())).toBe('เปลี่ยน Supplier ต้องคงสินค้า/ใบรับของเดิม ห้ามเปลี่ยน source รายการ')
    expect(validateSupplierChangeSourceItems(valuesWithSource({ deductWeight: 3 }), existingSourceFact())).toBe('เปลี่ยน Supplier ต้องคงสินค้า/ใบรับของเดิม ห้ามเปลี่ยน source รายการ')
    expect(validateSupplierChangeSourceItems(valuesWithSource({ qty: 11 }), existingSourceFact())).toBe('เปลี่ยน Supplier ต้องคงน้ำหนักเดิม แก้ได้เฉพาะราคา')
  })
})
