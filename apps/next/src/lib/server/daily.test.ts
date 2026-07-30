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

describe('bangkokDateRange', () => {
  it('converts a Bangkok calendar day to an exclusive UTC timestamp range', () => {
    const range = daily.bangkokDateRange('2026-06-26', '2026-06-26')

    expect(range.gte?.toISOString()).toBe('2026-06-25T17:00:00.000Z')
    expect(range.lt?.toISOString()).toBe('2026-06-26T17:00:00.000Z')
  })
})

describe('toDailyAccountOption', () => {
  it('exposes the business account code as a JSON-safe option id', () => {
    const option = daily.toDailyAccountOption({
      code: 'ACC01-001',
      name: 'บัญชีธนาคารหลัก',
      type: 'bank',
    })

    expect(option.id).toBe('ACC01-001')
    expect(() => JSON.stringify(option)).not.toThrow()
  })

  it('rejects BigInt values with the response path', () => {
    expect(() => daily.assertJsonSafe({ rows: [{ id: 1n }] }, 'payment-approval.GET')).toThrow(
      'payment-approval.GET.rows[0].id contains BigInt',
    )
  })
})
