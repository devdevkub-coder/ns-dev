import { describe, expect, it } from 'vitest'
import { poBuyItemSummaryText } from './PoBuyPageClient'

describe('PO Buy list product summary', () => {
  it('shows only the product name in the shared cell and tooltip text', () => {
    expect(poBuyItemSummaryText({
      productId: 'product-1',
      productName: 'ทองแดง',
      qty: 20,
      remainingQty: 8,
      unit: 'กก.',
      unitPrice: 100,
    })).toBe('ทองแดง')
  })
})
