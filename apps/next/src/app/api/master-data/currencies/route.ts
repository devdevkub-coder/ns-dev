import { parseInternalBigIntId, requireBusinessCode } from '@/lib/business-code'
import { prisma } from '@/lib/server/prisma'
import { AuthContextError, authContextErrorResponse, getCurrentAuthContext, requirePermission } from '@/lib/server/auth-context'
import { errorJson, masterDataJson, masterDataListJson, parseMasterDataForm, toIso, toNumber } from '@/lib/server/master-data'
import { invalidateCurrencyReferenceCache, listCurrencies } from '@/lib/server/reference-master-cache'

export const runtime = 'nodejs'

function normalizeCurrencyRate(value: unknown) {
  if (value == null) return null
  if (typeof value === 'number') return Number.isFinite(value) ? value : null
  if (typeof value === 'string') {
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : null
  }
  if (typeof value === 'object' && value && 'toNumber' in value && typeof (value as { toNumber: unknown }).toNumber === 'function') {
    return ((value as { toNumber: () => number }).toNumber)()
  }
  return null
}

function mapCurrency(row: { code: string; id: bigint; name: string; rateToThb?: string | number | null; rate_to_thb?: string | number | null; symbol: string | null; updatedAt?: string | null; updated_at?: Date | null }) {
  const outwardId = requireBusinessCode(row.code, `สกุลเงิน ${row.id}`)
  return {
    id: outwardId,
    code: outwardId,
    name: row.name,
    active: true,
    type: null,
    phone: null,
    email: null,
    note: null,
    symbol: row.symbol,
    rateToThb: normalizeCurrencyRate('rateToThb' in row ? row.rateToThb : row.rate_to_thb),
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
    createdAt: null,
    updatedAt: 'updatedAt' in row ? row.updatedAt : toIso(row.updated_at ?? null),
  }
}

export async function GET() {
  try {
    const context = await getCurrentAuthContext()
    requirePermission(context, 'master.reference.view')

    const rows = await listCurrencies()
    return masterDataListJson(rows.map(mapCurrency))
  } catch (caught) {
    if (caught instanceof AuthContextError) return authContextErrorResponse(caught)
    return errorJson(caught, 'โหลดข้อมูลสกุลเงินไม่ได้', 500)
  }
}

export async function POST(request: Request) {
  try {
    const context = await getCurrentAuthContext()
    requirePermission(context, 'master.reference.manage')

    const values = parseMasterDataForm(await request.json())
    const existing = values.id
      ? await prisma.currencies.findFirst({
        select: { id: true },
        where: {
          OR: [{ code: values.id.toUpperCase() }, ...(parseInternalBigIntId(values.id) != null ? [{ id: parseInternalBigIntId(values.id) as bigint }] : [])],
        } as any,
      })
      : null
    const symbol = values.symbol?.trim().toUpperCase()
    if (!symbol) throw new Error('กรอกสัญลักษณ์สกุลเงิน')
    const row = existing
      ? await prisma.currencies.update({
        where: { id: existing.id },
        data: { code: symbol, name: values.name, symbol, rate_to_thb: values.rateToThb },
      })
      : await prisma.currencies.create({
        data: { code: symbol, name: values.name, symbol, rate_to_thb: values.rateToThb },
      })
    await invalidateCurrencyReferenceCache()
    return masterDataJson(mapCurrency({ ...row, rate_to_thb: row.rate_to_thb?.toNumber() ?? null }))
  } catch (caught) {
    if (caught instanceof AuthContextError) return authContextErrorResponse(caught)
    return errorJson(caught, 'บันทึกข้อมูลสกุลเงินไม่ได้')
  }
}
