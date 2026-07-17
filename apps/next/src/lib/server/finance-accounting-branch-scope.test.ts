import { describe, expect, it } from 'vitest'
import { getFinanceBranchCodeIntersection } from './finance-accounting-branch-scope'

describe('getFinanceBranchCodeIntersection', () => {
  it('fails closed when a custom-scope user has no branch mapping', () => {
    const context = {
      appUser: { branchIds: [] },
      isAdmin: false,
      roles: [{ branchScope: 'custom' }],
    }

    expect(getFinanceBranchCodeIntersection(context)).toEqual([])
    expect(getFinanceBranchCodeIntersection(context, 'B01')).toEqual([])
  })

  it('keeps an explicitly all-scope role unrestricted', () => {
    const context = {
      appUser: { branchIds: [] },
      isAdmin: false,
      roles: [{ branchScope: 'all' }],
    }

    expect(getFinanceBranchCodeIntersection(context)).toBeNull()
    expect(getFinanceBranchCodeIntersection(context, 'b01')).toEqual(['B01'])
  })

  it('intersects an own-scope request with normalized branch mappings', () => {
    const context = {
      appUser: { branchIds: ['b01', 'B02', 'B02'] },
      isAdmin: false,
      roles: [{ branchScope: 'own' }],
    }

    expect(getFinanceBranchCodeIntersection(context)).toEqual(['B01', 'B02'])
    expect(getFinanceBranchCodeIntersection(context, 'b02')).toEqual(['B02'])
    expect(getFinanceBranchCodeIntersection(context, 'B03')).toEqual([])
  })
})
