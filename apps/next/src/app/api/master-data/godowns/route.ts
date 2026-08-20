import { requireBusinessCode } from '@/lib/business-code'
import { prisma } from '@/lib/server/prisma'
import { AuthContextError, authContextErrorResponse, getCurrentAuthContext, requirePermission } from '@/lib/server/auth-context'
import { errorJson, masterDataJson, masterDataListJson, normalizeCode, parseMasterDataForm, toIso } from '@/lib/server/master-data'
import { findActiveBranchReferenceByCodeOrId } from '@/lib/server/branch-reference'
import type { Prisma } from '../../../../../generated/prisma/client'

export const runtime = 'nodejs'
type GodownRow = Prisma.godownsGetPayload<{ include: { branches: true } }>

function mapGodown(row: GodownRow) {
  const code = requireBusinessCode(row.code, `โกดัง ${row.id}`)
  return {
    id: code, code, name: row.name, active: row.active === true, type: null,
    inCharge: row.in_charge ?? null, phone: row.phone ?? null,
    supportedProcesses: row.supported_processes ?? [],
    targetSortKg: row.target_sort_kg == null ? null : Number(row.target_sort_kg),
    targetBaleCount: row.target_bale_count ?? null,
    maxCapacityKg: row.max_capacity_kg == null ? null : Number(row.max_capacity_kg),
    email: null, note: null, symbol: null, rateToThb: null, parentId: null,
    channelType: null, bankName: null, accountNo: null, currency: null,
    openingBalance: null, odLimit: null,
    branchId: row.branches?.code ?? null, branchName: row.branches?.name ?? null,
    address: null, commissionPct: null, baseSalary: null,
    createdAt: toIso(row.created_at), updatedAt: toIso(row.updated_at),
  }
}

export async function GET() {
  try {
    const context = await getCurrentAuthContext()
    requirePermission(context, 'master.reference.view')
    const rows = await prisma.godowns.findMany({ orderBy: [{ code: 'asc' }, { name: 'asc' }], include: { branches: true } })
    return masterDataListJson(rows.map(mapGodown))
  } catch (caught) {
    if (caught instanceof AuthContextError) return authContextErrorResponse(caught)
    return errorJson(caught, 'โหลดข้อมูลโกดังไม่ได้', 500)
  }
}

export async function POST(request: Request) {
  try {
    const context = await getCurrentAuthContext()
    requirePermission(context, 'master.reference.manage')
    const values = parseMasterDataForm(await request.json())
    const branch = values.branchId ? await findActiveBranchReferenceByCodeOrId(values.branchId) : null
    if (values.branchId && !branch) return errorJson(new Error('เลือกสาขา'), 'สาขาที่เลือกไม่ถูกต้องหรือถูกปิดใช้งาน')
    const code = normalizeCode(values.code, values.id || '')
    if (!/^KD-\d+$/i.test(code)) return errorJson(new Error('รหัสโกดังต้องขึ้นต้นด้วย KD-'), 'รหัสโกดังไม่ถูกต้อง')
    const existing = values.id ? await prisma.godowns.findFirst({ select: { id: true }, where: { OR: [{ code: values.id.toUpperCase() }, ...(values.id.match(/^\d+$/) ? [{ id: BigInt(values.id) }] : [])] } }) : null
    const row = await prisma.godowns.upsert({
      where: existing ? { id: existing.id } : { code },
      create: { active: values.active, branch_id: branch?.id ?? null, code, in_charge: values.inCharge, max_capacity_kg: values.maxCapacityKg, name: values.name, phone: values.phone, supported_processes: values.supportedProcesses, target_bale_count: values.targetBaleCount, target_sort_kg: values.targetSortKg },
      update: { active: values.active, branch_id: branch?.id ?? null, code, in_charge: values.inCharge, max_capacity_kg: values.maxCapacityKg, name: values.name, phone: values.phone, supported_processes: values.supportedProcesses, target_bale_count: values.targetBaleCount, target_sort_kg: values.targetSortKg, updated_at: new Date() },
      include: { branches: true },
    })
    return masterDataJson(mapGodown(row))
  } catch (caught) {
    if (caught instanceof AuthContextError) return authContextErrorResponse(caught)
    return errorJson(caught, 'บันทึกข้อมูลโกดังไม่ได้')
  }
}
