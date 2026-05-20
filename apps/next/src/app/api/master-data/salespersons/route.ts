import { prisma } from '@/lib/server/prisma'
import { AuthContextError, authContextErrorResponse, getCurrentAuthContext, requirePermission } from '@/lib/server/auth-context'
import { errorJson, masterDataJson, masterDataListJson, parseMasterDataForm, toIso } from '@/lib/server/master-data'
import { z } from 'zod'

export const runtime = 'nodejs'

function mapSalesperson(row: Awaited<ReturnType<typeof prisma.salespersons.findMany>>[number]) {
  return {
    id: row.id,
    code: row.code ?? row.id,
    name: row.name,
    active: row.active ?? true,
    type: null,
    phone: row.phone,
    email: row.email,
    note: null,
    symbol: null,
    rateToThb: null,
    parentId: null,
    channelType: null,
    bankName: null,
    accountNo: null,
    currency: null,
    openingBalance: null,
    odLimit: null,
    branchId: null,
    branchName: null,
    address: null,
    commissionPct: null,
    baseSalary: null,
    createdAt: toIso(row.created_at),
    updatedAt: toIso(row.updated_at),
  }
}

function codeValidationError(message: string) {
  return new z.ZodError([{ code: 'custom', message, path: ['code'] }])
}

function normalizeSalespersonCode(value: string | null | undefined, fallback: string) {
  const rawCode = (value?.trim() || fallback).toLowerCase()
  const matched = rawCode.match(/^(?:sa|sales|s)(\d{1,3})$/)
  if (!matched) throw codeValidationError('รหัสพนักงานขายต้องเป็นรูปแบบ sa001-sa999')

  const number = Number(matched[1])
  if (!Number.isInteger(number) || number < 1 || number > 999) throw codeValidationError('รหัสพนักงานขายต้องอยู่ระหว่าง sa001-sa999')

  return `sa${String(number).padStart(3, '0')}`
}

async function getNextCode() {
  const rows = await prisma.salespersons.findMany({
    orderBy: { code: 'desc' },
    select: { code: true },
    where: { code: { startsWith: 's', mode: 'insensitive' } },
  })
  const lastNumber = rows.reduce((max, row) => {
    const matched = String(row.code ?? '').toLowerCase().match(/^(?:sa|sales|s)(\d{1,3})$/)
    const number = matched ? Number(matched[1]) : 0
    return Number.isFinite(number) && number > max ? number : max
  }, 0)
  const nextNumber = lastNumber + 1
  if (nextNumber > 999) throw codeValidationError('รหัสพนักงานขายเต็มช่วง sa001-sa999 แล้ว')
  return `sa${String(nextNumber).padStart(3, '0')}`
}

export async function GET() {
  try {
    const context = await getCurrentAuthContext()
    requirePermission(context, 'master.reference.view')

    const rows = await prisma.salespersons.findMany({ orderBy: [{ code: 'asc' }, { name: 'asc' }] })
    return masterDataListJson(rows.map(mapSalesperson))
  } catch (caught) {
    if (caught instanceof AuthContextError) return authContextErrorResponse(caught)
    return errorJson(caught, 'โหลดข้อมูลพนักงานขายไม่ได้', 500)
  }
}

export async function POST(request: Request) {
  try {
    const context = await getCurrentAuthContext()
    requirePermission(context, 'master.reference.manage')

    const values = parseMasterDataForm(await request.json())
    const code = normalizeSalespersonCode(values.code, values.id || await getNextCode())
    const row = await prisma.salespersons.upsert({
      where: { id: values.id || code },
      create: {
        id: values.id || code,
        code,
        name: values.name,
        phone: values.phone || null,
        email: values.email || null,
        active: values.active,
      },
      update: {
        code,
        name: values.name,
        phone: values.phone || null,
        email: values.email || null,
        active: values.active,
      },
    })
    return masterDataJson(mapSalesperson(row))
  } catch (caught) {
    if (caught instanceof AuthContextError) return authContextErrorResponse(caught)
    return errorJson(caught, 'บันทึกข้อมูลพนักงานขายไม่ได้')
  }
}
