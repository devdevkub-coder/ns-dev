import { prisma } from '@/lib/server/prisma'
import { errorJson, masterDataJson, type MasterDataRouteProps, updateMasterDataStatusSchema, toIso, toNumber } from '@/lib/server/master-data'

export const runtime = 'nodejs'

export async function PATCH(request: Request, { params }: MasterDataRouteProps) {
  try {
    const { id } = await params
    const values = updateMasterDataStatusSchema.parse(await request.json())
    const row = await prisma.suppliers.update({ where: { id }, data: { active: values.active }, include: { branches: true } })
    return masterDataJson({ id: row.id, code: row.code ?? row.id, name: row.name, active: row.active ?? true, type: row.type, taxId: row.tax_id, phone: row.phone, email: row.email, contact: row.contact ?? row.sales_rep, address: row.address, bankName: row.bank_name, accountNo: row.bank_account, bankAccount: row.bank_account_name, creditTerm: row.credit_term, creditLimit: toNumber(row.credit_limit), branchId: row.branch_id, branchName: row.branches?.name ?? row.branch_id, note: row.notes, createdAt: toIso(row.created_at), updatedAt: toIso(row.updated_at) })
  } catch (caught) {
    return errorJson(caught, 'อัปเดตสถานะผู้ขายไม่ได้')
  }
}
