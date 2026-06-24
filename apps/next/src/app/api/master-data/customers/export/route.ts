import { NextResponse } from 'next/server'
import * as XLSX from 'xlsx'
import { mapPrismaCustomer } from '@/lib/domain/customer'
import { formatPhoneDisplay } from '@/lib/format'
import { apiErrorResponse } from '@/lib/server/api-error'
import { AuthContextError, authContextErrorResponse, getCurrentAuthContext, requirePermission } from '@/lib/server/auth-context'
import { prisma } from '@/lib/server/prisma'
import { listSalespersonReferencesByIds } from '@/lib/server/salesperson-reference'
import { applyWorksheetTableLayout } from '@/lib/server/xlsx'
import type { Customer } from '@/lib/customer'
import type { Prisma } from '../../../../../../generated/prisma/client'

export const runtime = 'nodejs'

const EXPORT_LIMIT = 10000

const sortColumns = {
  active: 'active',
  code: 'code',
  creditLimit: 'credit_limit',
  creditTerm: 'credit_term',
  email: 'email',
  legalEntityType: 'legal_entity_type',
  marketScope: 'market_scope',
  name: 'name',
  phone: 'phone',
  taxId: 'tax_id',
  type: 'type',
} as const

const customerColumns: Array<{ key: keyof Customer; label: string; width: number; type?: 'number' }> = [
  { key: 'code', label: 'รหัสลูกค้า', width: 90 },
  { key: 'name', label: 'ชื่อลูกค้า/บริษัท', width: 220 },
  { key: 'type', label: 'ประเภทลูกค้า', width: 110 },
  { key: 'legalEntityType', label: 'รูปแบบบริษัท', width: 150 },
  { key: 'marketScope', label: 'ประเทศ/ตลาด', width: 110 },
  { key: 'branchIds', label: 'รหัสสาขาที่ใช้ได้', width: 180 },
  { key: 'branchNames', label: 'สาขาที่ใช้ได้', width: 220 },
  { key: 'primaryBranchId', label: 'รหัสสาขาหลัก', width: 130 },
  { key: 'primaryBranchName', label: 'สาขาหลัก', width: 160 },
  { key: 'nameTitle', label: 'คำนำหน้าชื่อ', width: 100 },
  { key: 'firstName', label: 'ชื่อ', width: 140 },
  { key: 'lastName', label: 'นามสกุล', width: 140 },
  { key: 'taxId', label: 'เลขผู้เสียภาษี', width: 130 },
  { key: 'phone', label: 'โทรศัพท์', width: 130 },
  { key: 'email', label: 'อีเมล', width: 200 },
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
  { key: 'creditTerm', label: 'เครดิตเทอม (วัน)', width: 110, type: 'number' },
  { key: 'creditLimit', label: 'วงเงินเครดิต', width: 120, type: 'number' },
  { key: 'active', label: 'สถานะ', width: 90 },
  { key: 'createdAt', label: 'สร้างเมื่อ', width: 150 },
  { key: 'updatedAt', label: 'แก้ไขเมื่อ', width: 150 },
]

function parseExportParams(request: Request) {
  const url = new URL(request.url)
  const q = url.searchParams.get('q')?.trim() ?? ''
  const customerType = url.searchParams.get('type')?.trim() ?? ''
  const marketScope = url.searchParams.get('marketScope')?.trim() ?? ''
  const sort = url.searchParams.get('sort') ?? 'code'
  const direction = url.searchParams.get('direction') === 'desc' ? 'desc' : 'asc'
  const sortColumn = sortColumns[sort as keyof typeof sortColumns] ?? sortColumns.code

  return { customerType, direction, marketScope, q, sortColumn }
}

