import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  getCurrentAuthContext: vi.fn(),
  getDualCostingBranch: vi.fn(),
  poBuysFindMany: vi.fn(),
  purchaseBillItemsFindMany: vi.fn(),
  purchaseBillsFindMany: vi.fn(),
  stockPoolEntriesFindMany: vi.fn(),
  requirePermission: vi.fn(),
}))

vi.mock('@/lib/server/api-error', () => ({ apiErrorResponse: vi.fn() }))
vi.mock('@/lib/server/auth-context', () => ({
  AuthContextError: class AuthContextError extends Error {},
  authContextErrorResponse: vi.fn(),
  getCurrentAuthContext: mocks.getCurrentAuthContext,
  requirePermission: mocks.requirePermission,
}))

vi.mock('@/lib/server/dual-costing-allocation-contract', () => ({
  getCostPoolAvailableQty: (qty: number, allocated: number, released: number) => Math.max(0, qty - allocated - released),
  getCostPoolStatus: (qty: number, allocated: number, released: number) => allocated + released >= qty ? 'Fully Used' : allocated + released > 0 ? 'Partially Used' : 'Available',
}))
vi.mock('@/lib/server/daily', () => ({
  toDateOnly: (value: Date | string) => new Date(value).toISOString().slice(0, 10),
  toNumber: (value: unknown) => typeof value === 'number' ? value : Number(value ?? 0),
}))
vi.mock('@/lib/server/dual-costing-branch', () => ({ getDualCostingBranch: mocks.getDualCostingBranch }))
vi.mock('@/lib/server/prisma', () => ({
  prisma: {
    po_buys: { findMany: mocks.poBuysFindMany },
    purchase_bill_items: { findMany: mocks.purchaseBillItemsFindMany },
    purchase_bills: { findMany: mocks.purchaseBillsFindMany },
    stock_cost_pool_entries: { findMany: mocks.stockPoolEntriesFindMany },
  },
}))

import { GET, getCostPoolRowsData } from './handler'

function entry(overrides: Record<string, unknown>) {
  return {
    allocated_qty: 0,
    branches: { name: 'สำนักงานใหญ่' },
    date: new Date('2026-08-01T00:00:00.000Z'),
    id: 1n,
    original_qty: 10,
    original_value: 1000,
    pool_key: 'SCP-001',
    products: { code: 'CU-01', id: 1n, metal_group: 'copper', name: 'Copper' },
    released_qty: 0,
    source_line_id: null,
    source_ref_id: null,
    source_ref_no: 'PB-001',
    source_ref_type: 'PB',
    source_type: 'Purchase',
    status: 'active',
    unit_cost: 100,
    ...overrides,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.getCurrentAuthContext.mockResolvedValue({ appUser: { email: 'viewer@example.com' }, authUser: { email: 'viewer@example.com' } })
  mocks.getDualCostingBranch.mockResolvedValue({ id: 1n })
  mocks.purchaseBillItemsFindMany.mockResolvedValue([])
  mocks.purchaseBillsFindMany.mockResolvedValue([{ doc_no: 'PB-001', suppliers: { name: 'ผู้ขายบิล' } }])
  mocks.poBuysFindMany.mockResolvedValue([{ doc_no: 'POB-001', suppliers: { name: 'ผู้ขาย PO' } }])
})

describe('GET /api/dual-costing/cost-pool cache contract', () => {
  it('marks JSON financial facts as private and non-cacheable', async () => {
    mocks.stockPoolEntriesFindMany.mockResolvedValue([entry({})])

    const response = await GET(new Request('http://localhost/api/dual-costing/cost-pool'))

    expect(response.headers.get('cache-control')).toBe('private, no-store')
  })

  it('marks XLSX financial exports as private and non-cacheable', async () => {
    mocks.stockPoolEntriesFindMany.mockResolvedValue([entry({})])

    const response = await GET(new Request('http://localhost/api/dual-costing/cost-pool?format=xlsx'))

    expect(response.headers.get('cache-control')).toBe('private, no-store')
  })
})

describe('Cost Pool supplier display contract', () => {
  it('keeps the counterparty wire key but resolves PB/PO rows from suppliers.name', async () => {
    mocks.stockPoolEntriesFindMany.mockResolvedValue([
      entry({ pool_key: 'SCP-PB' }),
      entry({ pool_key: 'SCP-PO', source_ref_no: 'POB-001', source_ref_type: 'POB', source_type: 'PO_Buy' }),
    ])

    const { rows } = await getCostPoolRowsData({ showAvailableOnly: false })

    expect(rows.map((row) => ({ counterparty: row.counterparty, sourceType: row.sourceType }))).toEqual([
      { counterparty: 'ผู้ขายบิล', sourceType: 'Spot_Buy' },
      { counterparty: 'ผู้ขาย PO', sourceType: 'PO_Buy' },
    ])
  })

  it('prefers the PO supplier for a PB-backed PO cost row', async () => {
    mocks.purchaseBillItemsFindMany.mockResolvedValue([
      { line_no: 1, purchase_bill_id: 1n, source_snapshot: { poBuyId: 'POB-001' } },
    ])
    mocks.stockPoolEntriesFindMany.mockResolvedValue([
      entry({ source_line_id: '1', source_ref_id: '1' }),
    ])

    const { rows } = await getCostPoolRowsData({ showAvailableOnly: false })

    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({
      counterparty: 'ผู้ขาย PO',
      sourceNo: 'POB-001',
      sourceType: 'PO_Buy',
    })
  })

  it('uses an em dash for Production, Regrade, and Opening rows instead of source-type text', async () => {
    mocks.stockPoolEntriesFindMany.mockResolvedValue([
      entry({ pool_key: 'SCP-PROD', source_ref_no: 'PROD-001', source_ref_type: 'PO2', source_type: 'Production' }),
      entry({ pool_key: 'SCP-REGRADE', source_ref_no: 'REG-001', source_ref_type: 'REG', source_type: 'Grade Adjustment' }),
      entry({ pool_key: 'SCP-OPEN', source_ref_no: 'OPEN-001', source_ref_type: 'opening_cost_pool', source_type: 'opening_purchase' }),
    ])

    const { rows } = await getCostPoolRowsData({ showAvailableOnly: false })

    expect(rows.map((row) => row.counterparty)).toEqual(['—', '—', '—'])
  })
})
