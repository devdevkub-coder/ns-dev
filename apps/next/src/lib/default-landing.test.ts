import { describe, expect, it } from 'vitest'
import { defaultLandingPath, preferredLandingPathForRoles } from './default-landing'

describe('default landing path', () => {
  it('does not send a restricted user to Owner Daily', () => {
    expect(defaultLandingPath({ permissions: ['reports.sales_plan.view'] })).toBe('/sales-plan')
  })

  it('keeps the first Dashboard & Reports page for a fully granted user', () => {
    expect(defaultLandingPath({ permissions: ['reports.owner_daily.view'] })).toBe('/owner-daily')
  })

  it('uses an accessible role landing preference before menu order', () => {
    expect(defaultLandingPath({
      permissions: ['daily.weight_tickets.view', 'production.operations.view'],
      preferredPath: '/production/dashboard',
    })).toBe('/production/dashboard')
  })

  it('ignores a preferred landing path without permission', () => {
    expect(defaultLandingPath({
      permissions: ['daily.weight_tickets.view'],
      preferredPath: '/production/dashboard',
    })).not.toBe('/production/dashboard')
  })

  it('ignores a preferred landing path outside the navigation registry', () => {
    expect(defaultLandingPath({
      permissions: ['production.operations.view'],
      preferredPath: '/api/production/dashboard',
    })).toBe('/production/dashboard')
  })
})

describe('role landing preference', () => {
  it('uses the configured production role landing path', () => {
    expect(preferredLandingPathForRoles([
      { code: 'staff', defaultLandingPath: null },
      { code: 'production_department', defaultLandingPath: '/production/dashboard' },
    ])).toBe('/production/dashboard')
  })

  it('resolves multiple configured roles deterministically by role code', () => {
    expect(preferredLandingPathForRoles([
      { code: 'warehouse', defaultLandingPath: '/stock/balance' },
      { code: 'production_department', defaultLandingPath: '/production/dashboard' },
    ])).toBe('/production/dashboard')
  })
})
