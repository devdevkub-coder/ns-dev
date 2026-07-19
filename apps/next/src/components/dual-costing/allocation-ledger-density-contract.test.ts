import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const source = readFileSync(
  fileURLToPath(new URL('./DualCostingManagementPageClient.tsx', import.meta.url)),
  'utf8',
).replaceAll('\r\n', '\n')

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
    expect(ordinaryCells).toHaveLength(15)
    ordinaryCells.forEach((cell) => {
      expect(cell).toMatch(/\bp-3\b/)
      expect(cell).not.toMatch(/\bp-2\b/)
    })
    expect(view.match(/className="p-8 text-center text-slate-500"/g)).toHaveLength(2)
  })
})
