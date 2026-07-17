import { prisma } from '@/lib/server/prisma'
import { AuthContextError, authContextErrorResponse, getCurrentAuthContext, requirePermission } from '@/lib/server/auth-context'
import { errorJson, masterDataJson, type MasterDataRouteProps, updateMasterDataStatusSchema } from '@/lib/server/master-data'
import { invalidateOverseasRecipientReferenceCache } from '@/lib/server/reference-master-cache'

export const runtime = 'nodejs'

export async function PATCH(request: Request, { params }: MasterDataRouteProps) {
  try {
    const context = await getCurrentAuthContext()
    requirePermission(context, 'master.reference.manage')

    const { id } = await params
    const values = updateMasterDataStatusSchema.parse(await request.json())
    const row = await prisma.overseas_recipients.update({ where: { code: id }, data: { active: values.active } })
    await invalidateOverseasRecipientReferenceCache()
    return masterDataJson({ id: row.code, code: row.code, name: row.name, active: row.active ?? true, country: row.country, bankName: row.bank_name, accountNo: row.account_no, swift: row.swift, accountCurrency: row.currency })
  } catch (caught) {
    if (caught instanceof AuthContextError) return authContextErrorResponse(caught)
    return errorJson(caught, 'อัปเดตสถานะผู้รับเงินต่างประเทศไม่ได้')
  }
}
