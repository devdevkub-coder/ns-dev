import { NextResponse } from 'next/server'
import * as XLSX from 'xlsx'
import { CUSTOMER_LEGAL_ENTITY_TYPES, customerFormSchema, type CustomerFormValues } from '@/lib/customer'
import { toCustomerWriteInput } from '@/lib/domain/customer'
import { apiErrorResponse } from '@/lib/server/api-error'
import { AuthContextError, authContextErrorResponse, getCurrentAuthContext, requirePermission } from '@/lib/server/auth-context'
import { findActiveCustomerReferenceByCodeOrId } from '@/lib/server/customer-reference'
import { prisma } from '@/lib/server/prisma'
import { findActiveSalespersonReferenceByCodeOrId } from '@/lib/server/salesperson-reference'
import type { Prisma } from '../../../../../../generated/prisma/client'

export const runtime = 'nodejs'

const IMPORT_LIMIT = 10000
const MAX_FILE_SIZE = 10 * 1024 * 1024

const headerMap = {
  active: ['สถานะ', 'active'],
  address: ['ที่อยู่เต็ม/หมายเหตุที่อยู่', 'ที่อยู่', 'address'],
  addressCountry: ['ประเทศ', 'addressCountry'],
  addressCity: ['เมือง', 'addressCity', 'address_city'],
  addressDistrict: ['อำเภอ/เขต', 'อำเภอ', 'เขต', 'addressDistrict'],
  addressLine1: ['ที่อยู่บรรทัด 1', 'addressLine1', 'address_line1'],
  addressLine2: ['ที่อยู่บรรทัด 2', 'addressLine2', 'address_line2'],
  addressMoo: ['หมู่', 'addressMoo'],
  addressNo: ['บ้านเลขที่', 'addressNo'],
  addressPostalCodeIntl: ['รหัสไปรษณีย์สากล', 'addressPostalCodeIntl', 'address_postal_code_intl'],
  addressPostalCode: ['รหัสไปรษณีย์', 'addressPostalCode'],
  addressProvince: ['จังหวัด', 'addressProvince'],
  addressRoad: ['ถนน', 'addressRoad'],
  addressStateRegion: ['รัฐ/จังหวัด/ภูมิภาค', 'addressStateRegion', 'address_state_region'],
  addressSubdistrict: ['ตำบล/แขวง', 'ตำบล', 'แขวง', 'addressSubdistrict'],
  addressVillage: ['หมู่บ้าน/อาคาร', 'หมู่บ้าน', 'อาคาร', 'addressVillage'],
  code: ['รหัสลูกค้า', 'code'],
  countryCode: ['รหัสประเทศ (ISO)', 'countryCode', 'country_code'],
  creditLimit: ['วงเงินเครดิต', 'creditLimit'],
  creditTerm: ['เครดิตเทอม (วัน)', 'เครดิตเทอม', 'creditTerm'],
  email: ['อีเมล', 'email'],
  firstName: ['ชื่อ', 'firstName'],
  lastName: ['นามสกุล', 'lastName'],
  legalEntityType: ['รูปแบบบริษัท', 'legalEntityType', 'legal_entity_type'],
  marketScope: ['ประเทศ/ตลาด', 'marketScope'],
  name: ['ชื่อลูกค้า/บริษัท', 'ชื่อบริษัท', 'name'],
  nameTitle: ['คำนำหน้าชื่อ', 'nameTitle'],
  phone: ['โทรศัพท์', 'โทร', 'phone'],
  primaryBranchId: ['รหัสสาขาหลัก', 'primaryBranchId', 'primary_branch_id'],
  branchIds: ['รหัสสาขาที่ใช้ได้', 'branchIds', 'branch_ids'],
  salesId: ['รหัสพนักงานขาย', 'salesId'],
  taxId: ['เลขผู้เสียภาษี', 'taxId'],
  type: ['ประเภทลูกค้า', 'ประเภท', 'type'],
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

function cellNumber(row: ImportRow, field: ImportField) {
  const value = getCell(row, field)
  if (value === null || value === undefined || value === '') return null
  if (typeof value === 'number') return Number.isFinite(value) ? value : null
  const normalized = String(value).replace(/,/g, '').trim()
  if (!normalized) return null
  const number = Number(normalized)
  return Number.isFinite(number) ? number : null
}

function normalizeCustomerCode(value: string) {
  const trimmed = value.trim()
  if (!trimmed) return null
  const matched = trimmed.toLowerCase().match(/^(?:cus|c)(\d{1,5})$/)
  if (!matched) throw new Error('รหัสลูกค้าต้องเป็นรูปแบบ CUS001-CUS99999')
  const number = Number(matched[1])
  if (!Number.isInteger(number) || number < 1 || number > 99999) throw new Error('รหัสลูกค้าต้องอยู่ระหว่าง CUS001-CUS99999')
  return `CUS${String(number).padStart(3, '0')}`
}

function normalizeCustomerType(value: string, row: ImportRow) {
  const normalized = value.trim().toLowerCase()
  if (normalized === 'บุคคล' || normalized === 'person' || normalized === 'individual') return 'บุคคล'
  if (normalized === 'นิติบุคคล' || normalized === 'company' || normalized === 'corporate') return 'นิติบุคคล'
  return cellText(row, 'firstName') || cellText(row, 'lastName') ? 'บุคคล' : 'นิติบุคคล'
}

function isCustomerLegalEntityType(value: string): value is NonNullable<CustomerFormValues['legalEntityType']> {
  return (CUSTOMER_LEGAL_ENTITY_TYPES as readonly string[]).includes(value)
}

function normalizeLegalEntityType(value: string): CustomerFormValues['legalEntityType'] {
  const trimmed = value.trim()
  if (!trimmed) return null
  if (isCustomerLegalEntityType(trimmed)) return trimmed

  const normalized = trimmed.toLowerCase().replace(/\s+/g, '')
  if (['บจก', 'บจก.', 'บริษัทจำกัด', 'companylimited', 'coltd', 'co.,ltd.', 'limited'].includes(normalized)) return 'บริษัทจำกัด (บจก.)'
  if (['หจก', 'หจก.', 'ห้างหุ้นส่วนจำกัด', 'limitedpartnership'].includes(normalized)) return 'ห้างหุ้นส่วนจำกัด (หจก.)'
  if (['บมจ', 'บมจ.', 'บริษัทมหาชนจำกัด', 'publiccompanylimited', 'publiccompany'].includes(normalized)) return 'บริษัทมหาชนจำกัด (บมจ.)'
  if (['หน่วยงาน', 'องค์กร', 'หน่วยงาน/องค์กร', 'organization', 'organisation'].includes(normalized)) return 'หน่วยงาน/องค์กร'
  if (['อื่นๆ', 'อื่นๆ.', 'อื่น ๆ', 'other'].includes(normalized)) return 'อื่น ๆ'

  throw new Error('รูปแบบบริษัทต้องเป็น บจก., หจก., บมจ., หน่วยงาน/องค์กร หรือ อื่น ๆ')
}

function normalizeMarketScope(value: string, countryCode: string, country: string) {
  const normalized = value.trim().toLowerCase()
  if (normalized === 'ต่างประเทศ' || normalized === 'foreign' || normalized === 'overseas') return 'ต่างประเทศ'
  const normalizedCountryCode = countryCode.trim().toUpperCase()
  const normalizedCountry = country.trim().toLowerCase()
  if (normalizedCountryCode && normalizedCountryCode !== 'TH') return 'ต่างประเทศ'
  if (normalizedCountry && normalizedCountry !== 'ไทย' && normalizedCountry !== 'thailand') return 'ต่างประเทศ'
  return 'ในประเทศ'
}

function normalizeActive(value: string) {
  const normalized = value.trim().toLowerCase()
  if (!normalized) return true
  if (['ปิด', 'inactive', 'false', '0', 'no', 'n'].includes(normalized)) return false
  return true
}

function splitBranchCodes(value: string) {
  return Array.from(new Set(value
    .split(/[;,|]/)
    .map((part) => part.trim().toUpperCase())
    .filter(Boolean)))
}

async function syncCustomerBranches(
  tx: Prisma.TransactionClient,
  input: {
    actor: string | null
    branchCodes: string[]
    customerId: bigint
    primaryBranchCode: string | null
  },
) {
  const branchCodes = Array.from(new Set([
    ...input.branchCodes.map((code) => code.trim().toUpperCase()).filter(Boolean),
    ...(input.primaryBranchCode ? [input.primaryBranchCode.trim().toUpperCase()] : []),
  ]))
  const primaryBranchCode = input.primaryBranchCode?.trim().toUpperCase() || branchCodes[0] || null
  const branches = await tx.branches.findMany({
    select: { code: true, id: true },
    where: { active: true, code: { in: branchCodes } },
  })
  const branchByCode = new Map(branches.map((branch) => [branch.code, branch] as const))
  const missingCodes = branchCodes.filter((code) => !branchByCode.has(code))
  if (missingCodes.length) {
    throw new Error(`สาขาไม่ถูกต้องหรือถูกปิดใช้งาน: ${missingCodes.join(', ')}`)
  }

  await tx.customer_branches.updateMany({
    data: { active: false, is_primary: false, updated_at: new Date(), updated_by: input.actor },
    where: { customer_id: input.customerId },
  })

  for (const code of branchCodes) {
    const branch = branchByCode.get(code)
    if (!branch) continue
    await tx.customer_branches.upsert({
      create: {
        active: true,
        branch_id: branch.id,
        created_by: input.actor,
        customer_id: input.customerId,
        is_primary: code === primaryBranchCode,
        updated_by: input.actor,
      },
      update: {
        active: true,
        is_primary: code === primaryBranchCode,
        updated_at: new Date(),
        updated_by: input.actor,
      },
      where: {
        customer_id_branch_id: {
          branch_id: branch.id,
          customer_id: input.customerId,
        },
      },
    })
  }
}

function findCustomerSheet(workbook: XLSX.WorkBook) {
  const namedSheet = workbook.Sheets['ลูกค้า']
  if (namedSheet) return namedSheet

  return workbook.SheetNames.map((name) => workbook.Sheets[name]).find((sheet) => {
    const rows = XLSX.utils.sheet_to_json<string[]>(sheet, { header: 1, blankrows: false })
    return rows.some((row) => row.map(String).includes('รหัสลูกค้า'))
  })
}

function parseRows(workbook: XLSX.WorkBook) {
  const sheet = findCustomerSheet(workbook)
  if (!sheet) throw new Error('ไม่พบ sheet ลูกค้า หรือ header รหัสลูกค้า')
  return XLSX.utils.sheet_to_json<ImportRow>(sheet, { defval: '' })
}

function firstIssueMessage(rowNumber: number, message: string) {
  return `แถว ${rowNumber}: ${message}`
}

async function nextCustomerCodeSequence(blankCodeCount: number) {
  if (blankCodeCount === 0) return []
  const existingCustomers = await prisma.customers.findMany({
    select: { code: true },
    where: { code: { startsWith: 'CUS' } },
  })
  const maxNumber = existingCustomers.reduce((max, row) => {
    const matched = String(row.code ?? '').match(/^CUS(\d+)$/i)
    const value = matched ? Number(matched[1]) : 0
    return Number.isFinite(value) ? Math.max(max, value) : max
  }, 0)
  const startNumber = maxNumber + 1
  return Array.from({ length: blankCodeCount }, (_, index) => `CUS${String(startNumber + index).padStart(3, '0')}`)
}

export async function POST(request: Request) {
  try {
    const context = await getCurrentAuthContext()
    requirePermission(context, 'master.customers.create')

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
      const workbook = XLSX.read(Buffer.from(await file.arrayBuffer()), { type: 'buffer' })
      rows = parseRows(workbook).filter((row) => Object.values(row).some((value) => String(value ?? '').trim()))
    } catch (caught) {
      return NextResponse.json({
        code: 'BAD_REQUEST',
        error: caught instanceof Error ? caught.message : 'อ่านไฟล์ Excel ไม่สำเร็จ',
      }, { status: 400 })
    }
    if (rows.length === 0) {
      return NextResponse.json({ code: 'BAD_REQUEST', error: 'ไม่พบข้อมูลลูกค้าในไฟล์' }, { status: 400 })
    }
    if (rows.length > IMPORT_LIMIT) {
      return NextResponse.json({ code: 'BAD_REQUEST', error: `Import ได้สูงสุด ${IMPORT_LIMIT.toLocaleString('th-TH')} แถวต่อครั้ง` }, { status: 400 })
    }

    const blankCodeRows = rows.filter((row) => !cellText(row, 'code')).length
    const generatedCodes = await nextCustomerCodeSequence(blankCodeRows)
    const activeBranches = await prisma.branches.findMany({
      select: { code: true },
      where: { active: true },
    })
    const activeBranchCodes = new Set(activeBranches.map((branch) => branch.code))
    let generatedCodeIndex = 0
    const issues: string[] = []
    const seenCodes = new Set<string>()

    const parsedRows = rows.map((row, index) => {
      const rowNumber = index + 2
      let code = ''
      try {
        code = normalizeCustomerCode(cellText(row, 'code')) ?? generatedCodes[generatedCodeIndex] ?? ''
        if (!cellText(row, 'code')) generatedCodeIndex += 1
      } catch (caught) {
        issues.push(firstIssueMessage(rowNumber, caught instanceof Error ? caught.message : 'รหัสลูกค้าไม่ถูกต้อง'))
      }

      if (code && seenCodes.has(code)) issues.push(firstIssueMessage(rowNumber, `รหัสลูกค้า ${code} ซ้ำในไฟล์`))
      if (code) seenCodes.add(code)

      const addressCountry = cellText(row, 'addressCountry')
      const countryCode = cellText(row, 'countryCode')
      const marketScope = normalizeMarketScope(cellText(row, 'marketScope'), countryCode, addressCountry)
      let legalEntityType: CustomerFormValues['legalEntityType'] = null
      try {
        legalEntityType = normalizeLegalEntityType(cellText(row, 'legalEntityType'))
      } catch (caught) {
        issues.push(firstIssueMessage(rowNumber, caught instanceof Error ? caught.message : 'รูปแบบบริษัทไม่ถูกต้อง'))
      }
      const values = {
        id: code || undefined,
        code: code || null,
        name: cellText(row, 'name') || null,
        nameTitle: cellText(row, 'nameTitle') || null,
        firstName: cellText(row, 'firstName') || null,
        lastName: cellText(row, 'lastName') || null,
        type: normalizeCustomerType(cellText(row, 'type'), row),
        legalEntityType,
        marketScope,
        taxId: cellText(row, 'taxId') || null,
        phone: cellText(row, 'phone') || '',
        email: cellText(row, 'email') || null,
        address: cellText(row, 'address') || null,
        addressNo: cellText(row, 'addressNo') || null,
        addressMoo: cellText(row, 'addressMoo') || null,
        addressVillage: cellText(row, 'addressVillage') || null,
        addressRoad: cellText(row, 'addressRoad') || null,
        addressSubdistrict: cellText(row, 'addressSubdistrict') || null,
        addressDistrict: cellText(row, 'addressDistrict') || null,
        addressProvince: cellText(row, 'addressProvince') || null,
        addressPostalCode: cellText(row, 'addressPostalCode') || null,
        addressCountry: addressCountry || 'ไทย',
        countryCode: countryCode || (marketScope === 'ในประเทศ' ? 'TH' : null),
        addressLine1: cellText(row, 'addressLine1') || null,
        addressLine2: cellText(row, 'addressLine2') || null,
        addressCity: cellText(row, 'addressCity') || null,
        addressStateRegion: cellText(row, 'addressStateRegion') || null,
        addressPostalCodeIntl: cellText(row, 'addressPostalCodeIntl') || null,
        creditTerm: cellNumber(row, 'creditTerm'),
        creditLimit: cellNumber(row, 'creditLimit'),
        branchIds: splitBranchCodes(cellText(row, 'branchIds')),
        primaryBranchId: cellText(row, 'primaryBranchId').trim().toUpperCase() || null,
        salesId: cellText(row, 'salesId') || null,
        active: normalizeActive(cellText(row, 'active')),
      }
      if (values.primaryBranchId && !values.branchIds.includes(values.primaryBranchId)) values.branchIds.unshift(values.primaryBranchId)
      const invalidBranchCodes = values.branchIds.filter((branchCode) => !activeBranchCodes.has(branchCode))
      if (invalidBranchCodes.length) {
        issues.push(firstIssueMessage(rowNumber, `รหัสสาขาไม่ถูกต้องหรือถูกปิดใช้งาน: ${invalidBranchCodes.join(', ')}`))
      }
      if (values.active && values.branchIds.length === 0) {
        issues.push(firstIssueMessage(rowNumber, 'ต้องระบุรหัสสาขาที่ใช้ได้สำหรับลูกค้าที่ใช้งาน'))
      }

      const parsed = customerFormSchema.safeParse(values)
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

    const validRows = parsedRows.filter((row): row is NonNullable<typeof row> => row !== null)
    const existingReferences = await Promise.all(validRows.map((row) => findActiveCustomerReferenceByCodeOrId(row.id)))
    const salespersonReferences = await Promise.all(validRows.map((row) => row.salesId ? findActiveSalespersonReferenceByCodeOrId(row.salesId) : Promise.resolve(null)))
    const existingIds = new Set(existingReferences.map((row) => (row ? String(row.id) : '')).filter(Boolean))

    const missingSalespersonIndex = salespersonReferences.findIndex((row, index) => validRows[index]?.salesId && !row)
    if (missingSalespersonIndex >= 0) {
      return NextResponse.json({
        code: 'VALIDATION_ERROR',
        error: `Import Excel ไม่สำเร็จ: แถว ${missingSalespersonIndex + 2}: พนักงานขายไม่ถูกต้องหรือถูกปิดใช้งาน`,
      }, { status: 400 })
    }

    const actor = context.appUser?.username ?? context.authUser.email ?? null
    await prisma.$transaction(async (tx) => {
      for (const [index, row] of validRows.entries()) {
        const payload = toCustomerWriteInput(row, {
          salesId: salespersonReferences[index]?.id ?? null,
        })
        const existing = existingReferences[index]
        const savedCustomer = existing
          ? await tx.customers.update({
            where: { id: existing.id },
            data: payload as Parameters<typeof tx.customers.update>[0]['data'],
          })
          : await tx.customers.create({
            data: payload as Parameters<typeof tx.customers.create>[0]['data'],
          })
        await syncCustomerBranches(tx, {
          actor,
          branchCodes: row.branchIds,
          customerId: savedCustomer.id,
          primaryBranchCode: row.primaryBranchId,
        })
      }
    })

    const updated = existingReferences.filter(Boolean).length
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
