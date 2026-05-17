import { prisma } from '@/lib/server/prisma'
import { errorJson, masterDataJson, masterDataListJson, normalizeCode, parseMasterDataForm, toIso, toNumber } from '@/lib/server/master-data'

export const runtime = 'nodejs'

function mapCurrency(row: Awaited<ReturnType<typeof prisma.currencies.findMany>>[number]) {
  return {
    id: row.code,
    code: row.code,
    name: row.name,
    active: true,
    type: null,
    phone: null,
    email: null,
    note: null,
    symbol: row.symbol,
    rateToThb: toNumber(row.rate_to_thb),
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
    updatedAt: toIso(row.updated_at),
  }
}

export async function GET() {
  try {
    const rows = await prisma.currencies.findMany({ orderBy: { code: 'asc' } })
    return masterDataListJson(rows.map(mapCurrency))
  } catch (caught) {
    return errorJson(caught, 'โหลดข้อมูลสกุลเงินไม่ได้', 500)
  }
}

export async function POST(request: Request) {
  try {
    const values = parseMasterDataForm(await request.json())
    const code = normalizeCode(values.code, values.id || '')
    const row = await prisma.currencies.upsert({
      where: { code: values.id || code },
      create: { code, name: values.name, symbol: values.symbol || null, rate_to_thb: values.rateToThb },
      update: { name: values.name, symbol: values.symbol || null, rate_to_thb: values.rateToThb },
    })
    return masterDataJson(mapCurrency(row))
  } catch (caught) {
    return errorJson(caught, 'บันทึกข้อมูลสกุลเงินไม่ได้')
  }
}
