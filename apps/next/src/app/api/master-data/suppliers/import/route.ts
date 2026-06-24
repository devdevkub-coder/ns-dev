import { NextResponse } from 'next/server'
import * as XLSX from 'xlsx'
import { z } from 'zod'
import {
  defaultSupplierPaymentMethodName,
  legacySupplierPaymentMethodGroup,
  resolveSupplierPaymentMethodName,
  supplierFormSchema,
  throwSupplierBankAccountValidationError,
  type SupplierPaymentMethod,
  type SupplierPaymentMethodRecord,
} from '@/lib/supplier'
import { supplierBankAccountRows, toSupplierWriteInput } from '@/lib/domain/supplier'
import { apiErrorResponse } from '@/lib/server/api-error'
import { AuthContextError, authContextErrorResponse, getCurrentAuthContext, requirePermission } from '@/lib/server/auth-context'
import { prisma } from '@/lib/server/prisma'
import type { Prisma } from '../../../../../../generated/prisma/client'

export const runtime = 'nodejs'

const IMPORT_LIMIT = 10000
const MAX_FILE_SIZE = 10 * 1024 * 1024

const headerMap = {
  accountNo: ['เลขที่บัญชีรับเงิน', 'เลขบัญชี', 'accountNo'],
  accountsAll: ['บัญชีรับเงินทั้งหมด', 'bankAccounts', 'bankAccountsText'],
  active: ['สถานะ', 'active'],
  address: ['ที่อยู่เต็ม/หมายเหตุที่อยู่', 'ที่อยู่', 'address'],
  addressCountry: ['ประเทศ', 'addressCountry'],
  addressDistrict: ['อำเภอ/เขต', 'อำเภอ', 'เขต', 'addressDistrict'],
  addressLine1: ['ที่อยู่บรรทัด 1', 'addressLine1', 'address_line1'],
  addressLine2: ['ที่อยู่บรรทัด 2', 'addressLine2', 'address_line2'],
  addressCity: ['เมือง', 'addressCity', 'address_city'],
  addressMoo: ['หมู่', 'addressMoo'],
  addressNo: ['บ้านเลขที่', 'addressNo'],
  addressPostalCodeIntl: ['รหัสไปรษณีย์สากล', 'addressPostalCodeIntl', 'address_postal_code_intl'],
  addressPostalCode: ['รหัสไปรษณีย์', 'addressPostalCode'],
  addressProvince: ['จังหวัด', 'addressProvince'],
  addressRoad: ['ถนน', 'addressRoad'],
  addressStateRegion: ['รัฐ/จังหวัด/ภูมิภาค', 'addressStateRegion', 'address_state_region'],
  addressSubdistrict: ['ตำบล/แขวง', 'ตำบล', 'แขวง', 'addressSubdistrict'],
  addressVillage: ['หมู่บ้าน/อาคาร', 'หมู่บ้าน', 'อาคาร', 'addressVillage'],
  bankAccount: ['ชื่อบัญชีรับเงิน', 'bankAccount'],
  branchCode: ['รหัสสาขาบัญชี', 'รหัสสาขา', 'branchCode', 'branch_code'],
  bankName: ['ธนาคารรับเงิน', 'ธนาคาร', 'bankName'],
  code: ['รหัสผู้ขาย', 'code'],
  countryCode: ['รหัสประเทศ (ISO)', 'countryCode', 'country_code'],
  firstName: ['ชื่อ', 'firstName'],
  lastName: ['นามสกุล', 'lastName'],
  marketScope: ['ประเทศ/ตลาด', 'marketScope'],
  name: ['ชื่อผู้ขาย/บริษัท', 'ชื่อบริษัท/ร้านค้า', 'name'],
  nameTitle: ['คำนำหน้าชื่อ', 'nameTitle'],
  phone: ['โทรศัพท์', 'โทร', 'phone'],
  primaryBranchId: ['รหัสสาขาหลัก', 'primaryBranchId', 'primary_branch_id'],
  branchIds: ['รหัสสาขาที่ใช้ได้', 'branchIds', 'branch_ids'],
  salesId: ['รหัสผู้ดูแล', 'salesId', 'sales_id'],
  salesName: ['ผู้ดูแล', 'salesName'],
  taxId: ['เลขผู้เสียภาษี', 'taxId'],
  type: ['ประเภทผู้ขาย', 'ประเภท', 'type'],
} as const

