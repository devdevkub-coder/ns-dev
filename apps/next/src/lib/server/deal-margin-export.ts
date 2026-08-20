import { applyWorksheetTableLayout, XLSX } from '@/lib/server/xlsx'
import type { UnlinkedDealMarginAllocation } from './deal-margin-allocation'

export type DealMarginExportRow = {
  allocationNo: string
  avgCost: number
  channel: string
  customer: string
  date: string
  docNo: string
  margin: number
  marginPct: number
  matchedCost: number
  matchedQty: number
  product: string
  sellQty: number
  statusMatch: 'Fully' | 'None' | 'Partial'
  totalRevenue: number
  unitPrice: number
}

export async function buildDealMarginWorkbook(rows: DealMarginExportRow[], unlinkedAllocations: UnlinkedDealMarginAllocation[] = []) {
  const workbook = XLSX.utils.book_new()
  const dataRows = rows.map((row) => ({
    AllocationNo: row.allocationNo,
    AvgCost: row.avgCost,
    Channel: row.channel,
    Customer: row.customer,
    Date: row.date,
    DealNo: row.docNo,
    Margin: row.margin,
    MarginPct: row.marginPct,
    MatchedCost: row.matchedCost,
    MatchedQty: row.matchedQty,
    Product: row.product,
    Revenue: row.totalRevenue,
    SellQty: row.sellQty,
    StatusMatch: row.statusMatch,
    UnitPrice: row.unitPrice,
  }))
  const sheet = XLSX.utils.json_to_sheet(dataRows)
  const headers = dataRows[0] ? Object.keys(dataRows[0]) : []
  sheet['!cols'] = headers.map((header) => ({ wch: Math.max(12, String(header).length + 4) }))
  applyWorksheetTableLayout(sheet, headers.length, rows.length + 1)
  XLSX.utils.book_append_sheet(workbook, sheet, 'Deal Margin')

  const unlinkedRows = unlinkedAllocations.map((allocation) => ({
    AllocationNo: allocation.allocationNo,
    MatchedCost: allocation.matchedCost,
    MatchedQty: allocation.matchedQty,
    SalesBill: allocation.salesDocNo ?? '-',
    Status: 'รอผูก Sales Line',
  }))
  const unlinkedSheet = XLSX.utils.json_to_sheet(unlinkedRows)
  const unlinkedHeaders = unlinkedRows[0] ? Object.keys(unlinkedRows[0]) : []
  unlinkedSheet['!cols'] = unlinkedHeaders.map((header) => ({ wch: Math.max(12, String(header).length + 4) }))
  applyWorksheetTableLayout(unlinkedSheet, unlinkedHeaders.length, unlinkedRows.length + 1)
  XLSX.utils.book_append_sheet(workbook, unlinkedSheet, 'Unlinked Allocations')
  return XLSX.write(workbook, { bookType: 'xlsx', type: 'buffer' })
}
