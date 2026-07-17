import { requireBusinessCode } from '@/lib/business-code'
import { prisma } from '@/lib/server/prisma'
import { AuthContextError, authContextErrorResponse, getCurrentAuthContext, requirePermission } from '@/lib/server/auth-context'
import { errorJson, masterDataJson, masterDataListJson, normalizeCode, parseMasterDataForm, toIso } from '@/lib/server/master-data'
import { findActiveBranchReferenceByCodeOrId } from '@/lib/server/branch-reference'
import { invalidateWarehouseReferenceCache, listWarehouseMasterRecords, type WarehouseMasterRecord } from '@/lib/server/reference-master-cache'
import type { Prisma } from '../../../../../generated/prisma/client'

export const runtime = 'nodejs'

type WarehouseRow = Prisma.warehousesGetPayload<{ include: { branches: true } }>
const warehouseTypes = new Set(['RM', 'WIP', 'FG', 'SCRAP'])

function mapWarehouse(row: WarehouseMasterRecord | WarehouseRow) {
  const cachedRecord = 'branchCode' in row
  const outwardId = requireBusinessCode(row.code, `คลัง ${row.id}`)
  const branchCode = cachedRecord ? row.branchCode : row.branches?.code ?? null
  const branchName = cachedRecord ? row.branchName : row.branches?.name ?? null
  const createdAt = cachedRecord ? row.createdAt : toIso(row.created_at)
  const updatedAt = cachedRecord ? row.updatedAt : null
  return {
    id: outwardId,
    code: outwardId,
    name: row.name,
    active: row.active === true,
    type: row.type ?? null,
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
    ...(branchCode ? { branchId: branchCode, branchName } : { branchId: null, branchName: null }),
    address: null,
    commissionPct: null,
    baseSalary: null,
    createdAt,
    updatedAt,
  }
}

export async function GET() {
  try {
    const context = await getCurrentAuthContext()
    requirePermission(context, 'master.reference.view')

    const rows = await listWarehouseMasterRecords()
    return masterDataListJson(rows.map(mapWarehouse))
  } catch (caught) {
    if (caught instanceof AuthContextError) return authContextErrorResponse(caught)
    return errorJson(caught, 'โหลดข้อมูลคลังไม่ได้', 500)
  }
}

export async function POST(request: Request) {
  try {
    const context = await getCurrentAuthContext()
    requirePermission(context, 'master.reference.manage')

    const values = parseMasterDataForm(await request.json())
    if (!values.branchId) return errorJson(new Error('กรอกสาขา'), 'กรอกสาขา')
    if (!values.type || !warehouseTypes.has(values.type)) return errorJson(new Error('เลือกประเภทคลัง'), 'เลือกประเภทคลัง')
    const branch = await findActiveBranchReferenceByCodeOrId(values.branchId)
    if (!branch) return errorJson(new Error('เลือกสาขา'), 'สาขาที่เลือกไม่ถูกต้องหรือถูกปิดใช้งาน')
    const existing = values.id
      ? await prisma.warehouses.findFirst({
        select: { branches: { select: { code: true } }, id: true },
        where: {
          OR: [
            { code: values.id.toUpperCase() },
            ...(values.id.match(/^\d+$/) ? [{ id: BigInt(values.id) }] : []),
          ],
        },
      })
      : null
    const code = normalizeCode(values.code, values.id || '')
    const row = await prisma.warehouses.upsert({
      where: existing ? { id: existing.id } : { code },
      create: {
        active: values.active,
        branch_id: branch.id,
        code,
        name: values.name,
        type: values.type,
      },
      update: {
        active: values.active,
        branch_id: branch.id,
        code,
        name: values.name,
        type: values.type,
      },
      include: { branches: true },
    })
    await invalidateWarehouseReferenceCache([branch.code, existing?.branches?.code ?? ''])
    return masterDataJson(mapWarehouse(row))
  } catch (caught) {
    if (caught instanceof AuthContextError) return authContextErrorResponse(caught)
    return errorJson(caught, 'บันทึกข้อมูลคลังไม่ได้')
  }
}
