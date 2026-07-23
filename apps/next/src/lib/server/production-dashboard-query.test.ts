import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  loadProductionMetrics: vi.fn(),
  loadProductionTotalWipQty: vi.fn(),
}))

vi.mock('@/lib/server/production-reports', () => ({
  loadProductionMetrics: mocks.loadProductionMetrics,
  loadProductionTotalWipQty: mocks.loadProductionTotalWipQty,
}))

import { loadProductionDashboardRows, loadProductionDashboardWip } from './production-dashboard-query'

beforeEach(() => {
  vi.clearAllMocks()
  mocks.loadProductionMetrics.mockResolvedValue([])
  mocks.loadProductionTotalWipQty.mockResolvedValue(0)
})

describe('Production Dashboard query seam', () => {
  it('forwards the exact date and branch scope to the metric reader', async () => {
    const filters = { allowedBranchIds: [1n, 2n], dateFrom: '2026-07-01', dateTo: '2026-07-23' }

    await loadProductionDashboardRows(filters)

    expect(mocks.loadProductionMetrics).toHaveBeenCalledWith(filters)
  })

  it('forwards branch scope to the independent WIP snapshot reader', async () => {
    await loadProductionDashboardWip({ allowedBranchIds: [] })

    expect(mocks.loadProductionTotalWipQty).toHaveBeenCalledWith({ allowedBranchIds: [] })
  })
})
