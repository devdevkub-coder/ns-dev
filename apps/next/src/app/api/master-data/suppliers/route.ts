import { NextResponse } from 'next/server'
import { supplierFormSchema } from '@/lib/supplier'
import { mapPrismaSupplier, toSupplierWriteInput } from '@/lib/domain/supplier'
import { apiErrorResponse } from '@/lib/server/api-error'
import { AuthContextError, authContextErrorResponse, getCurrentAuthContext, requirePermission } from '@/lib/server/auth-context'
import { prisma } from '@/lib/server/prisma'
import { z } from 'zod'
import type { Prisma } from '../../../../../generated/prisma/client'

export const runtime = 'nodejs'

const sortColumns = {
  active: 'active',
  code: 'code',
  creditLimit: 'credit_limit',
  creditTerm: 'credit_term',
  accountNo: 'bank_account',
  bankName: 'bank_name',
  name: 'name',
  phone: 'phone',
  salesName: 'sales_rep',
  taxId: 'tax_id',
  type: 'type',
} as const

function parseListParams(request: Request) {
  const url = new URL(request.url)
  const all = url.searchParams.get('all') === '1'
  const page = Math.max(1, Number(url.searchParams.get('page') ?? '1') || 1)
  const pageSize = all ? 10000 : Math.min(100, Math.max(10, Number(url.searchParams.get('pageSize') ?? '25') || 25))
  const q = url.searchParams.get('q')?.trim() ?? ''
  const supplierType = url.searchParams.get('type')?.trim() ?? ''
  const marketScope = url.searchParams.get('marketScope')?.trim() ?? ''
  const salesId = url.searchParams.get('salesId')?.trim() ?? ''
  const sort = url.searchParams.get('sort') ?? 'code'
  const direction = url.searchParams.get('direction') === 'desc' ? 'desc' : 'asc'
  const sortColumn = sortColumns[sort as keyof typeof sortColumns] ?? sortColumns.code

  return { all, direction, marketScope, page, pageSize, q, salesId, sortColumn, supplierType }
}

function supplierSearchWhere(q: string, supplierType: string, marketScope: string, salesId: string): Prisma.suppliersWhereInput {
  const where: Prisma.suppliersWhereInput = {}

  if (supplierType) {
    where.type = supplierType
  }

  if (marketScope) {
    where.market_scope = marketScope
  }

  if (salesId) {
    where.sales_id = salesId
  }

  if (!q) return where

  where.OR = [
    { id: { contains: q, mode: 'insensitive' } },
    { code: { contains: q, mode: 'insensitive' } },
    { name: { contains: q, mode: 'insensitive' } },
    { type: { contains: q, mode: 'insensitive' } },
    { tax_id: { contains: q, mode: 'insensitive' } },
    { phone: { contains: q, mode: 'insensitive' } },
    { address: { contains: q, mode: 'insensitive' } },
    { bank_name: { contains: q, mode: 'insensitive' } },
    { bank_account: { contains: q, mode: 'insensitive' } },
    { bank_account_name: { contains: q, mode: 'insensitive' } },
    { branch_id: { contains: q, mode: 'insensitive' } },
    { sales_id: { contains: q, mode: 'insensitive' } },
    { sales_rep: { contains: q, mode: 'insensitive' } },
    { notes: { contains: q, mode: 'insensitive' } },
  ]

  return where
}

async function getNextSupplierCode() {
  const rows = await prisma.suppliers.findMany({
    orderBy: { code: 'desc' },
    select: { code: true },
    where: { code: { startsWith: 's', mode: 'insensitive' } },
  })
  const lastNumber = rows.reduce((max, row) => {
    const matched = String(row.code ?? '').toLowerCase().match(/^(?:su|sup|s)(\d{1,5})$/)
    const number = matched ? Number(matched[1]) : 0
    return Number.isFinite(number) && number > max ? number : max
  }, 0)
  const nextNumber = lastNumber + 1
  if (nextNumber > 99999) throw supplierCodeValidationError('รหัสผู้ขายเต็มช่วง SU0001-SU99999 แล้ว')
  return `SU${String(nextNumber).padStart(4, '0')}`
}

function supplierCodeValidationError(message: string) {
  return new z.ZodError([{ code: 'custom', message, path: ['code'] }])
}

function normalizeSupplierCode(value: string | null | undefined, fallback: string) {
  const rawCode = (value?.trim() || fallback).toLowerCase()
  const matched = rawCode.match(/^(?:su|sup|s)(\d{1,5})$/)
  if (!matched) throw supplierCodeValidationError('รหัสผู้ขายต้องเป็นรูปแบบ SU0001-SU99999')

  const number = Number(matched[1])
  if (!Number.isInteger(number) || number < 1 || number > 99999) throw supplierCodeValidationError('รหัสผู้ขายต้องอยู่ระหว่าง SU0001-SU99999')

  return `SU${String(number).padStart(4, '0')}`
}

async function getActiveSalespersonName(salesId: string | null) {
  if (!salesId) return null

  const salesperson = await prisma.salespersons.findFirst({
    select: { name: true },
    where: {
      active: true,
      id: salesId,
    },
  })

  if (!salesperson) {
    throw new Error('ผู้ดูแลที่เลือกไม่ถูกต้องหรือถูกปิดใช้งาน')
  }

  return salesperson.name
}

export async function GET(request: Request) {
  try {
    const context = await getCurrentAuthContext()
    requirePermission(context, 'master.suppliers.view')

    const { all, direction, marketScope, page, pageSize, q, salesId, sortColumn, supplierType } = parseListParams(request)
    const where = supplierSearchWhere(q, supplierType, marketScope, salesId)
    const [suppliers, total] = await Promise.all([
      prisma.suppliers.findMany({
        include: { branches: true },
        orderBy: [{ [sortColumn]: direction }, { id: 'asc' }],
        skip: all ? undefined : (page - 1) * pageSize,
        take: pageSize,
        where,
      }),
      prisma.suppliers.count({ where }),
    ])

    return NextResponse.json({
      rows: suppliers.map(mapPrismaSupplier),
      page: all ? 1 : page,
      pageSize,
      total,
      totalPages: all ? 1 : Math.max(1, Math.ceil(total / pageSize)),
    })
  } catch (caught) {
    if (caught instanceof AuthContextError) return authContextErrorResponse(caught)
    return apiErrorResponse(caught, 'โหลดข้อมูลผู้ขายไม่ได้', 500)
  }
}

export async function POST(request: Request) {
  try {
    const context = await getCurrentAuthContext()
    requirePermission(context, 'master.suppliers.create')

    const body = await request.json()
    const values = supplierFormSchema.parse(body)
    const salesName = await getActiveSalespersonName(values.salesId)
    const code = normalizeSupplierCode(values.code, values.id || await getNextSupplierCode())
    const payload = toSupplierWriteInput({ ...values, code, salesName })

    const supplier = await prisma.suppliers.upsert({
      where: {
        id: payload.id,
      },
      create: payload,
      update: payload,
      include: { branches: true },
    })

    return NextResponse.json(mapPrismaSupplier(supplier))
  } catch (caught) {
    if (caught instanceof AuthContextError) return authContextErrorResponse(caught)
    return apiErrorResponse(caught, 'บันทึกข้อมูลผู้ขายไม่ได้', 400)
  }
}
