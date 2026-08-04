import { describe, expect, it } from 'vitest'
import { simpleMasterViewPermission } from './simple-master-permissions'

describe('simple master page view permissions', () => {
  it('keeps product type and unit reads on their page-specific permissions', () => {
    expect(simpleMasterViewPermission('productTypes')).toBe('master.product_types.view')
    expect(simpleMasterViewPermission('productUnits')).toBe('master.product_units.view')
  })
})
