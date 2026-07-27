import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const source = readFileSync(
  fileURLToPath(new URL('./DualCostingManagementPageClient.tsx', import.meta.url)),
  'utf8',
).replaceAll('\r\n', '\n')
const tableSource = readFileSync(
  fileURLToPath(new URL('../ui/Table.tsx', import.meta.url)),
  'utf8',
).replaceAll('\r\n', '\n')
const textualColumnClass = 'ns-table-textual-column'

function openingTableCell(sourceText: string, marker: string) {
  const markerIndex = sourceText.indexOf(marker)
  const cellStart = sourceText.lastIndexOf('<TableCell', markerIndex)
  const cellEnd = sourceText.indexOf('>', cellStart)

  expect(markerIndex, marker).toBeGreaterThan(-1)
  expect(cellStart, marker).toBeGreaterThan(-1)
  expect(cellEnd, marker).toBeGreaterThan(cellStart)
  return sourceText.slice(cellStart, cellEnd + 1)
}

function openingNativeCell(sourceText: string, marker: string) {
  const markerIndex = sourceText.indexOf(marker)
  const cellStart = sourceText.lastIndexOf('<td', markerIndex)
  const cellEnd = sourceText.indexOf('>', cellStart)

  expect(markerIndex, marker).toBeGreaterThan(-1)
  expect(cellStart, marker).toBeGreaterThan(-1)
  expect(cellEnd, marker).toBeGreaterThan(cellStart)
  return sourceText.slice(cellStart, cellEnd + 1)
}

describe('Waiting Allocations semantic alignment', () => {
  it('keeps text, date, category, and status columns left while numeric columns stay right', () => {
    const viewStart = source.indexOf('function WaitingAllocationsView()')
    const viewEnd = source.indexOf('\nfunction AllocationLedgerView', viewStart)
    const view = source.slice(viewStart, viewEnd)
    const textualKeys = ['docNo', 'date', 'customerName', 'productName', 'metalGroup', 'allocationStatus'] as const
    const textualBodyMarkers = [
      '{row.docNo}',
      '{formatDateDisplay(row.date)}',
      "title={row.customerName === '-' ? 'ภายในโรงงาน' : row.customerName}",
      "title={row.productName || ''}",
      '{row.metalGroup}',
      '<StatusPill status={row.allocationStatus}',
    ] as const
    const numericKeys = ['qty', 'allocatedQty', 'remainingQty', 'unitPrice', 'revenuePending'] as const

    expect(viewStart).toBeGreaterThan(-1)
    expect(viewEnd).toBeGreaterThan(viewStart)
    expect(view).toContain('className={col.className}')
    textualKeys.forEach((key) => {
      expect(view.match(new RegExp(`\\{ key: '${key}',[^\\n]*className: '${textualColumnClass}'`, 'g'))).toHaveLength(3)
    })
    textualBodyMarkers.forEach((marker) => {
      expect(openingNativeCell(view, marker)).toContain(textualColumnClass)
    })
    numericKeys.forEach((key) => {
      expect(view.match(new RegExp(`\\{ key: '${key}',[^\\n]*align: 'right'`, 'g'))).toHaveLength(3)
    })
  })
})

