// @vitest-environment jsdom

import * as React from 'react'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { CashFlowAnalysisPageClient, CashFlowForecastCalendarPageClient } from './CashFlowPlanningPageClients'
import { CashFlowStatementPageClient, PlStatementPageClient } from './FinancialStatementsPageClients'

const mocks = vi.hoisted(() => ({ dailyFetchJson: vi.fn() }))

vi.mock('@/lib/daily', async (importOriginal) => ({
  ...await importOriginal<typeof import('@/lib/daily')>(),
  dailyFetchJson: mocks.dailyFetchJson,
}))

vi.mock('@/components/ui/date-picker-input', () => ({
  DatePickerInput: ({ ariaLabel, className, id, onChange, value }: { ariaLabel?: string; className?: string; id?: string; onChange: (value: string) => void; value: string }) => (
    <input aria-label={ariaLabel} className={className} id={id} value={value} onChange={(event) => onChange(event.target.value)} />
  ),
}))

vi.mock('@/components/ui/Select', () => ({
  Select: ({ children, ...props }: React.SelectHTMLAttributes<HTMLSelectElement>) => <select {...props}>{children}</select>,
}))

const sourceState = {
  basis: 'ยอดจากเอกสารดำเนินงานตามช่วงวันที่',
  limitations: ['ยังไม่ใช่งบปิดบัญชี'],
  writeActionsEnabled: false as const,
}

function plPayload(revenue = 12_345.67) {
  return {
    branches: [{ code: 'BKK', id: 'BKK', name: 'สำนักงานใหญ่' }],
    filters: { branchId: '', from: '2026-07-01', to: '2026-07-17' },
    sections: [{
      amount: -0,
      details: [{ amount: 100, date: '2026-07-17', description: 'ขายสินค้า', href: '/sales/bills?docNo=SB001', refNo: 'SB001', sourceType: 'sales_bill' }],
      label: 'รายได้',
      section: 'รายได้',
    }],
    sourceState,
    split: { stock: { cogs: 0, revenue }, trading: { cogs: 0, revenue: 0 } },
    summary: { grossProfit: undefined, netProfitBeforeTax: -0, operatingProfit: Number.NaN, revenue },
  }
}

function cashFlowPayload() {
  return {
    branches: [{ code: 'BKK', id: 'BKK', name: 'สำนักงานใหญ่' }],
    charts: {
      profitVsCash: [],
      projection: [{ basis: 'วันครบกำหนดจากข้อมูลต้นทาง', expectedIn: 20, expectedOut: 10, label: '7 วัน', projected: 10 }],
      trap: { ar: 100, cash: 200, stock: 150 },
    },
    detailRows: [{ href: '/finance/ar', label: 'Profit Before Tax ในงบ (Accrual)', suffix: '', value: 321 }],
    fcdBalances: [{ currency: 'USD', value: 125 }, { currency: 'EUR', value: 200 }],
    filters: { branchId: '', from: '2026-07-01', to: '2026-07-17' },
    insights: [],
    projectionBasis: 'วันครบกำหนดจากข้อมูลต้นทาง',
    sourceState,
    summary: {
      apNow: 80,
      arNow: 100,
      burnRate: 5,
      cashIn7: 20,
      cashIn30: 20,
      cashNow: -0,
      cashOut7: 10,
      cashOut30: 10,
      daysToODMaxed: 100,
      netProfitBeforeTax: 321,
      odLimit: 1_000,
      odUsed: 100,
      operatingCashFlow: 123,
      projected7: 10,
      projected30: 10,
      stockNow: 150,
    },
  }
}

function forecastPayload() {
  return {
    branches: [],
    dailyProjection: [{
      closing: Number.NaN,
      date: '2026-07-17',
      dayIn: 0,
      dayOfMonth: 17,
      dayOfWeek: 5,
      dayOut: 0,
      events: [],
      isToday: true,
      opening: Number.POSITIVE_INFINITY,
    }],
    events: [],
    filters: { branchId: '', horizon: 30, startDate: '2026-07-17' },
    insights: { topAP: [], topAR: [] },
    projectionBasis: 'AR due date; AP conservative bill date',
    sourceState,
    summary: {
      endCash: Number.NaN,
      lowestBal: Number.NaN,
      negCount: 0,
      negDay: null as { date: string } | null,
      startCash: Number.POSITIVE_INFINITY,
      totalIn: Number.NaN,
      totalOut: Number.POSITIVE_INFINITY,
    },
  }
}

