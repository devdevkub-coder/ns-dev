import { describe, expect, it } from 'vitest'
import { apiErrorResponse } from './api-error'

function prismaUniqueError(meta: Record<string, unknown>) {
  return Object.assign(new Error('Unique constraint failed'), { code: 'P2002', meta })
}

describe('apiErrorResponse trading allocation conflicts', () => {
  it('returns Deal Margin integrity for a unique sales line target', async () => {
    const response = apiErrorResponse(prismaUniqueError({ target: ['sales_bill_id', 'sales_line_no'] }), 'fallback')

    expect(response.status).toBe(409)
    await expect(response.json()).resolves.toMatchObject({ code: 'DEAL_MARGIN_DATA_INTEGRITY' })
  })

  it('returns Deal Margin integrity when Prisma reports the unique constraint name', async () => {
    const response = apiErrorResponse(prismaUniqueError({ constraint: 'uq_trading_allocation_facts_active_sales_line' }), 'fallback')

    expect(response.status).toBe(409)
    await expect(response.json()).resolves.toMatchObject({ code: 'DEAL_MARGIN_DATA_INTEGRITY' })
  })

  it('keeps unrelated unique conflicts as generic conflicts', async () => {
    const response = apiErrorResponse(prismaUniqueError({ target: ['allocation_no'] }), 'fallback')

    expect(response.status).toBe(409)
    await expect(response.json()).resolves.toEqual({ code: 'CONFLICT', error: 'ข้อมูลซ้ำกับรายการที่มีอยู่แล้ว' })
  })
})
