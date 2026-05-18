import { NextResponse } from 'next/server'
import { resolveMx } from 'node:dns/promises'
import { customerFormSchema } from '@/lib/customer'
import { mapPrismaCustomer, toCustomerWriteInput } from '@/lib/domain/customer'
import { apiErrorResponse } from '@/lib/server/api-error'
import { AuthContextError, authContextErrorResponse, getCurrentAuthContext, requirePermission } from '@/lib/server/auth-context'
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
  const customerType = url.searchParams.get('type')?.trim() ?? ''
  const marketScope = url.searchParams.get('marketScope')?.trim() ?? ''
  const sort = url.searchParams.get('sort') ?? 'code'
  const direction = url.searchParams.get('direction') === 'desc' ? 'desc' : 'asc'
  const sortColumn = sortColumns[sort as keyof typeof sortColumns] ?? sortColumns.code

  return { all, customerType, direction, marketScope, page, pageSize, q, sortColumn }
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
      { id: { contains: q, mode: 'insensitive' } },
      { code: { contains: q, mode: 'insensitive' } },
      { name: { contains: q, mode: 'insensitive' } },
      { type: { contains: q, mode: 'insensitive' } },
      { tax_id: { contains: q, mode: 'insensitive' } },
      { phone: { contains: q, mode: 'insensitive' } },
      { email: { contains: q, mode: 'insensitive' } },
      { address: { contains: q, mode: 'insensitive' } },
      { contact: { contains: q, mode: 'insensitive' } },
      { sales_id: { contains: q, mode: 'insensitive' } },
      { notes: { contains: q, mode: 'insensitive' } },
    ]

  return where
}

async function getNextCustomerCode() {
  const lastCustomer = await prisma.customers.findFirst({
    where: {
      code: {
        startsWith: 'CUS',
      },
    },
    orderBy: {
      code: 'desc',
    },
    select: {
      code: true,
    },
  })

  const lastNumber = Number(String(lastCustomer?.code ?? '').replace(/^CUS/i, ''))
  const nextNumber = Number.isFinite(lastNumber) ? lastNumber + 1 : 1
  return `CUS${String(nextNumber).padStart(3, '0')}`
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
    const context = await getCurrentAuthContext()
    requirePermission(context, 'master.customers.view')

    const { all, customerType, direction, marketScope, page, pageSize, q, sortColumn } = parseListParams(request)
    const where = customerSearchWhere(q, customerType, marketScope)
    const [customers, total] = await Promise.all([
      prisma.customers.findMany({
        orderBy: [{ [sortColumn]: direction }, { id: 'asc' }],
        skip: all ? undefined : (page - 1) * pageSize,
        take: all ? pageSize : pageSize,
        where,
      }),
      prisma.customers.count({ where }),
    ])

    return NextResponse.json({
      rows: customers.map(mapPrismaCustomer),
      page: all ? 1 : page,
      pageSize,
      total,
      totalPages: all ? 1 : Math.max(1, Math.ceil(total / pageSize)),
    })
  } catch (caught) {
    if (caught instanceof AuthContextError) return authContextErrorResponse(caught)
    return apiErrorResponse(caught, 'โหลดข้อมูลลูกค้าไม่ได้', 500)
  }
}

export async function POST(request: Request) {
  try {
    const context = await getCurrentAuthContext()
    requirePermission(context, 'master.customers.create')

    const body = await request.json()
    const values = customerFormSchema.parse(body)
    await assertEmailDomainCanReceiveMail(values.email)
    const code = values.id ? values.code : await getNextCustomerCode()
    const payload = toCustomerWriteInput({ ...values, code })

    const customer = await prisma.customers.upsert({
      where: {
        id: payload.id,
      },
      create: payload,
      update: payload,
    })

    return NextResponse.json(mapPrismaCustomer(customer))
  } catch (caught) {
    if (caught instanceof AuthContextError) return authContextErrorResponse(caught)
    return apiErrorResponse(caught, 'บันทึกข้อมูลลูกค้าไม่ได้', 400)
  }
}