const actEnvironment = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
const previousActEnvironment = actEnvironment.IS_REACT_ACT_ENVIRONMENT

beforeAll(() => {
  actEnvironment.IS_REACT_ACT_ENVIRONMENT = true
})

afterAll(() => {
  actEnvironment.IS_REACT_ACT_ENVIRONMENT = previousActEnvironment
})

describe('Finance report page UI contracts', () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
    mocks.dailyFetchJson.mockReset()
    window.localStorage.clear()
  })

  afterEach(() => {
    act(() => root.unmount())
    container.remove()
  })

  it('renders P&L missing values safely and keeps the statement semantic order fixed', async () => {
    mocks.dailyFetchJson.mockResolvedValueOnce(plPayload())

    await act(async () => {
      root.render(<PlStatementPageClient />)
      await new Promise((resolve) => setTimeout(resolve, 0))
    })

    expect(container.textContent).toContain('องค์ประกอบกำไรก่อนภาษี')
    expect(container.textContent).toContain('ข้อมูลเพื่อการบริหาร')
    expect(container.textContent).toContain('หน่วย: บาท')
    expect(container.textContent).toContain('ไม่มีข้อมูล')
    expect(container.textContent).not.toContain('-0.00')
    expect(container.textContent).not.toContain('เฉพาะสต็อก')
    expect(container.querySelector('a[href*="format=xlsx"]')?.getAttribute('href')).not.toContain('transactionMode')
    expect(container.querySelectorAll('table[aria-sort], th[aria-sort]')).toHaveLength(0)

    const drillButton = container.querySelector<HTMLButtonElement>('button[aria-label^="ดูรายละเอียด รายได้"]')
    await act(async () => drillButton?.click())

    expect(container.querySelector('[role="dialog"]')?.getAttribute('aria-modal')).toBe('true')
    expect(container.querySelector('a[href="/sales/bills?docNo=SB001"]')?.textContent).toBe('SB001')
  })

  it('loads P&L with the drilldown scope on the first request', async () => {
    mocks.dailyFetchJson.mockResolvedValueOnce(plPayload())

    await act(async () => {
      root.render(<PlStatementPageClient initialFilters={{ branchId: 'BKK', from: '2026-06-01', to: '2026-06-30' }} />)
      await new Promise((resolve) => setTimeout(resolve, 0))
    })

    expect(mocks.dailyFetchJson).toHaveBeenCalledWith('/api/finance-accounting/pl-statement?from=2026-06-01&to=2026-06-30&branchId=BKK')
  })

  it('loads Cash Flow Statement with the drilldown scope on the first request', async () => {
    mocks.dailyFetchJson.mockImplementation(() => new Promise(() => undefined))

    await act(async () => {
      root.render(<CashFlowStatementPageClient initialFilters={{ branchId: 'BKK', from: '2026-06-01', to: '2026-06-30' }} />)
      await new Promise((resolve) => setTimeout(resolve, 0))
    })

    expect(mocks.dailyFetchJson).toHaveBeenCalledWith('/api/finance-accounting/cash-flow-statement?from=2026-06-01&to=2026-06-30&branchId=BKK')
  })

  it('keeps the Cash Flow Statement year shortcut on Bangkok January 1', async () => {
    const previousTimeZone = process.env.TZ
    process.env.TZ = 'Asia/Bangkok'
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-01-01T00:30:00+07:00'))
    mocks.dailyFetchJson.mockImplementation(() => new Promise(() => undefined))

    try {
      await act(async () => {
        root.render(<CashFlowStatementPageClient />)
        await Promise.resolve()
      })

      const yearButton = Array.from(container.querySelectorAll<HTMLButtonElement>('button')).find((button) => button.textContent?.trim() === 'ปีนี้')
      await act(async () => yearButton?.click())

      expect(container.querySelector<HTMLInputElement>('input[type="date"]')?.value).toBe('2026-01-01')
    } finally {
      vi.useRealTimers()
      if (previousTimeZone === undefined) delete process.env.TZ
      else process.env.TZ = previousTimeZone
    }
  })

  it('hides stale P&L figures as soon as a newer filter request starts', async () => {
    mocks.dailyFetchJson.mockResolvedValueOnce(plPayload())
    mocks.dailyFetchJson.mockImplementationOnce(() => new Promise(() => undefined))

    await act(async () => {
      root.render(<PlStatementPageClient />)
      await new Promise((resolve) => setTimeout(resolve, 0))
    })
    expect(container.textContent).toContain('12,345.67')

    const fromInput = container.querySelector<HTMLInputElement>('input[aria-label="จาก"]')
    await act(async () => {
      if (!fromInput) throw new Error('Expected desktop from-date input')
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set?.call(fromInput, '2026-07-02')
      fromInput.dispatchEvent(new Event('input', { bubbles: true }))
      await new Promise((resolve) => setTimeout(resolve, 0))
    })

    expect(container.textContent).not.toContain('12,345.67')
    expect(container.querySelector('[aria-label="กำลังโหลดงบกำไรขาดทุน"]')).not.toBeNull()
  })

  it('keeps mobile P&L filter edits as a draft until apply and discards them on close', async () => {
    mocks.dailyFetchJson.mockResolvedValue(plPayload())

    await act(async () => {
      root.render(<PlStatementPageClient />)
      await new Promise((resolve) => setTimeout(resolve, 0))
    })
    const filterButton = Array.from(container.querySelectorAll<HTMLButtonElement>('button')).find((button) => button.textContent?.includes('ตัวกรอง'))
    await act(async () => filterButton?.click())
    const firstDraft = container.querySelector<HTMLInputElement>('#pl-statement-from-mobile')
    const originalValue = firstDraft?.value

    await act(async () => {
      if (!firstDraft) throw new Error('Expected mobile from-date input')
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set?.call(firstDraft, '2026-07-02')
      firstDraft.dispatchEvent(new Event('input', { bubbles: true }))
    })
    expect(mocks.dailyFetchJson).toHaveBeenCalledTimes(1)

    await act(async () => container.querySelector<HTMLDivElement>('.fixed')?.click())
    await act(async () => filterButton?.click())
    expect(container.querySelector<HTMLInputElement>('#pl-statement-from-mobile')?.value).toBe(originalValue)

    const appliedDraft = container.querySelector<HTMLInputElement>('#pl-statement-from-mobile')
    await act(async () => {
      if (!appliedDraft) throw new Error('Expected reopened mobile from-date input')
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set?.call(appliedDraft, '2026-07-03')
      appliedDraft.dispatchEvent(new Event('input', { bubbles: true }))
      Array.from(container.querySelectorAll<HTMLButtonElement>('button')).find((button) => button.textContent === 'ใช้ตัวกรอง')?.click()
      await new Promise((resolve) => setTimeout(resolve, 0))
    })

    expect(mocks.dailyFetchJson).toHaveBeenCalledTimes(2)
    expect(mocks.dailyFetchJson.mock.calls[1]?.[0]).toContain('from=2026-07-03')
  })

  it('labels Cash Flow as PBT, separates FCD, and exposes export and source links', async () => {
    mocks.dailyFetchJson.mockResolvedValueOnce(cashFlowPayload())

    await act(async () => {
      root.render(<CashFlowAnalysisPageClient />)
      await new Promise((resolve) => setTimeout(resolve, 0))
    })

    expect(container.textContent).toContain('กำไรก่อนภาษีเทียบกระแสเงินสดจริง')
    expect(container.textContent).not.toContain('กำไรสุทธิ')
    expect(container.textContent).toContain('เงินสดคงเหลือ (THB)')
    expect(container.textContent).toContain('บัญชี FCD (แยกจากยอดเงินบาท)')
    expect(container.textContent).toContain('USD 125.00')
    expect(container.textContent).toContain('เกณฑ์ประมาณการ: วันครบกำหนดจากข้อมูลต้นทาง')
    expect(container.textContent).not.toContain('-0.00')
    expect(container.querySelector('a[href*="format=xlsx"]')).not.toBeNull()
    expect(container.querySelector('a[href="/finance/ar"]')?.textContent).toContain('กำไรก่อนภาษี')
  })

  it('summarizes profit-to-cash divergence on one comparison scale', async () => {
    const payload = cashFlowPayload()
    payload.summary.netProfitBeforeTax = 60_418.07
    payload.summary.operatingCashFlow = -1_254_450
    mocks.dailyFetchJson.mockResolvedValueOnce(payload)

    await act(async () => {
      root.render(<CashFlowAnalysisPageClient />)
      await new Promise((resolve) => setTimeout(resolve, 0))
    })

    const comparison = container.querySelector<HTMLElement>('[data-cash-comparison]')
    if (!comparison) throw new Error('Expected the shared-scale cash comparison')
    const profitBar = comparison.querySelector<HTMLElement>('[data-cash-comparison-bar="profit"]')
    const cashBar = comparison.querySelector<HTMLElement>('[data-cash-comparison-bar="cash"]')

    expect(comparison.textContent).toContain('กำไรเป็นบวก แต่กระแสเงินสดจากการดำเนินงานติดลบ')
    expect(comparison.textContent).toContain('ช่องว่างระหว่างกำไรกับเงินสด')
    expect(comparison.textContent).toContain('1,314,868.07')
    expect(Number.parseFloat(profitBar?.style.width ?? '')).toBeGreaterThan(0)
    expect(Number.parseFloat(profitBar?.style.width ?? '')).toBeLessThan(Number.parseFloat(cashBar?.style.width ?? ''))
    expect(cashBar?.style.width).toBe('100%')
  })

  it('groups desktop analysis panels into independent primary and supporting columns', async () => {
    mocks.dailyFetchJson.mockResolvedValueOnce(cashFlowPayload())

    await act(async () => {
      root.render(<CashFlowAnalysisPageClient />)
      await new Promise((resolve) => setTimeout(resolve, 0))
    })

    const columns = container.querySelector<HTMLElement>('[data-cash-analysis-columns]')
    const primary = columns?.querySelector<HTMLElement>('[data-cash-analysis-primary-column]')
    const supporting = columns?.querySelector<HTMLElement>('[data-cash-analysis-supporting-column]')

    expect(columns?.className).toContain('lg:grid-cols-3')
    expect(primary?.className).toContain('lg:col-span-2')
    expect(primary?.textContent).toContain('กำไรก่อนภาษีเทียบกระแสเงินสดจริง')
    expect(primary?.textContent).toContain('ประมาณการเงินสด: ปัจจุบัน / 7 วัน / 30 วัน')
    expect(primary?.textContent).not.toContain('โครงสร้างเงินสดและทุนหมุนเวียน')
    expect(supporting?.textContent).toContain('โครงสร้างเงินสดและทุนหมุนเวียน')
    expect(supporting?.textContent).toContain('อัตราใช้เงินสดและวงเงิน OD')
    expect(supporting?.textContent).not.toContain('ประมาณการเงินสด: ปัจจุบัน / 7 วัน / 30 วัน')
  })

  it('renders the cash forecast as an enterprise stock-style line chart with exact movement context', async () => {
    const payload = cashFlowPayload()
    payload.charts.projection = [
      { basis: 'ฐานเงินสดปัจจุบัน', expectedIn: 0, expectedOut: 0, label: 'ปัจจุบัน', projected: 1_000 },
      { basis: 'รายการครบกำหนด', expectedIn: 100, expectedOut: 250, label: '7 วัน', projected: 850 },
      { basis: 'รายการครบกำหนด', expectedIn: 200, expectedOut: 300, label: '30 วัน', projected: 900 },
    ]
    mocks.dailyFetchJson.mockResolvedValueOnce(payload)

    await act(async () => {
      root.render(<CashFlowAnalysisPageClient />)
      await new Promise((resolve) => setTimeout(resolve, 0))
    })

    const forecast = container.querySelector<HTMLElement>('[data-cash-forecast]')
    if (!forecast) throw new Error('Expected the cash forecast')
    const chart = forecast.querySelector<HTMLElement>('[data-cash-forecast-line-chart]')
    if (!chart) throw new Error('Expected the cash forecast stock-style line chart')
    const line = chart.querySelector<SVGPathElement>('[data-cash-forecast-line]')
    if (!line) throw new Error('Expected the projected cash line')

    expect(forecast.querySelector('table')).toBeNull()
    expect(chart.querySelector('svg')).not.toBeNull()
    expect(chart.querySelector('linearGradient, polygon')).toBeNull()
    expect(chart.dataset.cashForecastLineDirection).toBe('negative')
    expect(line.getAttribute('d')).toMatch(/^M/)
    const points = chart.querySelectorAll<SVGCircleElement>('[data-cash-forecast-point]')
    expect(points).toHaveLength(3)
    expect(Array.from(points).every((point) => Number(point.getAttribute('r')) <= 4)).toBe(true)
    const summaries = chart.querySelectorAll<HTMLElement>('[data-cash-forecast-summary]')
    expect(summaries).toHaveLength(3)
    expect(summaries[1]?.querySelector('[data-cash-forecast-summary-balance]')?.className).toContain('text-[15px]')
    expect(summaries[1]?.querySelector('[data-cash-forecast-summary-details]')?.className).toContain('text-[13px]')
    expect(summaries[1]?.querySelector('[data-cash-forecast-summary-net]')?.className).toContain('text-[13.5px]')
    expect(chart.textContent).toContain('แกน Y ปรับตามช่วงยอดเงินสด')
    expect(chart.textContent).toContain('(150.00)')
    expect(forecast.textContent).toContain('เงินสดคาดการณ์')
    expect(forecast.textContent).toContain('เงินรับคาดการณ์')
    expect(forecast.textContent).toContain('เงินจ่ายคาดการณ์')
    expect(forecast.textContent).toContain('เปลี่ยนแปลงสุทธิ')
  })

  it('prioritizes KPIs before a collapsed report-basis disclosure and keeps export wording consistent', async () => {
    mocks.dailyFetchJson.mockResolvedValueOnce(cashFlowPayload())

    await act(async () => {
      root.render(<CashFlowAnalysisPageClient />)
      await new Promise((resolve) => setTimeout(resolve, 0))
    })

    const content = container.textContent ?? ''
    const disclosure = container.querySelector<HTMLDetailsElement>('details')
    const exports = Array.from(container.querySelectorAll<HTMLAnchorElement>('a[href*="format=xlsx"]'))

    expect(content.indexOf('เงินสดคงเหลือ (THB)')).toBeLessThan(content.indexOf('ดูเกณฑ์และข้อจำกัด'))
    expect(disclosure?.open).toBe(false)
    expect(disclosure?.querySelector('summary')?.textContent).toContain('ข้อมูลเพื่อการบริหาร')
    expect(disclosure?.querySelector('summary')?.textContent).toContain('ดูเกณฑ์และข้อจำกัด')
    expect(exports).toHaveLength(2)
    expect(exports.every((link) => link.textContent === 'ส่งออก Excel')).toBe(true)

    const mobileFilterButton = Array.from(container.querySelectorAll('button')).find((button) => button.textContent?.startsWith('ตัวกรอง'))
    await act(async () => mobileFilterButton?.click())
    const mobileDateInputs = Array.from(container.querySelectorAll<HTMLInputElement>('#cash-flow-analysis-from-mobile, #cash-flow-analysis-to-mobile'))
    expect(mobileDateInputs).toHaveLength(2)
    expect(mobileDateInputs.every((input) => input.classList.contains('h-9'))).toBe(true)
  })

  it('loads Cash Flow Analysis with the drilldown scope on the first request', async () => {
    mocks.dailyFetchJson.mockResolvedValueOnce(cashFlowPayload())

    await act(async () => {
      root.render(<CashFlowAnalysisPageClient initialFilters={{ branchId: 'BKK', from: '2026-06-01', to: '2026-06-30' }} />)
      await new Promise((resolve) => setTimeout(resolve, 0))
    })

    expect(mocks.dailyFetchJson).toHaveBeenCalledWith('/api/finance-accounting/cash-flow-analysis?from=2026-06-01&to=2026-06-30&branchId=BKK')
  })

  it('does not render non-finite Cash Flow values or invalid chart geometry', async () => {
    const payload = cashFlowPayload()
    payload.charts.projection = [{ basis: 'วันครบกำหนดจากข้อมูลต้นทาง', expectedIn: Number.POSITIVE_INFINITY, expectedOut: Number.NaN, label: '7 วัน', projected: Number.NaN }]
    payload.charts.trap = { ar: Number.NaN, cash: 200, stock: Number.POSITIVE_INFINITY }
    payload.detailRows = [
      { href: '/finance/ar', label: 'Cash Collection Rate', suffix: '%', value: Number.NaN },
      { href: '/finance/bank', label: 'วันที่ OD จะเต็มวงเงิน', suffix: ' วัน', value: Number.POSITIVE_INFINITY },
    ]
    payload.summary.daysToODMaxed = Number.NaN
    payload.summary.odLimit = Number.POSITIVE_INFINITY
    payload.summary.odUsed = Number.NaN
    mocks.dailyFetchJson.mockResolvedValueOnce(payload)

    await act(async () => {
      root.render(<CashFlowAnalysisPageClient />)
      await new Promise((resolve) => setTimeout(resolve, 0))
    })

    expect(container.textContent).toContain('ไม่มีข้อมูล')
    expect(container.textContent).not.toMatch(/NaN|Infinity/)
    expect(container.innerHTML).not.toMatch(/NaN%|Infinity%|NaN,|Infinity,/)
  })

  it('does not label missing Forecast values as healthy or render invalid SVG geometry', async () => {
    mocks.dailyFetchJson.mockResolvedValueOnce(forecastPayload())

    await act(async () => {
      root.render(<CashFlowForecastCalendarPageClient />)
      await new Promise((resolve) => setTimeout(resolve, 0))
    })

    expect(container.textContent).toContain('ไม่มีข้อมูล')
    expect(container.textContent).toContain('AR due date; AP conservative bill date')
    expect(container.textContent).not.toContain('คาดการณ์: เงินพอ')
    expect(container.textContent).not.toContain('คาดการณ์: เงินขาด')
    expect(container.textContent).not.toContain('ไม่มีวันที่เงินสดติดลบในช่วง forecast นี้')
    expect(container.innerHTML).not.toMatch(/NaN|Infinity/)
  })

  it('uses a danger tone for a negative Forecast closing balance', async () => {
    const payload = forecastPayload()
    payload.dailyProjection = [{
      closing: -50,
      date: '2026-07-17',
      dayIn: 0,
      dayOfMonth: 17,
      dayOfWeek: 5,
      dayOut: 50,
      events: [],
      isToday: true,
      opening: 0,
    }]
    payload.summary = { endCash: -50, lowestBal: -50, negCount: 1, negDay: payload.dailyProjection[0], startCash: 0, totalIn: 0, totalOut: 50 }
    mocks.dailyFetchJson.mockResolvedValueOnce(payload)

    await act(async () => {
      root.render(<CashFlowForecastCalendarPageClient />)
      await new Promise((resolve) => setTimeout(resolve, 0))
    })

    const closingLabel = Array.from(container.querySelectorAll('div')).find((node) => node.textContent === 'ยอดสิ้นช่วง')
    const closingNote = closingLabel?.parentElement
    expect(closingNote?.textContent).toContain('(50.00)')
    expect(closingNote?.querySelector('.text-rose-700')).not.toBeNull()
  })

  it('loads Forecast Calendar with the drilldown scope on the first request', async () => {
    mocks.dailyFetchJson.mockResolvedValueOnce({
      ...forecastPayload(),
      dailyProjection: [],
      summary: { ...forecastPayload().summary, endCash: 0, lowestBal: 0, startCash: 0, totalIn: 0, totalOut: 0 },
    })

    await act(async () => {
      root.render(<CashFlowForecastCalendarPageClient initialFilters={{ branchId: 'BKK', horizon: 7, startDate: '2026-06-30' }} />)
      await new Promise((resolve) => setTimeout(resolve, 0))
    })

    expect(mocks.dailyFetchJson).toHaveBeenCalledWith('/api/finance-accounting/cf-forecast-calendar?startDate=2026-06-30&horizon=7&branchId=BKK')
  })
})
