// @vitest-environment jsdom

import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { AccountsPayablePageClient } from '@/components/purchase-flow/AccountsPayablePageClient'
import { AccountsReceivablePageClient } from './AccountsReceivablePageClient'
import { BankStatementPageClient } from './BankStatementPageClient'

const mocks = vi.hoisted(() => ({ dailyFetchJson: vi.fn() }))

vi.mock('@/lib/daily', async (importOriginal) => ({
  ...await importOriginal<typeof import('@/lib/daily')>(),
  dailyFetchJson: mocks.dailyFetchJson,
}))

const actEnvironment = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
const previousActEnvironment = actEnvironment.IS_REACT_ACT_ENVIRONMENT

beforeAll(() => {
  actEnvironment.IS_REACT_ACT_ENVIRONMENT = true
})

afterAll(() => {
  actEnvironment.IS_REACT_ACT_ENVIRONMENT = previousActEnvironment
})

describe('finance drilldown client scope', () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
    mocks.dailyFetchJson.mockReset()
    mocks.dailyFetchJson.mockImplementation(() => new Promise(() => undefined))
  })

  afterEach(() => {
    act(() => root.unmount())
    container.remove()
  })

  it('loads AR with the drilldown scope on the first request', async () => {
    await act(async () => {
      root.render(<AccountsReceivablePageClient initialFilters={{ branchId: 'BKK', from: '2026-06-01', to: '2026-06-30' }} />)
      await new Promise((resolve) => setTimeout(resolve, 0))
    })

    expect(mocks.dailyFetchJson).toHaveBeenCalledWith('/api/finance/ar?page=1&pageSize=50&sortDirection=desc&sortKey=dueDate&branchId=BKK&from=2026-06-01&to=2026-06-30')
  })

  it('loads AP with the drilldown scope on the first request', async () => {
    await act(async () => {
      root.render(<AccountsPayablePageClient initialFilters={{ branchId: 'BKK', from: '2026-06-01', to: '2026-06-30' }} />)
      await new Promise((resolve) => setTimeout(resolve, 0))
    })

    expect(mocks.dailyFetchJson).toHaveBeenCalledWith('/api/finance/ap?page=1&pageSize=50&sortDirection=desc&sortKey=dueDate&branchId=BKK&from=2026-06-01&to=2026-06-30')
  })

  it('loads AR as-of outstanding without forcing a month-start lower bound', async () => {
    await act(async () => {
      root.render(<AccountsReceivablePageClient initialFilters={{ branchId: 'BKK', from: '', to: '2026-07-17' }} />)
      await new Promise((resolve) => setTimeout(resolve, 0))
    })

    expect(mocks.dailyFetchJson).toHaveBeenCalledWith('/api/finance/ar?page=1&pageSize=50&sortDirection=desc&sortKey=dueDate&branchId=BKK&to=2026-07-17')
  })

  it('loads AP as-of outstanding without forcing a month-start lower bound', async () => {
    await act(async () => {
      root.render(<AccountsPayablePageClient initialFilters={{ branchId: 'BKK', from: '', to: '2026-07-17' }} />)
      await new Promise((resolve) => setTimeout(resolve, 0))
    })

    expect(mocks.dailyFetchJson).toHaveBeenCalledWith('/api/finance/ap?page=1&pageSize=50&sortDirection=desc&sortKey=dueDate&branchId=BKK&to=2026-07-17')
  })

  it('loads Bank Statement with only the supported date scope on the first request', async () => {
    await act(async () => {
      root.render(<BankStatementPageClient initialFilters={{ from: '2026-06-01', to: '2026-06-30' }} />)
      await new Promise((resolve) => setTimeout(resolve, 0))
    })

    expect(mocks.dailyFetchJson).toHaveBeenCalledWith('/api/finance/bank?page=1&pageSize=50&sortDirection=asc&from=2026-06-01&to=2026-06-30')
    expect(String(mocks.dailyFetchJson.mock.calls[0]?.[0])).not.toContain('branchId=')
  })
})
