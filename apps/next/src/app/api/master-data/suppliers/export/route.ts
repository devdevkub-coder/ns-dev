import { NextResponse } from 'next/server'
import { XLSX } from '@/lib/server/xlsx'
import { mapPrismaSupplier } from '@/lib/domain/supplier'
import { supplierPaymentMethodGroup, type SupplierPaymentMethodRecord } from '@/lib/supplier'
import { formatAccountNoDisplay, formatPhoneDisplay } from '@/lib/format'
import { apiErrorResponse } from '@/lib/server/api-error'
import { AuthContextError, authContextErrorResponse, getCurrentAuthContext, requirePermission } from '@/lib/server/auth-context'
import { getActivePaymentMethods } from '@/lib/server/payment-methods'
import { prisma } from '@/lib/server/prisma'
import { findActiveSalespersonReferenceByCodeOrId, listSalespersonReferencesByIds } from '@/lib/server/salesperson-reference'
import { applyWorksheetTableLayout } from '@/lib/server/xlsx'
import type { Supplier } from '@/lib/supplier'
import type { Prisma } from '../../../../../../generated/prisma/client'

export const runtime = 'nodejs'

const EXPORT_LIMIT = 10000
type SortDirection = 'asc' | 'desc'

const sortColumns = {
  active: 'active',
  code: 'code',
  name: 'name',
  phone: 'phone',
  salesName: 'sales_rep',
  taxId: 'tax_id',
  type: 'type',
} as const

type SupplierExportKey = keyof Supplier | 'bankAccountsText'

const supplierColumns: Array<{ key: SupplierExportKey; label: string; width: number; type?: 'number' }> = [
  { key: 'code', label: 'รหัสผู้ขาย', width: 90 },
  { key: 'name', label: 'ชื่อผู้ขาย/บริษัท', width: 220 },
  { key: 'type', label: 'ประเภทผู้ขาย', width: 110 },
  { key: 'marketScope', label: 'ประเทศ/ตลาด', width: 110 },
  { key: 'nameTitle', label: 'คำนำหน้าชื่อ', width: 100 },
  { key: 'firstName', label: 'ชื่อ', width: 140 },
  { key: 'lastName', label: 'นามสกุล', width: 140 },
  { key: 'taxId', label: 'เลขผู้เสียภาษี', width: 130 },
  { key: 'phone', label: 'โทรศัพท์', width: 130 },
  { key: 'branchIds', label: 'รหัสสาขาที่ใช้ได้', width: 180 },
  { key: 'branchNames', label: 'สาขาที่ใช้ได้', width: 220 },
  { key: 'primaryBranchId', label: 'รหัสสาขาหลัก', width: 130 },
  { key: 'primaryBranchName', label: 'สาขาหลัก', width: 160 },
  { key: 'bankName', label: 'ธนาคารรับเงิน', width: 160 },
  { key: 'accountNo', label: 'เลขที่บัญชีรับเงิน', width: 160 },
  { key: 'bankAccount', label: 'ชื่อบัญชีรับเงิน', width: 180 },
  { key: 'bankAccountsText', label: 'บัญชีรับเงินทั้งหมด', width: 320 },
  { key: 'salesId', label: 'รหัสผู้ดูแล', width: 120 },
  { key: 'salesName', label: 'ผู้ดูแล', width: 160 },
  { key: 'countryCode', label: 'รหัสประเทศ (ISO)', width: 120 },
  { key: 'addressCountry', label: 'ประเทศ', width: 120 },
  { key: 'addressPostalCode', label: 'รหัสไปรษณีย์', width: 100 },
  { key: 'addressProvince', label: 'จังหวัด', width: 120 },
  { key: 'addressDistrict', label: 'อำเภอ/เขต', width: 120 },
  { key: 'addressSubdistrict', label: 'ตำบล/แขวง', width: 120 },
  { key: 'addressNo', label: 'บ้านเลขที่', width: 100 },
  { key: 'addressMoo', label: 'หมู่', width: 70 },
  { key: 'addressVillage', label: 'หมู่บ้าน/อาคาร', width: 180 },
  { key: 'addressRoad', label: 'ถนน', width: 140 },
  { key: 'addressLine1', label: 'ที่อยู่บรรทัด 1', width: 240 },
  { key: 'addressLine2', label: 'ที่อยู่บรรทัด 2', width: 220 },
  { key: 'addressCity', label: 'เมือง', width: 140 },
  { key: 'addressStateRegion', label: 'รัฐ/จังหวัด/ภูมิภาค', width: 160 },
  { key: 'addressPostalCodeIntl', label: 'รหัสไปรษณีย์สากล', width: 150 },
  { key: 'address', label: 'ที่อยู่เต็ม/หมายเหตุที่อยู่', width: 300 },
  { key: 'active', label: 'สถานะ', width: 90 },
  { key: 'createdAt', label: 'สร้างเมื่อ', width: 150 },
  { key: 'updatedAt', label: 'แก้ไขเมื่อ', width: 150 },
]

