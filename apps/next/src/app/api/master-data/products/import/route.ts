import { NextResponse } from 'next/server'
import { type WorkBook, XLSX } from '@/lib/server/xlsx'
import { productFormSchema } from '@/lib/product'
import { toProductWriteInput } from '@/lib/domain/product'
import { apiErrorResponse } from '@/lib/server/api-error'
import { AuthContextError, authContextErrorResponse, getCurrentAuthContext, requirePermission } from '@/lib/server/auth-context'
import { prisma } from '@/lib/server/prisma'

export const runtime = 'nodejs'

const IMPORT_LIMIT = 10000
const MAX_FILE_SIZE = 10 * 1024 * 1024

const headerMap = {
  active: ['สถานะ', 'active'],
  code: ['รหัสสินค้า', 'code'],
  name: ['ชื่อสินค้า', 'name'],
  type: ['ประเภทสินค้า', 'ประเภท', 'type'],
  unit: ['หน่วย', 'unit'],
} as const

type ImportField = keyof typeof headerMap
type ImportRow = Record<string, unknown>

function normalizeHeader(value: string) {
  return value.trim().toLowerCase().replace(/\s+/g, '')
}

function getCell(row: ImportRow, field: ImportField) {
  for (const label of headerMap[field]) {
    if (label in row) return row[label]
    const matchedKey = Object.keys(row).find((key) => normalizeHeader(key) === normalizeHeader(label))
    if (matchedKey) return row[matchedKey]
  }
  return ''
}

function cellText(row: ImportRow, field: ImportField) {
  const value = getCell(row, field)
  if (value === null || value === undefined) return ''
  if (value instanceof Date) return value.toISOString()
  return String(value).trim()
}

function normalizeActive(value: string) {
  const normalized = value.trim().toLowerCase()
  if (!normalized) return true
  if (['ปิด', 'inactive', 'false', '0', 'no', 'n'].includes(normalized)) return false
  return true
}

function normalizeProductCode(value: string) {
  return value.trim().toUpperCase()
}

async function nextProductCodeSequence(blankCodeCount: number) {
  if (blankCodeCount === 0) return []
  const existingProducts = await prisma.products.findMany({
    select: { code: true },
    where: { code: { startsWith: 'SKU' } },
  })
  const maxNumber = existingProducts.reduce((max, row) => {
    const matched = String(row.code ?? '').match(/^SKU(\d+)$/i)
    const value = matched ? Number(matched[1]) : 0
    return Number.isFinite(value) ? Math.max(max, value) : max
  }, 0)
  const startNumber = maxNumber + 1
  return Array.from({ length: blankCodeCount }, (_, index) => `SKU${String(startNumber + index).padStart(3, '0')}`)
}

function findProductSheet(workbook: WorkBook) {
  const namedSheet = workbook.Sheets['สินค้า']
  if (namedSheet) return namedSheet

  return workbook.SheetNames.map((name) => workbook.Sheets[name]).find((sheet) => {
    const rows = XLSX.utils.sheet_to_json<string[]>(sheet, { header: 1, blankrows: false })
    return rows.some((row) => row.map(String).includes('รหัสสินค้า'))
  })
}

function parseRows(workbook: WorkBook) {
  const sheet = findProductSheet(workbook)
  if (!sheet) throw new Error('ไม่พบ sheet สินค้า หรือ header รหัสสินค้า')
  return XLSX.utils.sheet_to_json<ImportRow>(sheet, { defval: '' })
}

function firstIssueMessage(rowNumber: number, message: string) {
  return `แถว ${rowNumber}: ${message}`
}

async function assertActiveProductType(name: string | null) {
  if (!name) return

  const productType = await prisma.product_types.findFirst({
    select: { id: true },
    where: { active: true, name },
  })

  if (!productType) throw new Error(`ประเภทสินค้า "${name}" ไม่ถูกต้องหรือถูกปิดใช้งาน`)
}

async function assertActiveProductUnit(unit: string | null) {
  if (!unit) return

  const productUnit = await prisma.product_units.findFirst({
    select: { id: true },
    where: {
      active: true,
      OR: [
        { name: unit },
        { symbol: unit },
      ],
    },
  })

  if (!productUnit) throw new Error(`หน่วยสินค้า "${unit}" ไม่ถูกต้องหรือถูกปิดใช้งาน`)
}

