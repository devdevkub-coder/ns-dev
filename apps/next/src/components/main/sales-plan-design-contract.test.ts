import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const clientPath = fileURLToPath(new URL('./MainSalesControlClients.tsx', import.meta.url))
const serverPath = fileURLToPath(new URL('../../lib/server/main-sales-control.ts', import.meta.url))
const routePath = fileURLToPath(new URL('../../app/api/sales-plan/route.ts', import.meta.url))

describe('Sales Plan design contract', () => {
  it('keeps draft, locked, and PO-created plans as separate decision states', async () => {
    const [client, server] = await Promise.all([readFile(clientPath, 'utf8'), readFile(serverPath, 'utf8')])
    const summary = server.slice(server.indexOf('summary: {', server.indexOf('export async function buildSalesPlan')), server.indexOf('\n    },\n  }', server.indexOf('summary: {', server.indexOf('export async function buildSalesPlan'))))

    expect(summary).toContain("lockedCount: planRows.filter((row: (typeof planRows)[number]) => String(row.status) === 'locked').length")
    expect(summary).toContain("pendingCount: planRows.filter((row: (typeof planRows)[number]) => String(row.status) === 'draft').length")
    expect(summary).toContain("poCreatedCount: planRows.filter((row: (typeof planRows)[number]) => String(row.status) === 'po_created').length")
    expect(client).not.toContain('label="แผนทั้งหมด"')
    expect(client).toContain('label="รอล็อกแผน" sublabel="ต้องตรวจและล็อกแผน" value={count(data?.summary.pendingCount)}')
    expect(client).toContain('label="ล็อกแผนแล้ว" sublabel="พร้อมเปิด PO ขาย" value={count(data?.summary.lockedCount)}')
    expect(client).toContain('label="เปิด PO ขายแล้ว" sublabel="ไม่แสดงในตารางงานค้าง" value={count(data?.summary.poCreatedCount)}')
  })

  it('uses the shared blue focus and persistent manual-entry treatment', async () => {
    const client = await readFile(clientPath, 'utf8')
    const lmeCard = client.slice(client.indexOf('function LmeEditableCard'), client.indexOf('type CommissionMetricTone'))

    expect(client).toContain('focus:border-blue-500 focus:ring-[3px] focus:ring-blue-500/20')
    expect(client).not.toContain('focus:border-neutral-500')
    expect(lmeCard).toContain("data-manual-required={manualRequired ? 'true' : undefined}")
    expect(lmeCard).toContain('data-auto-filled={autoFilled ? \'true\' : undefined}')
    expect(lmeCard).toContain('required={manualRequired}')
    expect(lmeCard).toContain('aria-invalid={Boolean(error)}')
    expect(lmeCard).toContain('data-error-key={errorKey}')
    expect(lmeCard).toContain('readOnly ? salesPlanReadonlyNumberInputClass : salesPlanNumberInputClass')
    expect(lmeCard).not.toContain('readOnly || manualOnly')
    expect(client).toContain('label="USD/THB" manualRequired')
    expect(client).toContain('manualOnly manualRequired')
    expect(client).toContain('data-manual-required="true"')
    expect(client).not.toContain('data-auto-filled="true"')
    expect(client).toContain("if (key === 'fxRate') setLmeFxAutoFilled(false)")
    expect(client).toContain('autoFilled={lmeFxAutoFilled}')
    expect(client).toContain("data-auto-filled={draftKgPerContainerAutoFilled ? 'true' : undefined}")
    expect(client).toContain("data-auto-filled={draftLmeCfAutoFilled ? 'true' : undefined}")
    expect(client).toContain('setDraftLmeCfAutoFilled(Boolean(lmeCf))')
    expect(client).toContain('errorKey="lme-fxRate"')
    expect(client).toContain('errorKey="lme-kgPerContainer"')
  })

  it('keeps the pending-sale table single-line and resizable', async () => {
    const client = await readFile(clientPath, 'utf8')
    const table = client.slice(client.indexOf('📋 ตารางรอขาย'), client.indexOf('const hasPlan =', client.indexOf('📋 ตารางรอขาย')))
    const columns = client.slice(client.indexOf('const salesPlanPendingColumns'), client.indexOf('const salesPlanAnalysisColumns'))
    const columnKeys = [...columns.matchAll(/\{ key: '([^']+)'/g)].map((match) => match[1])
    const rowStart = table.indexOf('pagedPendingSaleRows.map')
    const desktopRow = table.slice(rowStart, table.indexOf('</tr>', rowStart))
    const cellMarkers = [
      'text(row.productName)',
      'text(row.metalGroup)',
      'money(row.pendingSaleQty)',
      'num(row.avgPrice)',
      'num(row.bestPlanPrice)',
      'num(row.bestPlanPct)',
      'num(row.projectedProfit)',
      'num(row.projectedMarginPct)',
      'money(row.realPendingSale)',
      'money(row.lockedSell)',
      'money(row.lockedBuy)',
      'money(row.stock)',
    ]
    const cellPositions = cellMarkers.map((marker) => desktopRow.indexOf(marker))

    expect(client).toContain("useResizableColumns('main.sales-plan.pending-sale.v1', salesPlanPendingColumns)")
    expect(client).toContain('.filter((row) => matchesProductFilter(row, planFilterProductCode))')
    expect(columnKeys).toEqual([
      'productName',
      'metalGroup',
      'pendingSaleQty',
      'avgPrice',
      'bestPlanPrice',
      'bestPlanPct',
      'projectedProfit',
      'projectedMarginPct',
      'realPendingSale',
      'lockedSell',
      'lockedBuy',
      'stock',
    ])
    expect(columns).toContain("{ key: 'metalGroup', label: 'หมวด', defaultWidth: 120, minWidth: 100, align: 'right' }")
    expect(cellPositions.every((position) => position >= 0)).toBe(true)
    expect(cellPositions).toEqual([...cellPositions].sort((left, right) => left - right))
    expect(desktopRow).toContain('<td className="p-3 text-right text-xs font-medium text-slate-500">{text(row.metalGroup)}</td>')
    expect(desktopRow).not.toContain('px-4 py-3')
    expect(table).toContain('onResetWidths={pendingSaleResize.hasCustomWidths ? pendingSaleResize.resetColumnWidths : undefined}')
    expect(table).toContain("style={{ minWidth: pendingSaleResize.tableMinWidth, tableLayout: 'fixed', width: '100%' }}")
    expect(table).toContain('pendingSaleResize.getColumnStyle(column.key)')
    expect(table).toContain('<ResizableTableHead')
    expect(table).not.toContain('<br')
  })

  it('keeps mobile shortage cards neutral and exposes only semantic red accents', async () => {
    const client = await readFile(clientPath, 'utf8')
    const mobile = client.slice(client.indexOf('const hasPlan =', client.indexOf('📋 ตารางรอขาย')), client.indexOf("{!pendingSaleRows.length ?", client.indexOf('const hasPlan =', client.indexOf('📋 ตารางรอขาย'))))

    expect(mobile).toContain('bg-white p-4 shadow-sm dark:bg-slate-900')
    expect(mobile).not.toContain('bg-red-50/40')
    expect(mobile).toContain('สต๊อกไม่พอ')
    expect(mobile).toContain("shortage ? 'text-red-600 dark:text-red-300' : 'text-emerald-600 dark:text-emerald-300'")
    expect(mobile).toContain('มูลค่ารอขาย')
    expect(mobile).toContain('money(row.pendingSaleValue)')
    expect(client).toContain('ดูราคาและสมมติฐาน')
    expect(client).toContain('รายละเอียดแหล่งข้อมูล')
    expect(client).toContain('open={isLmeReferenceOpen}')
    expect(client).toContain("window.matchMedia('(min-width: 1024px)')")
  })

  it('focuses actionable draft errors and resets filters to the current month', async () => {
    const [clientSource, route] = await Promise.all([readFile(clientPath, 'utf8'), readFile(routePath, 'utf8')])
    const client = clientSource.replace(/\r\n/g, '\n')
    const clearFilters = client.slice(client.indexOf('const clearPlanFilters'), client.indexOf('function changePlanSort'))
    const draftForm = client.slice(client.indexOf('<Dialog open={isPlanFormOpen}'), client.indexOf('<TablePaginationToolbar', client.indexOf('<Dialog open={isPlanFormOpen}')))
    const pendingStatCard = client.slice(client.indexOf('function PendingStatCard'), client.indexOf('export function SalesCommissionPageClient'))

    expect(client).toContain("import { focusFieldError } from '@/lib/form-errors'")
    expect(client).toContain("(['productCode', 'customerCode', 'containers', 'kgPerContainer', 'lmeCf', 'sellPctLme'] as const)")
    expect(client).toContain('setPlanDraftFieldErrors(nextFieldErrors)')
    expect(client).toContain('focusFieldError(firstErrorKey)')
    expect(client).toContain("if (selectedDraftProduct && draftLmeCf <= 0) nextFieldErrors.lmeCf = 'LME cf ต้องมากกว่า 0'")
    expect(client).toContain('setIsLmeReferenceOpen(true)\n      setLmeFieldErrors(nextFieldErrors)')
    expect(client).toContain("focusFieldError(`lme-${firstErrorKey}`)")
    expect(route).toContain("fxRate: z.coerce.number().finite().gt(0, 'USD/THB ต้องมากกว่า 0')")
    expect(route).toContain("kgPerContainer: z.coerce.number().finite().gt(0, 'กก./ตู้ ต้องมากกว่า 0')")
    for (const errorKey of ['productCode', 'customerCode']) {
      expect(client).toContain(`errorKey="${errorKey}"`)
    }
    for (const errorKey of ['containers', 'kgPerContainer', 'lmeCf', 'sellPctLme']) {
      expect(client).toContain(`data-error-key="${errorKey}"`)
    }
    expect(client).toContain("const currentMonth = new Date().toISOString().slice(0, 7)")
    expect(clearFilters).toContain('setMonth(currentMonth)')
    expect(clearFilters).not.toContain("setMonth('')")
    expect(draftForm.match(/step="any"/g)).toHaveLength(3)
    expect(pendingStatCard).toContain('return <KpiCard label={label} note={sublabel} tone={kpiTone} value={value} />')
    expect(pendingStatCard).not.toContain('className=')
  })

  it('keeps the mobile plan toolbar compact and hides an empty destructive action', async () => {
    const client = await readFile(clientPath, 'utf8')
    const filters = client.slice(client.indexOf('data-sales-plan-filter-toolbar'), client.indexOf('{/* 1. Sales Plan Section */}'))
    const mobileSheet = filters.slice(filters.indexOf('<MobileFilterSheet'), filters.indexOf('</MobileFilterSheet>'))

    expect(client).toContain("import { MobileFilterSheet } from '@/components/ui/MobileFilterSheet'")
    expect(filters).toContain('data-sales-plan-filter-toolbar="mobile"')
    expect(filters).toContain('data-sales-plan-filter-toolbar="desktop" className="hidden rounded-xl')
    expect(filters).toContain('dark:bg-slate-900 lg:block')
    expect(filters).toContain('dark:bg-slate-900 lg:hidden')
    expect(filters).toContain('ตัวกรอง{hasActivePlanFilters ? \' (มี)\' : \'\'}')
    expect(filters).toContain('title="ตัวกรองแผนขาย"')
    expect(filters).toContain('visibleClassName="lg:hidden"')
    expect(filters).toContain('ล้างตัวกรอง')
    expect(filters).toContain('onClick={clearPlanFilters} type="button">ล้างตัวกรอง</button>')
    expect(filters).not.toContain('ล้างสินค้า')
    expect(filters).toContain('ใช้ตัวกรอง')
    expect(filters).toContain('{pendingPlanCount > 0 ? (')
    expect(filters).toContain('className="inline-flex h-9 items-center justify-center rounded-md border border-rose-200')
    expect(filters).not.toContain('disabled={!pendingPlanCount')
    expect(mobileSheet.match(/<select /g)).toHaveLength(2)
    expect(mobileSheet).not.toContain('<Select ')
  })
})
