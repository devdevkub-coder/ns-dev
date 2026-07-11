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

type SortDirection = 'asc' | 'desc'

const sortColumns = {
  active: 'active',
  code: 'code',
  name: 'name',
  phone: 'phone',
  salesName: 'sales_rep',
  taxId: 'tax_id',
  type: 'type',
} as const

const supplierInclude = {
  branches: true,
  supplier_branches: {
    include: {
      branches: {
        select: { code: true, name: true },
      },
    },
    orderBy: [{ is_primary: 'desc' }, { id: 'asc' }],
  },
  supplier_bank_accounts: {
    include: {
      bank_names: {
        select: { code: true, name: true },
      },
    },
    orderBy: [{ is_primary: 'desc' }, { id: 'asc' }],
  },
} satisfies Prisma.suppliersInclude

type SupplierListRow = Prisma.suppliersGetPayload<{
  include: typeof supplierInclude
}>

function parseListParams(request: Request) {
  const url = new URL(request.url)
  const active = url.searchParams.get('active')?.trim() ?? ''
  const all = url.searchParams.get('all') === '1'
  const page = Math.max(1, Number(url.searchParams.get('page') ?? '1') || 1)
  const pageSize = all ? 10000 : Math.min(100, Math.max(10, Number(url.searchParams.get('pageSize') ?? '25') || 25))
  const q = url.searchParams.get('q')?.trim() ?? ''
  const supplierType = url.searchParams.get('type')?.trim() ?? ''
  const marketScope = url.searchParams.get('marketScope')?.trim() ?? ''
  const salesId = url.searchParams.get('salesId')?.trim() ?? ''
  const sort = url.searchParams.get('sort') ?? 'code'
  const direction: SortDirection = url.searchParams.get('direction') === 'desc' ? 'desc' : 'asc'
  const sortColumn = sortColumns[sort as keyof typeof sortColumns] ?? sortColumns.code

  return { active, all, direction, marketScope, page, pageSize, q, salesId, sort, sortColumn, supplierType }
}

function supplierSearchWhere(q: string, supplierType: string, marketScope: string, salesId: bigint | null, active: string): Prisma.suppliersWhereInput {
  const where: Prisma.suppliersWhereInput = {}

  if (active === 'active') {
    where.active = { not: false }
  } else if (active === 'inactive') {
    where.active = false
  }

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
    { supplier_bank_accounts: { some: { bank_names: { is: { name: { contains: q, mode: 'insensitive' } } } } } },
    { supplier_bank_accounts: { some: { account_no: { contains: q, mode: 'insensitive' } } } },
    { supplier_bank_accounts: { some: { account_name: { contains: q, mode: 'insensitive' } } } },
    { branches: { is: { code: { contains: q, mode: 'insensitive' } } } },
    { sales_rep: { contains: q, mode: 'insensitive' } },
  ]

  return where
}

function supplierPrimaryBankText(supplier: SupplierListRow, field: 'accountNo' | 'bankName') {
  const primaryAccount = supplier.supplier_bank_accounts.find((account) => account.is_primary) ?? supplier.supplier_bank_accounts[0] ?? null
  if (!primaryAccount) return ''
  if (field === 'accountNo') return primaryAccount.account_no ?? ''
  return primaryAccount.bank_names?.name ?? ''
}