function parseExportParams(request: Request) {
  const url = new URL(request.url)
  const active = url.searchParams.get('active')?.trim() ?? ''
  const q = url.searchParams.get('q')?.trim() ?? ''
  const supplierType = url.searchParams.get('type')?.trim() ?? ''
  const marketScope = url.searchParams.get('marketScope')?.trim() ?? ''
  const salesId = url.searchParams.get('salesId')?.trim() ?? ''
  const sort = url.searchParams.get('sort') ?? 'code'
  const direction: SortDirection = url.searchParams.get('direction') === 'desc' ? 'desc' : 'asc'
  const sortColumn = sortColumns[sort as keyof typeof sortColumns] ?? sortColumns.code

  return { active, supplierType, direction, marketScope, q, salesId, sort, sortColumn }
}

const supplierInclude = {
  branches: true,
  supplier_branches: {
    include: {
      branches: {
        select: { code: true, name: true },
      },
    },
    orderBy: [{ is_primary: 'desc' }, { id: 'asc' }],
  },
  supplier_bank_accounts: {
    include: {
      bank_names: {
        select: { code: true, name: true },
      },
    },
    orderBy: [{ is_primary: 'desc' }, { id: 'asc' }],
  },
} satisfies Prisma.suppliersInclude

type SupplierExportRow = Prisma.suppliersGetPayload<{
  include: typeof supplierInclude
}>

function supplierSearchWhere(q: string, supplierType: string, marketScope: string, active: string, salesId: bigint | null): Prisma.suppliersWhereInput {
  const where: Prisma.suppliersWhereInput = {}

  if (active === 'active') {
    where.active = { not: false }
  } else if (active === 'inactive') {
    where.active = false
  }

  if (supplierType) {
    where.type = supplierType
  }

  if (marketScope) {
    where.market_scope = marketScope
  }

  if (salesId != null) {
    where.sales_id = salesId
  }

  if (!q) return where

  where.OR = [
    { code: { contains: q, mode: 'insensitive' } },
    { name: { contains: q, mode: 'insensitive' } },
    { type: { contains: q, mode: 'insensitive' } },
    { tax_id: { contains: q, mode: 'insensitive' } },
    { phone: { contains: q, mode: 'insensitive' } },
    { address: { contains: q, mode: 'insensitive' } },
    { address_line1: { contains: q, mode: 'insensitive' } },
    { address_line2: { contains: q, mode: 'insensitive' } },
    { address_city: { contains: q, mode: 'insensitive' } },
    { address_state_region: { contains: q, mode: 'insensitive' } },
    { country_code: { contains: q, mode: 'insensitive' } },
    { supplier_bank_accounts: { some: { bank_names: { is: { name: { contains: q, mode: 'insensitive' } } } } } },
    { supplier_bank_accounts: { some: { account_no: { contains: q, mode: 'insensitive' } } } },
    { supplier_bank_accounts: { some: { account_name: { contains: q, mode: 'insensitive' } } } },
    { branches: { code: { contains: q, mode: 'insensitive' } } },
    { sales_rep: { contains: q, mode: 'insensitive' } },
  ]

  return where
}

function supplierPrimaryBankText(
  supplier: SupplierExportRow,
  field: 'accountNo' | 'bankName',
) {
  const primaryAccount = supplier.supplier_bank_accounts.find((account) => account.is_primary) ?? supplier.supplier_bank_accounts[0] ?? null
  if (!primaryAccount) return ''
  if (field === 'accountNo') return primaryAccount.account_no ?? ''
  return primaryAccount.bank_names?.name ?? ''
}

function compareText(left: string, right: string, direction: SortDirection) {
  return left.localeCompare(right, 'th', { numeric: true }) * (direction === 'asc' ? 1 : -1)
}

function formatBankAccounts(supplier: Supplier, paymentMethods: SupplierPaymentMethodRecord[]) {
  return supplier.bankAccounts
    .map((account) => supplierPaymentMethodGroup(account.paymentMethod, paymentMethods) === 'cash'
      ? account.paymentMethod
      : [account.paymentMethod, account.bankName || 'ไม่ระบุ', formatAccountNoDisplay(account.accountNo), account.branchCode ? `สาขา:${account.branchCode}` : null, account.bankAccount].filter(Boolean).join(' // '))
    .join(' | ')
}

function formatCellValue(supplier: Supplier, key: SupplierExportKey, paymentMethods: SupplierPaymentMethodRecord[]) {
  if (key === 'bankAccountsText' || key === 'bankAccounts') return formatBankAccounts(supplier, paymentMethods)
  const value = supplier[key] as string | number | boolean | null | undefined
  if (value === null || value === undefined || value === '') return ''
  if (typeof value === 'boolean') return value ? 'ใช้งาน' : 'ปิด'
  if (typeof value === 'number') return value
  if (Array.isArray(value)) return value.join(', ')
  if (key === 'phone') return formatPhoneDisplay(value) ?? ''
  if (key === 'accountNo') return formatAccountNoDisplay(value) ?? ''
  return String(value)
}

