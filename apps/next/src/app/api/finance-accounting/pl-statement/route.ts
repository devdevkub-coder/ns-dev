import { NextRequest, NextResponse } from 'next/server'
import { apiErrorResponse } from '@/lib/server/api-error'
import { AuthContextError, authContextErrorResponse, getCurrentAuthContext, requirePermission } from '@/lib/server/auth-context'
import { toBangkokDateOnly } from '@/lib/server/daily'
import { getFinanceBranchCodeIntersection } from '@/lib/server/finance-accounting-branch-scope'
import { buildPlStatement, FinancialStatementInputError } from '@/lib/server/finance-accounting-statements'
import { applyWorksheetTableLayout, XLSX } from '@/lib/server/xlsx'

export const runtime = 'nodejs'

function parseDateOnly(value: string | null, fallback: string, label: string) {
  const normalized = value === null ? fallback : value
  if (!/^\d{4}-\d{2}-\d{2}$/.test(normalized)) {
    throw new FinancialStatementInputError(`${label} ต้องอยู่ในรูปแบบ YYYY-MM-DD`)
  }
  const parsed = new Date(`${normalized}T00:00:00.000Z`)
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== normalized) {
    throw new FinancialStatementInputError(`${label} ไม่ถูกต้อง`)
  }
  return parsed
}

async function buildWorkbook(payload: Awaited<ReturnType<typeof buildPlStatement>>) {
  const statementRows = payload.sections.map((line) => ({
    จำนวนเงิน: line.amount,
    รายการ: line.label,
    หมวดรายงาน: line.section,
  }))
  const detailRows = payload.sections.flatMap((line) => (line.details ?? []).map((detail) => ({
    จำนวนเงิน: detail.amount,
    วันที่: detail.date,
    รายการ: line.label,
    รายละเอียด: detail.description,
    เลขที่เอกสาร: detail.refNo,
    หมวดรายงาน: line.section,
    href: detail.href ?? '',
    sourceType: detail.sourceType ?? '',
  })))
  const workbook = XLSX.utils.book_new()
  const statementSheet = XLSX.utils.json_to_sheet(statementRows, { header: ['หมวดรายงาน', 'รายการ', 'จำนวนเงิน'] })
  const detailSheet = XLSX.utils.json_to_sheet(detailRows, { header: ['หมวดรายงาน', 'รายการ', 'วันที่', 'เลขที่เอกสาร', 'รายละเอียด', 'จำนวนเงิน', 'sourceType', 'href'] })
  applyWorksheetTableLayout(statementSheet, 3, statementRows.length + 1)
  applyWorksheetTableLayout(detailSheet, 8, detailRows.length + 1)
  XLSX.utils.book_append_sheet(workbook, statementSheet, 'งบกำไรขาดทุน')
  XLSX.utils.book_append_sheet(workbook, detailSheet, 'รายละเอียด')
  return XLSX.write(workbook, { bookType: 'xlsx', type: 'buffer' })
}

function xlsxResponse(body: Buffer, filename: string) {
  const responseBody = new ArrayBuffer(body.byteLength)
  new Uint8Array(responseBody).set(body)
  return new NextResponse(responseBody, {
    headers: {
      'content-disposition': `attachment; filename="${filename}"`,
      'content-type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    },
  })
}

export async function GET(request: NextRequest) {
  try {
    const context = await getCurrentAuthContext()
    requirePermission(context, 'finance.financials.view')

    const params = request.nextUrl.searchParams
    const today = toBangkokDateOnly(new Date())
    const from = parseDateOnly(params.get('from'), `${today.slice(0, 8)}01`, 'วันที่เริ่มต้น')
    const to = parseDateOnly(params.get('to'), today, 'วันที่สิ้นสุด')
    if (from > to) throw new FinancialStatementInputError('วันที่เริ่มต้นต้องไม่เกินวันที่สิ้นสุด')
    const transactionMode = (params.get('transactionMode') || 'ALL').trim().toUpperCase()
    if (transactionMode !== 'ALL') {
      throw new FinancialStatementInputError('งบกำไรขาดทุนรองรับเฉพาะข้อมูลรวมทุกประเภทรายการ (ALL)')
    }
    const branchParam = (params.get('branchId') || '').trim()
    const branchId = branchParam && branchParam.toUpperCase() !== 'ALL' ? branchParam.toUpperCase() : undefined
    const allowedBranchCodes = getFinanceBranchCodeIntersection(context)
    if (branchId && getFinanceBranchCodeIntersection(context, branchId)?.length === 0) {
      throw new FinancialStatementInputError('ไม่มีสิทธิ์ดูข้อมูลของสาขาที่ระบุ', 403)
    }
    const payload = await buildPlStatement({
      allowedBranchCodes,
      branchId,
      from,
      to,
      transactionMode: 'ALL',
    })

    if (params.get('format') === 'xlsx') {
      return xlsxResponse(await buildWorkbook(payload), `pl-statement_${payload.filters.from}_${payload.filters.to}.xlsx`)
    }
    return NextResponse.json(payload)
  } catch (caught) {
    if (caught instanceof AuthContextError) return authContextErrorResponse(caught)
    if (caught instanceof FinancialStatementInputError) {
      return NextResponse.json({ code: caught.status === 403 ? 'FORBIDDEN' : 'BAD_REQUEST', error: caught.message }, { status: caught.status })
    }
    return apiErrorResponse(caught, 'โหลดงบกำไรขาดทุนเพื่อการบริหารไม่ได้', 500)
  }
}
