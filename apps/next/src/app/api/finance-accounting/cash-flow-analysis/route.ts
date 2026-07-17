import { NextResponse } from 'next/server'
import { apiErrorResponse } from '@/lib/server/api-error'
import { AuthContextError, authContextErrorResponse, getCurrentAuthContext, requirePermission } from '@/lib/server/auth-context'
import { buildCashFlowAnalysis, CashFlowValidationError, type AnalysisFilter } from '@/lib/server/finance-accounting-cashflow-planning'
import { toBangkokDateOnly } from '@/lib/server/daily'
import { getFinanceBranchCodeIntersection } from '@/lib/server/finance-accounting-branch-scope'
import { applyWorksheetTableLayout, XLSX } from '@/lib/server/xlsx'

export const runtime = 'nodejs'

const XLSX_CONTENT_TYPE = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'

function parseDateOnly(value: string | null, fallback: string, label: string) {
  const dateOnly = value === null ? fallback : value
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateOnly)) throw new CashFlowValidationError(`${label} ต้องเป็นรูปแบบ YYYY-MM-DD`)
  const parsed = new Date(`${dateOnly}T00:00:00.000Z`)
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== dateOnly) {
    throw new CashFlowValidationError(`${label} ไม่ถูกต้อง`)
  }
  return parsed
}

function parseFilter(url: URL, now = new Date()): AnalysisFilter {
  const today = toBangkokDateOnly(now)
  const from = parseDateOnly(url.searchParams.get('from'), `${today.slice(0, 7)}-01`, 'วันที่เริ่มต้น')
  const to = parseDateOnly(url.searchParams.get('to'), today, 'วันที่สิ้นสุด')
  if (from > to) throw new CashFlowValidationError('วันที่เริ่มต้นต้องไม่เกินวันที่สิ้นสุด')
  const requestedBranch = url.searchParams.get('branchId')?.trim()
  return {
    branchId: requestedBranch && requestedBranch.toUpperCase() !== 'ALL' ? requestedBranch.toUpperCase() : undefined,
    from,
    to,
  }
}

type CashFlowPayload = Awaited<ReturnType<typeof buildCashFlowAnalysis>>

async function buildWorkbook(payload: CashFlowPayload) {
  const workbook = XLSX.utils.book_new()
  const summaryRows = payload.detailRows.map((row) => ({
    'รายการ': row.label,
    'มูลค่า': row.value,
    'หน่วย': row.suffix ?? '',
    'แหล่งข้อมูล': row.href,
  }))
  const projectionRows = payload.charts.projection.map((row) => ({
    'ช่วงเวลา': row.label,
    'เงินรับคาดการณ์': row.expectedIn,
    'เงินจ่ายคาดการณ์': row.expectedOut,
    'เงินสดคาดการณ์ (THB)': row.projected,
  }))
  const fcdRows = payload.fcdBalances.map((row) => ({ 'สกุลเงิน': row.currency, 'ยอดยกมา FCD': row.value }))
  const sheets = [
    { name: 'สรุป', rows: summaryRows, headers: ['รายการ', 'มูลค่า', 'หน่วย', 'แหล่งข้อมูล'] },
    { name: 'ประมาณการ', rows: projectionRows, headers: ['ช่วงเวลา', 'เงินรับคาดการณ์', 'เงินจ่ายคาดการณ์', 'เงินสดคาดการณ์ (THB)'] },
    { name: 'FCD', rows: fcdRows, headers: ['สกุลเงิน', 'ยอดยกมา FCD'] },
  ]

  for (const item of sheets) {
    const sheet = XLSX.utils.json_to_sheet(item.rows, { header: item.headers })
    sheet['!cols'] = item.headers.map((header) => ({ wch: Math.max(14, header.length + 4) }))
    applyWorksheetTableLayout(sheet, item.headers.length, item.rows.length + 1)
    XLSX.utils.book_append_sheet(workbook, sheet, item.name)
  }
  return XLSX.write(workbook, { bookType: 'xlsx', type: 'buffer' })
}

function xlsxResponse(body: Buffer, payload: CashFlowPayload) {
  const branch = payload.filters.branchId.replace(/[^A-Za-z0-9_-]/g, '_')
  const filename = `cash-flow-analysis_${branch}_${payload.filters.from}_${payload.filters.to}.xlsx`
  return new Response(new Uint8Array(body), {
    headers: {
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Content-Type': XLSX_CONTENT_TYPE,
    },
  })
}

export async function GET(request: Request) {
  try {
    const context = await getCurrentAuthContext()
    requirePermission(context, 'finance.financials.view')

    const url = new URL(request.url)
    const filter = parseFilter(url)
    const allowedBranchCodes = getFinanceBranchCodeIntersection(context)
    if (filter.branchId && getFinanceBranchCodeIntersection(context, filter.branchId)?.length === 0) {
      return apiErrorResponse(new Error('ไม่มีสิทธิ์ดูข้อมูลของสาขาที่ระบุ'), 'ไม่มีสิทธิ์ดูข้อมูลของสาขาที่ระบุ', 403)
    }
    const payload = await buildCashFlowAnalysis({ ...filter, allowedBranchCodes })
    if (url.searchParams.get('format') === 'xlsx') return xlsxResponse(await buildWorkbook(payload), payload)
    return NextResponse.json(payload)
  } catch (caught) {
    if (caught instanceof AuthContextError) return authContextErrorResponse(caught)
    if (caught instanceof CashFlowValidationError) return apiErrorResponse(caught, caught.message, caught.status)
    return apiErrorResponse(caught, 'โหลด Cash Flow Analysis ไม่ได้', 500)
  }
}
