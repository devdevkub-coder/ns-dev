import { requireBusinessCode } from '@/lib/business-code'
import { prisma } from '@/lib/server/prisma'
import { AuthContextError, authContextErrorResponse, getCurrentAuthContext, requirePermission } from '@/lib/server/auth-context'
import { findActiveBranchReferenceByCodeOrId } from '@/lib/server/branch-reference'
import { errorJson, masterDataJson, toIso, updateMasterDataStatusSchema } from '@/lib/server/master-data'
import { masterDataFormSchema } from '@/lib/master-data'

export const runtime = 'nodejs'
type RouteProps = { params: Promise<{ id: string }> }

async function resolveGodown(id: string) {
  return prisma.godowns.findFirst({ where: { OR: [{ code: id.toUpperCase() }, ...(id.match(/^\d+$/) ? [{ id: BigInt(id) }] : [])] }, include: { branches: true } })
}

function mapGodown(row: NonNullable<Awaited<ReturnType<typeof resolveGodown>>>) {
  const code = requireBusinessCode(row.code, `โกดัง ${row.id}`)
  return { id: code, code, name: row.name, active: row.active === true, type: null, inCharge: row.in_charge ?? null, phone: row.phone ?? null, supportedProcesses: row.supported_processes ?? [], targetSortKg: row.target_sort_kg == null ? null : Number(row.target_sort_kg), targetBaleCount: row.target_bale_count ?? null, maxCapacityKg: row.max_capacity_kg == null ? null : Number(row.max_capacity_kg), email: null, note: null, symbol: null, rateToThb: null, parentId: null, channelType: null, bankName: null, accountNo: null, currency: null, openingBalance: null, odLimit: null, branchId: row.branches?.code ?? null, branchName: row.branches?.name ?? null, address: null, commissionPct: null, baseSalary: null, createdAt: toIso(row.created_at), updatedAt: toIso(row.updated_at) }
}

export async function PATCH(request: Request, { params }: RouteProps) {
  try {
    const context = await getCurrentAuthContext(); requirePermission(context, 'master.reference.manage')
    const { id } = await params; const body: unknown = await request.json(); const resolved = await resolveGodown(id)
    if (!resolved) throw new Error('ไม่พบโกดังที่ต้องการอัปเดต')
    const statusOnly = typeof body === 'object' && body !== null && Object.keys(body).length === 1 && 'active' in body
    if (statusOnly) {
      const values = updateMasterDataStatusSchema.parse(body)
      const row = await prisma.godowns.update({ where: { id: resolved.id }, data: { active: values.active }, include: { branches: true } })
      return masterDataJson(mapGodown(row))
    }
    const values = masterDataFormSchema.parse(body)
    const branch = values.branchId ? await findActiveBranchReferenceByCodeOrId(values.branchId) : null
    if (values.branchId && !branch) throw new Error('สาขาที่เลือกไม่ถูกต้องหรือถูกปิดใช้งาน')
    const row = await prisma.godowns.update({ where: { id: resolved.id }, data: { active: values.active, branch_id: branch?.id ?? null, code: values.code ?? values.id ?? '', in_charge: values.inCharge, max_capacity_kg: values.maxCapacityKg, name: values.name, phone: values.phone, supported_processes: values.supportedProcesses, target_bale_count: values.targetBaleCount, target_sort_kg: values.targetSortKg, updated_at: new Date() }, include: { branches: true } })
    return masterDataJson(mapGodown(row))
  } catch (caught) { if (caught instanceof AuthContextError) return authContextErrorResponse(caught); return errorJson(caught, 'อัปเดตข้อมูลโกดังไม่ได้') }
}

export async function DELETE(_request: Request, { params }: RouteProps) {
  try {
    const context = await getCurrentAuthContext(); requirePermission(context, 'master.reference.manage')
    const { id } = await params; const resolved = await resolveGodown(id)
    if (!resolved) throw new Error('ไม่พบโกดังที่ต้องการลบ')
    await prisma.godowns.delete({ where: { id: resolved.id } })
    return masterDataJson({ deleted: true })
  } catch (caught) { if (caught instanceof AuthContextError) return authContextErrorResponse(caught); return errorJson(caught, 'ลบโกดังไม่ได้') }
}
