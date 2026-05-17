import { prisma } from '@/lib/server/prisma'
import { errorJson, masterDataJson, masterDataListJson, nextSequentialCode, normalizeCode, parseMasterDataForm } from '@/lib/server/master-data'

export const runtime = 'nodejs'

type PurchaseChannel = Awaited<ReturnType<typeof prisma.purchase_channels.findMany>>[number]
type SalesChannel = Awaited<ReturnType<typeof prisma.sales_channels.findMany>>[number]

function mapChannel(row: PurchaseChannel | SalesChannel, channelType: 'purchase' | 'sales') {
  return {
    id: `${channelType}:${row.id}`,
    code: row.code ?? row.id,
    name: row.name,
    active: row.active ?? true,
    type: null,
    phone: null,
    email: null,
    note: null,
    symbol: null,
    rateToThb: null,
    parentId: null,
    channelType,
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

async function getNextCode(channelType: 'purchase' | 'sales') {
  const prefix = channelType === 'purchase' ? 'PC' : 'SC'
  const last = channelType === 'purchase'
    ? await prisma.purchase_channels.findFirst({ where: { code: { startsWith: prefix } }, orderBy: { code: 'desc' }, select: { code: true } })
    : await prisma.sales_channels.findFirst({ where: { code: { startsWith: prefix } }, orderBy: { code: 'desc' }, select: { code: true } })
  return nextSequentialCode(last?.code, prefix)
}

export async function GET() {
  try {
    const [purchaseRows, salesRows] = await Promise.all([
      prisma.purchase_channels.findMany({ orderBy: [{ code: 'asc' }, { name: 'asc' }] }),
      prisma.sales_channels.findMany({ orderBy: [{ code: 'asc' }, { name: 'asc' }] }),
    ])
    return masterDataListJson([...purchaseRows.map((row) => mapChannel(row, 'purchase')), ...salesRows.map((row) => mapChannel(row, 'sales'))])
  } catch (caught) {
    return errorJson(caught, 'โหลดข้อมูลช่องทางไม่ได้', 500)
  }
}

export async function POST(request: Request) {
  try {
    const values = parseMasterDataForm(await request.json())
    const channelType = values.channelType === 'sales' ? 'sales' : 'purchase'
    const rawId = values.id?.replace(/^(purchase|sales):/, '')
    const code = normalizeCode(values.code, rawId || await getNextCode(channelType))

    if (channelType === 'sales') {
      const row = await prisma.sales_channels.upsert({
        where: { id: rawId || code },
        create: { id: rawId || code, code, name: values.name, active: values.active },
        update: { code, name: values.name, active: values.active },
      })
      return masterDataJson(mapChannel(row, 'sales'))
    }

    const row = await prisma.purchase_channels.upsert({
      where: { id: rawId || code },
      create: { id: rawId || code, code, name: values.name, active: values.active },
      update: { code, name: values.name, active: values.active },
    })
    return masterDataJson(mapChannel(row, 'purchase'))
  } catch (caught) {
    return errorJson(caught, 'บันทึกข้อมูลช่องทางไม่ได้')
  }
}
