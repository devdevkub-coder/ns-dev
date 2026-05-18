import { NextResponse } from 'next/server'
import * as XLSX from 'xlsx'
import { mapPrismaProduct } from '@/lib/domain/product'
import { apiErrorResponse } from '@/lib/server/api-error'
import { AuthContextError, authContextErrorResponse, getCurrentAuthContext, requirePermission } from '@/lib/server/auth-context'
import { prisma } from '@/lib/server/prisma'
import { applyWorksheetTableLayout } from '@/lib/server/xlsx'
import type { Product } from '@/lib/product'
import type { Prisma } from '../../../../../../generated/prisma/client'

export const runtime = 'nodejs'

const EXPORT_LIMIT = 10000

const sortColumns = {
  active: 'active',
  code: 'code',
  name: 'name',
  targetMarginPct: 'target_margin_pct',
  type: 'type',
  unit: 'unit',
} as const

const productColumns: Array<{ key: keyof Product; label: string; width: number }> = [
  { key: 'code', label: 'รหัสสินค้า', width: 90 },
  { key: 'name', label: 'ชื่อสินค้า', width: 220 },
  { key: 'type', label: 'ประเภทสินค้า', width: 140 },
  { key: 'unit', label: 'หน่วย', width: 80 },
  { key: 'targetMarginPct', label: 'Target Margin %', width: 120 },
  { key: 'active', label: 'สถานะ', width: 90 },
  { key: 'createdAt', label: 'สร้างเมื่อ', width: 150 },
  { key: 'updatedAt', label: 'แก้ไขเมื่อ', width: 150 },
  { key: 'id', label: 'รหัสภายใน', width: 160 },
]

function parseExportParams(request: Request) {
  const url = new URL(request.url)
  const active = url.searchParams.get('active')?.trim() ?? ''
  const q = url.searchParams.get('q')?.trim() ?? ''
  const productType = url.searchParams.get('type')?.trim() ?? ''
  const sort = url.searchParams.get('sort') ?? 'code'
  const direction = url.searchParams.get('direction') === 'desc' ? 'desc' : 'asc'
  const sortColumn = sortColumns[sort as keyof typeof sortColumns] ?? sortColumns.code

  return { active, direction, productType, q, sortColumn }
}

function productSearchWhere(q: string, filters: { active: string; productType: string }): Prisma.productsWhereInput {
  const where: Prisma.productsWhereInput = {}

  if (filters.active === 'active') where.active = true
  if (filters.active === 'inactive') where.active = false
  if (filters.productType) where.type = filters.productType

  if (!q) return where

  where.OR = [
    { id: { contains: q, mode: 'insensitive' } },
    { code: { contains: q, mode: 'insensitive' } },
    { name: { contains: q, mode: 'insensitive' } },
    { type: { contains: q, mode: 'insensitive' } },
    { unit: { contains: q, mode: 'insensitive' } },
  ]

  return where
}

function formatCellValue(product: Product, key: keyof Product) {
  const value = product[key]
  if (value === null || value === undefined || value === '') return ''
  if (typeof value === 'boolean') return value ? 'ใช้งาน' : 'ปิด'
  if (typeof value === 'number') return value
  return String(value)
}

function buildWorkbook(products: Product[], total: number, filters: { active: string; productType: string; q: string }) {
  const generatedAt = new Date()
  const summaryRows = [
    ['Export ณ', generatedAt.toLocaleString('th-TH')],
    ['จำนวนที่ export', products.length.toLocaleString('th-TH')],
    ['จำนวนทั้งหมดตาม filter', total.toLocaleString('th-TH')],
    ['ค้นหา', filters.q || '-'],
    ['ประเภทสินค้า', filters.productType || 'ทุกประเภท'],
    ['สถานะใช้งาน', filters.active || 'ทั้งหมด'],
  ]

  const dataRows = products.map((product) => Object.fromEntries(
    productColumns.map((column) => [column.label, formatCellValue(product, column.key)]),
  ))
  const workbook = XLSX.utils.book_new()
  const summarySheet = XLSX.utils.aoa_to_sheet(summaryRows)
  const productSheet = XLSX.utils.json_to_sheet(dataRows, {
    header: productColumns.map((column) => column.label),
  })

  summarySheet['!cols'] = [{ wch: 24 }, { wch: 28 }]
  productSheet['!cols'] = productColumns.map((column) => ({ wch: Math.max(10, Math.round(column.width / 8)) }))
  applyWorksheetTableLayout(productSheet, productColumns.length, dataRows.length + 1)
  XLSX.utils.book_append_sheet(workbook, summarySheet, 'สรุป')
  XLSX.utils.book_append_sheet(workbook, productSheet, 'สินค้า')
  return XLSX.write(workbook, { bookType: 'xlsx', type: 'buffer' }) as Buffer
}

export async function GET(request: Request) {
  try {
    const context = await getCurrentAuthContext()
    requirePermission(context, 'master.products.export')

    const { active, direction, productType, q, sortColumn } = parseExportParams(request)
    const where = productSearchWhere(q, { active, productType })
    const [rows, total] = await Promise.all([
      prisma.products.findMany({
        orderBy: [{ [sortColumn]: direction }, { id: 'asc' }],
        take: EXPORT_LIMIT,
        where,
      }),
      prisma.products.count({ where }),
    ])

    const products = rows.map(mapPrismaProduct)
    const body = buildWorkbook(products, total, { active, productType, q })
    const filename = `products_${new Date().toISOString().slice(0, 10)}.xlsx`

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
