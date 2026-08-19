import { describe, expect, it } from 'vitest'
import { validateSupplierChangeSourceItems } from './purchase-bill-supplier-change'
import type { PurchaseBillFormValues } from './purchase-bill'

function valuesWithSource(overrides: Partial<PurchaseBillFormValues['items'][number]> = {}) {
  return {
    items: [{
      deductWeight: 2,
      grossWeight: 12,
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

function existingSnapshot(overrides: Record<string, unknown> = {}) {
  return [{
    qty: 10,
    source_snapshot: {
      deductWeight: 2,
      grossWeight: 12,
      productId: 'product-1',
      receiptLineId: 'line-1',
      receiptLineIds: ['line-1', 'line-2'],
      receiptSummaryId: 'summary-1',
      receiptTicketId: 'ticket-1',
      qty: 10,
      ...overrides,
    },
  }]
}

describe('supplier-change source contract', () => {
  it('rejects a changed receipt line id', () => {
    expect(validateSupplierChangeSourceItems(valuesWithSource({ receiptLineId: 'line-other' }), existingSnapshot())).toBe('เปลี่ยน Supplier ต้องคงสินค้า/ใบรับของเดิม ห้ามเปลี่ยน source รายการ')
  })

  it('accepts the same source line ids in a different order', () => {
    expect(validateSupplierChangeSourceItems(valuesWithSource({ receiptLineIds: ['line-2', 'line-1'] }), existingSnapshot())).toBeNull()
  })

  it('rejects an incomplete persisted source snapshot instead of substituting nulls', () => {
    expect(validateSupplierChangeSourceItems(valuesWithSource(), existingSnapshot({ receiptLineIds: undefined }))).toBe('ข้อมูล source รายการเดิมไม่ครบ จึงเปลี่ยน Supplier ไม่ได้')
  })

  it('rejects an empty receipt line snapshot for a stock source', () => {
    expect(validateSupplierChangeSourceItems(valuesWithSource(), existingSnapshot({ receiptLineIds: [] }))).toBe('ข้อมูล source รายการเดิมไม่ครบ จึงเปลี่ยน Supplier ไม่ได้')
  })

  it('keeps source-owned weight fields immutable', () => {
    expect(validateSupplierChangeSourceItems(valuesWithSource({ grossWeight: 13 }), existingSnapshot())).toBe('เปลี่ยน Supplier ต้องคงสินค้า/ใบรับของเดิม ห้ามเปลี่ยน source รายการ')
    expect(validateSupplierChangeSourceItems(valuesWithSource({ deductWeight: 3 }), existingSnapshot())).toBe('เปลี่ยน Supplier ต้องคงสินค้า/ใบรับของเดิม ห้ามเปลี่ยน source รายการ')
    expect(validateSupplierChangeSourceItems(valuesWithSource({ qty: 11 }), existingSnapshot())).toBe('เปลี่ยน Supplier ต้องคงน้ำหนักเดิม แก้ได้เฉพาะราคา')
  })
})
