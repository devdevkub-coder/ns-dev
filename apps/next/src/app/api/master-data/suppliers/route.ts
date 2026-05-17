import { NextResponse } from 'next/server'
import { resolveMx } from 'node:dns/promises'
import { supplierFormSchema } from '@/lib/supplier'
import { mapPrismaSupplier, toSupplierWriteInput } from '@/lib/domain/supplier'
import { prisma } from '@/lib/server/prisma'
import type { Prisma } from '../../../../../generated/prisma/client'

export const runtime = 'nodejs'

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

function parseListParams(request: Request) {
  const url = new URL(request.url)
  const all = url.searchParams.get('all') === '1'
  const page = Math.max(1, Number(url.searchParams.get('page') ?? '1') || 1)
  const pageSize = all ? 10000 : Math.min(100, Math.max(10, Number(url.searchParams.get('pageSize') ?? '25') || 25))
  const q = url.searchParams.get('q')?.trim() ?? ''
  const supplierType = url.searchParams.get('type')?.trim() ?? ''
  const marketScope = url.searchParams.get('marketScope')?.trim() ?? ''
  const sort = url.searchParams.get('sort') ?? 'code'
  const direction = url.searchParams.get('direction') === 'desc' ? 'desc' : 'asc'
  const sortColumn = sortColumns[sort as keyof typeof sortColumns] ?? sortColumns.code

  return { all, direction, marketScope, page, pageSize, q, sortColumn, supplierType }
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

async function getNextSupplierCode() {
  const lastSupplier = await prisma.suppliers.findFirst({
    where: {
      code: {
        startsWith: 'SUP',
      },
    },
    orderBy: {
      code: 'desc',
    },
    select: {
      code: true,
    },
  })

  const lastNumber = Number(String(lastSupplier?.code ?? '').replace(/^SUP/i, ''))
  const nextNumber = Number.isFinite(lastNumber) ? lastNumber + 1 : 1
  return `SUP${String(nextNumber).padStart(3, '0')}`
}

async function assertEmailDomainCanReceiveMail(email: string | null) {
  if (!email) return

  const domain = email.split('@')[1]?.toLowerCase()
  if (!domain) {
    throw new Error('รูปแบบอีเมลไม่ถูกต้อง')
  }

  try {
    const records = await resolveMx(domain)
    if (records.length === 0) {
      throw new Error('โดเมนอีเมลนี้ไม่รองรับการรับอีเมล')
    }
  } catch {
    throw new Error('ตรวจสอบโดเมนอีเมลไม่ผ่าน')
  }
}

export async function GET(request: Request) {
  try {
    const { all, direction, marketScope, page, pageSize, q, sortColumn, supplierType } = parseListParams(request)
    const where = supplierSearchWhere(q, supplierType, marketScope)
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
    return NextResponse.json({ error: caught instanceof Error ? caught.message : 'โหลดข้อมูลผู้ขายไม่ได้' }, { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const values = supplierFormSchema.parse(body)
    await assertEmailDomainCanReceiveMail(values.email)
    const code = values.id ? values.code : await getNextSupplierCode()
    const payload = toSupplierWriteInput({ ...values, code })

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
    return NextResponse.json({ error: caught instanceof Error ? caught.message : 'บันทึกข้อมูลผู้ขายไม่ได้' }, { status: 400 })
  }
}
