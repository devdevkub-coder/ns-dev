import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  canAccessBranchId: vi.fn(),
  factCreate: vi.fn(),
  factFindMany: vi.fn(),
  getAllowedBranchIds: vi.fn(),
  getCurrentAuthContext: vi.fn(),
  getDualCostingBranch: vi.fn(),
  poBuyFindFirst: vi.fn(),
  poSellFindFirst: vi.fn(),
  poolFindFirst: vi.fn(),
  poolUpdate: vi.fn(),
  productionOrderFindFirst: vi.fn(),
  purchaseBillFindFirst: vi.fn(),
  requirePermission: vi.fn(),
  productFindFirst: vi.fn(),
  productFindMany: vi.fn(),
  salesBillFindFirst: vi.fn(),
  transaction: vi.fn(),
  tradingDealCreate: vi.fn(),
  tradingDealFindMany: vi.fn(),
  txExecuteRaw: vi.fn(),
}))

vi.mock('@/lib/server/api-error', () => ({ apiErrorResponse: vi.fn() }))
vi.mock('@/lib/server/auth-context', () => ({
  AuthContextError: class AuthContextError extends Error {},
  authContextErrorResponse: vi.fn(),
  getCurrentAuthContext: mocks.getCurrentAuthContext,
  requirePermission: mocks.requirePermission,
}))
vi.mock('@/lib/server/branch-scope', () => ({
  canAccessBranchId: mocks.canAccessBranchId,
  getAllowedBranchIds: mocks.getAllowedBranchIds,
}))
vi.mock('@/lib/server/dual-costing-allocation-contract', () => ({
  COST_POOL_EPSILON: 0.001,
  DUAL_COSTING_ALLOCATION_ADVISORY_LOCK: 2026072711,
  getCostPoolAvailableQty: (original: number, allocated: number, released: number) => Math.max(0, original - allocated - released),
  getCostPoolStatus: (original: number, allocated: number, released: number) => {
    const available = Math.max(0, original - allocated - released)
    if (available <= 0.001) return 'Fully Used'
    if (allocated <= 0.001) return 'Available'
    return 'Partially Used'
  },
}))
vi.mock('@/lib/server/dual-costing-branch', () => ({ getDualCostingBranch: mocks.getDualCostingBranch }))
vi.mock('@/lib/server/prisma', () => ({ prisma: { $transaction: mocks.transaction } }))
vi.mock('@/lib/server/reference-master-cache', () => ({ listProductReferences: vi.fn() }))
vi.mock('../cost-pool/handler', () => ({ getCostPoolRowsData: vi.fn() }))

import { POST } from './route'

const actor = { appUser: { email: 'allocator@example.com' }, authUser: { email: 'allocator@example.com' } }

function product(overrides: Record<string, unknown> = {}) {
  return { code: 'CU-01', id: 1n, metal_group: 'Copper', name: 'Copper', ...overrides }
}

function pool(overrides: Record<string, unknown> = {}) {
  return {
    allocated_qty: 0,
    branch_id: 10n,
    id: 101n,
    original_qty: 10,
    pool_key: 'SCP-001',
    product_id: 1n,
    released_qty: 0,
    source_line_id: '1',
    source_ref_id: '501',
    source_ref_no: 'PB-001',
    source_ref_type: 'PB',
    source_type: 'Purchase',
    unit_cost: 100,
    ...overrides,
  }
}

function spotTarget(overrides: Record<string, unknown> = {}) {
  return {
    customer_id: 22n,
    customers: { name: 'Customer' },
    doc_no: 'SB-001',
    id: 41n,
    sales_bill_lines: [{
      line_no: 1,
      net_weight: 10,
      product_id: 1n,
      products: { metal_group: 'Copper' },
      qty: 10,
      sales_bill_po_sell_allocations: [],
      unit_price: 200,
    }],
    status: 'active',
    transaction_mode: 'STOCK',
    ...overrides,
  }
}

