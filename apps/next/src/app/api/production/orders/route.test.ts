import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  branchFindMany: vi.fn(),
  count: vi.fn(),
  findMany: vi.fn(),
  getBranchCodeIntersection: vi.fn(),
  getCurrentAuthContext: vi.fn(),
  warehouseFindMany: vi.fn(),
}))

vi.mock('@/lib/business-code', () => ({ requireBusinessCode: vi.fn((code: string) => code) }))
vi.mock('@/lib/server/api-error', () => ({ apiErrorResponse: vi.fn(() => new Response(null, { status: 500 })) }))
vi.mock('@/lib/server/auth-context', () => ({
  AuthContextError: class AuthContextError extends Error {},
  authContextErrorResponse: vi.fn(),
  getBranchCodeIntersection: mocks.getBranchCodeIntersection,
  getCurrentAuthContext: mocks.getCurrentAuthContext,
  requirePermission: vi.fn(),
}))
vi.mock('@/lib/server/daily', () => ({ currentActor: vi.fn(), toDateOnly: vi.fn(), toNumber: vi.fn() }))
vi.mock('@/lib/server/prisma', () => ({
  prisma: {
    branches: { findMany: mocks.branchFindMany },
    production_orders: { count: mocks.count, findMany: mocks.findMany },
    warehouses: { findMany: mocks.warehouseFindMany },
  },
}))
vi.mock('@/lib/server/production-orders', () => ({
  createProductionOrder: vi.fn(),
  createProductionOrderSchema: { parse: vi.fn() },
  ProductionOrderError: class ProductionOrderError extends Error {},
}))
vi.mock('@/lib/server/xlsx', () => ({
  applyWorksheetTableLayout: vi.fn(),
  XLSX: {
    utils: {
      book_append_sheet: vi.fn(),
      book_new: vi.fn(() => ({})),
      json_to_sheet: vi.fn(() => ({})),
    },
    write: vi.fn(() => Buffer.from('xlsx')),
  },
}))

import { GET } from './route'

const context = { appUser: { branchIds: ['B01'] } }

beforeEach(() => {
  vi.clearAllMocks()
  mocks.getCurrentAuthContext.mockResolvedValue(context)
  mocks.count.mockResolvedValue(0)
  mocks.findMany.mockResolvedValue([])
  mocks.warehouseFindMany.mockResolvedValue([])
  mocks.branchFindMany.mockResolvedValue([])

  mocks.getBranchCodeIntersection.mockImplementation((_context, requested?: string | null) => {
    if (requested) return requested === 'B01' ? ['B01'] : []
    return ['B01']
  })
})

describe('production orders branch authorization', () => {
  it('keeps unrestricted users unscoped while honoring an optional requested branch', async () => {
    mocks.getBranchCodeIntersection.mockImplementation((_context, requested?: string | null) => requested ? [requested] : null)

    await GET(new Request('http://localhost/api/production/orders'))
    expect(mocks.findMany.mock.calls[0]?.[0].where).not.toHaveProperty('branches')
    expect(mocks.branchFindMany).toHaveBeenCalledWith(expect.objectContaining({ where: { active: true } }))

    vi.clearAllMocks()
    mocks.getCurrentAuthContext.mockResolvedValue(context)
    mocks.count.mockResolvedValue(0)
    mocks.findMany.mockResolvedValue([])
    mocks.warehouseFindMany.mockResolvedValue([])
    mocks.branchFindMany.mockResolvedValue([])
    mocks.getBranchCodeIntersection.mockImplementation((_context, requested?: string | null) => requested ? [requested] : null)

    await GET(new Request('http://localhost/api/production/orders?branchCode=B02'))
    expect(mocks.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ branches: { code: { in: ['B02'] } } }),
    }))
  })

  it('scopes an unfiltered list and branch options to the authenticated branches', async () => {
    const response = await GET(new Request('http://localhost/api/production/orders'))

    expect(response.status).toBe(200)
    expect(mocks.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ branches: { code: { in: ['B01'] } } }),
    }))
    expect(mocks.branchFindMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { active: true, code: { in: ['B01'] } },
    }))
  })

  it('returns no rows when a restricted user requests a disallowed branch', async () => {
    const response = await GET(new Request('http://localhost/api/production/orders?branchCode=B02'))

    expect(response.status).toBe(200)
    expect(mocks.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ branches: { code: { in: [] } } }),
    }))
  })

  it('allows a restricted user to request an assigned branch', async () => {
    const response = await GET(new Request('http://localhost/api/production/orders?branchCode=B01'))

    expect(response.status).toBe(200)
    expect(mocks.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ branches: { code: { in: ['B01'] } } }),
    }))
  })

  it('applies the same branch authorization to XLSX without unused list queries', async () => {
    const response = await GET(new Request('http://localhost/api/production/orders?branchCode=B02&format=xlsx'))

    expect(response.status).toBe(200)
    expect(mocks.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ branches: { code: { in: [] } } }),
    }))
    expect(mocks.count).not.toHaveBeenCalled()
    expect(mocks.branchFindMany).not.toHaveBeenCalled()
  })
})

describe('production orders status filter', () => {
  it('filters list rows by every selected production status', async () => {
    const response = await GET(new Request('http://localhost/api/production/orders?status=Open&status=Completed'))

    expect(response.status).toBe(200)
    expect(mocks.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ status: { in: ['Open', 'Completed'] } }),
    }))
  })
})
