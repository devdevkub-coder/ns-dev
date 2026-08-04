import { describe, expect, it } from 'vitest'
import { getCostPoolAvailableQty, getCostPoolStatus } from './dual-costing-allocation-contract'

describe('dual costing allocation contract', () => {
  it('treats released quantity as unavailable and fully used when it exhausts the lot', () => {
    expect(getCostPoolAvailableQty(10, 3, 7)).toBe(0)
    expect(getCostPoolStatus(10, 3, 7)).toBe('Fully Used')
    expect(getCostPoolStatus(10, 10, 0)).toBe('Fully Used')
  })
})
