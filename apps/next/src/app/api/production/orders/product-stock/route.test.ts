import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => {
  class AuthContextError extends Error {
    status: number

    constructor(message: string, status: number) {
      super(message)
      this.status = status
    }
  }

  return {
  AuthContextError,
  apiErrorResponse: vi.fn((_error: unknown, message: string, status = 500) => Response.json({ error: message }, { status })),
  authContextErrorResponse: vi.fn((error: { message: string; status: number }) => Response.json({ error: error.message }, { status: error.status })),
  getBranchCodeIntersection: vi.fn(() => null),
  getCurrentAuthContext: vi.fn(),
  productionProductStock: vi.fn(),
  requireAnyPermission: vi.fn(),
  }
})

vi.mock('@/lib/server/api-error', () => ({ apiErrorResponse: mocks.apiErrorResponse }))
vi.mock('@/lib/server/auth-context', () => ({
  AuthContextError: mocks.AuthContextError,
  authContextErrorResponse: mocks.authContextErrorResponse,
  getBranchCodeIntersection: mocks.getBranchCodeIntersection,
  getCurrentAuthContext: mocks.getCurrentAuthContext,
  requireAnyPermission: mocks.requireAnyPermission,
}))
vi.mock('@/lib/server/production-orders', () => ({
  ProductionOrderError: class ProductionOrderError extends Error {},
  productionProductStock: mocks.productionProductStock,
}))

import { GET } from './route'

beforeEach(() => {
  vi.clearAllMocks()
  mocks.getCurrentAuthContext.mockResolvedValue({ permissions: [] })
  mocks.productionProductStock.mockResolvedValue([])
  mocks.requireAnyPermission.mockImplementation((context: { permissions: string[] }, required: string[]) => {
    if (!required.some((permission) => context.permissions.includes(permission))) {
      throw new mocks.AuthContextError('ไม่มีสิทธิ์เข้าถึงข้อมูล', 403)
    }
  })
})

describe('GET /api/production/orders/product-stock', () => {
  it('denies a sorting-style context without production or stock permission', async () => {
    const response = await GET(new Request('http://localhost/api/production/orders/product-stock?branchCode=B01'))

    expect(response.status).toBe(403)
    expect(mocks.productionProductStock).not.toHaveBeenCalled()
  })

  it('allows production orders view without granting stock ledger access', async () => {
    mocks.getCurrentAuthContext.mockResolvedValue({ permissions: ['production.orders.view'] })

    const response = await GET(new Request('http://localhost/api/production/orders/product-stock?branchCode=B01&productCode=P01'))

    expect(response.status).toBe(200)
    expect(mocks.requireAnyPermission).toHaveBeenCalledWith(
      { permissions: ['production.orders.view'] },
      ['production.orders.view', 'stock.ledger.view'],
    )
    expect(mocks.productionProductStock).toHaveBeenCalledWith({ branchCode: 'B01', productCode: 'P01', warehouseCode: '' })
  })
})
