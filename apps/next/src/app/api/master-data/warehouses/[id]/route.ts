import { requireBusinessCode } from '@/lib/business-code'
import { prisma } from '@/lib/server/prisma'
import { AuthContextError, authContextErrorResponse, getCurrentAuthContext, requirePermission } from '@/lib/server/auth-context'
import { errorJson, masterDataJson, type MasterDataRouteProps, toIso, updateMasterDataStatusSchema } from '@/lib/server/master-data'
import { masterDataFormSchema } from '@/lib/master-data'
import { findActiveBranchReferenceByCodeOrId, outwardBranchReference } from '@/lib/server/branch-reference'
import { invalidateWarehouseReferenceCache } from '@/lib/server/reference-master-cache'
import type { Prisma } from '../../../../../../generated/prisma/client'

export const runtime = 'nodejs'

type WarehouseRow = Prisma.warehousesGetPayload<{ include: { branches: true } }>

function mapWarehouse(row: WarehouseRow) {
  const outwardId = requireBusinessCode(row.code, `คลัง ${row.id}`)
  return {
    id: outwardId,
    code: outwardId,
    name: row.name,
    active: row.active ?? true,
    type: row.type ?? null,
    inCharge: row.in_charge ?? null,
    phone: row.phone ?? null,
    supportedProcesses: row.supported_processes ?? [],
    targetSortKg: row.target_sort_kg == null ? null : Number(row.target_sort_kg),
    targetBaleCount: row.target_bale_count ?? null,
    maxCapacityKg: row.max_capacity_kg == null ? null : Number(row.max_capacity_kg),
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
    ...outwardBranchReference(row.branches, row.branch_id),
    address: null,
    commissionPct: null,
    baseSalary: null,
    createdAt: toIso(row.created_at),
    updatedAt: toIso(row.updated_at),
  }
}

async function resolveWarehouseId(id: string) {
  return prisma.warehouses.findFirst({
    select: { id: true, branches: { select: { code: true } } },
    where: {
      OR: [
        { code: id.toUpperCase() },
        ...(id.match(/^\d+$/) ? [{ id: BigInt(id) }] : []),
      ],
    },
  })
}

export async function PATCH(request: Request, { params }: MasterDataRouteProps) {
  try {
    const context = await getCurrentAuthContext()
    requirePermission(context, 'master.reference.manage')

    const { id } = await params
    const body: unknown = await request.json()
    const statusOnly = typeof body === 'object' && body !== null
      && Object.keys(body).length === 1
      && 'active' in body
    const resolved = await resolveWarehouseId(id)
    if (!resolved) throw new Error('ไม่พบคลังที่ต้องการอัปเดต')

    let row: WarehouseRow
    if (statusOnly) {
      const values = updateMasterDataStatusSchema.parse(body)
      row = await prisma.warehouses.update({
        data: { active: values.active },
        include: { branches: true },
        where: { id: resolved.id },
      })
      await invalidateWarehouseReferenceCache([resolved.branches?.code ?? ''])
      return masterDataJson(mapWarehouse(row))
    }

    const values = masterDataFormSchema.parse(body)
    if (values.branchId) {
      const branch = await findActiveBranchReferenceByCodeOrId(values.branchId)
      if (!branch) throw new Error('สาขาที่เลือกไม่ถูกต้องหรือถูกปิดใช้งาน')
    }
    if (values.type && !['RM', 'WIP', 'FG', 'SCRAP'].includes(values.type)) throw new Error('เลือกประเภทคลัง')
    const branch = values.branchId ? await findActiveBranchReferenceByCodeOrId(values.branchId) : null
    const previousBranchCode = resolved.branches?.code ?? ''
    row = await prisma.warehouses.update({
      data: {
        active: values.active,
        branch_id: branch?.id ?? null,
        code: values.code ?? values.id ?? '',
        in_charge: values.inCharge,
        max_capacity_kg: values.maxCapacityKg,
        name: values.name,
        phone: values.phone,
        supported_processes: values.supportedProcesses,
        target_bale_count: values.targetBaleCount,
        target_sort_kg: values.targetSortKg,
        type: values.type,
        updated_at: new Date(),
      },
      include: { branches: true },
      where: { id: resolved.id },
    })
    await invalidateWarehouseReferenceCache([previousBranchCode, branch?.code ?? ''])
    return masterDataJson(mapWarehouse(row))
  } catch (caught) {
    if (caught instanceof AuthContextError) return authContextErrorResponse(caught)
    return errorJson(caught, 'อัปเดตข้อมูลคลังไม่ได้')
  }
}

export async function DELETE(_request: Request, { params }: MasterDataRouteProps) {
  try {
    const context = await getCurrentAuthContext()
    requirePermission(context, 'master.reference.manage')

    const { id } = await params
    const resolved = await resolveWarehouseId(id)
    if (!resolved) throw new Error('ไม่พบคลังที่ต้องการลบ')
    const previousBranchCode = resolved.branches?.code ?? ''

    try {
      // Hard delete: remove the row entirely. If any document still references
      // this warehouse, the FK constraint (onDelete: NoAction) rejects it below.
      await prisma.warehouses.delete({ where: { id: resolved.id } })
    } catch {
      // Referenced by existing documents -> cannot hard delete. Fall back to
      // disabling so old documents keep a valid reference.
      const row = await prisma.warehouses.update({
        data: { active: false, updated_at: new Date() },
        include: { branches: true },
        where: { id: resolved.id },
      })
      await invalidateWarehouseReferenceCache([previousBranchCode, row.branches?.code ?? ''])
      return errorJson(
        new Error('ลบไม่ได้เพราะโกดังนี้ถูกอ้างอิงในเอกสารแล้ว ระบบจึงปิดการใช้งานแทน'),
        'ลบคลังไม่ได้',
      )
    }

    await invalidateWarehouseReferenceCache([previousBranchCode])
    return masterDataJson({ deleted: true })
  } catch (caught) {
    if (caught instanceof AuthContextError) return authContextErrorResponse(caught)
    return errorJson(caught, 'ลบคลังไม่ได้')
  }
}
