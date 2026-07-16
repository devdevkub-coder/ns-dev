import { describe, expect, it } from 'vitest'
import {
  calculateCustomerAdvanceAllocation,
  calculateCustomerAdvancePaidBaseCapacity,
  calculateCustomerAdvanceTaxBreakdown,
  calculateSalesBillPostCustomerAdvanceTotals,
} from './customer-advance'

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

describe('customer advance sales bill allocation', () => {
  it('treats received CADV cash as gross and converts it back to pre-VAT capacity', () => {
    expect(calculateCustomerAdvancePaidBaseCapacity({
      receivedGrossAmount: 535,
      subtotalAmount: 1000,
      targetAmount: 1070,
    })).toBe(500)
  })

  it('allocates CADV by pre-VAT base and records the related VAT/total split', () => {
    expect(calculateCustomerAdvanceAllocation({
      availableBaseAmount: 500,
      billSubtotalAmount: 1000,
      billTotalAmount: 1070,
      billVatAmount: 70,
    })).toEqual({
      allocatedAmount: 500,
      allocatedSubtotalAmount: 500,
      allocatedTotalAmount: 535,
      allocatedVatAmount: 35,
      remainingBaseAmount: 0,
    })
  })

  it('recalculates sales bill VAT after subtracting CADV base', () => {
    expect(calculateSalesBillPostCustomerAdvanceTotals({
      advanceBaseAllocatedAmount: 500,
      hasVat: true,
      subtotalAmount: 1000,
      vatRatePercent: 7,
      vatType: 'EXCLUDE',
    })).toMatchObject({
      taxableBaseAmount: 500,
      totalAmount: 535,
      vatAmount: 35,
    })
  })

  it('subtracts sales bill discount before applying CADV base and recalculating VAT', () => {
    expect(calculateSalesBillPostCustomerAdvanceTotals({
      advanceBaseAllocatedAmount: 500,
      discountAmount: 100,
      hasVat: true,
      subtotalAmount: 1000,
      vatRatePercent: 7,
      vatType: 'EXCLUDE',
    })).toMatchObject({
      afterDiscountAmount: 900,
      taxableBaseAmount: 400,
      totalAmount: 428,
      vatAmount: 28,
    })
  })

  it('does not let CADV allocation exceed the bill base', () => {
    expect(calculateCustomerAdvanceAllocation({
      availableBaseAmount: 1200,
      billSubtotalAmount: 1000,
      billTotalAmount: 1070,
      billVatAmount: 70,
    })).toMatchObject({
      allocatedSubtotalAmount: 1000,
      allocatedTotalAmount: 1070,
      allocatedVatAmount: 70,
      remainingBaseAmount: 200,
    })
  })
})
