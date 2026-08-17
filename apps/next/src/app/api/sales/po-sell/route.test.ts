import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const routeSource = readFileSync(new URL('./route.ts', import.meta.url), 'utf8').replaceAll('\r\n', '\n')

describe('PO Sell price-lock date API contract', () => {
  it('uses po_sells.date for business-date filtering, ordering, and response mapping', () => {
    expect(routeSource).toContain('function priceLockDateRange(')
    expect(routeSource).toContain('const priceLockDateWhere = priceLockDateRange(from, to)')
    expect(routeSource).toContain('...(priceLockDateWhere ? { date: priceLockDateWhere } : {}),')
    expect(routeSource).toContain("orderBy: [{ date: 'desc' }, { doc_no: 'desc' }]")
    expect(routeSource).toContain('priceLockDate: toDateOnly(po.date)')
    expect(routeSource).toContain('PriceLockDate: row.priceLockDate')
    expect(routeSource).toContain("updatedAt: po.updated_at?.toISOString() ?? po.created_at?.toISOString() ?? ''")
    expect(routeSource).not.toContain('updatedAt: po.updated_at?.toISOString() ?? po.created_at?.toISOString() ?? po.date.toISOString()')
  })

  it('keeps creation audit time separate from the selected price-lock date on create', () => {
    const postSource = routeSource.slice(routeSource.indexOf('export async function POST'))

    expect(postSource).toContain('const createdAt = new Date()')
    expect(postSource).toContain('const priceLockDate = normalizeDate(values.priceLockDate)')
    expect(postSource).toContain('activeVatRatePercent(priceLockDate)')
    expect(postSource).toContain('nextPoSellDocNo(tx, priceLockDate, branch.code)')
    expect(postSource).toContain('created_at: createdAt')
    expect(postSource).toContain('date: priceLockDate')
  })

  it('updates only the business date while preserving created_at on edit', () => {
    const patchSource = routeSource.slice(routeSource.indexOf('export async function PATCH'))
    const updateDataSource = patchSource.slice(patchSource.lastIndexOf('await prisma.po_sells.update({'))

    expect(patchSource).toContain('const priceLockDate = normalizeDate(values.priceLockDate)')
    expect(patchSource).toContain('activeVatRatePercent(priceLockDate)')
    expect(updateDataSource).toContain('date: priceLockDate')
    expect(updateDataSource).not.toContain('created_at:')
  })
})
