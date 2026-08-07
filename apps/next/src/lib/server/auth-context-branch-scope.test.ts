import { describe, expect, it } from 'vitest'
import { getBranchCodeIntersection } from './auth-context'

describe('getBranchCodeIntersection', () => {
  it('keeps an all-scope user without explicit mappings unrestricted', () => {
    const context = { appUser: { branchIds: [] }, isAdmin: false, roles: [{ branchScope: 'all' }] } as never
    expect(getBranchCodeIntersection(context)).toBeNull()
    expect(getBranchCodeIntersection(context, 'b01')).toEqual(['B01'])
  })

  it('uses explicit mappings to restrict an all-scope role', () => {
    const context = { appUser: { branchIds: ['b01'] }, isAdmin: false, roles: [{ branchScope: 'all' }] } as never
    expect(getBranchCodeIntersection(context)).toEqual(['B01'])
    expect(getBranchCodeIntersection(context, 'B02')).toEqual([])
  })
})
