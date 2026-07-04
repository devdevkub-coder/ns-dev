import { NextRequest, NextResponse } from 'next/server'
import { apiErrorResponse } from '@/lib/server/api-error'
import { AuthContextError, authContextErrorResponse, getCurrentAuthContext, requirePermission } from '@/lib/server/auth-context'
import { buildTaxVatWht } from '@/lib/server/finance-accounting-tax'
import { applyWorksheetTableLayout, XLSX } from '@/lib/server/xlsx'

export const runtime = 'nodejs'

type TaxPayload = Awaited<ReturnType<typeof buildTaxVatWht>>
type SheetRow = Record<string, string | number | boolean | null | undefined>

function parseIntParam(value: string | null, fallback: number) {
  if (!value) return fallback
  const parsed = Number.parseInt(value, 10)
  return Number.isFinite(parsed) ? parsed : fallback
}

function appendSheet(workbook: ReturnType<typeof XLSX.utils.book_new>, sheetName: string, rows: SheetRow[], headers: string[]) {
  const sheet = XLSX.utils.json_to_sheet(rows, { header: headers })
  sheet['!cols'] = headers.map((header) => ({ wch: Math.max(12, header.length + 6) }))
  applyWorksheetTableLayout(sheet, headers.length, rows.length + 1)
  XLSX.utils.book_append_sheet(workbook, sheet, sheetName)
}

function taxRows(items: TaxPayload['vatInput']['items'], valueHeader: 'VAT' | 'WHT') {
  return items.map((item) => ({
    Link: item.sourceHref ?? '',
    Source: item.source,
    [valueHeader]: valueHeader === 'VAT' ? item.vat ?? 0 : item.wht ?? 0,
    กรณีขาดเกิน60วัน: item.agedMissingDoc ? 'ใช่' : '',
    คำเตือน: item.warning ?? '',
    คู่ค้า: item.party,
    ฐาน: item.base,
    วันที่: item.date,
    อายุเอกสารวัน: item.documentAgeDays ?? '',
    เลขที่: item.no,
    เอกสารภาษี: item.hasDoc === undefined ? '' : item.hasDoc ? 'ครบ' : 'ขาด',
  }))
}

async function buildWorkbook(payload: TaxPayload) {
  const workbook = XLSX.utils.book_new()
  const opening = payload.openingBalance
  appendSheet(workbook, 'Summary', [
    { ค่า: `${payload.filters.year}-${payload.filters.month}`, หัวข้อ: 'งวด' },
    { ค่า: payload.filters.branchId, หัวข้อ: 'สาขา' },
    { ค่า: payload.summary.vatOut, หัวข้อ: 'VAT ขาย' },
    { ค่า: payload.summary.vatIn, หัวข้อ: 'VAT ซื้อ' },
    { ค่า: payload.summary.vatPayableBeforeOpening, หัวข้อ: 'VAT Payable ก่อนยอดยกมา' },
    { ค่า: payload.summary.vatOutputAccrued, หัวข้อ: 'VAT ขายยกมา' },
    { ค่า: payload.summary.vatInputCredit, หัวข้อ: 'VAT ซื้อเครดิตยกมา' },
    { ค่า: payload.summary.vatPayable, หัวข้อ: 'VAT Payable สุทธิ' },
    { ค่า: payload.summary.whtChargedBeforeOpening, หัวข้อ: 'WHT เราหักไว้ก่อนยอดยกมา' },
    { ค่า: payload.summary.whtPayableCarried, หัวข้อ: 'WHT นำส่งยกมา' },
    { ค่า: payload.summary.whtChargedNet, หัวข้อ: 'WHT เราหักไว้สุทธิ' },
    { ค่า: payload.summary.whtWithheldBeforeOpening, หัวข้อ: 'WHT ถูกหักก่อนยอดยกมา' },
    { ค่า: payload.summary.whtCreditCarried, หัวข้อ: 'WHT เครดิตยกมา' },
    { ค่า: payload.summary.whtWithheldNet, หัวข้อ: 'WHT ถูกหักสุทธิ' },
    { ค่า: payload.summary.missingCount, หัวข้อ: 'เอกสารภาษีไม่ครบ' },
    { ค่า: payload.summary.agedMissingCount, หัวข้อ: 'เอกสารขาดเกิน 60 วัน' },
    { ค่า: opening.applied ? 'ใช่' : 'ไม่ใช่', หัวข้อ: 'รวมยอดยกมาในงวดนี้' },
    { ค่า: opening.reason, หัวข้อ: 'เหตุผลยอดยกมา' },
    { ค่า: opening.goLiveDate, หัวข้อ: 'Go-live date' },
    { ค่า: opening.cutoffDate, หัวข้อ: 'Cutoff date' },
  ], ['หัวข้อ', 'ค่า'])
  appendSheet(workbook, 'VAT Output', taxRows(payload.vatOutput.items, 'VAT'), ['วันที่', 'เลขที่', 'คู่ค้า', 'ฐาน', 'VAT', 'Source', 'Link'])
  appendSheet(workbook, 'VAT Input', taxRows(payload.vatInput.items, 'VAT'), ['วันที่', 'เลขที่', 'คู่ค้า', 'ฐาน', 'VAT', 'เอกสารภาษี', 'อายุเอกสารวัน', 'กรณีขาดเกิน60วัน', 'คำเตือน', 'Source', 'Link'])
  appendSheet(workbook, 'WHT Charged', taxRows(payload.whtCharged.items, 'WHT'), ['วันที่', 'เลขที่', 'คู่ค้า', 'ฐาน', 'WHT', 'Source', 'Link'])
  appendSheet(workbook, 'WHT Withheld', taxRows(payload.whtWithheld.items, 'WHT'), ['วันที่', 'เลขที่', 'คู่ค้า', 'ฐาน', 'WHT', 'Source', 'Link'])
  appendSheet(workbook, 'Tax Calendar', payload.taxCalendar.map((row) => ({
    VATDue: row.vatDue,
    VATPayable: row.vatPayable,
    VATขาย: row.vOut,
    VATซื้อ: row.vIn,
    WHTDue: row.whtDue,
    WHTถูกหัก: row.wW,
    WHTหักไว้: row.wC,
    งวด: row.periodLabel,
  })), ['งวด', 'VATขาย', 'VATซื้อ', 'VATPayable', 'VATDue', 'WHTหักไว้', 'WHTถูกหัก', 'WHTDue'])
  return XLSX.write(workbook, { bookType: 'xlsx', type: 'buffer' })
}

function xlsxResponse(body: Buffer, filename: string) {
  return new Response(new Uint8Array(body), {
    headers: {
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    },
  })
}

export async function GET(request: NextRequest) {
  try {
    const context = await getCurrentAuthContext()
    requirePermission(context, 'finance.financials.view')

    const now = new Date()
    const params = request.nextUrl.searchParams
    const month = Math.min(12, Math.max(1, parseIntParam(params.get('month'), now.getMonth() + 1)))
    const year = parseIntParam(params.get('year'), now.getFullYear())
    const payload = await buildTaxVatWht({
      branchId: params.get('branchId') || undefined,
      month,
      year,
    })

    if (params.get('format') === 'xlsx') {
      return xlsxResponse(await buildWorkbook(payload), `tax_vat_wht_${year}_${String(month).padStart(2, '0')}.xlsx`)
    }

    return NextResponse.json(payload)
  } catch (caught) {
    if (caught instanceof AuthContextError) return authContextErrorResponse(caught)
    return apiErrorResponse(caught, 'โหลด Tax / VAT / WHT ไม่ได้', 500)
  }
}
