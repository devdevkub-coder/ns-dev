import { z } from 'zod'
import { prisma } from '@/lib/server/prisma'
import { AuthContextError, authContextErrorResponse, getCurrentAuthContext, requirePermission } from '@/lib/server/auth-context'
import { errorJson, masterDataJson, masterDataListJson, nextSequentialCode, parseMasterDataForm } from '@/lib/server/master-data'

export const runtime = 'nodejs'

type PurchaseChannel = Awaited<ReturnType<typeof prisma.purchase_channels.findMany>>[number]
type SalesChannel = Awaited<ReturnType<typeof prisma.sales_channels.findMany>>[number]

const channelTypeSchema = z.enum(['purchase', 'sales'])

function mapChannel(row: PurchaseChannel | SalesChannel, channelType: 'purchase' | 'sales') {
  return {
    id: `${channelType}:${row.id}`,
    code: null,
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

async function getNextChannelId(channelType: 'purchase' | 'sales') {
  const prefix = channelType === 'purchase' ? 'PC' : 'SC'
  const last = channelType === 'purchase'
    ? await prisma.purchase_channels.findFirst({ where: { id: { startsWith: prefix } }, orderBy: { id: 'desc' }, select: { id: true } })
    : await prisma.sales_channels.findFirst({ where: { id: { startsWith: prefix } }, orderBy: { id: 'desc' }, select: { id: true } })
  return nextSequentialCode(last?.id, prefix)
}

export async function GET() {
  try {
    const context = await getCurrentAuthContext()
    requirePermission(context, 'master.reference.view')

    const [purchaseRows, salesRows] = await Promise.all([
      prisma.purchase_channels.findMany({ orderBy: [{ id: 'asc' }, { name: 'asc' }] }),
      prisma.sales_channels.findMany({ orderBy: [{ id: 'asc' }, { name: 'asc' }] }),
    ])
    return masterDataListJson([...purchaseRows.map((row) => mapChannel(row, 'purchase')), ...salesRows.map((row) => mapChannel(row, 'sales'))])
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
    const channelType = channelTypeSchema.parse(values.channelType)
    const rawId = values.id?.replace(/^(purchase|sales):/, '')
    const id = rawId || await getNextChannelId(channelType)

    if (channelType === 'sales') {
      const row = await prisma.sales_channels.upsert({
        where: { id },
        create: { id, name: values.name, active: values.active },
        update: { name: values.name, active: values.active },
      })
      return masterDataJson(mapChannel(row, 'sales'))
    }

    const row = await prisma.purchase_channels.upsert({
      where: { id },
      create: { id, name: values.name, active: values.active },
      update: { name: values.name, active: values.active },
    })
    return masterDataJson(mapChannel(row, 'purchase'))
  } catch (caught) {
    if (caught instanceof AuthContextError) return authContextErrorResponse(caught)
    return errorJson(caught, 'บันทึกข้อมูลช่องทางไม่ได้')
  }
}
