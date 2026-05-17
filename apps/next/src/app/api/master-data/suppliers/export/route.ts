import { NextResponse } from 'next/server'
import * as XLSX from 'xlsx'
import { mapPrismaSupplier } from '@/lib/domain/supplier'
import { prisma } from '@/lib/server/prisma'
import type { Supplier } from '@/lib/supplier'
import type { Prisma } from '../../../../../../generated/prisma/client'

export const runtime = 'nodejs'

const EXPORT_LIMIT = 10000

const sortColumns = {
  active: 'active',
  code: 'code',
  contact: 'contact',
  creditLimit: 'credit_limit',
  creditTerm: 'credit_term',
  email: 'email',
  name: 'name',
  phone: 'phone',
  taxId: 'tax_id',
  type: 'type',
} as const

const supplierColumns: Array<{ key: keyof Supplier; label: string; width: number; type?: 'number' }> = [
  { key: 'code', label: 'รหัสผู้ขาย', width: 90 },
  { key: 'name', label: 'ชื่อผู้ขาย/บริษัท', width: 220 },
  { key: 'type', label: 'ประเภทผู้ขาย', width: 110 },
  { key: 'marketScope', label: 'ประเทศ/ตลาด', width: 110 },
  { key: 'nameTitle', label: 'คำนำหน้าชื่อ', width: 100 },
  { key: 'firstName', label: 'ชื่อ', width: 140 },
  { key: 'lastName', label: 'นามสกุล', width: 140 },
  { key: 'taxId', label: 'เลขผู้เสียภาษี', width: 130 },
  { key: 'phone', label: 'โทรศัพท์', width: 130 },
  { key: 'email', label: 'อีเมล', width: 200 },
  { key: 'contact', label: 'ผู้ติดต่อ', width: 180 },
  { key: 'contactTitle', label: 'คำนำหน้าผู้ติดต่อ', width: 120 },
  { key: 'contactFirstName', label: 'ชื่อผู้ติดต่อ', width: 140 },
  { key: 'contactLastName', label: 'นามสกุลผู้ติดต่อ', width: 140 },
  { key: 'addressPostalCode', label: 'รหัสไปรษณีย์', width: 100 },
  { key: 'addressProvince', label: 'จังหวัด', width: 120 },
  { key: 'addressDistrict', label: 'อำเภอ/เขต', width: 120 },
  { key: 'addressSubdistrict', label: 'ตำบล/แขวง', width: 120 },
  { key: 'addressNo', label: 'บ้านเลขที่', width: 100 },
  { key: 'addressMoo', label: 'หมู่', width: 70 },
  { key: 'addressVillage', label: 'หมู่บ้าน/อาคาร', width: 180 },
  { key: 'addressRoad', label: 'ถนน', width: 140 },
  { key: 'addressCountry', label: 'ประเทศ', width: 100 },
  { key: 'address', label: 'ที่อยู่เต็ม/หมายเหตุที่อยู่', width: 300 },
  { key: 'creditTerm', label: 'เครดิตเทอม (วัน)', width: 110, type: 'number' },
  { key: 'creditLimit', label: 'วงเงินเครดิต', width: 120, type: 'number' },
  { key: 'active', label: 'สถานะ', width: 90 },
  { key: 'notes', label: 'หมายเหตุ', width: 240 },
  { key: 'createdAt', label: 'สร้างเมื่อ', width: 150 },
  { key: 'updatedAt', label: 'แก้ไขเมื่อ', width: 150 },
  { key: 'id', label: 'รหัสภายใน', width: 180 },
]

function parseExportParams(request: Request) {
  const url = new URL(request.url)
  const q = url.searchParams.get('q')?.trim() ?? ''
  const supplierType = url.searchParams.get('type')?.trim() ?? ''
  const marketScope = url.searchParams.get('marketScope')?.trim() ?? ''
  const sort = url.searchParams.get('sort') ?? 'code'
  const direction = url.searchParams.get('direction') === 'desc' ? 'desc' : 'asc'
  const sortColumn = sortColumns[sort as keyof typeof sortColumns] ?? sortColumns.code

  return { supplierType, direction, marketScope, q, sortColumn }
}

