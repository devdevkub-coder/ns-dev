import { describe, expect, it } from 'vitest'
import { AdminUserReferenceError, findBranchReferenceForAccess } from './admin-users-route-helpers'

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