export async function POST(request: Request) {
  try {
    const context = await getCurrentAuthContext()
    requirePermission(context, 'master.products.create')

    const form = await request.formData()
    const file = form.get('file')
    if (!(file instanceof File)) {
      return NextResponse.json({ code: 'BAD_REQUEST', error: 'เลือกไฟล์ Excel ก่อน import' }, { status: 400 })
    }
    if (!file.name.toLowerCase().endsWith('.xlsx')) {
      return NextResponse.json({ code: 'BAD_REQUEST', error: 'รองรับเฉพาะไฟล์ .xlsx' }, { status: 400 })
    }
    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json({ code: 'BAD_REQUEST', error: 'ไฟล์ Excel ต้องไม่เกิน 10 MB' }, { status: 400 })
    }

    let rows: ImportRow[]
    try {
      const workbook = await XLSX.read(Buffer.from(await file.arrayBuffer()))
      rows = parseRows(workbook).filter((row) => Object.values(row).some((value) => String(value ?? '').trim()))
    } catch (caught) {
      return NextResponse.json({
        code: 'BAD_REQUEST',
        error: caught instanceof Error ? caught.message : 'อ่านไฟล์ Excel ไม่สำเร็จ',
      }, { status: 400 })
    }
    if (rows.length === 0) {
      return NextResponse.json({ code: 'BAD_REQUEST', error: 'ไม่พบข้อมูลสินค้าในไฟล์' }, { status: 400 })
    }
    if (rows.length > IMPORT_LIMIT) {
      return NextResponse.json({ code: 'BAD_REQUEST', error: `Import ได้สูงสุด ${IMPORT_LIMIT.toLocaleString('th-TH')} แถวต่อครั้ง` }, { status: 400 })
    }

    const blankCodeRows = rows.filter((row) => !cellText(row, 'code')).length
    const generatedCodes = await nextProductCodeSequence(blankCodeRows)
    let generatedCodeIndex = 0
    const issues: string[] = []
    const seenCodes = new Set<string>()
    const parsedRows = rows.map((row, index) => {
      const rowNumber = index + 2
      const rawCode = cellText(row, 'code')
      const code = rawCode ? normalizeProductCode(rawCode) : generatedCodes[generatedCodeIndex] ?? ''
      if (!rawCode) generatedCodeIndex += 1
      if (code && seenCodes.has(code)) issues.push(firstIssueMessage(rowNumber, `รหัสสินค้า ${code} ซ้ำในไฟล์`))
      if (code) seenCodes.add(code)

      const values = {
        code,
        name: cellText(row, 'name'),
        type: cellText(row, 'type') || null,
        unit: cellText(row, 'unit') || null,
        active: normalizeActive(cellText(row, 'active')),
      }

      const parsed = productFormSchema.safeParse(values)
      if (!parsed.success) {
        const issue = parsed.error.issues[0]
        issues.push(firstIssueMessage(rowNumber, issue?.message ?? 'ข้อมูลไม่ถูกต้อง'))
      }

      return parsed.success ? parsed.data : null
    })

    if (issues.length > 0) {
      return NextResponse.json({
        code: 'VALIDATION_ERROR',
        error: `Import Excel ไม่สำเร็จ: ${issues.slice(0, 5).join(', ')}`,
        issues: issues.slice(0, 50),
      }, { status: 400 })
    }

    const validRows = parsedRows.filter((row): row is NonNullable<typeof row> & { code: string } => row !== null && Boolean(row.code))
    try {
      await Promise.all(validRows.flatMap((row) => [
        assertActiveProductType(row.type),
        assertActiveProductUnit(row.unit),
      ]))
    } catch (caught) {
      return NextResponse.json({
        code: 'VALIDATION_ERROR',
        error: caught instanceof Error ? caught.message : 'ข้อมูลสินค้าไม่ถูกต้อง',
      }, { status: 400 })
    }

    const codes = validRows.map((row) => row.code)
    const existing = await prisma.products.findMany({
      select: { code: true, id: true },
      where: { code: { in: codes } },
    })
    const existingIdByCode = new Map(existing.map((row) => [row.code, row.id]))

    await prisma.$transaction(validRows.map((row) => {
      const existingId = existingIdByCode.get(row.code)
      const payload = toProductWriteInput(row)
      return existingId
        ? prisma.products.update({
          where: { id: existingId },
          data: payload,
          select: { id: true },
        })
        : prisma.products.create({
          data: payload,
          select: { id: true },
        })
    }))

    const updated = validRows.filter((row) => existingIdByCode.has(row.code)).length
    return NextResponse.json({
      inserted: validRows.length - updated,
      totalRows: validRows.length,
      updated,
    })
  } catch (caught) {
    if (caught instanceof AuthContextError) return authContextErrorResponse(caught)
    return apiErrorResponse(caught, 'Import Excel ไม่สำเร็จ', 500)
  }
}
