import { parseInternalBigIntId, requireBusinessCode } from '@/lib/business-code'
import { prisma } from '@/lib/server/prisma'
import { AuthContextError, authContextErrorResponse, getCurrentAuthContext, requirePermission } from '@/lib/server/auth-context'
import { errorJson, masterDataJson, masterDataListJson, parseMasterDataForm } from '@/lib/server/master-data'

export const runtime = 'nodejs'

type SalesChannel = Awaited<ReturnType<typeof prisma.sales_channels.findMany>>[number]

function mapChannel(row: SalesChannel) {
  const outwardId = requireBusinessCode(row.code, `ช่องทางขาย ${row.id}`)
  return {
    id: outwardId,
    code: outwardId,
    name: row.name,
    active: row.active ?? true,
    type: null,
    phone: null,
    email: null,
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
    createdAt: null,
    updatedAt: null,
  }
}

async function getNextChannelCode() {
  const rows = await prisma.sales_channels.findMany({
    orderBy: { code: 'desc' },
    select: { code: true },
    where: { code: { startsWith: 'SC' } },
  })
  const lastNumber = rows.reduce((max, row) => {
    const matched = String(row.code ?? '').match(/^SC(\d+)$/i)
    const value = matched ? Number(matched[1]) : 0
    return Number.isFinite(value) ? Math.max(max, value) : max
  }, 0)
  return `SC${String(lastNumber + 1).padStart(3, '0')}`
}

export async function GET() {
  try {
    const context = await getCurrentAuthContext()
    requirePermission(context, 'master.reference.view')

    const salesRows = await prisma.sales_channels.findMany({ orderBy: [{ code: 'asc' }, { name: 'asc' }, { id: 'asc' }] })
    return masterDataListJson(salesRows.map(mapChannel))
  } catch (caught) {
    if (caught instanceof AuthContextError) return authContextErrorResponse(caught)
    return errorJson(caught, 'โหลดข้อมูลช่องทางไม่ได้', 500)
  }
}

export async function POST(request: Request) {
  try {
    const context = await getCurrentAuthContext()
    requirePermission(context, 'master.reference.manage')

    const values = parseMasterDataForm(await request.json())
    const existing = values.id
      ? await prisma.sales_channels.findFirst({
        select: { id: true },
        where: {
          OR: [{ code: values.id.toUpperCase() }, ...(parseInternalBigIntId(values.id) != null ? [{ id: parseInternalBigIntId(values.id) as bigint }] : [])],
        } as any,
      })
      : null
    const code = (values.code?.trim() || values.id?.trim() || await getNextChannelCode()).toUpperCase()
    const row = existing
      ? await prisma.sales_channels.update({
        where: { id: existing.id },
        data: { code, name: values.name, active: values.active },
      })
      : await prisma.sales_channels.create({
        data: { code, name: values.name, active: values.active },
      })
    return masterDataJson(mapChannel(row))
  } catch (caught) {
    if (caught instanceof AuthContextError) return authContextErrorResponse(caught)
    return errorJson(caught, 'บันทึกข้อมูลช่องทางไม่ได้')
  }
}