function customerSearchWhere(q: string, customerType: string, marketScope: string): Prisma.customersWhereInput {
  const where: Prisma.customersWhereInput = {}

  if (customerType) {
    where.type = customerType
  }

  if (marketScope) {
    where.market_scope = marketScope
  }

  if (!q) return where

  where.OR = [
    { code: { contains: q, mode: 'insensitive' } },
    { name: { contains: q, mode: 'insensitive' } },
    { type: { contains: q, mode: 'insensitive' } },
    { legal_entity_type: { contains: q, mode: 'insensitive' } },
    { tax_id: { contains: q, mode: 'insensitive' } },
    { phone: { contains: q, mode: 'insensitive' } },
    { email: { contains: q, mode: 'insensitive' } },
    { address: { contains: q, mode: 'insensitive' } },
    { address_line1: { contains: q, mode: 'insensitive' } },
    { address_line2: { contains: q, mode: 'insensitive' } },
    { address_city: { contains: q, mode: 'insensitive' } },
    { address_state_region: { contains: q, mode: 'insensitive' } },
    { country_code: { contains: q, mode: 'insensitive' } },
  ]

  return where
}

const customerInclude = {
  customer_branches: {
    include: {
      branches: {
        select: { code: true, name: true },
      },
    },
    orderBy: [{ is_primary: 'desc' }, { id: 'asc' }],
  },
} satisfies Prisma.customersInclude

function formatCellValue(customer: Customer, key: keyof Customer) {
  const value = customer[key]
  if (value === null || value === undefined || value === '') return ''
  if (typeof value === 'boolean') return value ? 'ใช้งาน' : 'ปิด'
  if (typeof value === 'number') return value
  if (Array.isArray(value)) return value.join(', ')
  if (key === 'phone') return formatPhoneDisplay(value) ?? ''
  return String(value)
}

function buildWorkbook(customers: Customer[], total: number, filters: { customerType: string; marketScope: string; q: string }) {
  const generatedAt = new Date()
  const summaryRows = [
    ['Export ณ', generatedAt.toLocaleString('th-TH')],
    ['จำนวนที่ export', customers.length.toLocaleString('th-TH')],
    ['จำนวนทั้งหมดตาม filter', total.toLocaleString('th-TH')],
    ['ค้นหา', filters.q || '-'],
    ['ประเภทลูกค้า', filters.customerType || 'ทุกประเภท'],
    ['ประเทศ/ตลาด', filters.marketScope || 'ทุกตลาด'],
  ]

  const dataRows = customers.map((customer) => Object.fromEntries(
    customerColumns.map((column) => [column.label, formatCellValue(customer, column.key)]),
  ))
  const workbook = XLSX.utils.book_new()
  const summarySheet = XLSX.utils.aoa_to_sheet(summaryRows)
  const customerSheet = XLSX.utils.json_to_sheet(dataRows, {
    header: customerColumns.map((column) => column.label),
  })

  summarySheet['!cols'] = [{ wch: 24 }, { wch: 28 }]
  customerSheet['!cols'] = customerColumns.map((column) => ({ wch: Math.max(10, Math.round(column.width / 8)) }))
  applyWorksheetTableLayout(customerSheet, customerColumns.length, dataRows.length + 1)
  XLSX.utils.book_append_sheet(workbook, summarySheet, 'สรุป')
  XLSX.utils.book_append_sheet(workbook, customerSheet, 'ลูกค้า')
  return XLSX.write(workbook, { bookType: 'xlsx', type: 'buffer' }) as Buffer
}

export async function GET(request: Request) {
  try {
    const context = await getCurrentAuthContext()
    requirePermission(context, 'master.customers.export')

    const { customerType, direction, marketScope, q, sortColumn } = parseExportParams(request)
    const where = customerSearchWhere(q, customerType, marketScope)
    const [rows, total] = await Promise.all([
      prisma.customers.findMany({
        include: customerInclude,
        orderBy: [{ [sortColumn]: direction }, { id: 'asc' }],
        take: EXPORT_LIMIT,
        where,
      }),
      prisma.customers.count({ where }),
    ])

    const salespersonReferences = await listSalespersonReferencesByIds(rows.map((row) => row.sales_id))
    const customers = rows.map((row) => mapPrismaCustomer(row as any, {
      salesId: salespersonReferences.get(String(row.sales_id ?? ''))?.code ?? null,
    }))
    const body = buildWorkbook(customers, total, { customerType, marketScope, q })
    const filename = `customers_${new Date().toISOString().slice(0, 10)}.xlsx`

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
