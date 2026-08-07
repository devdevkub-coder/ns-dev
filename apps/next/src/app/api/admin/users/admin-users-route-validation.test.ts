import { describe, expect, it } from 'vitest'
import { AdminUserReferenceError, findBranchReferenceForAccess, resolveBranchReferencesForUser } from './admin-users-route-helpers'

describe('admin users route reference validation', () => {
  it('matches branch references case-insensitively for access inserts', () => {
    expect(findBranchReferenceForAccess([
      { code: 'BKK', id: 12n },
    ], 'bkk')).toEqual({ code: 'BKK', id: 12n })
  })

  it('throws a validation error when branch reference resolution drifts', () => {
    expect(() => findBranchReferenceForAccess([], 'BKK')).toThrow(AdminUserReferenceError)
  })
})

describe('resolveBranchReferencesForUser', () => {
  const branches = [{ code: 'B01', id: 1n }, { code: 'B02', id: 2n }]

  it('allows selected branches even when the role itself is all-scope', () => {
    expect(resolveBranchReferencesForUser({
      activeBranchRefs: branches,
      branchAccessMode: 'selected',
      branchIds: ['B01'],
      hasUnrestrictedRole: true,
      selectedBranchRefs: [branches[0]],
    })).toEqual([branches[0]])
  })

  it('expands all for a scoped role into explicit current branch mappings', () => {
    expect(resolveBranchReferencesForUser({
      activeBranchRefs: branches,
      branchAccessMode: 'all',
      branchIds: [],
      hasUnrestrictedRole: false,
      selectedBranchRefs: [],
    })).toEqual(branches)
  })

  it('keeps an all-scope role without mappings unrestricted', () => {
    expect(resolveBranchReferencesForUser({
      activeBranchRefs: branches,
      branchAccessMode: 'all',
      branchIds: [],
      hasUnrestrictedRole: true,
      selectedBranchRefs: [],
    })).toEqual([])
  })
})
