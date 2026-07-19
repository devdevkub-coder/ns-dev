import { describe, expect, it } from 'vitest'

import { effectivePermissionCodes } from './authorization'

describe('effectivePermissionCodes', () => {
  it('combines permissions from multiple roles', () => {
    const result = effectivePermissionCodes({
      overrides: [],
      rolePermissionCodes: ['daily.weight_tickets.view', 'sales.bill.create'],
    })

    expect([...result]).toEqual(['daily.weight_tickets.view', 'sales.bill.create'])
  })

  it('applies deny overrides before allow overrides for the same code', () => {
    const result = effectivePermissionCodes({
      overrides: [
        { code: 'sales.bill.approve', effect: 'allow' },
        { code: 'sales.bill.approve', effect: 'deny' },
      ],
      rolePermissionCodes: ['sales.bill.view', 'sales.bill.approve'],
    })

    expect(result.has('sales.bill.view')).toBe(true)
    expect(result.has('sales.bill.approve')).toBe(false)
  })

  it('keeps deny precedence when allow is listed after deny', () => {
    const result = effectivePermissionCodes({
      overrides: [
        { code: 'sales.bill.approve', effect: 'deny' },
        { code: 'sales.bill.approve', effect: 'allow' },
      ],
      rolePermissionCodes: ['sales.bill.approve'],
    })

    expect(result.has('sales.bill.approve')).toBe(false)
  })

  it('allows a user override to add a permission not present in a role', () => {
    const result = effectivePermissionCodes({
      overrides: [{ code: 'sales.bill.export', effect: 'allow' }],
      rolePermissionCodes: ['sales.bill.view'],
    })

    expect([...result]).toEqual(['sales.bill.view', 'sales.bill.export'])
  })

  it('ignores duplicate role permission codes', () => {
    const result = effectivePermissionCodes({
      overrides: [],
      rolePermissionCodes: ['sales.bill.view', 'sales.bill.view'],
    })

    expect(result.size).toBe(1)
  })
})
