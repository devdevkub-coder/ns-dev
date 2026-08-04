import { describe, expect, it, vi } from 'vitest'
import { currentTransactionDate } from './transaction-date'

describe('customer receipt reversal period', () => {
  it('uses the database transaction date and fails closed when it is unavailable', async () => {
    const tx = { $queryRaw: vi.fn().mockResolvedValue([{ business_date: new Date('2026-07-30T00:00:00.000Z') }]) }
    await expect(currentTransactionDate(tx as never)).resolves.toBe('2026-07-30')
    await expect(currentTransactionDate({ $queryRaw: vi.fn().mockResolvedValue([]) } as never)).rejects.toThrow('ไม่พบวันที่ดำเนินการ')
  })
})
