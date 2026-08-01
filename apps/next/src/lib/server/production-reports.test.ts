import { describe, expect, it } from 'vitest'

import { productionWhere } from './production-reports'

describe('production report status policy', () => {
  it('keeps cancelled orders excluded even when a lifecycle status is supplied', () => {
    expect(productionWhere({})).toMatchObject({ NOT: { status: 'Cancelled' } })
    expect(productionWhere({ status: 'Cancelled' })).toMatchObject({
      NOT: { status: 'Cancelled' },
      status: 'Cancelled',
    })
  })
})
