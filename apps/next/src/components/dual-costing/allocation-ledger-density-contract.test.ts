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
  it('keeps descriptive text left, documents and status centered, and numeric columns right', () => {
    const viewStart = source.indexOf('function WaitingAllocationsView()')
    const viewEnd = source.indexOf('\nfunction AllocationLedgerView', viewStart)
    const view = source.slice(viewStart, viewEnd)
    const textualKeys = ['customerName', 'productName', 'metalGroup'] as const
    const textualBodyMarkers = [
      "title={row.customerName === '-' ? 'ภายในโรงงาน' : row.customerName}",
      "title={row.productName || ''}",
      '{row.metalGroup}',
    ] as const
    const centeredKeys = ['docNo', 'date', 'allocationStatus', 'action'] as const
    const centeredBodyMarkers = [
      '{row.docNo}',
      '{formatDateDisplay(row.date)}',
      '<StatusPill status={row.allocationStatus}',
      '<Button asChild size="xs"',
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
    centeredKeys.forEach((key) => {
      expect(view.match(new RegExp(`\\{ key: '${key}',[^\\n]*align: 'center'`, 'g'))).toHaveLength(3)
    })
    centeredBodyMarkers.forEach((marker) => {
      const cell = openingNativeCell(view, marker)
      expect(cell).toContain('text-center')
      expect(cell).toContain('whitespace-nowrap')
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

    expect(view).toContain('setSelectedDetailMatchId(row.matchId)')
    expect(view).toContain('onClick={() => setSelectedDetailMatchId(row.matchId)}')
    expect(view).toContain('onClick={(event) => event.stopPropagation()}')
    expect(view).toContain('<Dialog open={selectedDetailRow != null}')
    expect(view).toContain('<LedgerMatchedCostDetails rows={selectedDetailRows} />')
    expect(view).not.toContain('colSpan={ledgerColumns.length}>\n                        <LedgerMatchedCostDetails')
  })

  it('groups the main ledger by match id and exposes source rows from a dropdown', () => {
    const viewStart = source.indexOf('function AllocationLedgerView()')
    const viewEnd = source.indexOf('\nfunction compareSortValues', viewStart)
    const view = source.slice(viewStart, viewEnd)

    expect(view).toContain('groupedRows = useMemo<LedgerMatchGroup[]>')
    expect(view).toContain('rowsByMatch.get(selectedDetailMatchId)')
    expect(view).toContain('const isExpanded = expandedMatchIds.has(row.matchId)')
    expect(view).toContain('รายการภายใน {row.matchId}')
    expect(view).toContain('ดูรายการ ${row.rows.length} รายการ')
  })

  it('keeps Thai-first wording, explicit units, and server-side table controls', () => {
    const viewStart = source.indexOf('function AllocationLedgerView()')
    const viewEnd = source.indexOf('\nfunction compareSortValues', viewStart)
    const view = source.slice(viewStart, viewEnd)

    expect(view).not.toContain('รายการต้นทุน')
    expect(view).not.toMatch(/\bLot\b/i)
    expect(view).toContain("label: 'น้ำหนักจัดสรร (กก.)'")
    expect(view).toContain("label: 'ต้นทุนรวม (บาท)'")
    expect(view).toContain("label: 'รายได้ (บาท)'")
    expect(view).toContain("label: 'กำไรขั้นต้น (บาท)'")
    expect(view).toContain("params.set('page', String(page))")
    expect(view).toContain("params.set('pageSize', String(pageSize))")
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
