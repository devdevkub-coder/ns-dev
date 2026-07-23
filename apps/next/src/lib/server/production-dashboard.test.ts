import { describe, expect, it } from 'vitest'
import { buildProductionDashboardPayload } from './production-dashboard'
import { productionWhere, type ProductionOrderMetric } from './production-reports'

function row(overrides: Partial<ProductionOrderMetric> = {}): ProductionOrderMetric {
  return {
    branchName: 'หลัก',
    costPerKg: 10,
    costBreakdown: {},
    costAllocationMethod: 'standard',
    date: '2026-07-23',
    docNo: 'PO2607-0001',
    id: 'PO2607-0001',
    inputCost: 100,
    inputQty: 10,
    ledgerBalanced: true,
    ledgerMismatchQty: 0,
    lossPct: 10,
    lossQty: 1,
    lossValue: 10,
    machineId: '10',
    machineName: 'เครื่อง 1',
    normalLossPercent: 5,
    outputProducts: [{ cost: 90, productCode: 'P-01', productName: 'ทองแดง', qty: 9, unitCost: 10 }],
    outputQty: 9,
    outputValue: 90,
    processCost: 0,
    productionCostPerKg: 11.11,
    productCode: 'P-01',
    productName: 'ทองแดง',
    productionLineName: 'ไลน์ 1',
    productionType: 'ทั่วไป',
    rmCostPerKg: 10,
    status: 'In Production',
    totalCost: 100,
    variance: -10,
    warehouseName: 'คลังหลัก',
    wipQty: 0,
    wipValue: 0,
    yieldPct: 90,
    inputProducts: 'วัตถุดิบ',
    ...overrides,
  }
}

describe('Production Dashboard payload', () => {
  it('uses only authorized branch ids and never includes unscoped branch rows', () => {
    expect(productionWhere({ allowedBranchIds: [1n, 2n] })).toMatchObject({ branch_id: { in: [1n, 2n] } })
  })

  it('groups machine output by machine id and counts output receipt rows', () => {
    const payload = buildProductionDashboardPayload([
      row(),
      row({ docNo: 'PO2607-0002', id: 'PO2607-0002', outputProducts: [{ cost: 50, productCode: 'P-01', productName: 'ทองแดง', qty: 5, unitCost: 10 }] }),
      row({ machineId: '11', machineName: 'เครื่อง 1', docNo: 'PO2607-0003', id: 'PO2607-0003' }),
    ], 12)

    expect(payload.machineUtil).toEqual([
      { batches: 2, cost: 140, id: '10', name: 'เครื่อง 1', qty: 14 },
      { batches: 1, cost: 90, id: '11', name: 'เครื่อง 1', qty: 9 },
    ])
    expect(payload.summary.totalWipQty).toBe(12)
  })

  it('groups Top 10 from actual output products and preserves zero variance', () => {
    const payload = buildProductionDashboardPayload([
      row({ variance: 0, outputProducts: [{ cost: 100, productCode: 'P-02', productName: 'เงิน', qty: 10, unitCost: 10 }] }),
    ], 0)

    expect(payload.rows[0]?.variance).toBe(0)
    expect(payload.topProducts[0]).toMatchObject({ batches: 1, code: 'P-02', qty: 10, cost: 100, avgCost: 10 })
  })

  it('returns stable empty collections for an empty dashboard range', () => {
    const payload = buildProductionDashboardPayload([], 0)

    expect(payload).toMatchObject({
      daily: [],
      machineUtil: [],
      monthly: [],
      rows: [],
      byStatus: [],
      topProducts: [],
      summary: { count: 0, totalWipQty: 0 },
    })
  })
})
