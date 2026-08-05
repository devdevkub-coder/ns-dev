import { describe, expect, it } from 'vitest'
import { canUseMasterDataAction } from './master-data-page-capabilities'
import { productTypesPageConfig, productUnitsPageConfig, salespersonsPageConfig } from './master-data-page-configs'

describe('master-data UI action capabilities', () => {
  it('hides write actions for coordinator read-only pages', () => {
    expect(canUseMasterDataAction(productTypesPageConfig, ['master.product_types.view'], 'create')).toBe(false)
    expect(canUseMasterDataAction(productTypesPageConfig, ['master.product_types.view'], 'status')).toBe(false)
    expect(canUseMasterDataAction(salespersonsPageConfig, ['master.salespersons.view'], 'update')).toBe(false)
  })

  it('keeps actions available only when their route permission is present', () => {
    expect(canUseMasterDataAction(salespersonsPageConfig, ['master.salespersons.view', 'master.salespersons.create'], 'create')).toBe(true)
    expect(canUseMasterDataAction(salespersonsPageConfig, ['master.salespersons.view', 'master.salespersons.status'], 'status')).toBe(true)
    expect(canUseMasterDataAction(productTypesPageConfig, ['master.product_types.view', 'master.product_types.create'], 'create')).toBe(true)
    expect(canUseMasterDataAction(productTypesPageConfig, ['master.product_types.view'], 'create')).toBe(false)
    expect(canUseMasterDataAction(productUnitsPageConfig, ['master.product_units.view', 'master.product_units.status'], 'status')).toBe(true)
  })
})
