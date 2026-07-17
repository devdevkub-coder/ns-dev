// @vitest-environment jsdom

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import * as React from 'react'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { FinancialDashboardPageClient } from './FinancialDashboardPageClient'

const mocks = vi.hoisted(() => ({ dailyFetchJson: vi.fn() }))

vi.mock('@/lib/daily', async (importOriginal) => ({
  ...await importOriginal<typeof import('@/lib/daily')>(),
  dailyFetchJson: mocks.dailyFetchJson,
}))

vi.mock('@/components/ui/date-picker-input', () => ({
  DatePickerInput: ({ ariaLabel, id, onChange, value }: { ariaLabel?: string; id?: string; onChange: (value: string) => void; value: string }) => (
    <input aria-label={ariaLabel} id={id} value={value} onChange={(event) => onChange(event.target.value)} />
  ),
}))

vi.mock('@/components/ui/Select', () => ({
  Select: ({ children, ...props }: React.SelectHTMLAttributes<HTMLSelectElement>) => <select {...props}>{children}</select>,
}))

vi.mock('next/link', () => ({
  default: ({ children, href, ...props }: React.AnchorHTMLAttributes<HTMLAnchorElement> & { href: string }) => <a href={href} {...props}>{children}</a>,
}))

const clientSource = readFileSync(resolve(process.cwd(), 'src/components/finance-accounting/FinancialDashboardPageClient.tsx'), 'utf8').replaceAll('\r\n', '\n')
const serverSource = readFileSync(resolve(process.cwd(), 'src/lib/server/finance-accounting-dashboard.ts'), 'utf8').replaceAll('\r\n', '\n')
const cashPositionSource = readFileSync(resolve(process.cwd(), 'src/lib/server/finance-accounting-cash-position.ts'), 'utf8').replaceAll('\r\n', '\n')

describe('Financial Dashboard design contract', () => {
  it('uses one cash-period surface and one-layer responsive KPI cards', () => {
    expect(clientSource.match(/data\?\.cashPeriods/g) ?? []).toHaveLength(1)
    expect(clientSource).toContain('KpiCardGrid')
    expect(clientSource.match(/lg:grid-cols-3 xl:grid-cols-3 2xl:grid-cols-6/g) ?? []).toHaveLength(2)
    expect(clientSource).not.toContain('Trading รอจับคู่')
    expect(clientSource).not.toContain('<MetricRow label="กำไรก่อนภาษี"')
    expect(clientSource).not.toContain('<MetricRow label="กระแสเงินสดจากการดำเนินงาน"')
  })

  it('gates financial values while loading and labels the page scope', () => {
    expect(clientSource).toContain('DashboardLoadingState')
    expect(clientSource).toContain('aria-busy={isLoading}')
    expect(clientSource).toContain('ข้อมูลเพื่อการบริหาร')
    expect(clientSource).toContain('aria-label="สาขา"')
  })

  it('does not expose unsupported today or trading values as numeric zero', () => {
    expect(serverSource).not.toContain('const cashNeedToday = 0')
    expect(serverSource).not.toContain('const cashInToday = 0')
    expect(serverSource).not.toContain('tradingPendingValue: 0')
    expect(serverSource).not.toContain('take: 30000')
    expect(serverSource).toContain('buildFinanceCashPosition({')
    expect(cashPositionSource).toContain('prisma.bank_statement.groupBy')
    expect(serverSource).toContain('const assets = split.cashAndBank + balanceSheet.ar + balanceSheet.inventory + balanceSheet.fixedAssetNet')
    expect(serverSource).not.toContain('const assets = balanceSheet.summary.totalAssets')
    expect(serverSource).not.toMatch(/\bfcdBalance\b/)
    expect(clientSource).not.toContain('label="เงินสด/ธนาคาร/FCD"')
    expect(clientSource).toContain('FCD (ยอดตั้งต้น · ไม่รวมยอดบาท)')
  })

  it('uses a compact mobile filter and keeps the as-of date required', () => {
    expect(clientSource).toContain('MobileFilterSheet')
    expect(clientSource.match(/readOnly/g) ?? []).toHaveLength(2)
    expect(clientSource).toContain('showClearButton={false}')
    expect(clientSource).toContain('financial-dashboard-branch-mobile')
  })

  it('keeps chart values and drilldown names accessible on narrow screens', () => {
    expect(clientSource).toContain('aria-label={`ดูรายละเอียด ${title}`}')
    expect(clientSource).not.toContain('<Link aria-label={`ดูรายละเอียด ${label}`}')
    expect(clientSource).toContain('<desc>')
    expect(clientSource).toContain('overflow-x-auto')
    expect(clientSource).toContain('min-w-[720px]')
    expect(clientSource).not.toContain('focus-visible:ring-slate-500/30')
  })
})

