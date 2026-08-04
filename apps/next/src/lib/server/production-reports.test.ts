import { describe, expect, it } from 'vitest'

import { productionWhere } from './production-reports'

describe('production report status policy', () => {
  it('excludes cancelled orders by default but allows an explicit cancelled filter', () => {
    expect(productionWhere({})).toMatchObject({ NOT: { status: 'Cancelled' } })
    expect(productionWhere({ status: 'Cancelled' })).toMatchObject({ status: 'Cancelled' })
    expect(productionWhere({ status: 'Cancelled' })).not.toHaveProperty('NOT')
  })
})