async function buildWorkbook(
  suppliers: Supplier[],
  paymentMethods: SupplierPaymentMethodRecord[],
  total: number,
  filters: { active: string; supplierType: string; marketScope: string; q: string; salesId: string },
) {
  const generatedAt = new Date()
  const summaryRows = [
    ['Export ณ', generatedAt.toLocaleString('th-TH')],
    ['จำนวนที่ export', suppliers.length.toLocaleString('th-TH')],
    ['จำนวนทั้งหมดตาม filter', total.toLocaleString('th-TH')],
    ['ค้นหา', filters.q || '-'],
    ['ประเภทผู้ขาย', filters.supplierType || 'ทุกประเภท'],
    ['ประเทศ/ตลาด', filters.marketScope || 'ทุกตลาด'],
    ['ผู้ดูแล', filters.salesId || 'ทุกผู้ดูแล'],
    ['สถานะ', filters.active === 'active' ? 'ใช้งาน' : filters.active === 'inactive' ? 'ปิด' : 'ทุกสถานะ'],
  ]

  const dataRows = suppliers.map((supplier) => Object.fromEntries(
    supplierColumns.map((column) => [column.label, formatCellValue(supplier, column.key, paymentMethods)]),
  ))
  const workbook = XLSX.utils.book_new()
  const summarySheet = XLSX.utils.aoa_to_sheet(summaryRows)
  const supplierSheet = XLSX.utils.json_to_sheet(dataRows, {
    header: supplierColumns.map((column) => column.label),
  })

  summarySheet['!cols'] = [{ wch: 24 }, { wch: 28 }]
  supplierSheet['!cols'] = supplierColumns.map((column) => ({ wch: Math.max(10, Math.round(column.width / 8)) }))
  applyWorksheetTableLayout(supplierSheet, supplierColumns.length, dataRows.length + 1)
  XLSX.utils.book_append_sheet(workbook, summarySheet, 'สรุป')
  XLSX.utils.book_append_sheet(workbook, supplierSheet, 'ผู้ขาย')
  return XLSX.write(workbook, { bookType: 'xlsx', type: 'buffer' })
}

export async function GET(request: Request) {
  try {
    const context = await getCurrentAuthContext()
    requirePermission(context, 'master.suppliers.export')

    const { active, supplierType, direction, marketScope, q, salesId, sort, sortColumn } = parseExportParams(request)
    const resolvedSalesperson = salesId ? await findActiveSalespersonReferenceByCodeOrId(salesId) : null
    const where = supplierSearchWhere(q, supplierType, marketScope, active, resolvedSalesperson?.id ?? null)
    const requiresBankSort = sort === 'bankName' || sort === 'accountNo'
    const [rows, total, paymentMethods] = await Promise.all([
      prisma.suppliers.findMany({
        include: supplierInclude,
        orderBy: requiresBankSort ? [{ code: 'asc' }, { id: 'asc' }] : [{ [sortColumn]: direction }, { id: 'asc' }],
        take: EXPORT_LIMIT,
        where,
      }),
      prisma.suppliers.count({ where }),
      getActivePaymentMethods() as Promise<SupplierPaymentMethodRecord[]>,
    ])
    const visibleRows = salesId && !resolvedSalesperson
      ? []
      : requiresBankSort
        ? rows.slice().sort((left, right) => {
          const byBankField = compareText(
            supplierPrimaryBankText(left, sort === 'bankName' ? 'bankName' : 'accountNo'),
            supplierPrimaryBankText(right, sort === 'bankName' ? 'bankName' : 'accountNo'),
            direction,
          )
          if (byBankField !== 0) return byBankField
          return compareText(left.code, right.code, 'asc')
        })
        : rows
    const visibleTotal = salesId && !resolvedSalesperson ? 0 : total
    const salespersonReferences = await listSalespersonReferencesByIds(visibleRows.map((row) => row.sales_id))

    const suppliers = visibleRows.map((row) => mapPrismaSupplier(row as any, paymentMethods, {
      salesId: salespersonReferences.get(String(row.sales_id ?? ''))?.code ?? null,
    }))
    const body = await buildWorkbook(suppliers, paymentMethods, visibleTotal, { active, supplierType, marketScope, q, salesId })
    const filename = `suppliers_${new Date().toISOString().slice(0, 10)}.xlsx`

    return new NextResponse(new Uint8Array(body), {
      headers: {
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      },
    })
  } catch (caught) {
    if (caught instanceof AuthContextError) return authContextErrorResponse(caught)
    return apiErrorResponse(caught, 'Export Excel ไม่สำเร็จ', 500)
  }
}
