import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

const source = (relativePath: string) => readFileSync(fileURLToPath(new URL(relativePath, import.meta.url)), 'utf8')

function openingButton(sourceText: string, marker: string) {
  const markerIndex = sourceText.indexOf(marker)
  const buttonStart = sourceText.lastIndexOf('<button', markerIndex)
  const buttonEnd = sourceText.indexOf('>', buttonStart)

  expect(markerIndex, marker).toBeGreaterThan(-1)
  expect(buttonStart, marker).toBeGreaterThan(-1)
  expect(buttonEnd, marker).toBeGreaterThan(buttonStart)
  return sourceText.slice(buttonStart, buttonEnd + 1)
}

describe('shared blue focus contract', () => {
  it('keeps shared list controls in the blue focus family', () => {
    const button = source('./Button.tsx')
    const segmentedFilter = source('./SegmentedFilterButton.tsx')
    const pageSizeDropdown = source('./PageSizeDropdown.tsx')
    const resizableTableHead = source('./ResizableTableHead.tsx')

    expect(button).toContain('focus-visible:ring-blue-500')
    expect(button).not.toMatch(/focus-visible:ring-(?:slate|neutral|emerald|red)/)

    expect(segmentedFilter).toContain('focus-visible:border-blue-500')
    expect(segmentedFilter).toContain('focus-visible:ring-blue-500/30')
    expect(segmentedFilter).not.toContain('focus-visible:ring-neutral-500')

    expect(pageSizeDropdown).toContain('focus-visible:border-blue-500')
    expect(pageSizeDropdown).toContain('focus-visible:ring-blue-500/30')
    expect(pageSizeDropdown).not.toContain('focus-visible:ring-slate-400')

    expect(resizableTableHead).toContain('focus-visible:ring-blue-500/40')
    expect(resizableTableHead).toContain('focus-visible:ring-blue-500/60')
    expect(resizableTableHead).toContain('group-focus-visible:bg-blue-500')
  })

  it('does not reintroduce a slate focus override in Allocation Ledger controls', () => {
    const ledger = source('../dual-costing/DualCostingManagementPageClient.tsx')
    const viewStart = ledger.indexOf('function AllocationLedgerView()')
    const viewEnd = ledger.indexOf('\nfunction compareSortValues', viewStart)
    const view = ledger.slice(viewStart, viewEnd)
    const expectedMobileFocus = 'focus-visible:ring-blue-500 focus-visible:ring-offset-2'

    expect(viewStart).toBeGreaterThan(-1)
    expect(viewEnd).toBeGreaterThan(viewStart)
    expect(view).not.toContain('focus-visible:ring-slate-100')
    expect(view).not.toContain('focus-visible:ring-emerald-100')
    expect(view).not.toContain('focus-visible:ring-red-500')
    expect(view).not.toMatch(/focus-visible:(?:ring|border)-(?:slate|neutral|emerald|red)/)
    expect(openingButton(view, 'onClick={openMobileLedgerFilters}')).toContain(expectedMobileFocus)
    expect(openingButton(view, 'onClick={() => setMobileFilters')).toContain(expectedMobileFocus)
    expect(openingButton(view, 'onClick={applyMobileLedgerFilters}')).toContain(expectedMobileFocus)
  })
})
