import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  getCurrentAuthContext: vi.fn(),
  listActiveBranches: vi.fn(),
  listProductReferences: vi.fn(),
  poSellFindMany: vi.fn(),
  productionOrderFindMany: vi.fn(),
  salesBillFindMany: vi.fn(),
  tradingAllocationFactFindMany: vi.fn(),
  tradingDealFindMany: vi.fn(),
}))

vi.mock('@/lib/server/auth-context', () => ({
  AuthContextError: class AuthContextError extends Error {},
  authContextErrorResponse: vi.fn(),
  getCurrentAuthContext: mocks.getCurrentAuthContext,
  requirePermission: vi.fn(),
}))

vi.mock('@/lib/server/prisma', () => ({
  prisma: {
    po_sells: { findMany: mocks.poSellFindMany },
    production_orders: { findMany: mocks.productionOrderFindMany },
    sales_bills: { findMany: mocks.salesBillFindMany },
    trading_allocation_facts: { findMany: mocks.tradingAllocationFactFindMany },
    trading_deals: { findMany: mocks.tradingDealFindMany },
  },
}))

vi.mock('@/lib/server/reference-master-cache', () => ({
  listActiveBranches: mocks.listActiveBranches,
  listProductReferences: mocks.listProductReferences,
}))

import { GET as exportLedger } from '@/app/api/dual-costing/cost-allocation-ledger/route'
import { GET as listWaitingAllocations } from '@/app/api/dual-costing/waiting-allocations/route'
import { XLSX } from '@/lib/server/xlsx'
import { buildDualCostingManagement } from './dual-costing-management'

const product = {
  code: 'CU-001',
  id: 1n,
  metal_group: 'ทองแดง',
  name: 'ทองแดงเส้น',
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.getCurrentAuthContext.mockResolvedValue({})
  mocks.listActiveBranches.mockResolvedValue([{ code: 'B01', id: 10n, name: 'สมุทรสาคร' }])
  mocks.listProductReferences.mockResolvedValue([{
    active: true,
    code: product.code,
    id: product.id,
    metalGroup: product.metal_group,
    name: product.name,
    type: 'RM',
    unit: 'กก.',
  }])
  mocks.salesBillFindMany.mockResolvedValue([
    {
      branches: { name: 'สมุทรสาคร' },
      customers: { name: 'ลูกค้า ก' },
      date: new Date('2026-07-01T00:00:00.000Z'),
      doc_no: 'SB-NORMALIZED',
      id: 101n,
      items: [],
      po_sell_id: null,
      sales_bill_lines: [{
        line_no: 1,
        net_weight: null,
        product_code_snapshot: product.code,
        product_id: product.id,
        product_name_snapshot: product.name,
        products: product,
        qty: 10,
        sales_bill_po_sell_allocations: [],
        unit_price: 100,
      }],
      status: 'active',
      transaction_mode: 'STOCK',
    },
    {
      branches: { name: 'สมุทรสาคร' },
      customers: { name: 'ลูกค้า ข' },
      date: new Date('2026-07-02T00:00:00.000Z'),
      doc_no: 'SB-LEGACY-JSON',
      id: 102n,
      items: [{ id: 'legacy-line', productCode: product.code, productName: product.name, qty: 8, unitPrice: 101 }],
      po_sell_id: null,
      sales_bill_lines: [],
      status: 'active',
      transaction_mode: 'STOCK',
    },
  ])
  mocks.poSellFindMany.mockResolvedValue([
    {
      customers: { name: 'ลูกค้า ค' },
      date: new Date('2026-07-03T00:00:00.000Z'),
      doc_no: 'POS-JSON',
      id: 201n,
      items: [{ productCode: product.code, productName: product.name, remainingQty: 7, unitPrice: 102 }],
      product_id: null,
      qty: null,
      remaining_qty: null,
      unit_price: null,
    },
    {
      customers: { name: 'ลูกค้า ง' },
      date: new Date('2026-07-04T00:00:00.000Z'),
      doc_no: 'POS-HEADER',
      id: 202n,
      items: [],
      product_id: product.id,
      qty: 6,
      remaining_qty: 6,
      unit_price: 103,
    },
  ])
  mocks.productionOrderFindMany.mockResolvedValue([{
    date: new Date('2026-07-05T00:00:00.000Z'),
    doc_no: 'PROD-001',
    id: 301n,
    planned_input_qty: 5,
    production_inputs: [],
    production_outputs: [],
    products: product,
    qty_planned: 5,
  }])
  mocks.tradingAllocationFactFindMany.mockResolvedValue([])
  mocks.tradingDealFindMany.mockResolvedValue([{
    created_at: new Date('2026-07-06T00:00:00.000Z'),
    created_by: 'ผู้จัดสรร',
    customers: { name: 'ลูกค้า ก' },
    date: new Date('2026-07-06T00:00:00.000Z'),
    deal_no: 'DEAL-001',
    id: 401n,
    matched_purchase_amount: 90,
    matched_qty: 1,
    matched_sales_amount: 110,
    product_id: product.id,
    products: product,
    purchase_bill_no: 'PB-001',
    purchase_bills: { doc_no: 'PB-001' },
    sales_bill_id: 101n,
    sales_bill_no: 'SB-NORMALIZED',
    sales_bills: { doc_no: 'SB-NORMALIZED', po_sell_id: null },
    status: 'reversed',
    suppliers: { name: 'ผู้ขาย ก' },
  }])
})

