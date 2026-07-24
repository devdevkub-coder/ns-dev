import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'

const appliedFilters = {
  branchCode: '',
  dateFrom: '',
  dateTo: '',
  direction: 'desc' as const,
  sort: 'date',
  statuses: [],
}

describe('production order mobile filter draft', () => {
  it('keeps applied filters unchanged until the draft is applied', async () => {
    const filterStateModule = await import('./production-orders-mobile-filter-state')

    expect(filterStateModule.createMobileFilterDraft).toBeTypeOf('function')
    expect(filterStateModule.updateMobileFilterDraft).toBeTypeOf('function')
    expect(filterStateModule.applyMobileFilterDraft).toBeTypeOf('function')

    if (
      typeof filterStateModule.createMobileFilterDraft !== 'function'
      || typeof filterStateModule.updateMobileFilterDraft !== 'function'
      || typeof filterStateModule.applyMobileFilterDraft !== 'function'
    ) return

    const draft = filterStateModule.createMobileFilterDraft(appliedFilters)
    const changedDraft = filterStateModule.updateMobileFilterDraft(draft, {
      branchCode: 'BKK',
      statuses: ['Completed'],
    })

    expect(appliedFilters).toEqual({
      branchCode: '',
      dateFrom: '',
      dateTo: '',
      direction: 'desc',
      sort: 'date',
      statuses: [],
    })
    expect(changedDraft).toMatchObject({ branchCode: 'BKK', statuses: ['Completed'] })
    expect(filterStateModule.applyMobileFilterDraft(changedDraft)).toEqual(changedDraft)
    expect(filterStateModule.applyMobileFilterDraft(changedDraft)).not.toBe(changedDraft)
  })

  it('toggles independent statuses and resets to every status', async () => {
    const filterStateModule = await import('./production-orders-mobile-filter-state')
    const toggleStatus = Reflect.get(filterStateModule, 'toggleProductionOrderStatus') as unknown

    expect(toggleStatus).toBeTypeOf('function')
    if (typeof toggleStatus !== 'function') return

    expect(toggleStatus([], 'Open')).toEqual(['Open'])
    expect(toggleStatus(['Open'], 'Completed')).toEqual(['Open', 'Completed'])
    expect(toggleStatus(['Open', 'Completed'], 'Open')).toEqual(['Completed'])
    expect(toggleStatus(['Completed'], '')).toEqual([])
  })
})

describe('production order mobile card', () => {
  it('exposes the whole card as its single detail action', async () => {
    const pageModule = await import('./ProductionOrdersPageClient')

    expect(pageModule.OrderCard).toBeTypeOf('function')
    if (typeof pageModule.OrderCard !== 'function') return

    const html = renderToStaticMarkup(createElement(pageModule.OrderCard, {
      onOpen: () => undefined,
      row: {
        branchName: 'สมุทรสาคร',
        closedAt: null,
        createdAt: '2026-07-11T00:00:00.000Z',
        date: '2026-07-11',
        startDate: '2026-07-12',
        docNo: 'PO2607-0001',
        id: '1',
        inputCost: 100,
        inputCount: 1,
        inputQty: 10,
        inputs: [],
        history: [],
        notes: '',
        outputCategories: [],
        outputCount: 1,
        outputQty: 9,
        outputValue: 90,
        outputs: [],
        productCode: 'SKU001',
        productId: '1',
        productName: 'ทองแดง',
        qtyPlanned: 10,
        status: 'Open',
        variance: -10,
        warehouseName: 'FG สมุทรสาคร',
        wipQty: 1,
        wipValue: 10,
      },
    }))

    expect(html.startsWith('<article')).toBe(true)
    expect(html).toContain('role="button"')
    expect(html).toContain('tabindex="0"')
    expect(html).toContain('aria-label="เปิดใบสั่งผลิต PO2607-0001"')
    expect(html).not.toContain('<button')
  }, 30_000)
})
