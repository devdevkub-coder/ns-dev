import { describe, expect, it } from 'vitest'
import { branchAccessModeForRoleScopes, hasUnrestrictedBranchScope, isUnrestrictedBranchScope } from './admin-user-branch-access'

describe('admin user branch access mode', () => {
  it('recognizes all-branch role scopes case-insensitively', () => {
    expect(isUnrestrictedBranchScope(' ALL ')).toBe(true)
    expect(isUnrestrictedBranchScope('own')).toBe(false)
    expect(isUnrestrictedBranchScope(null)).toBe(false)
  })

  it('uses all-branch mode when any selected role is unrestricted', () => {
    expect(hasUnrestrictedBranchScope(['own', ' all '])).toBe(true)
    expect(branchAccessModeForRoleScopes(['own', ' all '])).toBe('all')
  })

  it('uses selected mode for scoped roles and unset mode without roles', () => {
    expect(branchAccessModeForRoleScopes([])).toBe('unset')
    expect(branchAccessModeForRoleScopes(['own', 'custom'])).toBe('selected')
  })
})
