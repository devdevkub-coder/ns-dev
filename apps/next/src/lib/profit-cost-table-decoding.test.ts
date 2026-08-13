import { describe, expect, it } from 'vitest'
import { shouldDecodeDimensionRows } from './profit-cost-table-decoding'

describe('profit-cost table decoding', () => {
  it('does not decode product rows as dimension rows', () => {
    expect(shouldDecodeDimensionRows('products')).toBe(false)
  })

  it('keeps dimension decoding for dimension tabs only', () => {
    expect(shouldDecodeDimensionRows('suppliers')).toBe(true)
    expect(shouldDecodeDimensionRows('customers')).toBe(true)
    expect(shouldDecodeDimensionRows('channels')).toBe(true)
    expect(shouldDecodeDimensionRows('trend')).toBe(true)
    expect(shouldDecodeDimensionRows('alerts')).toBe(false)
  })
})