function compareText(left: string, right: string, direction: SortDirection) {
  return left.localeCompare(right, 'th', { numeric: true }) * (direction === 'asc' ? 1 : -1)
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

function uniqueBranchCodes(values: Array<string | null | undefined>) {
  return Array.from(new Set(values.map((value) => value?.trim()).filter(Boolean) as string[]))
}

async function syncSupplierBranches(
  tx: Prisma.TransactionClient,
  input: {
    actor: string | null
    branchCodes: string[]
    primaryBranchCode: string | null
    supplierId: bigint
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
    throw new z.ZodError([{ code: 'custom', message: `สาขาไม่ถูกต้องหรือถูกปิดใช้งาน: ${missingCodes.join(', ')}`, path: ['branchIds'] }])
  }

  const primaryCode = input.primaryBranchCode && branchByCode.has(input.primaryBranchCode)
    ? input.primaryBranchCode
    : branchCodes[0] ?? null

  await tx.supplier_branches.updateMany({
    data: { active: false, is_primary: false, updated_at: new Date(), updated_by: input.actor },
    where: { supplier_id: input.supplierId },
  })

  for (const code of branchCodes) {
    const branch = branchByCode.get(code)
    if (!branch) continue
    await tx.supplier_branches.upsert({
      create: {
        active: true,
        branch_id: branch.id,
        created_by: input.actor,
        is_primary: code === primaryCode,
        supplier_id: input.supplierId,
        updated_by: input.actor,
      },
      update: {
        active: true,
        is_primary: code === primaryCode,
        updated_at: new Date(),
        updated_by: input.actor,
      },
      where: {
        supplier_id_branch_id: {
          branch_id: branch.id,
          supplier_id: input.supplierId,
        },
      },
    })
  }
}

export async function GET(request: Request) {
  try {
    const context = await getCurrentAuthContext()
    requirePermission(context, 'master.suppliers.view')

    const { active, all, direction, marketScope, page, pageSize, q, salesId, sort, sortColumn, supplierType } = parseListParams(request)
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
    const where = supplierSearchWhere(q, supplierType, marketScope, resolvedSalesperson?.id ?? null, active)
    const requiresBankSort = sort === 'bankName' || sort === 'accountNo'
    const [supplierRows, total, paymentMethods] = await Promise.all([
      prisma.suppliers.findMany({
        include: supplierInclude,
        orderBy: requiresBankSort ? [{ code: 'asc' }, { id: 'asc' }] : [{ [sortColumn]: direction }, { id: 'asc' }],
        skip: requiresBankSort || all ? undefined : (page - 1) * pageSize,
        take: requiresBankSort ? undefined : pageSize,
        where,
      }),
      prisma.suppliers.count({ where }),
      getActivePaymentMethods() as Promise<SupplierPaymentMethodRecord[]>,
    ])
    const suppliers = requiresBankSort
      ? supplierRows
        .slice()
        .sort((left, right) => {
          const byBankField = compareText(
            supplierPrimaryBankText(left, sort === 'bankName' ? 'bankName' : 'accountNo'),
            supplierPrimaryBankText(right, sort === 'bankName' ? 'bankName' : 'accountNo'),
            direction,
          )
          if (byBankField !== 0) return byBankField
          return compareText(left.code, right.code, 'asc')
        })
      : supplierRows
    const pagedSuppliers = requiresBankSort && !all
      ? suppliers.slice((page - 1) * pageSize, page * pageSize)
      : suppliers
    const salespersonReferences = await listSalespersonReferencesByIds(pagedSuppliers.map((supplier) => supplier.sales_id))

    return NextResponse.json({
      rows: pagedSuppliers.map((supplier) => mapPrismaSupplier(supplier as any, paymentMethods, {
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
    const [paymentMethods, bankNameRows] = await Promise.all([
      getActivePaymentMethods() as Promise<SupplierPaymentMethodRecord[]>,
      prisma.bank_names.findMany({ select: { id: true, name: true }, where: { active: true } }),
    ])
    const bankNamesByName = new Map(bankNameRows.map((row) => [row.name, row] as const))
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

    const actor = context.appUser?.email ?? context.authUser.email ?? null
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
        bankNamesByName,
      )
      if (accountRows.length) {
        await tx.supplier_bank_accounts.createMany({ data: accountRows })
      }
      const branchCodes = uniqueBranchCodes([
        values.branchId,
        values.primaryBranchId,
        ...values.branchIds,
      ])
      if (branchCodes.length) {
        await syncSupplierBranches(tx, {
          actor,
          branchCodes,
          primaryBranchCode: values.primaryBranchId ?? values.branchId,
          supplierId: savedSupplier.id,
        })
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
