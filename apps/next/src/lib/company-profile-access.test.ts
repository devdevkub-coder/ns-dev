import { describe, expect, it } from 'vitest'
import { isCompanyProfileBranchAllowed } from './company-profile'

describe('print company profile branch access', () => {
  it('allows a sales user to read the profile for an allowed branch', () => {
    expect(isCompanyProfileBranchAllowed(['B01', 'b02'], 'b01')).toBe(true)
  })

  it('rejects a sales user from reading another branch profile', () => {
    expect(isCompanyProfileBranchAllowed(['B01'], 'B02')).toBe(false)
  })

  it('allows an all-branch actor without requiring settings permission', () => {
    expect(isCompanyProfileBranchAllowed(null, 'B99')).toBe(true)
  })

  it('rejects an empty branch code instead of returning an unscoped profile', () => {
    expect(isCompanyProfileBranchAllowed(['B01'], '')).toBe(false)
  })
})