const actEnvironment = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
const previousActEnvironment = actEnvironment.IS_REACT_ACT_ENVIRONMENT

beforeAll(() => {
  actEnvironment.IS_REACT_ACT_ENVIRONMENT = true
})

afterAll(() => {
  actEnvironment.IS_REACT_ACT_ENVIRONMENT = previousActEnvironment
})

describe('Financial Dashboard filter loading', () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
    mocks.dailyFetchJson.mockReset()
  })

  afterEach(() => {
    act(() => root.unmount())
    container.remove()
  })

  it('hides the previous financial figures when the latest filter request fails', async () => {
    const payload = {
      assetComp: [],
      branches: [],
      cashPeriods: [],
      fcdBalances: [],
      filters: { asOf: '2026-07-17', branchId: 'ALL', monthStart: '2026-07-01' },
      insights: [],
      monthlyPL: [],
      sourceState: { basis: 'management', limitations: [], writeActionsEnabled: false },
      summary: { cashAndBank: 12_345.67 },
    }
    mocks.dailyFetchJson.mockResolvedValueOnce(payload).mockRejectedValueOnce(new Error('โหลดขอบเขตใหม่ไม่ได้'))

    await act(async () => {
      root.render(<FinancialDashboardPageClient />)
      await new Promise((resolve) => setTimeout(resolve, 0))
    })
    expect(container.textContent).toContain('12,345.67')

    const input = container.querySelector<HTMLInputElement>('#financial-dashboard-as-of')
    if (!input) throw new Error('Expected as-of date input')
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set?.call(input, '2026-07-16')
      input.dispatchEvent(new Event('input', { bubbles: true }))
      await new Promise((resolve) => setTimeout(resolve, 0))
    })

    expect(container.textContent).toContain('โหลดขอบเขตใหม่ไม่ได้')
    expect(container.textContent).not.toContain('12,345.67')
  })

  it('uses the server projection and labels a zero balance as balanced', async () => {
    mocks.dailyFetchJson.mockResolvedValueOnce({
      assetComp: [],
      branches: [],
      cashPeriods: [{ cashIn: 0, label: '7 วัน', need: 0, projected: 0 }],
      fcdBalances: [],
      filters: { asOf: '2026-07-17', branchId: 'ALL', monthStart: '2026-07-01' },
      insights: [],
      monthlyPL: [],
      sourceState: { basis: 'management', limitations: [], writeActionsEnabled: false },
      summary: { cashAndBank: 1_000 },
    })

    await act(async () => {
      root.render(<FinancialDashboardPageClient />)
      await new Promise((resolve) => setTimeout(resolve, 0))
    })
    const projection = Array.from(container.querySelectorAll('article')).find((item) => item.textContent?.includes('7 วันข้างหน้า'))

    expect(projection?.textContent).toContain('0.00')
    expect(projection?.textContent).toContain('สมดุล')
    expect(projection?.textContent).not.toContain('คงเหลือบวก')
  })

  it('keeps the selected period and branch on supported drilldowns', async () => {
    mocks.dailyFetchJson.mockResolvedValueOnce({
      assetComp: [],
      branches: [{ code: 'BKK', id: 'BKK', name: 'สำนักงานใหญ่' }],
      cashPeriods: [],
      fcdBalances: [],
      filters: { asOf: '2026-07-17', branchId: 'BKK', monthStart: '2026-07-01' },
      insights: [{ detail: 'ทดสอบขอบเขต', title: 'สภาพคล่อง 7 วัน', type: 'warn', value: 1 }],
      monthlyPL: [],
      sourceState: { basis: 'management', limitations: [], writeActionsEnabled: false },
      summary: {},
    })

    await act(async () => {
      root.render(<FinancialDashboardPageClient />)
      await new Promise((resolve) => setTimeout(resolve, 0))
    })

    expect(container.querySelectorAll('a[href="/finance-accounting/pl-statement?from=2026-07-01&to=2026-07-17&branchId=BKK"]')).toHaveLength(3)
    expect(container.querySelectorAll('a[href="/finance-accounting/cash-flow-analysis?from=2026-07-01&to=2026-07-17&branchId=BKK"]')).toHaveLength(3)
    expect(container.querySelector('a[href="/finance/ar?from=&to=2026-07-17&branchId=BKK"]')).not.toBeNull()
    expect(container.querySelector('a[href="/finance/ap?from=&to=2026-07-17&branchId=BKK"]')).not.toBeNull()
    expect(container.querySelector('a[href="/finance-accounting/asset-overview?asOf=2026-07-17&branchId=BKK"]')).not.toBeNull()
    expect(container.querySelector('a[href^="/finance/cash-position"]')).toBeNull()
    expect(container.querySelector('a[href^="/finance-accounting/balance-sheet"]')).toBeNull()
    expect(container.querySelector('a[href^="/finance-accounting/stock-finance"]')).toBeNull()
  })

  it('shows OD usage even when no limit has been configured', async () => {
    mocks.dailyFetchJson.mockResolvedValueOnce({
      assetComp: [], branches: [], cashPeriods: [], fcdBalances: [], insights: [], monthlyPL: [],
      filters: { asOf: '2026-07-17', branchId: 'ALL', monthStart: '2026-07-01' },
      sourceState: { basis: 'management', limitations: [], writeActionsEnabled: false },
      summary: { odAvailable: 0, odLimit: 0, odUsed: 250 },
    })

    await act(async () => {
      root.render(<FinancialDashboardPageClient />)
      await new Promise((resolve) => setTimeout(resolve, 0))
    })

    expect(container.textContent).toContain('ใช้ไป 250.00 · ยังไม่ตั้งวงเงิน')
  })

  it('shows FCD balances by currency without adding them together', async () => {
    mocks.dailyFetchJson.mockResolvedValueOnce({
      assetComp: [], branches: [], cashPeriods: [], insights: [], monthlyPL: [],
      fcdBalances: [{ currency: 'EUR', value: 200 }, { currency: 'USD', value: 125 }],
      filters: { asOf: '2026-07-17', branchId: 'ALL', monthStart: '2026-07-01' },
      sourceState: { basis: 'management', limitations: [], writeActionsEnabled: false },
      summary: {},
    })

    await act(async () => {
      root.render(<FinancialDashboardPageClient />)
      await new Promise((resolve) => setTimeout(resolve, 0))
    })

    expect(container.textContent).toContain('EUR 200.00 · USD 125.00')
  })

  it('does not turn a missing financial metric into numeric zero', async () => {
    mocks.dailyFetchJson.mockResolvedValueOnce({
      assetComp: [], branches: [], cashPeriods: [], fcdBalances: [], insights: [], monthlyPL: [],
      filters: { asOf: '2026-07-17', branchId: 'ALL', monthStart: '2026-07-01' },
      sourceState: { basis: 'management', limitations: [], writeActionsEnabled: false },
      summary: {},
    })

    await act(async () => {
      root.render(<FinancialDashboardPageClient />)
      await new Promise((resolve) => setTimeout(resolve, 0))
    })
    const cashKpi = Array.from(container.querySelectorAll<HTMLElement>('div')).find((node) => node.textContent === 'เงินสดและธนาคาร')?.parentElement

    expect(cashKpi?.textContent).toContain('ไม่มีข้อมูล')
    expect(cashKpi?.textContent).not.toContain('0.00')
    expect(container.textContent).toContain('ODไม่มีข้อมูล')
    expect(container.querySelector<HTMLAnchorElement>('a[href^="/finance-accounting/pl-statement?"]')?.textContent).toContain('ไม่มีข้อมูล ของรายได้')
  })

  it('does not label a missing cash projection as positive', async () => {
    mocks.dailyFetchJson.mockResolvedValueOnce({
      assetComp: [], branches: [], fcdBalances: [], insights: [], monthlyPL: [],
      cashPeriods: [{ label: '7 วัน' }],
      filters: { asOf: '2026-07-17', branchId: 'ALL', monthStart: '2026-07-01' },
      sourceState: { basis: 'management', limitations: [], writeActionsEnabled: false },
      summary: { odAvailable: 0, odLimit: 0, odUsed: 0 },
    })

    await act(async () => {
      root.render(<FinancialDashboardPageClient />)
      await new Promise((resolve) => setTimeout(resolve, 0))
    })
    const projection = Array.from(container.querySelectorAll('article')).find((item) => item.textContent?.includes('7 วันข้างหน้า'))

    expect(projection?.textContent).toContain('ไม่มีข้อมูล')
    expect(projection?.textContent).not.toContain('คงเหลือบวก')
    expect(projection?.textContent).not.toContain('+ไม่มีข้อมูล')
    expect(projection?.textContent).not.toContain('-ไม่มีข้อมูล')
  })

  it('uses the full plot height when every P&L value is non-negative', async () => {
    mocks.dailyFetchJson.mockResolvedValueOnce({
      assetComp: [], branches: [], cashPeriods: [], fcdBalances: [], insights: [],
      monthlyPL: ['ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.'].map((label) => ({ cogs: 50, exp: 0, label, np: 25, rev: 100 })),
      filters: { asOf: '2026-07-17', branchId: 'ALL', monthStart: '2026-07-01' },
      sourceState: { basis: 'management', limitations: [], writeActionsEnabled: false },
      summary: { odAvailable: 0, odLimit: 0, odUsed: 0 },
    })

    await act(async () => {
      root.render(<FinancialDashboardPageClient />)
      await new Promise((resolve) => setTimeout(resolve, 0))
    })
    const chart = container.querySelector<SVGElement>('svg[aria-label^="กราฟ P&L"]')
    const revenueBar = chart?.querySelector<SVGRectElement>('rect[fill="#34d399"]')
    const firstMonth = Array.from(chart?.querySelectorAll('text') ?? []).find((text) => text.textContent === 'ก.พ.')

    expect(chart?.getAttribute('viewBox')).toBeNull()
    expect(chart?.getAttribute('class')).toContain('min-w-[720px]')
    expect(Number(revenueBar?.getAttribute('height'))).toBeGreaterThan(140)
    expect(Number(revenueBar?.getAttribute('y'))).toBeLessThan(30)
    expect(firstMonth?.getAttribute('x')).toMatch(/%$/)
    expect(chart?.parentElement?.getAttribute('aria-label')).toBe('เลื่อนดูกราฟ P&L ตามเดือน')
    expect(chart?.parentElement?.getAttribute('tabindex')).toBe('0')
  })

  it('ignores non-finite P&L values and scales sub-baht signed values', async () => {
    mocks.dailyFetchJson.mockResolvedValueOnce({
      assetComp: [], branches: [], cashPeriods: [], fcdBalances: [], insights: [],
      monthlyPL: [
        { cogs: Number.NaN, exp: 0, label: 'ก.พ.', np: -0.25, rev: 0.5 },
        ...['มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.'].map((label) => ({ cogs: 0, exp: 0, label, np: 0, rev: 0 })),
      ],
      filters: { asOf: '2026-07-17', branchId: 'ALL', monthStart: '2026-07-01' },
      sourceState: { basis: 'management', limitations: [], writeActionsEnabled: false },
      summary: { odAvailable: 0, odLimit: 0, odUsed: 0 },
    })

    await act(async () => {
      root.render(<FinancialDashboardPageClient />)
      await new Promise((resolve) => setTimeout(resolve, 0))
    })
    const chart = container.querySelector<SVGElement>('svg[aria-label^="กราฟ P&L"]')
    const revenueBar = chart?.querySelector<SVGRectElement>('rect[fill="#34d399"]')
    const geometry = Array.from(chart?.querySelectorAll('rect') ?? []).flatMap((rect) => [rect.getAttribute('height'), rect.getAttribute('y')])
    const firstMonth = chart?.querySelector<SVGGElement>('[data-pl-chart-group="ก.พ."]')

    expect(Number(revenueBar?.getAttribute('height'))).toBeGreaterThan(100)
    expect(geometry.every((value) => value != null && Number.isFinite(Number(value)))).toBe(true)
    expect(firstMonth?.getAttribute('aria-label')).not.toContain('ไม่มีข้อมูล บาท')
  })

  it('does not expose a tooltip target for a month with no visible bars', async () => {
    mocks.dailyFetchJson.mockResolvedValueOnce({
      assetComp: [], branches: [], cashPeriods: [], fcdBalances: [], insights: [],
      monthlyPL: [
        { cogs: 0, exp: 0, label: 'ก.พ.', np: 0, rev: 0 },
        ...['มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.'].map((label) => ({ cogs: 0, exp: 0, label, np: 0, rev: 0 })),
        { cogs: 50, exp: 0, label: 'ก.ค.', np: 25, rev: 100 },
      ],
      filters: { asOf: '2026-07-17', branchId: 'ALL', monthStart: '2026-07-01' },
      sourceState: { basis: 'management', limitations: [], writeActionsEnabled: false },
      summary: { odAvailable: 0, odLimit: 0, odUsed: 0 },
    })

    await act(async () => {
      root.render(<FinancialDashboardPageClient />)
      await new Promise((resolve) => setTimeout(resolve, 0))
    })
    const february = container.querySelector<SVGGElement>('[data-pl-chart-group="ก.พ."]')
    const july = container.querySelector<SVGGElement>('[data-pl-chart-group="ก.ค."]')

    expect(february?.querySelector('[data-pl-chart-hit]')).toBeNull()
    expect(february?.getAttribute('tabindex')).toBeNull()
    expect(july?.querySelector('[data-pl-chart-hit]')).not.toBeNull()
    expect(july?.getAttribute('tabindex')).toBe('0')

    await act(async () => {
      const hover = new MouseEvent('pointerover', { bubbles: true })
      Object.defineProperty(hover, 'pointerType', { value: 'mouse' })
      february?.dispatchEvent(hover)
    })
    expect(container.querySelector('[role="tooltip"]')).toBeNull()

    await act(async () => {
      const hover = new MouseEvent('pointerover', { bubbles: true })
      Object.defineProperty(hover, 'pointerType', { value: 'mouse' })
      july?.dispatchEvent(hover)
    })
    expect(container.querySelector('[role="tooltip"]')?.textContent).toContain('ก.ค.')

    await act(async () => {
      const move = new MouseEvent('pointermove', { bubbles: true })
      Object.defineProperty(move, 'pointerType', { value: 'mouse' })
      february?.dispatchEvent(move)
    })
    expect(container.querySelector('[role="tooltip"]')).toBeNull()
  })

  it('shows the exact monthly P&L values immediately on hover', async () => {
    mocks.dailyFetchJson.mockResolvedValueOnce({
      assetComp: [], branches: [], cashPeriods: [], fcdBalances: [], insights: [],
      monthlyPL: [
        ...['ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.'].map((label) => ({ cogs: 0, exp: 0, label, np: 0, rev: 0 })),
        { cogs: 161365.92, exp: 0, label: 'มิ.ย.', np: 66289.75, rev: 277155.67 },
        { cogs: 291978.93, exp: 0, label: 'ก.ค.', np: 60418.07, rev: 352397 },
      ],
      filters: { asOf: '2026-07-17', branchId: 'ALL', monthStart: '2026-07-01' },
      sourceState: { basis: 'management', limitations: [], writeActionsEnabled: false },
      summary: { odAvailable: 0, odLimit: 0, odUsed: 0 },
    })

    await act(async () => {
      root.render(<FinancialDashboardPageClient />)
      await new Promise((resolve) => setTimeout(resolve, 0))
    })
    const june = container.querySelector<SVGGElement>('[data-pl-chart-group="มิ.ย."]')

    expect(container.querySelector('[role="tooltip"]')).toBeNull()
    expect(june?.getAttribute('tabindex')).toBe('0')

    await act(async () => {
      const hover = new MouseEvent('pointerover', { bubbles: true, clientX: 480, clientY: 180 })
      Object.defineProperty(hover, 'pointerType', { value: 'mouse' })
      june?.dispatchEvent(hover)
    })
    const tooltip = container.querySelector('[role="tooltip"]')

    expect(tooltip?.textContent).toContain('มิ.ย.')
    expect(tooltip?.textContent).toContain('รายได้277,155.67 บาท')
    expect(tooltip?.textContent).toContain('ต้นทุนขาย (COGS)161,365.92 บาท')
    expect(tooltip?.textContent).toContain('กำไรก่อนภาษี66,289.75 บาท')
    expect(june?.getAttribute('aria-describedby')).toBe('financial-dashboard-pl-tooltip')
    expect(container.querySelectorAll('svg title')).toHaveLength(0)
    expect(june?.querySelector('[data-pl-chart-hit]')?.getAttribute('fill-opacity')).toBe('0.001')

    await act(async () => {
      document.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'Escape' }))
    })
    expect(container.querySelector('[role="tooltip"]')).toBeNull()

    await act(async () => {
      june?.dispatchEvent(new FocusEvent('focusin', { bubbles: true }))
    })
    expect(container.querySelector('[role="tooltip"]')?.textContent).toContain('มิ.ย.')

    await act(async () => {
      document.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'Escape' }))
      june?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })
    expect(container.querySelector('[role="tooltip"]')?.textContent).toContain('มิ.ย.')
  })
})
