import { describe, expect, it } from 'vitest'
import { calculateCustomerAdvanceTaxBreakdown } from './customer-advance'

describe('customer advance VAT breakdown', () => {
  it('uses the entered amount directly when CADV has no VAT', () => {
    expect(calculateCustomerAdvanceTaxBreakdown({
      amount: 1000,
      vatRatePercent: 7,
      vatType: 'NONE',
    })).toEqual({
      subtotalAmount: 1000,
      targetAmount: 1000,
      vatAmount: 0,
      vatRatePercent: 0,
      vatType: 'NONE',
    })
  })

  it('calculates gross cash from the entered pre-VAT base', () => {
    expect(calculateCustomerAdvanceTaxBreakdown({
      amount: 1000,
      vatRatePercent: 7,
      vatType: 'INCLUDE',
    })).toEqual({
      subtotalAmount: 1000,
      targetAmount: 1070,
      vatAmount: 70,
      vatRatePercent: 7,
      vatType: 'INCLUDE',
    })
  })

  it('rounds VAT and gross cash to two decimal places', () => {
    expect(calculateCustomerAdvanceTaxBreakdown({
      amount: 999.99,
      vatRatePercent: 7,
      vatType: 'INCLUDE',
    })).toMatchObject({
      subtotalAmount: 999.99,
      targetAmount: 1069.99,
      vatAmount: 70,
    })
  })
})
