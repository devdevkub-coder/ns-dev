import { NextResponse } from 'next/server'
import { apiErrorResponse } from '@/lib/server/api-error'
import { AuthContextError, authContextErrorResponse, getCurrentAuthContext, requirePermission } from '@/lib/server/auth-context'
import { getAllowedBranchIds } from '@/lib/server/branch-scope'
import { loadProductionMetrics, summarizeProductionMetrics, summarizeProductionOutputProducts } from '@/lib/server/production-reports'
import { applyWorksheetTableLayout, XLSX } from '@/lib/server/xlsx'

export const runtime = 'nodejs'

type ProductionMetricRow = Awaited<ReturnType<typeof loadProductionMetrics>>[number]

function productionReportSearchText(row: ProductionMetricRow) {
  return `${row.docNo} ${row.productName} ${row.productCode} ${row.inputProducts} ${row.productionType} ${row.machineName} ${row.branchName}`.toLowerCase()
}

async function buildProductionReportWorkbook(rows: ProductionMetricRow[]) {
  const workbookRows = rows.map((row) => ({
    เลขที่ใบสั่งผลิต: row.docNo,
    วันที่สร้าง: row.date,
    ประเภทเครื่องจักร: row.productionType,
    สินค้าที่เบิกผลิต: row.inputProducts,
    เครื่องจักร: row.machineName,
    สถานะ: row.status,
    Input: row.inputQty,
    Output: row.outputQty,
    WIP: row.wipQty,
    Loss: row.lossQty,
    Yield: row.yieldPct,
    RM: row.inputCost,
    Process: row.processCost,
    ต้นทุนรวม: row.totalCost,
    'Loss Value (บาท)': row.lossValue,
    'RM บาท/กก.': row.rmCostPerKg,
    'ต้นทุนผลิต บาท/กก.': row.productionCostPerKg,
  }))
  const workbook = XLSX.utils.book_new()
  const sheet = XLSX.utils.json_to_sheet(workbookRows)
  const headers = workbookRows[0] ? Object.keys(workbookRows[0]) : []
  sheet['!cols'] = headers.map((header) => ({ wch: Math.max(12, header.length + 4) }))
  applyWorksheetTableLayout(sheet, headers.length, workbookRows.length + 1)
  XLSX.utils.book_append_sheet(workbook, sheet, 'Production Yield')
  return XLSX.write(workbook, { bookType: 'xlsx', type: 'buffer' })
}

function xlsxResponse(body: Buffer, filename: string) {
  return new Response(new Uint8Array(body), {
    headers: {
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Cache-Control': 'private, no-store',
    },
  })
}

export async function GET(request: Request) {
  try {
    const context = await getCurrentAuthContext()
    requirePermission(context, 'production.reports.view')
    const url = new URL(request.url)
    const allowedBranchIds = await getAllowedBranchIds(context)
    const rows = await loadProductionMetrics({
      allowedBranchIds,
      branchId: url.searchParams.get('branchId') || undefined,
      dateFrom: url.searchParams.get('dateFrom') || undefined,
      dateTo: url.searchParams.get('dateTo') || undefined,
      machineId: url.searchParams.get('machineId') || undefined,
      status: url.searchParams.get('status') || undefined,
    })
    if (url.searchParams.get('format') === 'xlsx') {
      const query = url.searchParams.get('q')?.trim().toLowerCase() ?? ''
      const exportRows = query ? rows.filter((row) => productionReportSearchText(row).includes(query)) : rows
      return xlsxResponse(await buildProductionReportWorkbook(exportRows), `production_report_${new Date().toISOString().slice(0, 10)}.xlsx`)
    }
    return NextResponse.json({
      productSummary: summarizeProductionOutputProducts(rows),
      rows,
      summary: summarizeProductionMetrics(rows),
      wipRows: rows.filter((row) => row.wipQty > 0.000001),
    }, { headers: { 'Cache-Control': 'private, no-store' } })
  } catch (caught) {
    if (caught instanceof AuthContextError) return authContextErrorResponse(caught)
    return apiErrorResponse(caught, 'โหลดรายงานการผลิตไม่ได้', 500)
  }
}