describe('dual-costing product presentation', () => {
  it('shows and exports only product names while retaining product codes for allocation identity', async () => {
    const payload = await buildDualCostingManagement()
    const waitingProductLabels = Object.fromEntries([
      ...payload.waitingRows,
      ...payload.waitingPoSellRows,
      ...payload.waitingProductionRows,
    ].map((row) => [row.docNo, row.productName]))

    expect(waitingProductLabels).toEqual({
      'POS-HEADER': product.name,
      'POS-JSON': product.name,
      'PROD-001': product.name,
      'SB-LEGACY-JSON': product.name,
      'SB-NORMALIZED': product.name,
    })
    expect(payload.ledgerRows.map((row) => ({ productId: row.productId, productName: row.productName }))).toEqual([
      { productId: product.code, productName: product.name },
    ])

    const response = await exportLedger(new Request('http://localhost/api/dual-costing/cost-allocation-ledger?format=xlsx'))
    const workbook = await XLSX.read(Buffer.from(await response.arrayBuffer()))
    const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(workbook.Sheets['Allocation Ledger'])

    expect(rows.map((row) => row.Product)).toEqual([product.name])
  })

  it('keeps SKU search available after removing SKU from displayed labels', async () => {
    const waitingResponse = await listWaitingAllocations(new Request(`http://localhost/api/dual-costing/waiting-allocations?q=${product.code}`))
    const waitingPayload = await waitingResponse.json()
    const ledgerResponse = await exportLedger(new Request(`http://localhost/api/dual-costing/cost-allocation-ledger?q=${product.code}`))
    const ledgerPayload = await ledgerResponse.json()

    expect({
      bill: waitingPayload.bill.rows.map((row: { docNo: string }) => row.docNo),
      ledger: ledgerPayload.rows.map((row: { saleDocNo: string }) => row.saleDocNo),
      po: waitingPayload.po.rows.map((row: { docNo: string }) => row.docNo),
      production: waitingPayload.production.rows.map((row: { docNo: string }) => row.docNo),
    }).toEqual({
      bill: ['SB-NORMALIZED', 'SB-LEGACY-JSON'],
      ledger: ['SB-NORMALIZED'],
      po: ['POS-JSON', 'POS-HEADER'],
      production: ['PROD-001'],
    })
  })
})
