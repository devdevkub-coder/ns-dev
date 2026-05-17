import { prisma } from '@/lib/server/prisma'
import { errorJson, masterDataJson, type MasterDataRouteProps, toIso, toNumber } from '@/lib/server/master-data'

export const runtime = 'nodejs'

export async function PATCH(_request: Request, { params }: MasterDataRouteProps) {
  try {
    const { id } = await params
    const row = await prisma.currencies.findUniqueOrThrow({ where: { code: id } })
    return masterDataJson({
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
    })
  } catch (caught) {
    return errorJson(caught, 'สกุลเงินไม่มีสถานะใช้งานให้ปรับ')
  }
}
