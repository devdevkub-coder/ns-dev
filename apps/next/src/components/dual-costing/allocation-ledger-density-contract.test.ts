import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const source = readFileSync(
  fileURLToPath(new URL('./DualCostingManagementPageClient.tsx', import.meta.url)),
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
    expect(ordinaryCells).toHaveLength(16)
    ordinaryCells.forEach((cell) => {
      expect(cell).toMatch(/\bp-3\b/)
      expect(cell).not.toMatch(/\bp-2\b/)
    })
    expect(view.match(/className="p-8 text-center text-slate-500"/g)).toHaveLength(2)
  })

  it('applies the textual-column escape hatch to matching headers and body cells', () => {
    const viewStart = source.indexOf('function AllocationLedgerView()')
    const viewEnd = source.indexOf('\nfunction compareSortValues', viewStart)
    const view = source.slice(viewStart, viewEnd)
    const textualColumns = [
      ['matchId', 'title={row.matchId}'],
      ['targetType', '<TargetPill type={row.targetType}'],
      ['saleDocNo', 'title={row.saleDocNo}'],
      ['productName', 'title={row.productName}'],
      ['productCategory', '{row.productCategory}'],
      ['costPoolNo', 'title={row.costPoolNo}'],
      ['allocatedBy', 'title={row.allocatedBy}'],
      ['status', '<LedgerStatusText status={row.status}'],
    ] as const

    expect(view).toContain('className={column.className}')
    textualColumns.forEach(([key, bodyMarker]) => {
      expect(view).toMatch(new RegExp(`\\{ key: '${key}',[^\\n]*className: '${textualColumnClass}'`))
      expect(openingTableCell(view, bodyMarker)).toContain(textualColumnClass)
    })
  })

  it('opens matched-cost details from the allocated quantity without expanding the table row', () => {
    const viewStart = source.indexOf('function AllocationLedgerView()')
    const viewEnd = source.indexOf('\nfunction compareSortValues', viewStart)
    const view = source.slice(viewStart, viewEnd)

    expect(view).toContain('setSelectedDetailKey(row.targetGroupKey)')
    expect(view).toContain('onClick={() => setSelectedDetailKey(row.targetGroupKey)}')
    expect(view).toContain('onClick={(event) => event.stopPropagation()}')
    expect(view).toContain('<Dialog open={selectedDetailRow != null}')
    expect(view).toContain('<LedgerMatchedCostDetails rows={selectedDetailRows} />')
    expect(view).not.toContain('colSpan={ledgerColumns.length}>\n                        <LedgerMatchedCostDetails')
  })
})
