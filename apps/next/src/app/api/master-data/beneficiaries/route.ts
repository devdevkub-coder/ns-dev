import { z } from 'zod'
import { prisma } from '@/lib/server/prisma'
import { AuthContextError, authContextErrorResponse, getCurrentAuthContext, requirePermission } from '@/lib/server/auth-context'
import { errorJson, masterDataJson, masterDataListJson, nextSequentialCode, parseMasterDataForm } from '@/lib/server/master-data'

export const runtime = 'nodejs'

const accountCurrencySchema = z.string().trim().regex(/^[A-Z]{3}$/, 'สกุลเงินบัญชีต้องเป็นรหัส 3 ตัว เช่น USD')

function mapBeneficiary(row: Awaited<ReturnType<typeof prisma.overseas_recipients.findMany>>[number]) {
  return {
    id: row.id,
    code: row.id,
    name: row.name,
    active: row.active ?? true,
    country: row.country,
    bankName: row.bank_name,
    accountNo: row.account_no,
    swift: row.swift,
    accountCurrency: row.currency,
  }
}

async function getNextCode() {
  const last = await prisma.overseas_recipients.findFirst({ where: { id: { startsWith: 'BEN' } }, orderBy: { id: 'desc' }, select: { id: true } })
  return nextSequentialCode(last?.id, 'BEN')
}

export async function GET() {
  try {
    const context = await getCurrentAuthContext()
    requirePermission(context, 'master.reference.view')

    const rows = await prisma.overseas_recipients.findMany({ orderBy: { name: 'asc' } })
    return masterDataListJson(rows.map(mapBeneficiary))
  } catch (caught) {
    if (caught instanceof AuthContextError) return authContextErrorResponse(caught)
    return errorJson(caught, 'โหลดข้อมูลผู้รับเงินต่างประเทศไม่ได้', 500)
  }
}

export async function POST(request: Request) {
  try {
    const context = await getCurrentAuthContext()
    requirePermission(context, 'master.reference.manage')

    const values = parseMasterDataForm(await request.json())
    const id = values.id || values.code || await getNextCode()
    const accountCurrency = accountCurrencySchema.parse(values.accountCurrency || 'USD')
    const row = await prisma.overseas_recipients.upsert({
      where: { id },
      create: { id, name: values.name, country: values.country || null, bank_name: values.bankName || null, account_no: values.accountNo || null, swift: values.swift || null, currency: accountCurrency, active: values.active },
      update: { name: values.name, country: values.country || null, bank_name: values.bankName || null, account_no: values.accountNo || null, swift: values.swift || null, currency: accountCurrency, active: values.active },
    })
    return masterDataJson(mapBeneficiary(row))
  } catch (caught) {
    if (caught instanceof AuthContextError) return authContextErrorResponse(caught)
    return errorJson(caught, 'บันทึกข้อมูลผู้รับเงินต่างประเทศไม่ได้')
  }
}
