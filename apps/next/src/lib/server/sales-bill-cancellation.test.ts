import { describe, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { cancelSalesBillLineFacts } from './sales-bill-cancellation'

describe('cancelSalesBillLineFacts', () => {
  it('changes line state without touching the existing business note', async () => {
    const cancelledAt = new Date('2026-08-13T03:00:00.000Z')
    const updateMany = vi.fn().mockResolvedValue({ count: 1 })

    await cancelSalesBillLineFacts(
      { sales_bill_lines: { updateMany } } as never,
      { actor: 'qa-sales-cancel', cancelledAt, salesBillId: 42n },
    )

    expect(updateMany).toHaveBeenCalledWith({
      data: {
        status: 'cancelled',
        updated_at: cancelledAt,
        updated_by: 'qa-sales-cancel',
      },
      where: {
        sales_bill_id: 42n,
        status: 'active',
      },
    })
  })
})

describe('Sales Bill cancellation route source contract', () => {
  it('routes both Sales Bill cancellation paths through the note-preserving helper', () => {
    const detailRoute = readFileSync(
      new URL('../../app/api/sales/bills/[id]/route.ts', import.meta.url),
      'utf8',
    )
    const collectionRoute = readFileSync(
      new URL('../../app/api/sales/bills/route.ts', import.meta.url),
      'utf8',
    )
    expect(detailRoute).toContain('cancelSalesBillLineFacts(tx, {')
    const legacyCancelStart = collectionRoute.indexOf(
      'const { id, reason } = cancelSalesBillSchema.parse(raw)',
    )
    expect(legacyCancelStart).toBeGreaterThan(-1)
    expect(collectionRoute.slice(legacyCancelStart)).toContain(
      'cancelSalesBillLineFacts(tx, {',
    )
  })
})
