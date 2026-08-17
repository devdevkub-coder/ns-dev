import { describe, expect, it } from 'vitest'
import { formatMoney, formatSignedMoney } from './daily'

describe('daily money formatting', () => {
  it('does not expose negative zero after rounding to two decimals', () => {
    expect(formatMoney(-0)).toBe('0.00')
    expect(formatMoney(-0.0001)).toBe('0.00')
    expect(formatMoney(0.0001)).toBe('0.00')
    expect(formatMoney(-0.01)).toBe('-0.01')
  })

  it('does not add a direction sign to zero', () => {
    expect(formatSignedMoney(0, '+')).toBe('0.00')
    expect(formatSignedMoney(-0.0001, '-')).toBe('0.00')
    expect(formatSignedMoney(125, '+')).toBe('+125.00')
    expect(formatSignedMoney(80, '-')).toBe('-80.00')
  })
})