type ImportField = keyof typeof headerMap
type ImportRow = Record<string, unknown>
type ImportBankAccount = {
  id: null
  paymentMethod: SupplierPaymentMethod
  bankName: string | null
  accountNo: string | null
  bankAccount: string | null
  branchCode: string | null
  isPrimary: boolean
  active: boolean
}

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

function firstNonBlankCellText(row: ImportRow, fields: ImportField[]) {
  for (const field of fields) {
    const value = cellText(row, field)
    if (value) return value
  }
  return ''
}

function normalizeSupplierCode(value: string) {
  const trimmed = value.trim()
  if (!trimmed) return null
  const matched = trimmed.toLowerCase().match(/^(?:su|sup|s)(\d{1,5})$/)
  if (!matched) throw new Error('รหัสผู้ขายต้องเป็นรูปแบบ SU0001-SU99999')
  const number = Number(matched[1])
  if (!Number.isInteger(number) || number < 1 || number > 99999) throw new Error('รหัสผู้ขายต้องอยู่ระหว่าง SU0001-SU99999')
  return `SU${String(number).padStart(4, '0')}`
}

function normalizeSupplierType(value: string, row: ImportRow) {
  const normalized = value.trim().toLowerCase()
  if (normalized === 'บุคคล' || normalized === 'person' || normalized === 'individual') return 'บุคคล'
  if (normalized === 'นิติบุคคล' || normalized === 'company' || normalized === 'corporate') return 'นิติบุคคล'
  return cellText(row, 'firstName') || cellText(row, 'lastName') ? 'บุคคล' : 'นิติบุคคล'
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

async function syncSupplierBranches(
  tx: Prisma.TransactionClient,
  input: {
    actor: string | null
    branchCodes: string[]
    primaryBranchCode: string | null
    supplierId: bigint
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

  await tx.supplier_branches.updateMany({
    data: { active: false, is_primary: false, updated_at: new Date(), updated_by: input.actor },
    where: { supplier_id: input.supplierId },
  })

  for (const code of branchCodes) {
    const branch = branchByCode.get(code)
    if (!branch) continue
    await tx.supplier_branches.upsert({
      create: {
        active: true,
        branch_id: branch.id,
        created_by: input.actor,
        is_primary: code === primaryBranchCode,
        supplier_id: input.supplierId,
        updated_by: input.actor,
      },
      update: {
        active: true,
        is_primary: code === primaryBranchCode,
        updated_at: new Date(),
        updated_by: input.actor,
      },
      where: {
        supplier_id_branch_id: {
          branch_id: branch.id,
          supplier_id: input.supplierId,
        },
      },
    })
  }
}

function stripCashMarker(value: string) {
  return value
    .replace(/เงินสด/g, '')
    .replace(/^[\s/\\\-–—:]+|[\s/\\\-–—:]+$/g, '')
    .replace(/\s{2,}/g, ' ')
    .trim()
}

function splitAccountNumbers(value: string) {
  const compactHyphens = value.replace(/\s*-\s*/g, '-')
  return compactHyphens
    .split(/\s+/)
    .map((part) => part.replace(/\D/g, ''))
    .filter((part) => part.length >= 2)
}

function parseBankAccounts(
  row: ImportRow,
  supplierName: string,
  paymentMethods: SupplierPaymentMethodRecord[],
): ImportBankAccount[] {
  const defaultCashMethod = defaultSupplierPaymentMethodName(paymentMethods, 'cash') ?? 'เงินสด'
  const defaultBankMethod = defaultSupplierPaymentMethodName(paymentMethods, 'bank') ?? 'เงินโอน'

  const rawAccountsAll = cellText(row, 'accountsAll')
  if (rawAccountsAll) {
    const accounts: ImportBankAccount[] = []
    rawAccountsAll.split('|').forEach((segment, index) => {
      const text = segment.trim()
      if (!text) return
      if (text.includes('เงินสด') && splitAccountNumbers(text).length === 0) {
        accounts.push({
          id: null,
          paymentMethod: defaultCashMethod,
          bankName: null,
          accountNo: null,
          bankAccount: null,
          branchCode: null,
          isPrimary: index === 0,
          active: true,
        })
        return
      }

      const parts = text.split('//').map((part) => part.trim()).filter(Boolean)
      const resolvedMethod = resolveSupplierPaymentMethodName(parts[0], paymentMethods)
      const startsWithTransfer = (resolvedMethod ? legacySupplierPaymentMethodGroup(resolvedMethod) : legacySupplierPaymentMethodGroup(parts[0])) === 'bank'
      const bankName = stripCashMarker(startsWithTransfer ? parts[1] ?? '' : parts[0] ?? '')
      const accountText = startsWithTransfer ? parts[2] ?? text : parts[1] ?? text
      const accountNos = splitAccountNumbers(accountText || text)
      const branchPartIndex = startsWithTransfer ? 3 : 2
      const branchPart = parts[branchPartIndex]?.startsWith('สาขา:') ? parts[branchPartIndex] : null
      const branchCode = branchPart?.replace(/^สาขา:/, '').trim() || null
      const accountName = startsWithTransfer
        ? branchPart ? parts[4] ?? supplierName : parts[3] ?? supplierName
        : branchPart ? parts[3] ?? supplierName : parts[2] ?? supplierName
      accountNos.forEach((accountNo, accountIndex) => {
        accounts.push({
          id: null,
          paymentMethod: resolvedMethod ?? defaultBankMethod,
          bankName: bankName || null,
          accountNo,
          bankAccount: accountName || null,
          branchCode,
          isPrimary: index === 0 && accountIndex === 0,
          active: true,
        })
      })
    })
    if (accounts.length) return accounts
  }

  const rawBankText = cellText(row, 'bankName')
  const rawAccountNo = cellText(row, 'accountNo')
  const rawAccountName = cellText(row, 'bankAccount') || supplierName || null
  const rawBranchCode = cellText(row, 'branchCode') || null
  const parts = rawBankText.split('//')
  const bankName = stripCashMarker(parts[0] ?? rawBankText)
  const accountText = rawAccountNo || parts.slice(1).join(' ') || rawBankText
  const accountNos = splitAccountNumbers(accountText)

  if (accountNos.length === 0) {
    const rawCombinedText = `${rawBankText} ${rawAccountNo}`.trim()
    return rawCombinedText.includes('เงินสด')
      ? [{
        id: null,
        paymentMethod: defaultCashMethod,
        bankName: null,
        accountNo: null,
        bankAccount: null,
        branchCode: null,
        isPrimary: true,
        active: true,
      }]
      : []
  }

  return accountNos.map((accountNo, index) => ({
    id: null,
    paymentMethod: defaultBankMethod,
    bankName: bankName || null,
    accountNo,
    bankAccount: rawAccountName,
    branchCode: rawBranchCode,
    isPrimary: index === 0,
    active: true,
  }))
}

function findSupplierSheet(workbook: XLSX.WorkBook) {
  const namedSheet = workbook.Sheets['ผู้ขาย']
  if (namedSheet) return namedSheet

  return workbook.SheetNames.map((name) => workbook.Sheets[name]).find((sheet) => {
    const rows = XLSX.utils.sheet_to_json<string[]>(sheet, { header: 1, blankrows: false })
    return rows.some((row) => row.map(String).includes('รหัสผู้ขาย'))
  })
}

function parseRows(workbook: XLSX.WorkBook) {
  const sheet = findSupplierSheet(workbook)
  if (!sheet) throw new Error('ไม่พบ sheet ผู้ขาย หรือ header รหัสผู้ขาย')
  return XLSX.utils.sheet_to_json<ImportRow>(sheet, { defval: '' })
}

function firstIssueMessage(rowNumber: number, message: string) {
  return `แถว ${rowNumber}: ${message}`
}

async function nextSupplierCodeSequence(blankCodeCount: number) {
  if (blankCodeCount === 0) return []
  const existingSuppliers = await prisma.suppliers.findMany({
    select: { code: true },
    where: { code: { startsWith: 'SU' } },
  })
  const maxNumber = existingSuppliers.reduce((max, row) => {
    const matched = String(row.code ?? '').match(/^SU(\d+)$/i)
    const value = matched ? Number(matched[1]) : 0
    return Number.isFinite(value) ? Math.max(max, value) : max
  }, 0)
  const startNumber = maxNumber + 1
  return Array.from({ length: blankCodeCount }, (_, index) => `SU${String(startNumber + index).padStart(4, '0')}`)
}

export async function POST(request: Request) {
  try {
    const context = await getCurrentAuthContext()
    requirePermission(context, 'master.suppliers.create')

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
      return NextResponse.json({ code: 'BAD_REQUEST', error: 'ไม่พบข้อมูลผู้ขายในไฟล์' }, { status: 400 })
    }
    if (rows.length > IMPORT_LIMIT) {
      return NextResponse.json({ code: 'BAD_REQUEST', error: `Import ได้สูงสุด ${IMPORT_LIMIT.toLocaleString('th-TH')} แถวต่อครั้ง` }, { status: 400 })
    }

    const [salespersons, paymentMethods, bankNameRows, activeBranches] = await Promise.all([
      prisma.salespersons.findMany({
        select: { code: true, id: true, name: true },
        where: { active: { not: false } },
      }),
      prisma.payment_methods.findMany({
        orderBy: [{ name: 'asc' }],
        select: { name: true, type: true },
        where: { active: true },
      }),
      prisma.bank_names.findMany({
        select: { id: true, name: true },
        where: { active: true },
      }),
      prisma.branches.findMany({
        select: { code: true },
        where: { active: true },
      }),
    ])
    const activeBranchCodes = new Set(activeBranches.map((branch) => branch.code))
    const bankNamesByName = new Map(bankNameRows.map((row) => [row.name, row] as const))
    const salespersonLookup = new Map<string, { code: string | null; id: bigint; name: string }>()
    for (const salesperson of salespersons) {
      for (const key of [salesperson.id, salesperson.code ?? '', salesperson.name]) {
        if (key) salespersonLookup.set(String(key).trim().toLowerCase(), { code: salesperson.code, id: salesperson.id, name: salesperson.name })
      }
    }

    const blankCodeRows = rows.filter((row) => !cellText(row, 'code')).length
    const generatedCodes = await nextSupplierCodeSequence(blankCodeRows)
    let generatedCodeIndex = 0
    const issues: string[] = []
    const seenCodes = new Set<string>()
    const parsedRows = rows.map((row, index) => {
      const rowNumber = index + 2
      let code = ''
      try {
        code = normalizeSupplierCode(cellText(row, 'code')) ?? generatedCodes[generatedCodeIndex] ?? ''
        if (!cellText(row, 'code')) generatedCodeIndex += 1
      } catch (caught) {
        issues.push(firstIssueMessage(rowNumber, caught instanceof Error ? caught.message : 'รหัสผู้ขายไม่ถูกต้อง'))
      }

      if (code && seenCodes.has(code)) issues.push(firstIssueMessage(rowNumber, `รหัสผู้ขาย ${code} ซ้ำในไฟล์`))
      if (code) seenCodes.add(code)

      const salesText = firstNonBlankCellText(row, ['salesId', 'salesName'])
      const salesperson = salesText ? salespersonLookup.get(salesText.toLowerCase()) : null
      if (salesText && !salesperson) issues.push(firstIssueMessage(rowNumber, `ไม่พบผู้ดูแล "${salesText}" ในระบบ`))
      const countryCode = cellText(row, 'countryCode').toUpperCase()
      const addressCountry = cellText(row, 'addressCountry')
      const marketScope = normalizeMarketScope(cellText(row, 'marketScope'), countryCode, addressCountry)
      const address = cellText(row, 'address') || null
      const addressLine1 = cellText(row, 'addressLine1') || (marketScope === 'ต่างประเทศ' ? address : null)
      const supplierName = cellText(row, 'name') || null
      const bankAccounts = parseBankAccounts(row, supplierName ?? '', paymentMethods)
      const primaryBankAccount = bankAccounts.find((account) => account.isPrimary) ?? bankAccounts[0] ?? null

      const values = {
        id: code || undefined,
        code: code || null,
        name: supplierName,
        nameTitle: cellText(row, 'nameTitle') || null,
        firstName: cellText(row, 'firstName') || null,
        lastName: cellText(row, 'lastName') || null,
        type: normalizeSupplierType(cellText(row, 'type'), row),
        marketScope,
        taxId: cellText(row, 'taxId') || null,
        phone: cellText(row, 'phone') || null,
        address,
        addressNo: cellText(row, 'addressNo') || null,
        addressMoo: cellText(row, 'addressMoo') || null,
        addressVillage: cellText(row, 'addressVillage') || null,
        addressRoad: cellText(row, 'addressRoad') || null,
        addressSubdistrict: cellText(row, 'addressSubdistrict') || null,
        addressDistrict: cellText(row, 'addressDistrict') || null,
        addressProvince: cellText(row, 'addressProvince') || null,
        addressPostalCode: cellText(row, 'addressPostalCode') || null,
        addressCountry: addressCountry || (marketScope === 'ในประเทศ' ? 'ไทย' : null),
        countryCode: countryCode || (marketScope === 'ในประเทศ' ? 'TH' : null),
        addressLine1,
        addressLine2: cellText(row, 'addressLine2') || null,
        addressCity: cellText(row, 'addressCity') || null,
        addressStateRegion: cellText(row, 'addressStateRegion') || null,
        addressPostalCodeIntl: cellText(row, 'addressPostalCodeIntl') || null,
        bankName: primaryBankAccount?.bankName ?? null,
        accountNo: primaryBankAccount?.accountNo ?? null,
        bankAccount: primaryBankAccount?.bankAccount ?? null,
        bankAccounts,
        branchId: cellText(row, 'primaryBranchId').trim().toUpperCase() || null,
        branchIds: splitBranchCodes(cellText(row, 'branchIds')),
        primaryBranchId: cellText(row, 'primaryBranchId').trim().toUpperCase() || null,
        salesId: salesperson?.code ?? null,
        salesName: salesperson?.name ?? null,
        active: normalizeActive(cellText(row, 'active')),
      }
      if (values.primaryBranchId && !values.branchIds.includes(values.primaryBranchId)) values.branchIds.unshift(values.primaryBranchId)
      const invalidBranchCodes = values.branchIds.filter((branchCode) => !activeBranchCodes.has(branchCode))
      if (invalidBranchCodes.length) {
        issues.push(firstIssueMessage(rowNumber, `รหัสสาขาไม่ถูกต้องหรือถูกปิดใช้งาน: ${invalidBranchCodes.join(', ')}`))
      }
      if (values.active && values.branchIds.length === 0) {
        issues.push(firstIssueMessage(rowNumber, 'ต้องระบุรหัสสาขาที่ใช้ได้สำหรับผู้ขายที่ใช้งาน'))
      }

      const parsed = supplierFormSchema.safeParse(values)
      if (!parsed.success) {
        const issue = parsed.error.issues[0]
        issues.push(firstIssueMessage(rowNumber, issue?.message ?? 'ข้อมูลไม่ถูกต้อง'))
      } else {
        try {
          throwSupplierBankAccountValidationError(parsed.data, paymentMethods)
        } catch (caught) {
          if (caught instanceof z.ZodError) {
            issues.push(firstIssueMessage(rowNumber, caught.issues[0]?.message ?? 'ข้อมูลวิธีจ่าย/รับเงินไม่ถูกต้อง'))
          } else {
            issues.push(firstIssueMessage(rowNumber, 'ข้อมูลวิธีจ่าย/รับเงินไม่ถูกต้อง'))
          }
        }
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
    const codes = validRows.map((row) => row.id as string)
    const existing = await prisma.suppliers.findMany({ select: { branch_id: true, code: true, id: true }, where: { code: { in: codes } } })
    const existingIds = new Set(existing.map((row) => row.code ?? '').filter(Boolean))
    const existingByCode = new Map(existing.map((row) => [row.code ?? '', row]))

    const actor = context.appUser?.username ?? context.authUser.email ?? null
    await prisma.$transaction(async (tx) => {
      for (const row of validRows) {
        const payload = toSupplierWriteInput(row, paymentMethods)
        const existingRow = existingByCode.get(payload.code ?? '')
        if (existingRow) payload.branch_id = existingRow.branch_id ?? null
        const savedSupplier = existingRow
          ? await tx.suppliers.update({
            where: { id: existingRow.id },
            data: payload as Parameters<typeof tx.suppliers.update>[0]['data'],
          })
          : await tx.suppliers.create({
            data: payload as Parameters<typeof tx.suppliers.create>[0]['data'],
          })
        await tx.supplier_bank_accounts.deleteMany({ where: { supplier_id: savedSupplier.id } })
        const accountRows = supplierBankAccountRows(row, savedSupplier.id, payload.code ?? String(row.id ?? ''), paymentMethods, bankNamesByName)
        if (accountRows.length) await tx.supplier_bank_accounts.createMany({ data: accountRows })
        await syncSupplierBranches(tx, {
          actor,
          branchCodes: row.branchIds,
          primaryBranchCode: row.primaryBranchId,
          supplierId: savedSupplier.id,
        })
      }
    })

    const updated = validRows.filter((row) => existingIds.has(String(row.id ?? ''))).length
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
