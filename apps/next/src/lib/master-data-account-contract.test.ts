import { describe, expect, it } from 'vitest'
import { masterDataRecordSchema } from '@/lib/master-data'

describe('company account master response contract', () => {
  it('does not expose Statement-derived balances through master data', () => {
    const record = masterDataRecordSchema.parse({
      id: 'ACC01-001',
      name: 'บัญชีทดสอบ',
      realBalance: 100,
      odUsed: 20,
      odRemaining: 80,
      availableToPay: 180,
    })

    expect(record).not.toHaveProperty('realBalance')
    expect(record).not.toHaveProperty('odUsed')
    expect(record).not.toHaveProperty('odRemaining')
    expect(record).not.toHaveProperty('availableToPay')
  })
})
