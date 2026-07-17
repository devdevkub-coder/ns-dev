import { NextResponse } from 'next/server'
import { resolveMx } from 'node:dns/promises'
import { parseInternalBigIntId } from '@/lib/business-code'
import { customerFormSchema } from '@/lib/customer'
import { mapPrismaCustomer, toCustomerWriteInput } from '@/lib/domain/customer'
import { apiErrorResponse } from '@/lib/server/api-error'
import { AuthContextError, authContextErrorResponse, getCurrentAuthContext, requirePermission } from '@/lib/server/auth-context'
import { prisma } from '@/lib/server/prisma'
import { invalidateCustomerReferenceCache } from '@/lib/server/reference-master-cache'
import { findActiveSalespersonReferenceByCodeOrId, listSalespersonReferencesByIds } from '@/lib/server/salesperson-reference'
import type { Prisma } from '../../../../../generated/prisma/client'

export const runtime = 'nodejs'

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

function uniqueBranchCodes(values: string[]) {
  return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean)))
}

async function syncCustomerBranches(
  tx: Prisma.TransactionClient,
  input: {
    actor: string | null
    branchCodes: string[]
    customerId: bigint
    primaryBranchCode: string | null
  },
) {
  const branchCodes = uniqueBranchCodes(input.branchCodes)
  if (input.primaryBranchCode && !branchCodes.includes(input.primaryBranchCode)) {
    branchCodes.unshift(input.primaryBranchCode)
  }

  const branches = branchCodes.length
    ? await tx.branches.findMany({
      select: { code: true, id: true },
      where: { active: true, code: { in: branchCodes } },
    })
    : []
  const branchByCode = new Map(branches.map((branch) => [branch.code, branch] as const))
  const missingCodes = branchCodes.filter((code) => !branchByCode.has(code))
  if (missingCodes.length) {
    throw new Error(`สาขาไม่ถูกต้องหรือถูกปิดใช้งาน: ${missingCodes.join(', ')}`)
  }

  const primaryCode = input.primaryBranchCode && branchByCode.has(input.primaryBranchCode)
    ? input.primaryBranchCode
    : branchCodes[0] ?? null

  await tx.customer_branches.updateMany({
    data: { active: false, is_primary: false, updated_at: new Date(), updated_by: input.actor },
    where: { customer_id: input.customerId },
  })

  for (const code of branchCodes) {
    const branch = branchByCode.get(code)
    if (!branch) continue
    await tx.customer_branches.upsert({
      create: {
        active: true,
        branch_id: branch.id,
        created_by: input.actor,
        customer_id: input.customerId,
        is_primary: code === primaryCode,
        updated_by: input.actor,
      },
      update: {
        active: true,
        is_primary: code === primaryCode,
        updated_at: new Date(),
        updated_by: input.actor,
      },
      where: {
        customer_id_branch_id: {
          branch_id: branch.id,
          customer_id: input.customerId,
        },
      },
    })
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
        include: customerInclude,
        orderBy: [{ [sortColumn]: direction }, { id: 'asc' }],
        skip: all ? undefined : (page - 1) * pageSize,
        take: all ? pageSize : pageSize,
        where,
      }),
      prisma.customers.count({ where }),
    ])
    const salespersonReferences = await listSalespersonReferencesByIds(customers.map((customer) => customer.sales_id))

    return NextResponse.json({
      rows: customers.map((customer) => mapPrismaCustomer(customer as any, {
        salesId: salespersonReferences.get(String(customer.sales_id ?? ''))?.code ?? null,
      })),
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
    const hasBranchMappingPayload = Object.prototype.hasOwnProperty.call(body, 'branchIds')
      || Object.prototype.hasOwnProperty.call(body, 'primaryBranchId')
    const values = customerFormSchema.parse(body)
    await assertEmailDomainCanReceiveMail(values.email)
    const existingCustomer = values.id
      ? await prisma.customers.findFirst({
        select: { code: true, id: true },
        where: {
          OR: [
            { code: values.id.toUpperCase() },
            ...(parseInternalBigIntId(values.id) != null ? [{ id: parseInternalBigIntId(values.id) as bigint }] : []),
          ],
        } as Prisma.customersWhereInput,
      })
      : null
    const resolvedSalesperson = values.salesId
      ? await findActiveSalespersonReferenceByCodeOrId(values.salesId)
      : null

    if (values.salesId && !resolvedSalesperson) {
      return NextResponse.json({ code: 'BAD_REQUEST', error: 'พนักงานขายไม่ถูกต้องหรือถูกปิดใช้งาน' }, { status: 400 })
    }

    const code = values.id ? values.code ?? existingCustomer?.code ?? values.id : await getNextCustomerCode()
    const payload = toCustomerWriteInput(
      { ...values, code },
      {
        salesId: resolvedSalesperson?.id ?? null,
      },
    )

    const actor = context.appUser?.email ?? context.authUser.email ?? null
    const customer = await prisma.$transaction(async (tx) => {
      const savedCustomer = existingCustomer
        ? await tx.customers.update({
          where: { id: existingCustomer.id },
          data: payload as Prisma.customersUpdateInput,
        })
        : await tx.customers.create({
          data: payload as Prisma.customersCreateInput,
        })

      if (hasBranchMappingPayload) {
        await syncCustomerBranches(tx, {
          actor,
          branchCodes: values.branchIds,
          customerId: savedCustomer.id,
          primaryBranchCode: values.primaryBranchId,
        })
      }

      return tx.customers.findUniqueOrThrow({
        include: customerInclude,
        where: { id: savedCustomer.id },
      })
    })
    await invalidateCustomerReferenceCache()

    return NextResponse.json(mapPrismaCustomer(customer as any, {
      salesId: resolvedSalesperson?.code ?? null,
    }))
  } catch (caught) {
    if (caught instanceof AuthContextError) return authContextErrorResponse(caught)
    return apiErrorResponse(caught, 'บันทึกข้อมูลลูกค้าไม่ได้', 400)
  }
}
