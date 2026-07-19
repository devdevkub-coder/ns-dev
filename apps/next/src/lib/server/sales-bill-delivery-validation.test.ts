import { describe, expect, it } from 'vitest'
import { validateDeliveryItemProductMatch } from '@/lib/server/sales-bill-delivery-validation'

describe('validateDeliveryItemProductMatch', () => {
  it('rejects when the selected sales item does not match the WTO summary product', () => {
    expect(validateDeliveryItemProductMatch({
      itemProductId: BigInt(2),
      itemProductName: 'กระป๋องอลูมิเนียม',
      summaryProductId: BigInt(1),
      summaryProductName: 'กระดาษคละ',
    })).toBe('สินค้า กระป๋องอลูมิเนียม ไม่ตรงกับใบส่งของ WTO (กระดาษคละ)')
  })

  it('allows matching products', () => {
    expect(validateDeliveryItemProductMatch({
      itemProductId: BigInt(1),
      itemProductName: 'กระดาษคละ',
      summaryProductId: BigInt(1),
      summaryProductName: 'กระดาษคละ',
    })).toBeNull()
  })
})
