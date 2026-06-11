import { NextResponse } from 'next/server'
import { mapPrismaProduct, toProductWriteInput } from '@/lib/domain/product'
import { parseInternalBigIntId } from '@/lib/business-code'
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
  type: 'type',
  unit: 'unit',
} as const

const productSelect = {
  active: true,
  code: true,
  created_at: true,
  id: true,
  image_storage_key: true,
  image_thumbnail_storage_key: true,
  name: true,
  type: true,
  unit: true,
  updated_at: true,
} satisfies Prisma.productsSelect

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
    { code: { contains: q, mode: 'insensitive' } },
    { name: { contains: q, mode: 'insensitive' } },
    { type: { contains: q, mode: 'insensitive' } },
    { unit: { contains: q, mode: 'insensitive' } },
  ]

  return where
}

async function assertActiveProductType(name: string | null) {
  if (!name) return

  const productType = await prisma.product_types.findFirst({
    select: { id: true },
    where: {
      active: true,
      name,
    },
  })

  if (!productType) {
    throw new Error('ประเภทสินค้าที่เลือกไม่ถูกต้องหรือถูกปิดใช้งาน')
  }
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

  if (!productUnit) {
    throw new Error('หน่วยสินค้าที่เลือกไม่ถูกต้องหรือถูกปิดใช้งาน')
  }
}

async function getNextProductCode() {
  const existingProducts = await prisma.products.findMany({
    select: { code: true },
    where: { code: { startsWith: 'SKU' } },
  })
  const maxNumber = existingProducts.reduce((max, row) => {
    const matched = String(row.code ?? '').match(/^SKU(\d+)$/i)
    const value = matched ? Number(matched[1]) : 0
    return Number.isFinite(value) ? Math.max(max, value) : max
  }, 0)
  const nextNumber = maxNumber + 1

  if (nextNumber > 99999) {
    throw new Error('รหัสสินค้าเต็มช่วง SKU001-SKU99999 แล้ว')
  }

  return `SKU${String(nextNumber).padStart(3, '0')}`
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
        select: productSelect,
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
    const formValues = productFormSchema.parse(await request.json())
    const existingProduct = formValues.id
      ? await prisma.products.findFirst({
        select: { id: true },
        where: {
          OR: [{ code: formValues.id.toUpperCase() }, ...(parseInternalBigIntId(formValues.id) != null ? [{ id: parseInternalBigIntId(formValues.id) as bigint }] : [])],
        } as Prisma.productsWhereInput,
      })
      : null
    const isUpdate = Boolean(formValues.id)
    requirePermission(context, isUpdate ? 'master.products.update' : 'master.products.create')
    if (formValues.id && !existingProduct) {
      return NextResponse.json({ code: 'NOT_FOUND', error: 'ไม่พบสินค้าที่ต้องการแก้ไข' }, { status: 404 })
    }
    const values = formValues.id
      ? formValues
      : productFormSchema.parse({ ...formValues, code: await getNextProductCode() })
    await Promise.all([
      assertActiveProductType(values.type),
      assertActiveProductUnit(values.unit),
    ])
    const payload = toProductWriteInput(values)

    const codeOwner = await prisma.products.findFirst({ select: { id: true }, where: { code: payload.code } })
    if (codeOwner && (!existingProduct || codeOwner.id !== existingProduct.id)) {
      return NextResponse.json({ code: 'CONFLICT', error: 'รหัสสินค้านี้มีอยู่แล้ว' }, { status: 409 })
    }

    const product = existingProduct
      ? await prisma.products.update({ where: { id: existingProduct.id }, data: payload, select: productSelect })
      : await prisma.products.create({ data: payload, select: productSelect })

    return NextResponse.json(mapPrismaProduct(product))
  } catch (caught) {
    if (caught instanceof AuthContextError) return authContextErrorResponse(caught)
    return apiErrorResponse(caught, 'บันทึกข้อมูลสินค้าไม่ได้', 400)
  }
}
// touched for client reload
