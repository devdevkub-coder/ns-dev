import { NextResponse } from 'next/server'
import { parseInternalBigIntId } from '@/lib/business-code'
import { supplierFormSchema, throwSupplierBankAccountValidationError, type SupplierPaymentMethodRecord } from '@/lib/supplier'
import { mapPrismaSupplier, supplierBankAccountRows, toSupplierWriteInput } from '@/lib/domain/supplier'
import { apiErrorResponse } from '@/lib/server/api-error'
import { AuthContextError, authContextErrorResponse, getCurrentAuthContext, requirePermission } from '@/lib/server/auth-context'
import { getActivePaymentMethods } from '@/lib/server/payment-methods'
import { prisma } from '@/lib/server/prisma'
import { findActiveBranchReferenceByCodeOrId } from '@/lib/server/branch-reference'
import { findActiveSalespersonReferenceByCodeOrId, listSalespersonReferencesByIds } from '@/lib/server/salesperson-reference'
import { z } from 'zod'
import type { Prisma } from '../../../../../generated/prisma/client'

export const runtime = 'nodejs'

const sortColumns = {
  active: 'active',
  code: 'code',
  accountNo: 'bank_account',
  bankName: 'bank_name',
  name: 'name',
  phone: 'phone',
  salesName: 'sales_rep',
  taxId: 'tax_id',
  type: 'type',
} as const

const supplierInclude = {
  branches: true,
  supplier_bank_accounts: {
    orderBy: [{ is_primary: 'desc' }, { id: 'asc' }],
  },
} satisfies Prisma.suppliersInclude

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

function supplierSearchWhere(q: string, supplierType: string, marketScope: string, salesId: bigint | null): Prisma.suppliersWhereInput {
  const where: Prisma.suppliersWhereInput = {}

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
    { bank_name: { contains: q, mode: 'insensitive' } },
    { bank_account: { contains: q, mode: 'insensitive' } },
    { bank_account_name: { contains: q, mode: 'insensitive' } },
    { branches: { is: { code: { contains: q, mode: 'insensitive' } } } },
    { sales_rep: { contains: q, mode: 'insensitive' } },
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

export async function GET(request: Request) {
  try {
    const context = await getCurrentAuthContext()
    requirePermission(context, 'master.suppliers.view')

    const { all, direction, marketScope, page, pageSize, q, salesId, sortColumn, supplierType } = parseListParams(request)
    const resolvedSalesperson = salesId ? await findActiveSalespersonReferenceByCodeOrId(salesId) : null
    if (salesId && !resolvedSalesperson) {
      return NextResponse.json({
        rows: [],
        page: all ? 1 : page,
        pageSize,
        total: 0,
        totalPages: 1,
      })
    }
    const where = supplierSearchWhere(q, supplierType, marketScope, resolvedSalesperson?.id ?? null)
    const [suppliers, total, paymentMethods] = await Promise.all([
      prisma.suppliers.findMany({
        include: supplierInclude,
        orderBy: [{ [sortColumn]: direction }, { id: 'asc' }],
        skip: all ? undefined : (page - 1) * pageSize,
        take: pageSize,
        where,
      }),
      prisma.suppliers.count({ where }),
      getActivePaymentMethods() as Promise<SupplierPaymentMethodRecord[]>,
    ])
    const salespersonReferences = await listSalespersonReferencesByIds(suppliers.map((supplier) => supplier.sales_id))

    return NextResponse.json({
      rows: suppliers.map((supplier) => mapPrismaSupplier(supplier as any, paymentMethods, {
        salesId: salespersonReferences.get(String(supplier.sales_id ?? ''))?.code ?? null,
      })),
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
    const existingSupplier = values.id
      ? await prisma.suppliers.findFirst({
        select: { id: true },
        where: {
          OR: [{ code: values.id.toUpperCase() }, ...(parseInternalBigIntId(values.id) != null ? [{ id: parseInternalBigIntId(values.id) as bigint }] : [])],
        } as Prisma.suppliersWhereInput,
      })
      : null
    const resolvedSalesperson = values.salesId ? await findActiveSalespersonReferenceByCodeOrId(values.salesId) : null
    if (values.salesId && !resolvedSalesperson) {
      throw new z.ZodError([{ code: 'custom', message: 'ผู้ดูแลที่เลือกไม่ถูกต้องหรือถูกปิดใช้งาน', path: ['salesId'] }])
    }
    const paymentMethods = await getActivePaymentMethods() as SupplierPaymentMethodRecord[]
    throwSupplierBankAccountValidationError(values, paymentMethods)
    const code = normalizeSupplierCode(values.code, values.id || await getNextSupplierCode())
    const branch = values.branchId ? await findActiveBranchReferenceByCodeOrId(values.branchId) : null
    if (values.branchId && !branch) {
      throw new z.ZodError([{ code: 'custom', message: 'สาขาที่เลือกไม่ถูกต้องหรือถูกปิดใช้งาน', path: ['branchId'] }])
    }
    const payload = toSupplierWriteInput(
      { ...values, code, salesName: resolvedSalesperson?.name ?? null },
      paymentMethods,
      branch?.id ?? null,
      {
        salesId: resolvedSalesperson?.id ?? null,
        salesName: resolvedSalesperson?.name ?? null,
      },
    )

    const supplier = await prisma.$transaction(async (tx) => {
      const savedSupplier = existingSupplier
        ? await tx.suppliers.update({
          where: { id: existingSupplier.id },
          data: payload as Prisma.suppliersUpdateInput,
        })
        : await tx.suppliers.create({
          data: payload as Prisma.suppliersCreateInput,
        })

      await tx.supplier_bank_accounts.deleteMany({ where: { supplier_id: savedSupplier.id } })
      const accountRows = supplierBankAccountRows(
        { ...values, code, salesName: resolvedSalesperson?.name ?? null },
        savedSupplier.id,
        code,
        paymentMethods,
      )
      if (accountRows.length) {
        await tx.supplier_bank_accounts.createMany({ data: accountRows })
      }

      return tx.suppliers.findUniqueOrThrow({
        where: { id: savedSupplier.id },
        include: supplierInclude,
      })
    })

    return NextResponse.json(mapPrismaSupplier(supplier as any, paymentMethods, {
      salesId: resolvedSalesperson?.code ?? null,
    }))
  } catch (caught) {
    if (caught instanceof AuthContextError) return authContextErrorResponse(caught)
    return apiErrorResponse(caught, 'บันทึกข้อมูลผู้ขายไม่ได้', 400)
  }
}
