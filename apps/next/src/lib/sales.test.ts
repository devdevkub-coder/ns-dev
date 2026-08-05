import { describe, expect, it } from 'vitest'

import { calculateSalesNetWeight, salesBillFormSchema } from './sales'

const stockSalesBill = (item: Record<string, unknown>) => ({
  branchId: 'BR01',
  channelId: 'CASH',
  customerId: 'CUS01',
  deliveryTicketId: 'WTO001',
  items: [{
    deductWeight: 100,
    deliverySummaryId: 'WTO001:SKU001:1',
    deliveryTicketId: 'WTO001',
    grossWeight: 5000,
    netWeight: 4900,
    price: 1,
    productId: 'SKU001',
    qty: 4900,
    ...item,
  }],
  transactionMode: 'STOCK' as const,
})

describe('sales net weight', () => {
  it('deducts impurity from the buyer scale weight', () => {
    expect(calculateSalesNetWeight(5000, 100)).toBe(4900)
  })

  it('does not produce a negative sale weight', () => {
    expect(calculateSalesNetWeight(100, 150)).toBe(0)
  })

  it('rejects a WTO sales bill when its submitted net sale differs from gross minus impurity', () => {
    expect(salesBillFormSchema.safeParse(stockSalesBill({ qty: 5000, netWeight: 5000 })).success).toBe(false)
    expect(salesBillFormSchema.safeParse(stockSalesBill({ deductWeight: 5100, netWeight: 0, qty: 0 })).success).toBe(false)
  })
})