function requestBody(overrides: Record<string, unknown> = {}) {
  return {
    candidates: [{ costPoolId: 'SCP-001', qtyToUse: 10 }],
    poSellId: 'SB-001:1',
    productId: 'CU-01',
    sourceType: 'spot-sell',
    ...overrides,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.getCurrentAuthContext.mockResolvedValue(actor)
  mocks.getDualCostingBranch.mockResolvedValue({ id: 10n, name: 'Main' })
  mocks.getAllowedBranchIds.mockResolvedValue(null)
  mocks.canAccessBranchId.mockReturnValue(true)
  mocks.productFindFirst.mockResolvedValue(product())
  mocks.productFindMany.mockResolvedValue([product()])
  mocks.salesBillFindFirst.mockResolvedValue(spotTarget())
  mocks.poSellFindFirst.mockResolvedValue(null)
  mocks.productionOrderFindFirst.mockResolvedValue(null)
  mocks.factFindMany.mockResolvedValue([])
  mocks.tradingDealFindMany.mockResolvedValue([])
  mocks.poolFindFirst.mockResolvedValue(pool())
  mocks.purchaseBillFindFirst.mockResolvedValue({ doc_no: 'PB-001', id: 501n, supplier_id: 77n, suppliers: { name: 'Supplier' } })
  mocks.poBuyFindFirst.mockResolvedValue(null)
  mocks.txExecuteRaw.mockResolvedValue(1)
  mocks.poolUpdate.mockResolvedValue({})
  mocks.tradingDealCreate.mockResolvedValue({ id: 1001n })
  mocks.factCreate.mockResolvedValue({ id: 2001n })

  const tx = {
    $executeRaw: mocks.txExecuteRaw,
    po_buys: { findFirst: mocks.poBuyFindFirst },
    po_sells: { findFirst: mocks.poSellFindFirst },
    products: { findFirst: mocks.productFindFirst, findMany: mocks.productFindMany },
    production_orders: { findFirst: mocks.productionOrderFindFirst },
    purchase_bills: { findFirst: mocks.purchaseBillFindFirst },
    sales_bills: { findFirst: mocks.salesBillFindFirst },
    stock_cost_pool_entries: { findFirst: mocks.poolFindFirst, update: mocks.poolUpdate },
    trading_allocation_facts: { create: mocks.factCreate, findMany: mocks.factFindMany },
    trading_deals: { create: mocks.tradingDealCreate, findMany: mocks.tradingDealFindMany },
  }
  mocks.transaction.mockImplementation(async (callback: (value: typeof tx) => unknown) => callback(tx))
})

async function post(body: Record<string, unknown>) {
  return POST(new Request('http://localhost/api/dual-costing/cost-allocator', {
    body: JSON.stringify(body),
    method: 'POST',
  }))
}

function expectNoWrites() {
  expect(mocks.poolUpdate).not.toHaveBeenCalled()
  expect(mocks.tradingDealCreate).not.toHaveBeenCalled()
  expect(mocks.factCreate).not.toHaveBeenCalled()
}

describe('POST /api/dual-costing/cost-allocator', () => {
  it.each([9, 11])('rejects requested quantity %s when it is not the target remainder before writing', async (qtyToUse) => {
    const response = await post(requestBody({ candidates: [{ costPoolId: 'SCP-001', qtyToUse }] }))

    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toMatchObject({ code: 'BAD_REQUEST' })
    expectNoWrites()
  })

  it('rejects a Cost Pool lot whose persisted product does not match the target product', async () => {
    mocks.poolFindFirst.mockResolvedValue(pool({ product_id: 2n }))

    const response = await post(requestBody())

    expect(response.status).toBe(400)
    expectNoWrites()
  })

  it('uses the persisted Cost Pool source rather than forged client candidate fields', async () => {
    const response = await post(requestBody({
      candidates: [{
        costPoolId: 'SCP-001',
        qtyToUse: 10,
        sourceNo: 'FORGED-001',
        sourceType: 'Production',
        unitCost: 1,
      }],
    }))

    expect(response.status).toBe(200)
    expect(mocks.factCreate).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        purchase_bill_id: 501n,
        source_doc_no: 'PB-001',
        source_type: 'TRADING_PURCHASE_BILL',
      }),
    }))
  })

  it.each([
    ['Completed', product()],
    ['Cancelled', product()],
    ['Open', product({ id: 2n })],
  ])('rejects production target with status/product combination %s before writing', async (status, productionProduct) => {
    mocks.productionOrderFindFirst.mockResolvedValue({
      doc_no: 'PROD-001',
      planned_input_qty: 10,
      product_id: productionProduct.id,
      products: productionProduct,
      production_inputs: [],
      qty_planned: 10,
      status,
    })

    const response = await post(requestBody({ poSellId: 'PROD-001', sourceType: 'production' }))

    expect(response.status).toBe(400)
    expectNoWrites()
  })

  it('takes the global allocation advisory lock before target and pool reads and stores the exact PO target reference', async () => {
    const callOrder: string[] = []
    mocks.txExecuteRaw.mockImplementation(() => { callOrder.push('lock') })
    mocks.productFindFirst.mockImplementation(async () => { callOrder.push('product'); return product() })
    mocks.poSellFindFirst.mockImplementation(async () => {
      callOrder.push('target')
      return {
        branch_id: 10n,
        customers: { name: 'Customer' },
        doc_no: 'PO-001',
        id: 55n,
        items: [{ productCode: 'CU-01', productName: 'Copper', qty: 10, remainingQty: 10, unitPrice: 200 }],
        product_id: 1n,
        qty: 10,
        remaining_qty: 10,
        status: 'Open',
        unit_price: 200,
      }
    })
    mocks.poolFindFirst.mockImplementation(async () => { callOrder.push('pool'); return pool() })

    const response = await post(requestBody({ poSellId: '55-CU-01-0', sourceType: 'po-sell' }))

    expect(response.status).toBe(200)
    expect(callOrder.indexOf('lock')).toBeLessThan(callOrder.indexOf('product'))
    expect(callOrder.indexOf('lock')).toBeLessThan(callOrder.indexOf('target'))
    expect(callOrder.indexOf('lock')).toBeLessThan(callOrder.indexOf('pool'))
    expect(mocks.factCreate).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ target_ref_id: '55-CU-01-0' }),
    }))
  })
})
