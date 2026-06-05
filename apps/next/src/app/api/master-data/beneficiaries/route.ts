import { z } from 'zod'
import { prisma } from '@/lib/server/prisma'
import { AuthContextError, authContextErrorResponse, getCurrentAuthContext, requirePermission } from '@/lib/server/auth-context'
import { errorJson, masterDataJson, masterDataListJson, nextSequentialCode, normalizeCode, parseMasterDataForm } from '@/lib/server/master-data'

export const runtime = 'nodejs'

const accountCurrencySchema = z.string().trim().regex(/^[A-Z]{3}$/, 'สกุลเงินบัญชีต้องเป็นรหัส 3 ตัว เช่น USD')

function mapBeneficiary(row: Awaited<ReturnType<typeof prisma.overseas_recipients.findMany>>[number]) {
  return {
    id: row.code,
    code: row.code,
    name: row.name,
    active: row.active ?? true,
    country: row.country,
    bankName: row.bank_name,
    accountNo: row.account_no,
    swift: row.swift,
    accountCurrency: row.currency,
  }
}

export async function GET() {
  try {
    const context = await getCurrentAuthContext()
    requirePermission(context, 'master.reference.view')

    const rows = await prisma.overseas_recipients.findMany({ orderBy: [{ code: 'asc' }, { name: 'asc' }] })
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
    const existing = values.id
      ? await prisma.overseas_recipients.findFirst({
        select: { code: true, id: true },
        where: { code: values.id },
      })
      : null
    const accountCurrency = accountCurrencySchema.parse(values.accountCurrency || 'USD')
    if (values.id && !existing) {
      throw new Error('ไม่พบผู้รับเงินต่างประเทศที่ต้องการแก้ไข')
    }
    const latest = existing
      ? null
      : await prisma.overseas_recipients.findFirst({
        orderBy: { code: 'desc' },
        select: { code: true },
      })
    const beneficiaryCode = normalizeCode(
      values.code,
      existing?.code ?? nextSequentialCode(latest?.code, 'BEN-', 3),
    )
    const data = { code: beneficiaryCode, name: values.name, country: values.country || null, bank_name: values.bankName || null, account_no: values.accountNo || null, swift: values.swift || null, currency: accountCurrency, active: values.active }
    const row = existing
      ? await prisma.overseas_recipients.update({ where: { id: existing.id }, data })
      : await prisma.overseas_recipients.create({ data })
    return masterDataJson(mapBeneficiary(row))
  } catch (caught) {
    if (caught instanceof AuthContextError) return authContextErrorResponse(caught)
    return errorJson(caught, 'บันทึกข้อมูลผู้รับเงินต่างประเทศไม่ได้')
  }
}
