import { describe, expect, it } from 'vitest'

import { calculateSalesNetWeight, normalizeSalesBillWeights, poSellFormSchema, salesBillFormSchema, type SalesBillFormValues } from './sales'

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

  it('derives both submitted weights from the editable WTO values', () => {
    const staleSalesBill = stockSalesBill({ grossWeight: 500, deductWeight: 100, netWeight: 500, qty: 400 }) as SalesBillFormValues
    const normalized = normalizeSalesBillWeights(staleSalesBill)
    expect(normalized.items[0]?.netWeight).toBe(400)
    expect(normalized.items[0]?.qty).toBe(400)
    expect(salesBillFormSchema.safeParse(normalized).success).toBe(true)
  })
})

describe('PO Sell price-lock date contract', () => {
  const validPoSell = {
    branchId: 'BR01',
    channelId: null,
    customerId: 'CUS01',
    priceLockDate: '2026-08-10',
    expectedDelivery: '2026-08-14',
    hasVat: false,
    items: [{ discount: 0, price: 10, productId: 'SKU001', qty: 10 }],
    note: null,
    salesPlanId: null,
  }

  it('accepts a valid user-selected price-lock date', () => {
    expect(poSellFormSchema.safeParse(validPoSell).success).toBe(true)
  })

  it('rejects a missing or malformed price-lock date', () => {
    expect(poSellFormSchema.safeParse({ ...validPoSell, priceLockDate: '' }).success).toBe(false)
    expect(poSellFormSchema.safeParse({ ...validPoSell, priceLockDate: '10/08/2026' }).success).toBe(false)
  })
})
