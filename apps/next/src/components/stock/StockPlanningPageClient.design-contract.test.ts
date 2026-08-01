import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const clientPath = fileURLToPath(new URL('./StockPlanningPageClient.tsx', import.meta.url))

describe('Stock Planning design contract', () => {
  it('uses the shared page hierarchy and compact responsive filters', async () => {
    const client = await readFile(clientPath, 'utf8')

    expect(client).toContain("import { MobileFilterSheet } from '@/components/ui/MobileFilterSheet'")
    expect(client).toContain("import { ResizableTableHead } from '@/components/ui/ResizableTableHead'")
    expect(client).toContain("import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'")
    expect(client).toContain("import { useResizableColumns, type ResizableColumnDefinition } from '@/components/ui/useResizableColumns'")
    expect(client).toContain('data-stock-planning-filter-toolbar="desktop"')
    expect(client).toContain('data-stock-planning-filter-toolbar="mobile"')
    expect(client).toContain('<TabsList')
    expect(client).toContain('variant="line"')
    expect(client).toContain('mobileFilterDraft')
    expect(client).toContain('title="ตัวกรองวางแผนสต๊อก"')
    expect(client).toContain('visibleClassName="lg:hidden"')
    expect(client).toContain('ล้างตัวกรอง')
    expect(client).toContain('ใช้ตัวกรอง')
    expect(client).not.toContain('<h1 className="text-xl font-bold text-slate-800">')
    expect(client).not.toContain('เทียบ Stock พร้อมส่งกับ PO Buy ที่กำลังเข้าและ PO Sell ที่ค้างส่งตามวันกำหนดส่ง')
  })

  it('keeps one primary data surface in each planning line tab', async () => {
    const client = await readFile(clientPath, 'utf8')
    const urgentSurface = client.slice(
      client.indexOf('function UrgentPurchasePanel'),
      client.indexOf('function PlanningPagination'),
    )

    expect(client).toContain("type PlanningView = 'overview' | 'purchase' | 'calendar'")
    expect(client).toContain('<TabsTrigger value="overview" variant="line">ภาพรวมสต๊อก</TabsTrigger>')
    expect(client).toContain('<TabsTrigger value="purchase" variant="line">ต้องซื้อเพิ่ม</TabsTrigger>')
    expect(client).toContain('value="calendar"')
    expect(client).not.toContain('value="table"')
    expect(client).not.toContain('!initialLoading && shortagePlans.length')
    expect(client).toContain("view === 'overview'")
    expect(client).toContain("view === 'purchase'")
    expect(urgentSurface).not.toContain('border-red-200 bg-red-50/70')
    expect(urgentSurface).not.toContain('min-w-[1200px]')
    expect(urgentSurface).not.toContain('<span className="shrink-0 text-xs font-semibold text-red-700">ต้องซื้อเพิ่ม</span>')
    expect(urgentSurface).toContain('purchaseColumns.map')
    expect(urgentSurface).toContain('label="Stock พร้อมส่ง (กก.)"')
    expect(urgentSurface).toContain('label="กำไรที่คาด (บาท)"')
    expect(urgentSurface).not.toContain('Stock ตอนนี้')
    expect(urgentSurface).not.toContain('กำไรที่จะได้')
    expect(urgentSurface.match(/<ResizableTableHead\b/g) ?? []).toHaveLength(6)
  })

  it('keeps filter ownership explicit and removes decorative status styling', async () => {
    const client = await readFile(clientPath, 'utf8')
    const calendarToolbar = client.slice(
      client.indexOf('data-stock-planning-calendar-toolbar'),
      client.indexOf('<div className="overflow-hidden rounded-xl', client.indexOf('data-stock-planning-calendar-toolbar')),
    )

    expect(client).toContain('data-stock-planning-calendar-toolbar')
    expect(client).toContain('className="flex flex-col gap-3 px-1 py-1 sm:flex-row sm:items-center sm:justify-between"')
    expect(calendarToolbar.indexOf('เลือกวันที่เพื่อดู PO Sell')).toBeLessThan(calendarToolbar.indexOf('shiftMonth(-1)'))
    expect(client.match(/data-ns-field-scope="filter"/g) ?? []).toHaveLength(3)
    expect(client).not.toContain('rounded bg-amber-100 px-2 py-0.5 text-[11px] text-amber-800')
    expect(client).not.toContain('rounded-full bg-red-600 px-3 py-1 text-xs font-bold text-white')
    expect(client).toMatch(/label="PO Sell [^"]+"\s+tone="slate"/)
    expect(client).toContain('aria-label="หมวด"')
    expect(client).toContain('เฉพาะสินค้าที่มี PO Sell')
    expect(client).toContain('รวมสินค้าที่ไม่มี PO')
    expect(client.match(/<SegmentedFilterButton\b/g) ?? []).toHaveLength(2)
    expect(client).toContain('✕ ล้าง')
  })

  it('keeps only real page actions and refreshes business facts when the page becomes active', async () => {
    const client = await readFile(clientPath, 'utf8')
    const desktopToolbar = client.slice(
      client.indexOf('data-stock-planning-filter-toolbar="desktop"'),
      client.indexOf('data-stock-planning-filter-toolbar="mobile"'),
    )
    const mobileToolbar = client.slice(
      client.indexOf('data-stock-planning-filter-toolbar="mobile"'),
      client.indexOf('{mobileFilterDraft ? ('),
    )

    expect(client).toContain("import { Button } from '@/components/ui/Button'")
    expect(client).toContain("import { SegmentedFilterButton } from '@/components/ui/SegmentedFilterButton'")
    expect(client).toContain("window.addEventListener('focus'")
    expect(client).toContain("document.addEventListener('visibilitychange'")
    expect(client).toContain('const canRenderPlanningData = initialLoading || Boolean(data)')
    expect(client).toContain('ลองใหม่')
    expect(client).not.toContain('RefreshCw')
    expect(client).not.toContain('รีเฟรช')
    expect(client).not.toContain('function PlanningSegmentedButton')
    expect(desktopToolbar).toMatch(/\{view === 'overview' \? \([\s\S]*variant="export"/)
    expect(mobileToolbar).toMatch(/\{view === 'overview' \? \([\s\S]*variant="export"/)
  })

  it('uses semantic colors only for business states, not ordinary metrics', async () => {
    const client = await readFile(clientPath, 'utf8')
    const decorativeMetricClasses = [
      'tabular-nums text-blue-700">{formatMoney(plan.stockNow)',
      'tabular-nums text-emerald-700">{plan.buyComing',
      'tabular-nums text-red-700">{plan.sellPending',
      "plan.finalBalance < 0 ? 'text-red-700' : 'text-emerald-700'",
      "plan.shortage ? 'text-red-700' : 'text-emerald-700'",
      'tabular-nums text-red-700">{plan.buyBudget',
      'tabular-nums text-emerald-700">{plan.poSellPrice',
      'tabular-nums text-amber-700">{formatMoney(row.remainingQty)',
      "row.before >= row.remainingQty ? 'text-emerald-700' : 'text-red-700'",
      "row.shortage ? 'text-red-700' : 'text-emerald-700'",
      "hasShortage ? 'bg-red-50/60' : dayRows.length ? 'bg-emerald-50/40' : ''",
    ]

    decorativeMetricClasses.forEach((className) => {
      expect(client).not.toContain(className)
    })
    expect(client).toContain("plan.finalBalance < 0 ? 'text-red-700' : 'text-slate-700'")
    expect(client).toContain("plan.shortage ? 'text-red-700' : 'text-slate-700'")
    expect(client).toContain("row.before < row.remainingQty ? 'text-red-700' : 'text-slate-700'")
    expect(client).toContain("row.shortage ? 'text-red-700' : 'text-slate-700'")
  })

  it('switches heavy tables to mobile cards and keeps expansion keyboard-accessible', async () => {
    const client = await readFile(clientPath, 'utf8')
    const rightAlignedNumericHeaders = client.match(/<ResizableTableHead align="right"/g) ?? []
    const resizableHeaders = client.match(/<ResizableTableHead\b/g) ?? []
    const fixedLayoutTables = client.match(/tableLayout: 'fixed'/g) ?? []
    const dividedBodies = client.match(/<tbody className="divide-y divide-slate-200">/g) ?? []

    expect(client).toContain('data-stock-planning-mobile-card')
    expect(client).toContain('className="hidden md:block"')
    expect(client).toContain('className="space-y-3 md:hidden"')
    expect(client).toContain('aria-expanded={isExpanded}')
    expect(client).toContain('aria-controls={detailId}')
    expect(client).toContain('aria-pressed={date === selectedDate}')
    expect(client).toContain('tabular-nums')
    expect(rightAlignedNumericHeaders).toHaveLength(16)
    expect(resizableHeaders).toHaveLength(30)
    expect(fixedLayoutTables).toHaveLength(4)
    expect(dividedBodies).toHaveLength(4)
    expect(client).not.toMatch(/<th\b/)
    expect(client).toContain("useResizableColumns('stock.planning.overview.v1'")
    expect(client).toContain("useResizableColumns('stock.planning.purchase.v1'")
    expect(client).toContain("useResizableColumns('stock.planning.detail.v1'")
    expect(client).toContain("useResizableColumns('stock.planning.calendar-day.v1'")
    expect(client.match(/ยังไม่มี PO Sell สำหรับสินค้านี้/g) ?? []).toHaveLength(2)
  })

  it('shows canonical pagination/loading and exports a real Excel workbook', async () => {
    const client = await readFile(clientPath, 'utf8')
    const canonicalExportButtons = client.match(/variant="export"/g) ?? []

    expect(client).toContain("import { PageSizeDropdown } from '@/components/ui/PageSizeDropdown'")
    expect(client).toContain('<PageSizeDropdown')
    expect(client).toContain('กำลังโหลดข้อมูล')
    expect(client).toContain('หน้า {currentPage} / {pageCount}')
    expect(client).toContain('คืนค่าเดิมตาราง')
    expect(client).toContain('แสดง ${rangeStart.toLocaleString')
    expect(client).toContain('className="flex flex-wrap items-center justify-between gap-2 px-1 py-1 text-sm text-slate-600"')
    expect(client).toContain("await import('write-excel-file/browser')")
    expect(client).toContain('.xlsx`')
    expect(client).toContain('ส่งออก Excel')
    expect(canonicalExportButtons).toHaveLength(2)
  })
})
