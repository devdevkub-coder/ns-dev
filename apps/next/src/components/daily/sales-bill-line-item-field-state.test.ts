import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

function readSource(relativePath: string) {
  return readFileSync(fileURLToPath(new URL(relativePath, import.meta.url)), 'utf8').replaceAll('\r\n', '\n')
}

function tableSource(source: string, marker: string) {
  const start = source.indexOf(marker)
  const end = source.indexOf('</table>', start)

  expect(start, `missing table marker: ${marker}`).toBeGreaterThan(-1)
  expect(end, `missing closing table marker: ${marker}`).toBeGreaterThan(start)

  return source.slice(start, end)
}

function cellContaining(source: string, marker: string) {
  const markerIndex = source.indexOf(marker)
  const start = source.lastIndexOf('<td', markerIndex)
  const end = source.indexOf('</td>', markerIndex)

  expect(markerIndex, `missing cell marker: ${marker}`).toBeGreaterThan(-1)
  expect(start, `missing cell start for: ${marker}`).toBeGreaterThan(-1)
  expect(end, `missing cell end for: ${marker}`).toBeGreaterThan(start)

  return source.slice(start, end)
}

function sectionSource(source: string, startMarker: string, endMarker: string) {
  const start = source.indexOf(startMarker)
  const end = source.indexOf(endMarker, start)

  expect(start, `missing section marker: ${startMarker}`).toBeGreaterThan(-1)
  expect(end, `missing section end marker: ${endMarker}`).toBeGreaterThan(start)

  return source.slice(start, end)
}

function writableNativeControls(source: string) {
  const inputs = [...source.matchAll(/<input\b[\s\S]*?\/>/g)].map(([match]) => match)
  const textareas = [...source.matchAll(/<textarea\b[\s\S]*?(?:\/>|<\/textarea>)/g)].map(([match]) => match)

  return [...inputs, ...textareas].filter((control) => (
    control.includes('onChange=')
    && !control.includes('type="checkbox"')
    && !control.includes('type="radio"')
    && !control.includes('disabled=')
    && !control.includes('readOnly=')
  ))
}

const transactionBillsSource = readSource('./TransactionBillsPageClient.tsx')
const globalsSource = readSource('../../app/globals.css')
const stockTableSource = tableSource(transactionBillsSource, 'min-w-[1300px]')
const tradingTableSource = tableSource(transactionBillsSource, 'min-w-[1360px]')
const salesFormSource = sectionSource(transactionBillsSource, "{showSalesForm && mode === 'sales' ? (", "{detailBillDocNo && mode === 'purchase' ? (")

describe('sales bill line-item field states', () => {
  it('keeps stock-sale inputs manual while calculated cells are visibly neutral', () => {
    expect(globalsSource).toContain('background-color: var(--ns-manual-entry-bg) !important;')
    expect(stockTableSource).toContain("updateSalesStockSaleWeight(index, 'netWeight'")
    expect(stockTableSource).toContain("updateSalesStockSaleWeight(index, 'deductWeight'")
    expect(transactionBillsSource).toContain('const qty = Number(Math.max(0, next.netWeight - next.deductWeight).toFixed(2))')
    expect(stockTableSource).toContain('disabled={hasSelectedPoSell}')

    expect(cellContaining(stockTableSource, 'data-error-key={`items.${index}.qty`}')).toContain('bg-slate-50')
    expect(cellContaining(stockTableSource, 'item.qty * item.price - item.discount')).toContain('bg-slate-50')
  })

  it('lets a split WTO row select a Sales Bill label without changing its stock source product', () => {
    const splitRowStart = stockTableSource.indexOf('sales-bill-stock-display-product-search-${index}')
    const splitRow = stockTableSource.slice(splitRowStart, stockTableSource.indexOf('</div>', splitRowStart) + 6)

    expect(splitRowStart).toBeGreaterThan(-1)
    expect(splitRow).toContain('updateSalesStockProduct(index, value)')
    expect(splitRow).toContain('สินค้าที่ขาย · ตัด WTO, สต็อก และต้นทุนตาม')
    expect(splitRow).not.toContain('updateSalesSplitProduct')
  })

  it('keeps the Trading table column order and field states unambiguous', () => {
    const sourceLabelIndex = tradingTableSource.indexOf('{sourceLabel}</div>')
    const referenceIndex = tradingTableSource.indexOf('inputId={`sales-bill-manual-po-sell-${index}`}')
    const unitCostIndex = tradingTableSource.indexOf('wtoSourceSummary?.unitCostSnapshot == null')

    expect(sourceLabelIndex).toBeGreaterThan(-1)
    expect(referenceIndex).toBeGreaterThan(sourceLabelIndex)
    expect(unitCostIndex).toBeGreaterThan(referenceIndex)
    expect((tradingTableSource.match(/wtoSourceSummary\?\.unitCostSnapshot == null/g) ?? [])).toHaveLength(1)
    expect(tradingTableSource).toContain("updateSalesItemWeights(index, 'grossWeight'")
    expect(tradingTableSource).toContain("updateSalesItemWeights(index, 'deductWeight'")
    expect(tradingTableSource).toContain('disabled={hasSelectedPoSell}')

    expect(cellContaining(tradingTableSource, 'data-error-key={`items.${index}.qty`}')).toContain('bg-slate-50')
    expect(cellContaining(tradingTableSource, 'item.qty * item.price))')).toContain('bg-slate-50')
  })

  it('keeps every writable Sales Bill field visibly yellow without turning system-owned surfaces yellow', () => {
    const globalFallbackStart = globalsSource.indexOf('/* Global fallback: active pages without an explicit scope still follow the same editable-field contract. */')
    const globalFallbackEnd = globalsSource.indexOf('/* Validation errors override manual-entry yellow with a red field surface. */', globalFallbackStart)
    const globalFallback = globalsSource.slice(globalFallbackStart, globalFallbackEnd)
    const writableControls = writableNativeControls(salesFormSource)

    expect(salesFormSource).toContain('data-ns-field-scope="entry"')
    expect(globalFallbackStart).toBeGreaterThan(-1)
    expect(globalFallbackEnd).toBeGreaterThan(globalFallbackStart)
    expect(globalFallback).toContain('input:not([type="checkbox"])')
    expect(globalFallback).toContain('select')
    expect(globalFallback).toContain('textarea')
    expect(globalFallback).toContain('[role="combobox"]')
    expect(globalFallback).toContain('background-color: var(--ns-manual-entry-bg) !important;')

    expect(writableControls).toHaveLength(5)
    for (const control of writableControls) {
      expect(control).toContain('bg-[var(--ns-manual-entry-bg)]')
      expect(control).not.toContain('bg-white')
    }

    expect(transactionBillsSource).toContain("className={`w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none transition-colors ${cancelNoteError ? 'bg-red-50' : 'bg-[var(--ns-manual-entry-bg)]'}`}")
    expect(transactionBillsSource).toContain('className="min-h-20 w-full rounded-md border border-slate-300 bg-[var(--ns-manual-entry-bg)] px-3 py-2 text-sm"')
    expect(transactionBillsSource).toContain("disabled={hasSelectedPoSell}")
    expect(cellContaining(stockTableSource, 'formatMoney(item.qty)')).toContain('bg-slate-50')
    expect(cellContaining(tradingTableSource, 'item.qty * item.price))')).toContain('bg-slate-50')
  })
})