describe('Allocation Ledger table density', () => {
  it('uses the shared p-3 body density while keeping loading and empty rows at p-8', () => {
    const viewStart = source.indexOf('function AllocationLedgerView()')
    const viewEnd = source.indexOf('\nfunction compareSortValues', viewStart)
    const view = source.slice(viewStart, viewEnd)
    const rowStart = view.indexOf('{visibleRows.map((row) => (')
    const rowEnd = view.indexOf('</TableRow>', rowStart)
    const ordinaryRow = view.slice(rowStart, rowEnd)
    const ordinaryCells = ordinaryRow.match(/<TableCell className=(?:"[^"]*"|\{`[^`]*`\})/g) ?? []

    expect(viewStart).toBeGreaterThan(-1)
    expect(viewEnd).toBeGreaterThan(viewStart)
    expect(rowStart).toBeGreaterThan(-1)
    expect(rowEnd).toBeGreaterThan(rowStart)
    expect(ordinaryCells).toHaveLength(12)
    ordinaryCells.forEach((cell) => {
      expect(cell).toMatch(/\bp-3\b/)
      expect(cell).not.toMatch(/\bp-2\b/)
    })
    expect(view.match(/className="p-8 text-center text-slate-500"/g)).toHaveLength(2)
  })

  it('centers non-numeric columns and right-aligns numeric measures', () => {
    const viewStart = source.indexOf('function AllocationLedgerView()')
    const viewEnd = source.indexOf('\nfunction compareSortValues', viewStart)
    const view = source.slice(viewStart, viewEnd)
    const centeredColumns = [
      ['matchId', 'title={row.matchId}'],
      ['allocatedAt', 'formatDateDisplay(row.allocatedAt)'],
      ['saleDocNo', 'title={row.saleDocNo}'],
      ['productName', 'title={row.productName}'],
      ['costPoolNo', 'title={row.costPoolNo}'],
      ['status', '<LedgerStatusText status={row.status}'],
      ['action', '<LedgerActionMenu'],
    ] as const
    const rightAlignedColumns = [
      ['allocatedQty', 'formatMoney(row.allocatedQty)'],
      ['costPerKg', 'formatMoney(row.costPerKg)'],
      ['totalCost', 'formatMoney(row.totalCost)'],
      ['allocatedRevenue', 'formatMoney(row.allocatedRevenue)'],
      ['grossProfit', 'formatMoney(row.grossProfit)'],
    ] as const

    expect(view).toContain('className={column.className}')
    centeredColumns.forEach(([key, bodyMarker]) => {
      expect(view).toMatch(new RegExp(`\\{ key: '${key}',[^\\n]*align: 'center'`))
      expect(openingTableCell(view, bodyMarker)).toContain('text-center')
    })
    rightAlignedColumns.forEach(([key, bodyMarker]) => {
      expect(view).toMatch(new RegExp(`\\{ key: '${key}',[^\\n]*align: 'right'`))
      expect(openingTableCell(view, bodyMarker)).toContain('text-right')
    })
    expect(view).toContain('mt-1 flex justify-center')
    expect(view).toContain('flex justify-center"><LedgerStatusText status={row.status} />')
  })

  it('opens matched-cost details from the allocated quantity without expanding the table row', () => {
    const viewStart = source.indexOf('function AllocationLedgerView()')
    const viewEnd = source.indexOf('\nfunction compareSortValues', viewStart)
    const view = source.slice(viewStart, viewEnd)

    expect(view).toContain('setSelectedDetailMatchId(row.matchId)')
    expect(view).toContain('onClick={() => setSelectedDetailMatchId(row.matchId)}')
    expect(view).toContain('onClick={(event) => event.stopPropagation()}')
    expect(view).toContain('<Dialog open={selectedDetailRow != null}')
    expect(view).toContain('<LedgerMatchedCostDetails rows={selectedDetailRows} />')
    expect(view).not.toContain('colSpan={ledgerColumns.length}>\n                        <LedgerMatchedCostDetails')
  })

  it('keeps the allocation record timestamp visible for audit', () => {
    const viewStart = source.indexOf('function AllocationLedgerView()')
    const viewEnd = source.indexOf('\nfunction compareSortValues', viewStart)
    const view = source.slice(viewStart, viewEnd)

    expect(view).toMatch(/\{ key: 'allocatedAt', label: 'วันที่บันทึก'/)
    expect(openingTableCell(view, 'formatDateDisplay(row.allocatedAt)')).toContain('text-center')
  })

  it('uses the shared confirmation dialog and compact management actions', () => {
    const viewStart = source.indexOf('function AllocationLedgerView()')
    const viewEnd = source.indexOf('\nfunction compareSortValues', viewStart)
    const view = source.slice(viewStart, viewEnd)
    const menuStart = source.indexOf('function LedgerActionMenu(')
    const menuEnd = source.indexOf('\nfunction TargetPill', menuStart)
    const menu = source.slice(menuStart, menuEnd)

    expect(view).toContain('ยืนยันการย้อนกลับการจัดสรร')
    expect(view).not.toContain('window.confirm')
    expect(menu).toContain('ดูรายละเอียด')
    expect(menu).toContain('แก้ไข')
    expect(menu).toContain('ยกเลิก')
    expect(menu).toContain('{canReallocate ?')
    expect(menu).toContain('{canReverse ?')
    expect(menu).not.toContain('disabled={!canReallocate}')
    expect(menu).not.toContain('disabled={!canReverse}')
    expect(menu).toContain('mobileLabel={mobileLabel}')
  })

  it('uses one lg breakpoint and keeps search, filters, and export available in the compact toolbar', () => {
    const viewStart = source.indexOf('function AllocationLedgerView()')
    const viewEnd = source.indexOf('\nfunction compareSortValues', viewStart)
    const view = source.slice(viewStart, viewEnd)

    expect(view).toContain('<MobileFilterSheet')
    expect(view).toContain('visibleClassName="lg:hidden"')
    expect(view).toContain('className="hidden lg:block"')
    expect(view).toContain('className="block lg:hidden')
    expect(view).toContain('openMobileLedgerFilters')
    expect(view).toContain('applyMobileLedgerFilters')
    expect(view.match(/ส่งออก Excel/g)?.length).toBeGreaterThanOrEqual(2)
    expect(view).toContain('ค้นหาเลขที่การจับคู่ / เอกสารขาย / เอกสารต้นทุน / สินค้า...')
    expect(view).not.toContain('animate-in slide-in-from-top-2')
  })

  it('uses the canonical two-row desktop filters, a connected desktop data surface, and only the baseline page sizes', () => {
    const viewStart = source.indexOf('function AllocationLedgerView()')
    const viewEnd = source.indexOf('\nfunction compareSortValues', viewStart)
    const view = source.slice(viewStart, viewEnd)

    expect(view).toContain('const pageSizeOptions = [10, 25] as const')
    expect(view).toContain("useState<(typeof pageSizeOptions)[number]>(25)")
    expect(view).toContain('function clearLedgerFilters()')
    expect(view).toContain('ล้างตัวกรอง')
    expect(view).toContain('border-t border-slate-100 pt-3')
    const shellStart = view.indexOf('className="lg:overflow-hidden lg:rounded-md lg:border lg:border-slate-200 lg:bg-white lg:shadow-sm"')
    const toolbarStart = view.indexOf('className="flex flex-col gap-3 px-1 py-3 text-sm text-slate-600 sm:flex-row sm:items-center sm:justify-between lg:border-b lg:border-slate-100 lg:px-3"')
    const desktopStart = view.indexOf('{/* Desktop View */}', toolbarStart)
    const mobileStart = view.indexOf('{/* Mobile Card List */}', desktopStart)
    const desktop = view.slice(desktopStart, mobileStart)

    expect(shellStart).toBeGreaterThan(-1)
    expect(toolbarStart).toBeGreaterThan(-1)
    expect(toolbarStart).toBeGreaterThan(shellStart)
    expect(desktopStart).toBeGreaterThan(toolbarStart)
    expect(desktop).toContain('<div className="hidden overflow-x-auto lg:block">')
    expect(desktop).toContain('<table className="ns-table min-w-full text-sm"')
    expect(desktop).not.toContain('<Table className="text-sm"')
  })

  it('keeps the condensed desktop table below 1500px at default widths', () => {
    const viewStart = source.indexOf('function AllocationLedgerView()')
    const viewEnd = source.indexOf('\nfunction compareSortValues', viewStart)
    const view = source.slice(viewStart, viewEnd)
    const columnBlockStart = view.indexOf('const ledgerColumns =')
    const columnBlockEnd = view.indexOf('const ledgerResize =', columnBlockStart)
    const columnBlock = view.slice(columnBlockStart, columnBlockEnd)
    const defaultWidths = [...columnBlock.matchAll(/defaultWidth: (\d+)/g)].map((match) => Number(match[1]))

    expect(defaultWidths).toHaveLength(12)
    expect(defaultWidths.reduce((sum, width) => sum + width, 0)).toBeLessThanOrEqual(1500)
  })

  it('keeps the mobile card header compact and separates cost labels', () => {
    const viewStart = source.indexOf('function AllocationLedgerView()')
    const viewEnd = source.indexOf('\nfunction compareSortValues', viewStart)
    const view = source.slice(viewStart, viewEnd)
    const mobileStart = view.indexOf('{/* Mobile Card List */}')
    const mobileEnd = view.indexOf('<Dialog open={selectedDetailRow != null}', mobileStart)
    const mobile = view.slice(mobileStart, mobileEnd)

    expect(mobile.indexOf('title={row.matchId}')).toBeLessThan(mobile.indexOf('formatDateDisplay(row.allocatedAt)'))
    expect(mobile.indexOf('formatDateDisplay(row.allocatedAt)')).toBeLessThan(mobile.indexOf('<TargetPill type={row.targetType}'))
    expect(mobile).toContain('min-w-0 truncate')
    expect(mobile).toContain('ต้นทุนรวม')
    expect(mobile).toContain('ต้นทุน/กก.')
    expect(mobile).not.toContain('ต้นทุน (฿/กก.)')
    const cardStart = mobile.indexOf('<div\n            key={row.id}')
    const cardOpening = mobile.slice(cardStart, mobile.indexOf('>', cardStart) + 1)

    expect(cardStart).toBeGreaterThan(-1)
    expect(cardOpening).toContain('hover:bg-slate-50')
  })

  it('uses a symmetric compact navigation row at narrow widths', () => {
    const viewStart = source.indexOf('function AllocationLedgerView()')
    const viewEnd = source.indexOf('\nfunction compareSortValues', viewStart)
    const view = source.slice(viewStart, viewEnd)

    expect(view).toContain('grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)]')
    expect(view).toContain('whitespace-nowrap px-1 text-center')
  })

  it('uses the canonical borderless dialog shell and a balanced mobile KPI grid', () => {
    const viewStart = source.indexOf('function AllocationLedgerView()')
    const viewEnd = source.indexOf('\nfunction compareSortValues', viewStart)
    const view = source.slice(viewStart, viewEnd)
    const detailsStart = source.indexOf('function LedgerMatchedCostDetails(')
    const detailsEnd = source.indexOf('\nfunction LedgerActionMenu', detailsStart)
    const details = source.slice(detailsStart, detailsEnd)

    expect(view.match(/border-0 bg-slate-900 !p-0/g)).toHaveLength(2)
    expect(view).not.toContain('border border-slate-200 bg-white p-0')
    expect(view.toLowerCase()).not.toContain('lot')
    expect(details).toContain('grid grid-cols-2')
    expect(details).toContain('col-span-2 md:col-span-1')
    expect(details).toContain('md:grid-cols-4')
    expect(details).toContain('ระบุแหล่งต้นทุนไม่ครบทุกบรรทัด')
    expect(details.toLowerCase()).not.toContain('lot')
  })
})
