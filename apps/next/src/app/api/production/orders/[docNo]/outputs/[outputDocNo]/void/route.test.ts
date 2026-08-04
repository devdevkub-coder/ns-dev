import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  apiErrorResponse: vi.fn((_error: unknown, message: string, status = 500) => Response.json({ error: message }, { status })),
  authContextErrorResponse: vi.fn(() => Response.json({ error: 'unauthorized' }, { status: 401 })),
  assertProductionOrderBranchAccess: vi.fn(),
  currentActor: vi.fn(() => 'test-actor'),
  getBranchCodeIntersection: vi.fn(() => null),
  getCurrentAuthContext: vi.fn(),
  requirePermission: vi.fn(),
  voidProductionOutput: vi.fn(),
  voidProductionOutputSchema: { parse: vi.fn(() => ({ reason: 'test' })) },
}))

vi.mock('@/lib/server/api-error', () => ({ apiErrorResponse: mocks.apiErrorResponse }))
vi.mock('@/lib/server/auth-context', () => ({
  AuthContextError: class AuthContextError extends Error {},
  authContextErrorResponse: mocks.authContextErrorResponse,
  getBranchCodeIntersection: mocks.getBranchCodeIntersection,
  getCurrentAuthContext: mocks.getCurrentAuthContext,
  requirePermission: mocks.requirePermission,
}))
vi.mock('@/lib/server/daily', () => ({ currentActor: mocks.currentActor }))
vi.mock('@/lib/server/production-orders', () => ({
  ProductionOrderError: class ProductionOrderError extends Error {},
  assertProductionOrderBranchAccess: mocks.assertProductionOrderBranchAccess,
  voidProductionOutput: mocks.voidProductionOutput,
  voidProductionOutputSchema: mocks.voidProductionOutputSchema,
}))

import { POST } from './route'

beforeEach(() => {
  vi.clearAllMocks()
  mocks.getCurrentAuthContext.mockResolvedValue({ permissions: ['production.orders.reverse'] })
  mocks.voidProductionOutput.mockResolvedValue({ docNo: 'PO01/01' })
})

describe('POST /api/production/orders/[docNo]/outputs/[outputDocNo]/void', () => {
  it('uses the dedicated reverse action instead of output permission', async () => {
    const response = await POST(
      new Request('http://localhost/api/production/orders/PO01/outputs/PO01%2F01/void', { method: 'POST', body: '{}' }),
      { params: Promise.resolve({ docNo: 'PO01', outputDocNo: 'PO01/01' }) },
    )

    expect(response.status).toBe(200)
    expect(mocks.requirePermission).toHaveBeenCalledWith({ permissions: ['production.orders.reverse'] }, 'production.orders.reverse')
    expect(mocks.voidProductionOutput).toHaveBeenCalledWith('PO01', 'PO01/01', { reason: 'test' }, 'test-actor')
  })
})
