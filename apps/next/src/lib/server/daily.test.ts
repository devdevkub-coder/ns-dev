import { describe, expect, it } from 'vitest'
import * as daily from './daily'

describe('toBangkokDateOnly', () => {
  it('keeps the Bangkok business date when UTC is still on the previous day', () => {
    const toBangkokDateOnly = (daily as typeof daily & {
      toBangkokDateOnly?: (value: Date | null | undefined) => string
    }).toBangkokDateOnly

    expect(toBangkokDateOnly).toBeTypeOf('function')
    expect(toBangkokDateOnly?.(new Date('2026-06-30T17:00:00.000Z'))).toBe('2026-07-01')
  })
})

describe('toBangkokEndOfDay', () => {
  it('returns the UTC boundary for the end of the Bangkok business date', () => {
    const toBangkokEndOfDay = (daily as typeof daily & {
      toBangkokEndOfDay?: (value: Date) => Date
    }).toBangkokEndOfDay

    expect(toBangkokEndOfDay).toBeTypeOf('function')
    expect(toBangkokEndOfDay?.(new Date('2026-07-17T00:00:00.000Z')).toISOString()).toBe('2026-07-17T16:59:59.999Z')
  })
})
