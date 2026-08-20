import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  allocationFindMany: vi.fn(),
  buildDealMarginWorkbook: vi.fn(),
  getCurrentAuthContext: vi.fn(),
  getDualCostingBranch: vi.fn(),
  salesBillFindMany: vi.fn(),
}))

vi.mock('@/lib/server/api-error', () => ({
  apiErrorResponse: vi.fn(() => Response.json({ error: 'server error' }, { status: 500 })),
}))
vi.mock('@/lib/server/auth-context', () => ({
  AuthContextError: class AuthContextError extends Error {},
  authContextErrorResponse: vi.fn(),
  getCurrentAuthContext: mocks.getCurrentAuthContext,
  requirePermission: vi.fn(),
}))
vi.mock('@/lib/server/daily', () => ({
  toDateOnly: (value: Date) => value.toISOString().slice(0, 10),
  toNumber: (value: number | null | undefined) => value ?? 0,
}))
vi.mock('@/lib/server/deal-margin-export', () => ({
  buildDealMarginWorkbook: mocks.buildDealMarginWorkbook,
}))
vi.mock('@/lib/server/dual-costing-branch', () => ({
  getDualCostingBranch: mocks.getDualCostingBranch,
}))
vi.mock('@/lib/server/prisma', () => ({
  prisma: {
    sales_bills: { findMany: mocks.salesBillFindMany },
    trading_allocation_facts: { findMany: mocks.allocationFindMany },
  },
}))

import { GET } from './route'

function salesBill() {
  return {
    id: 1n,
    date: new Date('2026-08-19T00:00:00.000Z'),
    doc_no: 'SB-001',
    customers: { name: 'ลูกค้าทดสอบ' },
    sales_channels: { name: 'Trading Deal', code: 'TRADING' },
    sales_bill_lines: [{
      line_no: 1,
      line_amount: 500,
      net_weight: 40,
      product_name_snapshot: 'Copper',
      products: { metal_group: 'copper', name: 'Copper' },
      qty: 40,
      unit_price: 12.5,
    }],
  }
}

function nonDualSalesBill() {
  return {
    id: 2n,
    date: new Date('2026-08-19T00:00:00.000Z'),
    doc_no: 'SB-002',
    customers: { name: 'ลูกค้าทดสอบ 2' },
    sales_channels: { name: 'Non-Dual Channel', code: 'NON_DUAL' },
    sales_bill_lines: [{
      line_no: 1,
      line_amount: 300,
      net_weight: 20,
      product_name_snapshot: 'Aluminium',
      products: { metal_group: 'aluminium', name: 'Aluminium' },
      qty: 20,
      unit_price: 15,
    }],
  }
}

function allocation(overrides: Record<string, unknown> = {}) {
  return {
    allocation_no: 'ALLOC-001',
    matched_cogs: 400,
    qty: 40,
    sales_bill_id: 1n,
    sales_doc_no: 'SB-001',
    sales_line_no: 1,
    status: 'active',
    ...overrides,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.getCurrentAuthContext.mockResolvedValue({ appUser: { id: 'USR-001' } })
  mocks.getDualCostingBranch.mockResolvedValue({ id: 99n })
  mocks.salesBillFindMany.mockResolvedValue([salesBill()])
  mocks.allocationFindMany.mockResolvedValue([allocation()])
  mocks.buildDealMarginWorkbook.mockResolvedValue(Buffer.from('xlsx'))
})

describe('GET /api/dual-costing/deal-margin', () => {
  it('returns a data-integrity response when a sales line has duplicate allocations', async () => {
    mocks.allocationFindMany.mockResolvedValue([
      allocation(),
      allocation({ allocation_no: 'ALLOC-002', matched_cogs: 100, qty: 10 }),
    ])

    const response = await GET(new Request('http://localhost/api/dual-costing/deal-margin'))

    expect(response.status).toBe(409)
    await expect(response.json()).resolves.toEqual({
      code: 'DEAL_MARGIN_DATA_INTEGRITY',
      details: {
        allocationNos: ['ALLOC-001', 'ALLOC-002'],
        salesDocNo: 'SB-001',
        salesLineNo: 1,
      },
      error: 'พบ Allocation ซ้ำใน Sales Bill SB-001, Sales Line 1',
    })
  })

  it('returns unlinked allocations separately without using their cost in totals', async () => {
    mocks.allocationFindMany.mockResolvedValue([allocation({ sales_line_no: null })])

    const response = await GET(new Request('http://localhost/api/dual-costing/deal-margin?from=2026-08-01&to=2026-08-31&channel=Trading%20Deal'))
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body.rows).toEqual([])
    expect(body.summary).toEqual(expect.objectContaining({ cost: 0, margin: 0, revenue: 0, rows: 0 }))
    expect(body.unlinkedAllocations).toEqual([expect.objectContaining({ allocationNo: 'ALLOC-001', salesDocNo: 'SB-001' })])
    expect(body.unlinkedAllocations[0]).not.toHaveProperty('billKey')
  })

  it('keeps linked lines visible when the same sales bill also has an unlinked allocation', async () => {
    const bill = salesBill()
    bill.sales_bill_lines = [
      ...bill.sales_bill_lines,
      {
        line_no: 2,
        line_amount: 250,
        net_weight: 20,
        product_name_snapshot: 'Copper',
        products: { metal_group: 'copper', name: 'Copper' },
        qty: 20,
        unit_price: 12.5,
      },
    ]
    mocks.salesBillFindMany.mockResolvedValue([bill])
    mocks.allocationFindMany.mockResolvedValue([
      allocation(),
      allocation({ allocation_no: 'ALLOC-PENDING', sales_line_no: null, qty: 20, matched_cogs: 200 }),
    ])

    const response = await GET(new Request('http://localhost/api/dual-costing/deal-margin?from=2026-08-01&to=2026-08-31&channel=Trading%20Deal'))
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body.rows).toEqual(expect.arrayContaining([
      expect.objectContaining({ allocationNo: 'ALLOC-001', docNo: 'SB-001', matchedCost: 400 }),
    ]))
    expect(body.unlinkedAllocations).toEqual([expect.objectContaining({ allocationNo: 'ALLOC-PENDING' })])
  })

  it('only exposes channels with Deal Margin rows or unlinked allocations', async () => {
    mocks.salesBillFindMany.mockResolvedValue([salesBill(), nonDualSalesBill()])

    const response = await GET(new Request('http://localhost/api/dual-costing/deal-margin'))
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body.filters.channels).toEqual(['Trading Deal'])
  })
})
