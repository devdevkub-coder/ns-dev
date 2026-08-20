import { describe, expect, it } from 'vitest'
import { XLSX } from '@/lib/server/xlsx'
import type { UnlinkedDealMarginAllocation } from './deal-margin-allocation'
import { buildDealMarginWorkbook, type DealMarginExportRow } from './deal-margin-export'

function dealRow(overrides: Partial<DealMarginExportRow> = {}): DealMarginExportRow {
  return {
    allocationNo: 'ALLOC-001',
    avgCost: 10,
    channel: 'Trading Deal',
    customer: 'ลูกค้าทดสอบ',
    date: '2026-08-19',
    docNo: 'PO-001',
    margin: 100,
    marginPct: 20,
    matchedCost: 400,
    matchedQty: 40,
    product: 'Copper',
    sellQty: 40,
    statusMatch: 'Fully',
    totalRevenue: 500,
    unitPrice: 12.5,
    ...overrides,
  }
}

describe('deal margin Excel export', () => {
  it('exports Allocation No alongside duplicate Deal No values', async () => {
    const workbook = await XLSX.read(await buildDealMarginWorkbook([
      dealRow({ allocationNo: 'ALLOC-001' }),
      dealRow({ allocationNo: 'ALLOC-002' }),
    ]))
    const rows = workbook.Sheets['Deal Margin'].rows

    expect(rows[0]).toContain('AllocationNo')
    expect(rows.slice(1).map((row) => row[0])).toEqual(['ALLOC-001', 'ALLOC-002'])
    expect(rows.slice(1).map((row) => row[5])).toEqual(['PO-001', 'PO-001'])
  })

  it('exports unlinked allocations on a separate sheet', async () => {
    const unlinked: UnlinkedDealMarginAllocation[] = [{
      allocationNo: 'ALLOC-003',
      billKey: 'BILL-001',
      salesDocNo: 'PO-001',
      date: '2026-08-19',
      channel: 'Trading Deal',
      matchedCost: 250,
      matchedQty: 25,
    }]
    const workbook = await XLSX.read(await buildDealMarginWorkbook([], unlinked))

    expect(workbook.SheetNames).toEqual(['Deal Margin', 'Unlinked Allocations'])
    expect(workbook.Sheets['Unlinked Allocations'].rows[0]).toContain('AllocationNo')
    expect(workbook.Sheets['Unlinked Allocations'].rows[1]).toContain('ALLOC-003')
    expect(workbook.Sheets['Unlinked Allocations'].rows[1]).toContain('รอผูก Sales Line')
  })
})
