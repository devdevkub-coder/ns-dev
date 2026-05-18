import { NextResponse } from 'next/server'
import { mapPrismaProduct, toProductWriteInput } from '@/lib/domain/product'
import { productFormSchema } from '@/lib/product'
import { apiErrorResponse } from '@/lib/server/api-error'
import { AuthContextError, authContextErrorResponse, getCurrentAuthContext, requirePermission } from '@/lib/server/auth-context'
import { prisma } from '@/lib/server/prisma'
import type { Prisma } from '../../../../../generated/prisma/client'

export const runtime = 'nodejs'

const sortColumns = {
  active: 'active',
  code: 'code',
  name: 'name',
  targetMarginPct: 'target_margin_pct',
  type: 'type',
  unit: 'unit',
} as const

function parseListParams(request: Request) {
  const url = new URL(request.url)
  const active = url.searchParams.get('active')?.trim() ?? ''
  const all = url.searchParams.get('all') === '1'
  const page = Math.max(1, Number(url.searchParams.get('page') ?? '1') || 1)
  const pageSize = all ? 10000 : Math.min(100, Math.max(10, Number(url.searchParams.get('pageSize') ?? '25') || 25))
  const q = url.searchParams.get('q')?.trim() ?? ''
  const productType = url.searchParams.get('type')?.trim() ?? ''
  const sort = url.searchParams.get('sort') ?? 'code'
  const direction = url.searchParams.get('direction') === 'desc' ? 'desc' : 'asc'
  const sortColumn = sortColumns[sort as keyof typeof sortColumns] ?? sortColumns.code

  return { active, all, direction, page, pageSize, productType, q, sortColumn }
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

export async function GET(request: Request) {
  try {
    const context = await getCurrentAuthContext()
    requirePermission(context, 'master.products.view')

    const { active, all, direction, page, pageSize, productType, q, sortColumn } = parseListParams(request)
    const where = productSearchWhere(q, { active, productType })
    const [products, total] = await Promise.all([
      prisma.products.findMany({
        orderBy: [{ [sortColumn]: direction }, { id: 'asc' }],
        skip: all ? undefined : (page - 1) * pageSize,
        take: pageSize,
        where,
      }),
      prisma.products.count({ where }),
    ])

    return NextResponse.json({
      rows: products.map(mapPrismaProduct),
      page: all ? 1 : page,
      pageSize,
      total,
      totalPages: all ? 1 : Math.max(1, Math.ceil(total / pageSize)),
    })
  } catch (caught) {
    if (caught instanceof AuthContextError) return authContextErrorResponse(caught)
    return apiErrorResponse(caught, 'โหลดข้อมูลสินค้าไม่ได้', 500)
  }
}

export async function POST(request: Request) {
  try {
    const context = await getCurrentAuthContext()
    const values = productFormSchema.parse(await request.json())
    const payload = toProductWriteInput(values)

    const existing = await prisma.products.findUnique({ where: { id: payload.id } })
    if (values.id) {
      requirePermission(context, 'master.products.update')
    } else {
      requirePermission(context, 'master.products.create')
      if (existing) {
        return NextResponse.json({ code: 'CONFLICT', error: 'รหัสสินค้านี้มีอยู่แล้ว' }, { status: 409 })
      }
    }

    const product = values.id
      ? await prisma.products.update({ where: { id: payload.id }, data: payload })
      : await prisma.products.create({ data: payload })

    return NextResponse.json(mapPrismaProduct(product))
  } catch (caught) {
    if (caught instanceof AuthContextError) return authContextErrorResponse(caught)
    return apiErrorResponse(caught, 'บันทึกข้อมูลสินค้าไม่ได้', 400)
  }
}
