import { prisma } from '@/lib/server/prisma'
import { errorJson, masterDataJson, type MasterDataRouteProps, updateMasterDataStatusSchema } from '@/lib/server/master-data'

export const runtime = 'nodejs'

export async function PATCH(request: Request, { params }: MasterDataRouteProps) {
  try {
    const { id } = await params
    const values = updateMasterDataStatusSchema.parse(await request.json())
    const row = await prisma.overseas_recipients.update({ where: { id }, data: { active: values.active } })
    return masterDataJson({ id: row.id, code: row.id, name: row.name, active: row.active ?? true, country: row.country, bankName: row.bank_name, accountNo: row.account_no, swift: row.swift, accountCurrency: row.currency })
  } catch (caught) {
    return errorJson(caught, 'อัปเดตสถานะผู้รับเงินต่างประเทศไม่ได้')
  }
}