function supplierSearchWhere(q: string, supplierType: string, marketScope: string): Prisma.suppliersWhereInput {
  const where: Prisma.suppliersWhereInput = {}

  if (supplierType) {
    where.type = supplierType
  }

  if (marketScope) {
    where.market_scope = marketScope
  }

  if (!q) return where

  where.OR = [
    { id: { contains: q, mode: 'insensitive' } },
    { code: { contains: q, mode: 'insensitive' } },
    { name: { contains: q, mode: 'insensitive' } },
    { type: { contains: q, mode: 'insensitive' } },
    { tax_id: { contains: q, mode: 'insensitive' } },
    { phone: { contains: q, mode: 'insensitive' } },
    { email: { contains: q, mode: 'insensitive' } },
    { address: { contains: q, mode: 'insensitive' } },
    { contact: { contains: q, mode: 'insensitive' } },
    { bank_name: { contains: q, mode: 'insensitive' } },
    { bank_account: { contains: q, mode: 'insensitive' } },
    { bank_account_name: { contains: q, mode: 'insensitive' } },
    { branch_id: { contains: q, mode: 'insensitive' } },
    { notes: { contains: q, mode: 'insensitive' } },
  ]

  return where
}

function formatCellValue(supplier: Supplier, key: keyof Supplier) {
  const value = supplier[key]
  if (value === null || value === undefined || value === '') return ''
  if (typeof value === 'boolean') return value ? 'ใช้งาน' : 'ปิด'
  if (typeof value === 'number') return value
  return String(value)
}

function buildWorkbook(suppliers: Supplier[], total: number, filters: { supplierType: string; marketScope: string; q: string }) {
  const generatedAt = new Date()
  const summaryRows = [
    ['Export ณ', generatedAt.toLocaleString('th-TH')],
    ['จำนวนที่ export', suppliers.length.toLocaleString('th-TH')],
    ['จำนวนทั้งหมดตาม filter', total.toLocaleString('th-TH')],
    ['ค้นหา', filters.q || '-'],
    ['ประเภทผู้ขาย', filters.supplierType || 'ทุกประเภท'],
    ['ประเทศ/ตลาด', filters.marketScope || 'ทุกตลาด'],
  ]

  const dataRows = suppliers.map((supplier) => Object.fromEntries(
    supplierColumns.map((column) => [column.label, formatCellValue(supplier, column.key)]),
  ))
  const workbook = XLSX.utils.book_new()
  const summarySheet = XLSX.utils.aoa_to_sheet(summaryRows)
  const supplierSheet = XLSX.utils.json_to_sheet(dataRows, {
    header: supplierColumns.map((column) => column.label),
  })

  summarySheet['!cols'] = [{ wch: 24 }, { wch: 28 }]
  supplierSheet['!cols'] = supplierColumns.map((column) => ({ wch: Math.max(10, Math.round(column.width / 8)) }))
  XLSX.utils.book_append_sheet(workbook, summarySheet, 'สรุป')
  XLSX.utils.book_append_sheet(workbook, supplierSheet, 'ผู้ขาย')
  return XLSX.write(workbook, { bookType: 'xlsx', type: 'buffer' }) as Buffer
}

export async function GET(request: Request) {
  try {
    const { supplierType, direction, marketScope, q, sortColumn } = parseExportParams(request)
    const where = supplierSearchWhere(q, supplierType, marketScope)
    const [rows, total] = await Promise.all([
      prisma.suppliers.findMany({
        include: { branches: true },
        orderBy: [{ [sortColumn]: direction }, { id: 'asc' }],
        take: EXPORT_LIMIT,
        where,
      }),
      prisma.suppliers.count({ where }),
    ])

    const suppliers = rows.map(mapPrismaSupplier)
    const body = buildWorkbook(suppliers, total, { supplierType, marketScope, q })
    const filename = `suppliers_${new Date().toISOString().slice(0, 10)}.xlsx`

    return new NextResponse(new Uint8Array(body), {
      headers: {
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      },
    })
  } catch (caught) {
    return NextResponse.json({ error: caught instanceof Error ? caught.message : 'Export Excel ไม่สำเร็จ' }, { status: 500 })
  }
}
